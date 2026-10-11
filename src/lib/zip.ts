// Minimal ZIP reader: central directory + stored/deflate entries via native DecompressionStream.
// ponytail: no ZIP64 (EPUBs > 4 GB / > 65k files); add if a real book ever needs it.

export interface ZipEntry {
  name: string
  method: number // 0 = stored, 8 = deflate
  compressedSize: number
  size: number
  offset: number // local header offset
}

export class Zip {
  readonly entries = new Map<string, ZipEntry>()
  private buf: Uint8Array

  constructor(buf: Uint8Array) {
    this.buf = buf
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    // End of central directory record: scan back from the end (comment can be up to 64 KB).
    let eocd = -1
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break }
    }
    if (eocd < 0) throw new Error('Not a ZIP file')
    const count = v.getUint16(eocd + 10, true)
    let p = v.getUint32(eocd + 16, true)
    const dec = new TextDecoder()
    for (let i = 0; i < count; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt ZIP central directory')
      const nameLen = v.getUint16(p + 28, true)
      const extraLen = v.getUint16(p + 30, true)
      const commentLen = v.getUint16(p + 32, true)
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen))
      this.entries.set(name, {
        name,
        method: v.getUint16(p + 10, true),
        compressedSize: v.getUint32(p + 20, true),
        size: v.getUint32(p + 24, true),
        offset: v.getUint32(p + 42, true),
      })
      p += 46 + nameLen + extraLen + commentLen
    }
  }

  has(name: string) { return this.entries.has(name) }

  async bytes(name: string): Promise<Uint8Array> {
    const e = this.entries.get(name)
    if (!e) throw new Error(`Missing in EPUB: ${name}`)
    const v = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength)
    // Local header has its own name/extra lengths, which can differ from the central directory's.
    const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true)
    const raw = this.buf.subarray(start, start + e.compressedSize)
    if (e.method === 0) return raw
    if (e.method !== 8) throw new Error(`Unsupported ZIP compression ${e.method} for ${name}`)
    const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }

  async text(name: string) { return new TextDecoder().decode(await this.bytes(name)) }
}
