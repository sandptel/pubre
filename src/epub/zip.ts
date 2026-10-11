// ZIP reader for EPUB containers: central directory (incl. ZIP64), stored + deflate entries via the
// native DecompressionStream, data-descriptor tolerant, optional CRC-32 check, UTF-8/CP437 names,
// normalized paths with case-insensitive lookup. Truncated archives (no central directory) are
// recovered by scanning local headers.
import { EpubError } from './errors.ts'

export interface ZipEntry {
  name: string // normalized path ("OEBPS/text/ch1.xhtml")
  method: number // 0 = stored, 8 = deflate
  flags: number // general purpose bit flags (bit 0 = encrypted, bit 3 = data descriptor, bit 11 = UTF-8)
  crc: number
  compressedSize: number
  size: number // uncompressed size; 0 if unknown (recovered entries with no descriptor)
  offset: number // local header offset
}

export interface ZipOptions {
  /** Verify CRC-32 of every extracted entry (costs a pass over the data). Default false. */
  checkCrc?: boolean
}

const LOC = 0x04034b50
const CEN = 0x02014b50
const EOCD = 0x06054b50
const EOCD64 = 0x06064b50
const EOCD64_LOC = 0x07064b50
const DESC = 0x08074b50

// Code page 437, bytes 0x80-0xFF (the legacy default for ZIP names without the UTF-8 flag).
const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ '

export function decodeCp437(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80]
  return s
}

const utf8 = new TextDecoder()
const utf8Strict = new TextDecoder('utf-8', { fatal: true })

/** Entry name bytes → string. UTF-8 if flagged; otherwise UTF-8 if it validates (common in practice), else CP437. */
export function decodeName(bytes: Uint8Array, flags: number): string {
  if (flags & 0x800) return utf8.decode(bytes)
  if (bytes.every(b => b < 0x80)) return utf8.decode(bytes)
  try { return utf8Strict.decode(bytes) } catch { return decodeCp437(bytes) }
}

/** Forward slashes, no leading slash, no "." segments, ".." resolved (never above the root). */
export function normalizePath(name: string): string {
  const out: string[] = []
  for (const seg of name.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/')
}

let crcTable: Uint32Array | undefined
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const b of data) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export class Zip {
  /** Entries by normalized path, in central-directory order. */
  readonly entries = new Map<string, ZipEntry>()
  /** Non-fatal oddities found while reading (recovered archive, shifted offsets, ...). */
  readonly warnings: string[] = []
  private readonly buf: Uint8Array
  private readonly view: DataView
  private readonly lower = new Map<string, string>()
  private readonly checkCrc: boolean

  constructor(buf: Uint8Array, options: ZipOptions = {}) {
    this.buf = buf
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    this.checkCrc = !!options.checkCrc
    const eocd = this.findEocd()
    if (eocd < 0 || !this.readCentral(eocd)) {
      if (this.scanLocal()) this.warnings.push('ZIP central directory missing or corrupt; recovered entries from local headers')
      else throw new EpubError('NOT_ZIP', 'This file is not an EPUB (not a ZIP archive).')
    }
  }

  private u16(p: number) { return p >= 0 && p + 2 <= this.buf.length ? this.view.getUint16(p, true) : -1 }
  private u32(p: number) { return p >= 0 && p + 4 <= this.buf.length ? this.view.getUint32(p, true) : -1 }
  private u64(p: number) { return p >= 0 && p + 8 <= this.buf.length ? Number(this.view.getBigUint64(p, true)) : -1 }

  private findEocd() {
    // Scan back from the end: the archive comment can be up to 64 KB.
    for (let i = this.buf.length - 22; i >= Math.max(0, this.buf.length - 22 - 0xffff); i--) {
      if (this.u32(i) === EOCD) return i
    }
    return -1
  }

  private readCentral(eocd: number): boolean {
    let cdSize = this.u32(eocd + 12)
    let cdOffset = this.u32(eocd + 16)
    let cdEnd = eocd
    const loc = eocd - 20
    if (loc >= 0 && this.u32(loc) === EOCD64_LOC) {
      const z = this.u64(loc + 8)
      if (this.u32(z) === EOCD64) {
        cdSize = this.u64(z + 40)
        cdOffset = this.u64(z + 48)
        cdEnd = z
      }
    }
    // Data prepended to the archive (or a writer that got offsets wrong): trust the EOCD position.
    let shift = 0
    if (this.u32(cdOffset) !== CEN && this.u32(cdEnd - cdSize) === CEN) {
      shift = cdEnd - cdSize - cdOffset
      cdOffset = cdEnd - cdSize
      this.warnings.push(`ZIP offsets shifted by ${shift} bytes`)
    }
    let p = cdOffset
    // Entry count is ignored on purpose: walk records while the signature holds (count overflows in non-ZIP64 writers).
    while (this.u32(p) === CEN) {
      const flags = this.u16(p + 8)
      const nameLen = this.u16(p + 28)
      const extraLen = this.u16(p + 30)
      const commentLen = this.u16(p + 32)
      const nameEnd = p + 46 + nameLen
      if (nameEnd + extraLen > this.buf.length) break
      const e = {
        method: this.u16(p + 10),
        flags,
        crc: this.u32(p + 16),
        compressedSize: this.u32(p + 20),
        size: this.u32(p + 24),
        offset: this.u32(p + 42),
      }
      const name = this.readExtra(nameEnd, extraLen, e) ?? decodeName(this.buf.subarray(p + 46, nameEnd), flags)
      e.offset += shift
      this.add(name, e)
      p = nameEnd + extraLen + commentLen
    }
    return this.entries.size > 0
  }

  /** Applies ZIP64 sizes/offset to `e`; returns the Info-ZIP Unicode Path (0x7075) if present. */
  private readExtra(start: number, len: number, e: { compressedSize: number; size: number; offset: number }) {
    let name: string | undefined
    for (let q = start; q + 4 <= start + len;) {
      const id = this.u16(q)
      const size = this.u16(q + 2)
      const d = q + 4
      if (id === 0x0001) {
        let r = d
        if (e.size === 0xffffffff) { e.size = this.u64(r); r += 8 }
        if (e.compressedSize === 0xffffffff) { e.compressedSize = this.u64(r); r += 8 }
        if (e.offset === 0xffffffff) e.offset = this.u64(r)
      } else if (id === 0x7075 && size > 5 && this.buf[d] === 1) {
        name = utf8.decode(this.buf.subarray(d + 5, d + size))
      }
      q = d + size
    }
    return name
  }

  private add(rawName: string, e: Omit<ZipEntry, 'name'>) {
    if (rawName.endsWith('/') || rawName.endsWith('\\')) return // directory
    const name = normalizePath(rawName)
    if (!name || this.entries.has(name)) return
    this.entries.set(name, { name, ...e })
    if (!this.lower.has(name.toLowerCase())) this.lower.set(name.toLowerCase(), name)
  }

  /** Recovery for archives without a usable central directory (e.g. truncated downloads). */
  private scanLocal(): boolean {
    let p = 0
    while (p + 30 <= this.buf.length) {
      if (this.u32(p) !== LOC) {
        p++
        continue
      }
      const flags = this.u16(p + 6)
      const nameLen = this.u16(p + 26)
      const extraLen = this.u16(p + 28)
      const e = {
        method: this.u16(p + 8),
        flags,
        crc: this.u32(p + 14),
        compressedSize: this.u32(p + 18),
        size: this.u32(p + 22),
        offset: p,
      }
      const nameEnd = p + 30 + nameLen
      const name = this.readExtra(nameEnd, extraLen, e) ?? decodeName(this.buf.subarray(p + 30, nameEnd), flags)
      const data = nameEnd + extraLen
      if ((flags & 8) || e.compressedSize === 0xffffffff || data + e.compressedSize > this.buf.length) {
        const d = this.findDataEnd(data)
        e.compressedSize = d.compressedSize
        if (d.size >= 0) e.size = d.size
        if (d.crc >= 0) e.crc = d.crc
      }
      if (e.method === 0) e.size = e.compressedSize
      this.add(name, e)
      p = Math.max(p + 1, data + e.compressedSize)
    }
    return this.entries.size > 0
  }

  /** Where an entry with unknown compressed size ends: at a data descriptor or the next header. */
  private findDataEnd(start: number) {
    for (let q = start; q + 4 <= this.buf.length; q++) {
      const s = this.u32(q)
      if (s === DESC) {
        if (this.u32(q + 8) === q - start) return { compressedSize: q - start, size: this.u32(q + 12), crc: this.u32(q + 4) }
        if (this.u64(q + 8) === q - start) return { compressedSize: q - start, size: this.u64(q + 16), crc: this.u32(q + 4) }
      }
      if (s === LOC || s === CEN || s === EOCD) {
        // Descriptor without signature: crc, csize, size right before the next header.
        if (q - 12 >= start && this.u32(q - 8) === q - 12 - start) return { compressedSize: q - 12 - start, size: this.u32(q - 4), crc: this.u32(q - 12) }
        return { compressedSize: q - start, size: -1, crc: -1 }
      }
    }
    return { compressedSize: this.buf.length - start, size: -1, crc: -1 }
  }

  /** The actual entry name for `name`: exact, normalized, then case-insensitive. */
  resolve(name: string): string | undefined {
    if (this.entries.has(name)) return name
    const n = normalizePath(name)
    if (this.entries.has(n)) return n
    return this.lower.get(n.toLowerCase())
  }

  get(name: string) { const n = this.resolve(name); return n === undefined ? undefined : this.entries.get(n) }

  has(name: string) { return this.resolve(name) !== undefined }

  async bytes(name: string): Promise<Uint8Array> {
    const e = this.get(name)
    if (!e) throw new EpubError('MISSING_RESOURCE', `Missing in EPUB: ${name}`)
    if (e.flags & 1) throw new EpubError('DRM', `${e.name} is password-encrypted.`, 'zip-encryption')
    if (this.u32(e.offset) !== LOC) throw new EpubError('CORRUPT_ZIP', `Corrupt ZIP entry: ${e.name}`)
    // The local header has its own name/extra lengths, which can differ from the central directory's.
    const start = e.offset + 30 + this.u16(e.offset + 26) + this.u16(e.offset + 28)
    const raw = this.buf.subarray(start, start + e.compressedSize)
    let data: Uint8Array
    if (e.method === 0) data = raw
    else if (e.method === 8) data = await inflate(raw, e.name)
    else throw new EpubError('UNSUPPORTED_COMPRESSION', `Unsupported ZIP compression method ${e.method} for ${e.name}`)
    if (this.checkCrc && crc32(data) !== e.crc) throw new EpubError('CORRUPT_ZIP', `CRC mismatch: ${e.name}`)
    return data
  }

  async text(name: string) { return utf8.decode(await this.bytes(name)) }
}

/** Raw deflate. A truncated/corrupt stream yields whatever decompressed before the error. */
async function inflate(raw: Uint8Array, name: string): Promise<Uint8Array> {
  const reader = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const chunks: Uint8Array[] = []
  try {
    for (let r = await reader.read(); !r.done; r = await reader.read()) chunks.push(r.value)
  } catch (err) {
    if (!chunks.length) throw new EpubError('CORRUPT_ZIP', `Cannot decompress ${name}: ${(err as Error).message}`)
  }
  if (chunks.length === 1) return chunks[0]
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}
