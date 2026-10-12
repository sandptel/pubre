// Builds public/guide.epub (the welcome book every new library starts with) from guide/.
// A tiny zip writer: "mimetype" first and stored, the rest deflated, as the EPUB spec asks. No dependencies.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

const src = new URL('../guide/', import.meta.url).pathname, out = new URL('../public/guide.epub', import.meta.url).pathname
const walk = d => readdirSync(d).filter(f => !f.startsWith('.')).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p] }).sort()
const files = [['mimetype', Buffer.from('application/epub+zip'), false], ...walk(src).map(p => [relative(src, p), readFileSync(p), true])]

const local = [], central = []
let offset = 0
for (const [name, data, deflate] of files) {
  const body = deflate ? deflateRawSync(data, { level: 9 }) : data, n = Buffer.from(name)
  const h = Buffer.alloc(30)
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(deflate ? 8 : 0, 8)
  h.writeUInt32LE(0x00210000, 10) // 1980-01-01: a fixed date keeps the build reproducible
  h.writeUInt32LE(crc32(data), 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26)
  const c = Buffer.alloc(46)
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(deflate ? 8 : 0, 10)
  c.writeUInt32LE(0x00210000, 12); c.writeUInt32LE(crc32(data), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24)
  c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42)
  local.push(h, n, body); central.push(c, n)
  offset += 30 + n.length + body.length
}
const cd = Buffer.concat(central), end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
mkdirSync(new URL('../public/', import.meta.url).pathname, { recursive: true })
writeFileSync(out, Buffer.concat([...local, cd, end]))
console.log(`guide.epub · ${files.length} files · ${(offset / 1024).toFixed(1)} KB`)
