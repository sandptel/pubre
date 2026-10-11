import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Zip, decodeName, decodeCp437, normalizePath, crc32 } from '../../src/epub/zip.ts'
import { EpubError } from '../../src/epub/errors.ts'
import { epub, rawZip } from './helpers.ts'

test('reads stored and deflated entries', async () => {
  const big = 'Call me Ishmael. '.repeat(500)
  const zip = new Zip(epub({ 'ch1.xhtml': big }))
  assert.equal(zip.entries.get('mimetype')!.method, 0)
  assert.equal(zip.entries.get('mimetype')!.offset, 0)
  assert.equal(zip.entries.get('ch1.xhtml')!.method, 8)
  assert.equal(await zip.text('mimetype'), 'application/epub+zip')
  assert.equal(await zip.text('ch1.xhtml'), big)
  await assert.rejects(zip.bytes('nope'), (e: EpubError) => e.code === 'MISSING_RESOURCE')
})

test('not a zip', () => {
  assert.throws(() => new Zip(new TextEncoder().encode('hello world, definitely not a zip file')), (e: EpubError) => e.code === 'NOT_ZIP')
  assert.throws(() => new Zip(new Uint8Array(0)), (e: EpubError) => e.code === 'NOT_ZIP')
})

test('case-insensitive and normalized lookup', async () => {
  const zip = new Zip(epub({ 'OEBPS/Text/Ch1.xhtml': 'x' }))
  assert.equal(zip.resolve('OEBPS/Text/Ch1.xhtml'), 'OEBPS/Text/Ch1.xhtml')
  assert.equal(zip.resolve('oebps/text/ch1.XHTML'), 'OEBPS/Text/Ch1.xhtml')
  assert.equal(zip.resolve('/OEBPS/./Images/../Text/Ch1.xhtml'), 'OEBPS/Text/Ch1.xhtml')
  assert.equal(await zip.text('oebps\\text\\ch1.xhtml'), 'x')
  assert.equal(normalizePath('a/b/../../../c'), 'c')
})

test('CRC check is optional and catches corruption', async () => {
  const bytes = rawZip([{ name: 'a.txt', data: 'hello' }])
  const i = bytes.indexOf(0x68) // 'h' of the stored data
  bytes[i] = 0x48
  assert.equal(await new Zip(bytes).text('a.txt'), 'Hello')
  await assert.rejects(new Zip(bytes, { checkCrc: true }).bytes('a.txt'), (e: EpubError) => e.code === 'CORRUPT_ZIP')
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
})

test('ZIP64 end records and extra fields (hand-built)', async () => {
  const zip = new Zip(rawZip([{ name: 'mimetype', data: 'application/epub+zip' }, { name: 'b.txt', data: 'bee' }], { zip64: true }))
  assert.deepEqual([...zip.entries.keys()], ['mimetype', 'b.txt'])
  assert.equal(zip.entries.get('b.txt')!.size, 3)
  assert.equal(await zip.text('b.txt'), 'bee')
})

test('ZIP64 from the zip CLI streaming stdin (data descriptor + zip64 extra)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pubre-'))
  execFileSync('sh', ['-c', 'printf "streamed data" | zip -q s.zip -'], { cwd: dir })
  const zip = new Zip(new Uint8Array(readFileSync(join(dir, 's.zip'))), { checkCrc: true })
  assert.equal(await zip.text('-'), 'streamed data')
})

test('data descriptors are tolerated', async () => {
  const zip = new Zip(rawZip([{ name: 'a.txt', data: 'alpha', descriptor: true }, { name: 'b.txt', data: 'beta' }]), { checkCrc: true })
  assert.equal(await zip.text('a.txt'), 'alpha')
  assert.equal(await zip.text('b.txt'), 'beta')
})

test('truncated archive (no central directory) is recovered from local headers', async () => {
  const bytes = rawZip([{ name: 'a.txt', data: 'alpha', descriptor: true }, { name: 'b.txt', data: 'beta' }, { name: 'c.txt', data: 'gamma', descriptor: true }], { central: false })
  const zip = new Zip(bytes, { checkCrc: true })
  assert.deepEqual([...zip.entries.keys()], ['a.txt', 'b.txt', 'c.txt'])
  assert.equal(await zip.text('a.txt'), 'alpha')
  assert.equal(await zip.text('c.txt'), 'gamma')
  assert.ok(zip.warnings.length)
})

test('prepended bytes shift offsets', async () => {
  const zip = new Zip(rawZip([{ name: 'a.txt', data: 'alpha' }], { prefix: 100 }))
  assert.equal(await zip.text('a.txt'), 'alpha')
})

test('entry names: UTF-8 flag, unflagged UTF-8, CP437 fallback', async () => {
  const utf8 = new TextEncoder().encode('café.xhtml')
  assert.equal(decodeName(utf8, 0x800), 'café.xhtml')
  assert.equal(decodeName(utf8, 0), 'café.xhtml')
  assert.equal(decodeName(new Uint8Array([0x63, 0x61, 0x66, 0x82]), 0), 'café') // 0x82 = é in CP437
  assert.equal(decodeCp437(new Uint8Array([0x80, 0xff])), 'Ç ')
  const zip = new Zip(rawZip([{ name: new Uint8Array([0x82, 0x2e, 0x74]), data: 'x' }]))
  assert.equal(await zip.text('é.t'), 'x')
})

test('password-encrypted entries raise DRM', async () => {
  await assert.rejects(new Zip(rawZip([{ name: 'a', data: 'x', flags: 1 }])).bytes('a'), (e: EpubError) => e.code === 'DRM')
})

test('corrupt deflate stream raises CORRUPT_ZIP', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pubre-'))
  writeFileSync(join(dir, 'a.txt'), 'abc'.repeat(1000))
  execFileSync('zip', ['-X9q', 'a.zip', 'a.txt'], { cwd: dir })
  const bytes = new Uint8Array(readFileSync(join(dir, 'a.zip')))
  const zip = new Zip(bytes)
  const e = zip.entries.get('a.txt')!
  const start = e.offset + 30 + 'a.txt'.length + bytes[e.offset + 28]
  bytes.fill(0xff, start, start + 8)
  await assert.rejects(zip.bytes('a.txt'), (err: EpubError) => err.code === 'CORRUPT_ZIP')
})
