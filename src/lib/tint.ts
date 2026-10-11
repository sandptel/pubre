// A book's colour: its cover's average, favouring coloured pixels (cached on the record).
import { saveBook, type BookRecord } from './store.svelte.ts'

export async function tintOf(b: BookRecord): Promise<string> {
  if (b.tint) return b.tint
  if (!b.cover) return ''
  try {
    const bmp = await createImageBitmap(new Blob([b.cover], { type: b.coverType }), { resizeWidth: 12, resizeHeight: 18 })
    const c = new OffscreenCanvas(12, 18), x = c.getContext('2d')!
    x.drawImage(bmp, 0, 0)
    const d = x.getImageData(0, 0, 12, 18).data
    let r = 0, g = 0, bl = 0, n = 0
    for (let i = 0; i < d.length; i += 4) { const s = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); const w = 1 + s / 40; r += d[i] * w; g += d[i + 1] * w; bl += d[i + 2] * w; n += w } // favour coloured pixels
    const hex = '#' + [r, g, bl].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('')
    b.tint = hex; saveBook(b)
    return hex
  } catch { return '' }
}
