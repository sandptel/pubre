// English lexicon on-device: the common-word list (wordfreq, Zipf ≥ 3) decides what is "hard";
// rare-word definitions (Open English WordNet) load lazily, one first-letter shard at a time.
// Data and attribution: public/data/ATTRIBUTION.md.

const base = () => (import.meta.env?.BASE_URL ?? '/') + 'data/'
let common: Promise<Set<string>> | undefined
const shards = new Map<string, Promise<Record<string, string>>>()

export function loadCommon(): Promise<Set<string>> {
  return common ??= fetch(base() + 'common-en.txt').then(r => (r.ok ? r.text() : '')).then(t => new Set(t.split('\n'))).catch(() => new Set())
}

/** Plausible dictionary forms of an inflected word, most likely first. */
export function lemmas(word: string): string[] {
  const w = word.toLowerCase().replace(/[’']s$/, '')
  const out = [w]
  const add = (s: string) => { if (s.length > 2 && !out.includes(s)) out.push(s) }
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) add(w.slice(0, -2))
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1))
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y')
  if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)); if (/(.)\1ed$/.test(w)) add(w.slice(0, -3)) }
  if (w.endsWith('ing')) { add(w.slice(0, -3)); add(w.slice(0, -3) + 'e'); if (/(.)\1ing$/.test(w)) add(w.slice(0, -4)) }
  if (w.endsWith('ly')) { add(w.slice(0, -2)); if (w.endsWith('ily')) add(w.slice(0, -3) + 'y') }
  if (w.endsWith('er')) add(w.slice(0, -2))
  if (w.endsWith('est')) add(w.slice(0, -3))
  if (w.endsWith('ness')) add(w.slice(0, -4))
  return out
}

/** Hard = none of its plausible dictionary forms is a common English word. */
export function isHard(word: string, set: Set<string>): boolean {
  if (!set.size || word.length < 4) return false
  // A hyphenated compound is hard only if one of its parts is ("cabin-gangway" isn't; "half-binnacle" would be).
  if (word.includes('-')) return word.split('-').some(p => p.length >= 4 && isHard(p, set))
  // Contractions and possessives: judge the word before the apostrophe ("can’t", "whale’s").
  if (/[’']/.test(word)) { const base = word.split(/[’']/)[0]; return base.length >= 4 && isHard(base, set) }
  return !lemmas(word).some(l => set.has(l))
}

export interface Definition { word: string; lemma: string; pos: string; text: string }
const POS: Record<string, string> = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' }

export async function define(word: string): Promise<Definition | null> {
  for (const l of lemmas(word)) {
    const c = l[0]
    if (!/[a-z]/.test(c)) continue
    let p = shards.get(c)
    if (!p) shards.set(c, (p = fetch(base() + `defs/${c}.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}))))
    const hit = (await p)[l]
    if (hit) { const [pos, text] = hit.split('|'); return { word, lemma: l, pos: POS[pos] ?? pos, text } }
  }
  return null
}
