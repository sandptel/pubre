// Find the cast of a book from plain chapter text (heuristic, on-device, no models).
// A name is a capitalised token that isn't sentence-initial, appears ≥ 3 times, and is rarely seen
// lowercase. Titles are dropped ("Captain Ahab" → Ahab), two-word names are kept ("Moby Dick"), and
// tokens mostly preceded by place prepositions ("in Nantucket") are classed as places, not people.

export interface NameInfo { name: string; kind: 'person' | 'place' | 'thing'; count: number; perSpine: number[]; first: number; slot: number }

const STOP = new Set(('I Mr Mrs Ms Miss Dr Sir Madam Lord Lady Captain Capt Mate King Queen Prince Princess Saint St Father Mother Aunt Uncle ' +
  'God Heaven Oh O Ah Yes No Not The A An And But Or So Then There Here This That These Those It Its He She They We You Your His Her Their Our My ' +
  'What When Where Why How Who Whom Which Well Now Yet Still Thus Let If In On At To Of For With By From As Is Was Be ' +
  'Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December ' +
  'Chapter Book Part Volume Section Mr. Mrs. Dr. CHAPTER BOOK PART Project Cape Mount Lake River Bay Sea Ocean Isle Island Strait Gulf Point').split(' '))
const PREP = /\b(in|at|from|to|of|near|into|toward|towards|on|off|round|around)\s*$/i
const THE = /\b(the|a|an|this|that|our|his|her|their)\s*$/i
const STOP_PHRASES = new Set(['Project Gutenberg', 'Gutenberg', 'Literary Archive', 'Foundation', 'United States', 'Internet Archive'])
const DEMONYM = /(ish|ese|ian|ans)$/
const TOKEN = /[A-Z][a-z’'-]*[a-z]|[A-Z]/g
const clean = (t: string) => t.replace(/[’']s$/, '')
const CONTRACTION = /[’'](ll|d|ve|m|re|t)$/

export function findNames(texts: string[], opts: { min?: number; slots?: number } = {}): NameInfo[] {
  const min = opts.min ?? 3, slots = opts.slots ?? 7
  const cap = new Map<string, { n: number; prep: number; the: number; per: number[]; first: number }>()
  const lower = new Map<string, number>()
  for (const [si, raw] of texts.entries()) {
    const text = raw.replace(/\s+/g, ' ')
    for (const m of text.toLowerCase().matchAll(/[a-z][a-z’'-]*[a-z]/g)) lower.set(m[0], (lower.get(m[0]) ?? 0))
    for (const m of text.matchAll(/(?<![A-Za-z’'])[a-z][a-z’'-]*[a-z]/g)) lower.set(m[0], (lower.get(m[0]) ?? 0) + 1)
    let prevEnd = 0, prevTok = ''
    for (const m of text.matchAll(TOKEN)) {
      if (CONTRACTION.test(m[0])) { prevTok = ''; continue }
      const tok = clean(m[0]), i = m.index!
      const before = text.slice(Math.max(0, i - 4), i)
      const gap = text.slice(prevEnd, i)
      const initial = i === 0 || /[.!?…:;]["”’)\]]*\s*["“‘(]*\s*$/.test(text.slice(Math.max(0, i - 6), i)) || /^\s*["“‘(]\s*$/.test(before.slice(-2))
      // Two-word name: previous capitalised token right before (single space), neither a stopword.
      if (prevTok && /^ $/.test(gap) && !STOP.has(prevTok) && !STOP.has(tok)) bump(`${prevTok} ${tok}`, si, text.slice(Math.max(0, i - prevTok.length - 9), i - prevTok.length - 1))
      if (!initial && !STOP.has(tok) && tok.length > 1) bump(tok, si, text.slice(Math.max(0, i - 8), i))
      prevEnd = i + tok.length; prevTok = initial && STOP.has(tok) ? '' : tok
    }
  }
  function bump(name: string, si: number, before: string) {
    if (STOP_PHRASES.has(name)) return
    let e = cap.get(name)
    if (!e) cap.set(name, (e = { n: 0, prep: 0, the: 0, per: new Array(texts.length).fill(0), first: si }))
    e.n++; e.per[si]++
    if (PREP.test(before)) e.prep++
    if (THE.test(before)) e.the++
  }
  const out: NameInfo[] = []
  for (const [name, e] of cap) {
    if (e.n < min) continue
    const parts = name.split(' ')
    const lowOf = (w: string) => lower.get(w.toLowerCase()) ?? 0
    if (parts.length === 1 && lowOf(name) > e.n * 0.15) continue // usually a common word ("Whale", "Sea")
    if (parts.length === 2 && parts.every(w => lowOf(w) > 20)) continue // capitalised common phrase ("Sperm Whale")
    if (parts.some(w => STOP_PHRASES.has(w))) continue
    const kind = DEMONYM.test(name) || e.the / e.n > 0.5 ? 'thing' : e.prep / e.n > 0.5 ? 'place' : 'person'
    out.push({ name, kind, count: e.n, perSpine: e.per, first: e.first, slot: -1 })
  }
  // A single token that mostly occurs inside a kept two-word name is an alias, not its own entity.
  const pairs = out.filter(n => n.name.includes(' '))
  const final = out.filter(n => n.name.includes(' ') || !pairs.some(p => p.name.split(' ').includes(n.name) && p.count >= n.count * 0.6))
  final.sort((a, b) => b.count - a.count)
  let s = 0
  for (const n of final) if (n.kind === 'person' && s < slots) n.slot = s++
  return final
}
