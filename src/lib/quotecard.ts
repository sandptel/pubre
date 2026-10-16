// Quote cards (R2): a passage you selected, set on your theme's paper in the book's face, as an image to
// share. 1080×1350 (a portrait post); long passages step the type down until they fit.

export interface QuoteCard { text: string; title: string; author: string; chapter: string; bg: string; fg: string; muted: string; accent: string; serif: string; mono: string }

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/)) {
    const next = line ? line + ' ' + w : w
    if (ctx.measureText(next).width > width && line) { out.push(line); line = w } else line = next
  }
  if (line) out.push(line)
  return out
}

export async function quoteCard(q: QuoteCard): Promise<Blob> {
  const W = 1080, H = 1350, pad = 110
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = q.bg; ctx.fillRect(0, 0, W, H)
  const text = q.text.replace(/\s+/g, ' ').trim()
  const quote = /^[“"‘]/.test(text) ? text : `“${text}”`
  let size = 58, lines: string[] = []
  for (; size >= 30; size -= 4) {
    ctx.font = `${size}px ${q.serif}`
    lines = wrap(ctx, quote, W - 2 * pad)
    if (lines.length * size * 1.42 < H - 2 * pad - 220) break
  }
  const lh = size * 1.42, top = (H - lines.length * lh) / 2 - 30
  ctx.fillStyle = q.accent; ctx.font = `44px ${q.serif}`
  ctx.fillText('❦', pad, pad + 30)
  ctx.fillStyle = q.fg; ctx.font = `${size}px ${q.serif}`; ctx.textBaseline = 'top'
  lines.forEach((l, i) => ctx.fillText(l, pad, top + i * lh))
  ctx.fillStyle = q.muted; ctx.font = `500 24px ${q.mono}`; ctx.textBaseline = 'alphabetic'
  const by = [q.title, q.author].filter(Boolean).join(' · ').toUpperCase()
  ctx.fillText(by.length > 60 ? by.slice(0, 58) + '…' : by, pad, H - pad - 34)
  if (q.chapter) { ctx.font = `italic 26px ${q.serif}`; ctx.fillText(q.chapter, pad, H - pad + 6) }
  ctx.fillStyle = q.accent; ctx.fillRect(pad, top - 44, 56, 3)
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('no image'))), 'image/png'))
}

/** Hand the card to the phone's share sheet, or save it where sharing files isn't possible. */
export async function shareCard(blob: Blob, name: string) {
  const file = new File([blob], name, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }).catch(() => {}); return 'shared' }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name })
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  return 'saved'
}
