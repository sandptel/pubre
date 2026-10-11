// The finish keepsake: your copy, drawn. Every punctuation mark of an opening chapter set along a
// spiral (after Nicholas Rougeux's "Between the Words"), ringed by the book's mood, chapter by chapter.

const GLYPH: Record<string, (x: number, y: number, s: number) => string> = {
  '.': (x, y, s) => `<circle cx="${x}" cy="${y}" r="${s * .9}"/>`,
  ',': (x, y, s) => `<path d="M${x} ${y - s}q${s} ${s} ${-s * .4} ${s * 2.2}" fill="none" stroke-width="${s * .7}"/>`,
  ';': (x, y, s) => `<circle cx="${x}" cy="${y - s}" r="${s * .6}"/><path d="M${x} ${y + s * .2}q${s} ${s} ${-s * .4} ${s * 2}" fill="none" stroke-width="${s * .6}"/>`,
  ':': (x, y, s) => `<circle cx="${x}" cy="${y - s}" r="${s * .6}"/><circle cx="${x}" cy="${y + s}" r="${s * .6}"/>`,
  '!': (x, y, s) => `<path d="M${x} ${y - s * 2}v${s * 2.2}" stroke-width="${s * .8}"/><circle cx="${x}" cy="${y + s * 1.2}" r="${s * .5}"/>`,
  '?': (x, y, s) => `<path d="M${x - s} ${y - s}a${s} ${s} 0 1 1 ${s} ${s}v${s * .6}" fill="none" stroke-width="${s * .6}"/>`,
  '—': (x, y, s) => `<path d="M${x - s * 2} ${y}h${s * 4}" stroke-width="${s * .6}"/>`,
}
const dash = (x: number, y: number, s: number) => `<path d="M${x - s} ${y}h${s * 2}" stroke-width="${s * .6}"/>`
const quote = (x: number, y: number, s: number) => `<path d="M${x - s * .6} ${y - s}v${s}M${x + s * .6} ${y - s}v${s}" stroke-width="${s * .5}"/>`

/** An SVG (2:3, like a cover) of the punctuation spiral inside a ring of chapter moods. */
export function keepsakeSvg(punct: string, moods: string[], title: string, ink = '#1b1b1d', paper = '#f3f1ec'): string {
  const W = 400, H = 600, cx = W / 2, cy = 258, marks: string[] = []
  const n = Math.max(1, punct.length)
  for (let i = 0; i < punct.length; i++) {
    const t = i / n, a = i * 0.137 * Math.PI, r = 14 + t * 150 // an Archimedean spiral, outward
    const x = +(cx + Math.cos(a) * r).toFixed(1), y = +(cy + Math.sin(a) * r).toFixed(1)
    const c = punct[i], g = GLYPH[c] ?? (/[“”"’]/.test(c) ? quote : dash)
    marks.push(g(x, y, 1.4 + t * 1.2))
  }
  const ring = moods.map((m, i) => {
    const a0 = (i / moods.length) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / moods.length) * 2 * Math.PI - Math.PI / 2 - 0.004
    const R = 178, p = (a: number) => `${(cx + Math.cos(a) * R).toFixed(1)} ${(cy + Math.sin(a) * R).toFixed(1)}`
    return `<path d="M${p(a0)}A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}" stroke="${m}" stroke-width="10" fill="none"/>`
  }).join('')
  const safe = title.replace(/[<&>"]/g, '').slice(0, 48)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${paper}"/>${ring}<g fill="${ink}" stroke="${ink}" stroke-linecap="round">${marks.join('')}</g><text x="${cx}" y="520" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="${ink}">${safe}</text><text x="${cx}" y="552" text-anchor="middle" font-family="ui-monospace, monospace" font-size="11" letter-spacing="3" fill="${ink}" opacity=".6">YOUR COPY · ${punct.length} MARKS</text></svg>`
}
