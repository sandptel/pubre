// More book insights, computed once in the worker: who is seen with whom (for character cards),
// the words used exactly once in the whole book (rare-word sparks), and the punctuation of an opening
// chapter (the finish keepsake). Everything is indexed by spine item so callers can stay spoiler-safe.

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const strip = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')

/** For each person, the others named in the same paragraph, with the spine items where that happened. */
export function castLinks(htmls: string[], people: string[]): Record<string, Record<string, number[]>> {
  const out: Record<string, Record<string, number[]>> = {}
  if (people.length < 2) return out
  const re = new RegExp(`(?<![A-Za-z])(${[...people].sort((a, b) => b.length - a.length).map(esc).join('|')})(?![A-Za-z])`, 'g')
  htmls.forEach((html, si) => {
    for (const para of html.split(/<\/p>|<br\s*\/?>\s*<br|\n\s*\n/i)) {
      const here = [...new Set([...strip(para).matchAll(re)].map(m => m[1]))]
      if (here.length < 2) continue
      for (const a of here) for (const b of here) {
        if (a === b) continue
        const spines = ((out[a] ||= {})[b] ||= [])
        if (spines[spines.length - 1] !== si) spines.push(si)
      }
    }
  })
  return out
}

/** Who a person is most often seen with, counting only spine items up to `upto` (spoiler-safe). */
export function companions(links: Record<string, Record<string, number[]>> | undefined, name: string, upto: number, n = 3): string[] {
  const mine = links?.[name]
  if (!mine) return []
  return Object.entries(mine).map(([o, s]) => [o, s.filter(i => i <= upto).length] as const).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([o]) => o)
}

/** Lower-case words of 5+ letters that occur exactly once in the whole book, with their spine item. */
export function hapax(htmls: string[]): Record<string, number> {
  const count = new Map<string, number>(), where = new Map<string, number>()
  htmls.forEach((html, si) => {
    for (const m of strip(html).toLowerCase().matchAll(/(?<![a-z’'-])[a-z]{5,}(?![a-z’'-])/g)) {
      count.set(m[0], (count.get(m[0]) ?? 0) + 1)
      if (!where.has(m[0])) where.set(m[0], si)
    }
  })
  const out: Record<string, number> = {}
  for (const [w, c] of count) if (c === 1) out[w] = where.get(w)!
  return out
}

/** The punctuation of the first substantial chapter, in order (for the finish keepsake). */
export function punctuation(htmls: string[], minWords = 1200, max = 3000): string {
  for (const html of htmls) {
    const text = strip(html)
    if ((text.match(/[A-Za-z]+/g) ?? []).length < minWords) continue
    return (text.match(/[.,;:!?—–’“”"()…-]/g) ?? []).join('').slice(0, max)
  }
  return ''
}
