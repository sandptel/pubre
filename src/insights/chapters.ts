// Chapter profiles: each chapter's own numbers, computed once on-device. Used for chapter openers
// (the room a chapter opens into), fingerprints (Posavec's sentence drawing), and the capsule.
// Structure only — sentence lengths, how much is spoken, a dark↔bright lean — so it is safe to show
// for chapters you haven't read yet (no names, no words).

export type Opener = 'classic' | 'daylight' | 'nocturne' | 'stage' | 'swell'
export interface ChapterInfo { spine: number; title: string; words: number; lens: number[]; talk: number; mood: number; avg: number }

const DARK = /\b(dark|darkness|night|nights|black|death|dead|die|died|grave|gloom|gloomy|shadow|shadows|storm|fear|feared|cold|blood|midnight|coffin|doom|dread|grief|sorrow|tears|weep|wept|cruel|evil|hell|ghost|pale|wreck|drown|drowned)\b/gi
const BRIGHT = /\b(light|sun|sunny|sunshine|bright|warm|joy|joyful|laugh|laughed|laughing|smile|smiled|gold|golden|morning|day|glad|sweet|fair|merry|happy|gay|delight|delighted|pleasant|cheerful|love|loved|lovely|dance|dancing|spring|summer)\b/gi
const SENTENCES = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('en', { granularity: 'sentence' }) : null

const strip = (html: string) => html
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8220;|&ldquo;/g, '“').replace(/&#8221;|&rdquo;/g, '”')
  .replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()

/** Numbers for one stretch of prose. */
export function profile(text: string): Omit<ChapterInfo, 'spine' | 'title'> {
  const lens: number[] = []
  const parts = SENTENCES ? [...SENTENCES.segment(text)].map(s => s.segment) : text.split(/(?<=[.!?])\s+/)
  for (const s of parts) { const n = (s.match(/[A-Za-z’'-]+/g) || []).length; if (n) lens.push(n) }
  const words = lens.reduce((a, n) => a + n, 0)
  const quoted = [...text.matchAll(/“[^”]*”|"[^"]{1,600}"/g)].reduce((a, m) => a + m[0].length, 0)
  const dark = text.match(DARK)?.length ?? 0, bright = text.match(BRIGHT)?.length ?? 0
  return { words, lens: lens.length > 300 ? sample(lens, 300) : lens, talk: text.length ? quoted / text.length : 0, mood: (bright - dark) / (bright + dark + 4), avg: lens.length ? words / lens.length : 0 }
}
const sample = (a: number[], n: number) => Array.from({ length: n }, (_, i) => a[Math.floor(i * a.length / n)])

/** Split one spine file's HTML at its chapter headings (h1/h2) and profile each chapter. */
export function chapters(spine: number, html: string): ChapterInfo[] {
  const cuts = [...html.matchAll(/<h[12][\s>][\s\S]*?<\/h[12]>/gi)]
  const out: ChapterInfo[] = []
  if (!cuts.length) { const t = strip(html); if (t) out.push({ spine, title: '', ...profile(t) }); return out }
  const pre = strip(html.slice(0, cuts[0].index))
  if (pre.length > 400) out.push({ spine, title: '', ...profile(pre) })
  cuts.forEach((m, i) => {
    const end = i + 1 < cuts.length ? cuts[i + 1].index! : html.length
    const title = strip(m[0]), body = strip(html.slice(m.index! + m[0].length, end))
    if (body) out.push({ spine, title, ...profile(body) })
  })
  return out
}

/** The room a chapter opens into, from its own numbers. */
export function openerOf(c: Pick<ChapterInfo, 'talk' | 'mood' | 'avg' | 'words'>): Opener {
  if (c.words < 120) return 'classic'
  if (c.talk > 0.42) return 'stage'      // a chapter that is mostly spoken reads like a script
  if (c.mood < -0.3) return 'nocturne'   // dark
  if (c.mood > 0.35) return 'daylight'   // bright
  if (c.avg > 30) return 'swell'         // long, rolling sentences
  return 'classic'
}

/** Posavec's sentence drawing: a line that turns right after every sentence, each segment as long as
 *  the sentence. Returns an SVG path in a box of `size` (with a little margin). */
export function fingerprint(lens: number[], size = 24): string {
  if (!lens.length) return ''
  let x = 0, y = 0, dx = 0, dy = -1, minX = 0, maxX = 0, minY = 0, maxY = 0
  const pts: [number, number][] = [[0, 0]]
  for (const n of lens) {
    x += dx * n; y += dy * n
    pts.push([x, y])
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    ;[dx, dy] = [-dy, dx] // turn right
  }
  const span = Math.max(maxX - minX, maxY - minY, 1), k = (size - 2) / span
  const ox = 1 + ((size - 2) - (maxX - minX) * k) / 2, oy = 1 + ((size - 2) - (maxY - minY) * k) / 2
  return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${(ox + (px - minX) * k).toFixed(1)} ${(oy + (py - minY) * k).toFixed(1)}`).join('')
}

/** Match a TOC label to a profiled chapter (titles are compared loosely). */
export function chapterFor(list: ChapterInfo[], label: string, spine = -1): ChapterInfo | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const want = norm(label)
  if (want) { const hit = list.find(c => c.title && (norm(c.title) === want || norm(c.title).startsWith(want) || want.startsWith(norm(c.title)))); if (hit) return hit }
  return spine >= 0 ? list.find(c => c.spine === spine) : undefined
}
