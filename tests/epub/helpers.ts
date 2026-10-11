// Test fixtures: XML DOM for Node (xmldom), EPUB builder via the `zip` CLI, and a tiny hand-rolled
// ZIP writer for structures the CLI cannot produce on demand (ZIP64 records, CP437 names, truncation).
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { crc32 } from '../../src/epub/zip.ts'
import type { ParseXml } from '../../src/epub/xml.ts'

export const parseXml: ParseXml = (text, type) => {
  try {
    return new DOMParser({ onError: () => {} }).parseFromString(text, type) as unknown as Document
  } catch {
    return null // xmldom throws on fatal errors where browsers return <parsererror>
  }
}
export const serializeXml = (doc: Document) => new XMLSerializer().serializeToString(doc as never)
export const dom = { parseXml, serializeXml }

export const xml = (text: string) => parseXml(text, 'application/xml')!
export const xhtml = (text: string) => parseXml(text, 'application/xhtml+xml')!

/** Build an EPUB with the zip CLI: mimetype first and stored, everything else deflated. */
export function epub(files: Record<string, string | Uint8Array>, opts: { mimetype?: string | null } = {}): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), 'pubre-'))
  const mimetype = opts.mimetype === undefined ? 'application/epub+zip' : opts.mimetype
  if (mimetype !== null) {
    writeFileSync(join(dir, 'mimetype'), mimetype)
    execFileSync('zip', ['-X0q', 'b.epub', 'mimetype'], { cwd: dir })
  }
  const names = Object.keys(files)
  for (const name of names) {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), files[name])
  }
  if (names.length) execFileSync('zip', ['-X9q', 'b.epub', ...names], { cwd: dir })
  return new Uint8Array(readFileSync(join(dir, 'b.epub')))
}

export interface RawEntry {
  name: string | Uint8Array
  data: string | Uint8Array
  flags?: number
  descriptor?: boolean // sizes only in a trailing data descriptor (bit 3)
}

/** Stored-only ZIP writer. `zip64` forces ZIP64 extra fields + ZIP64 end records; `central: false` truncates. */
export function rawZip(entries: RawEntry[], opts: { zip64?: boolean; central?: boolean; prefix?: number } = {}): Uint8Array {
  const enc = new TextEncoder()
  const out: number[] = new Array(opts.prefix ?? 0).fill(0x20)
  const u16 = (n: number) => out.push(n & 0xff, (n >>> 8) & 0xff)
  const u32 = (n: number) => { u16(n & 0xffff); u16(n >>> 16) }
  const u64 = (n: number) => { u32(n % 2 ** 32); u32(Math.floor(n / 2 ** 32)) }
  const bytes = (b: Uint8Array) => { for (const x of b) out.push(x) }
  const central: (() => void)[] = []
  const base = opts.prefix ?? 0
  for (const e of entries) {
    const name = typeof e.name === 'string' ? enc.encode(e.name) : e.name
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data
    const crc = crc32(data)
    const flags = (e.flags ?? 0) | (e.descriptor ? 8 : 0)
    const offset = out.length - base
    const z64 = !!opts.zip64
    u32(0x04034b50); u16(z64 ? 45 : 20); u16(flags); u16(0); u16(0); u16(0)
    u32(e.descriptor ? 0 : crc)
    u32(e.descriptor ? 0 : z64 ? 0xffffffff : data.length)
    u32(e.descriptor ? 0 : z64 ? 0xffffffff : data.length)
    u16(name.length); u16(z64 && !e.descriptor ? 20 : 0)
    bytes(name)
    if (z64 && !e.descriptor) { u16(1); u16(16); u64(data.length); u64(data.length) }
    bytes(data)
    if (e.descriptor) { u32(0x08074b50); u32(crc); u32(data.length); u32(data.length) }
    central.push(() => {
      u32(0x02014b50); u16(z64 ? 45 : 20); u16(z64 ? 45 : 20); u16(flags); u16(0); u16(0); u16(0)
      u32(crc); u32(z64 ? 0xffffffff : data.length); u32(z64 ? 0xffffffff : data.length)
      u16(name.length); u16(z64 ? 28 : 0); u16(0); u16(0); u16(0); u32(0)
      u32(z64 ? 0xffffffff : offset)
      bytes(name)
      if (z64) { u16(1); u16(24); u64(data.length); u64(data.length); u64(offset) }
    })
  }
  if (opts.central === false) return new Uint8Array(out)
  const cdStart = out.length - base
  for (const c of central) c()
  const cdSize = out.length - base - cdStart
  if (opts.zip64) {
    const z = out.length - base
    u32(0x06064b50); u64(44); u16(45); u16(45); u32(0); u32(0)
    u64(entries.length); u64(entries.length); u64(cdSize); u64(cdStart)
    u32(0x07064b50); u32(0); u64(z); u32(1)
  }
  u32(0x06054b50); u16(0); u16(0)
  u16(opts.zip64 ? 0xffff : entries.length); u16(opts.zip64 ? 0xffff : entries.length)
  u32(opts.zip64 ? 0xffffffff : cdSize); u32(opts.zip64 ? 0xffffffff : cdStart); u16(0)
  return new Uint8Array(out)
}
