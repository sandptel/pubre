// English lexicon on-device: the common-word list (wordfreq, Zipf ≥ 3) decides what is "hard";
// rare-word definitions (Open English WordNet) load lazily, one first-letter shard at a time.
// Data and attribution: public/data/ATTRIBUTION.md.

const base = () => (import.meta.env?.BASE_URL ?? '/') + 'data/'
let common: Promise<Set<string>> | undefined
const shards = new Map<string, Promise<Record<string, string>>>()
const loaded = new Map<string, Record<string, string>>() // shards already fetched, for sync lookups
const waiting = new Set<() => void>()

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
  if (w.endsWith('ier')) add(w.slice(0, -3) + 'y')
  if (w.endsWith('iest')) add(w.slice(0, -4) + 'y')
  if (w.endsWith('er')) { add(w.slice(0, -2)); add(w.slice(0, -1)) }
  if (w.endsWith('est')) { add(w.slice(0, -3)); add(w.slice(0, -2)) }
  if (w.endsWith('ness')) { add(w.slice(0, -4)); if (w.endsWith('iness')) add(w.slice(0, -5) + 'y') }
  if (w.endsWith('some')) add(w.slice(0, -4))
  return out
}

/** Hard = none of its plausible dictionary forms is a common English word. */
export function isHard(word: string, set: Set<string>): boolean {
  if (!set.size || word.length < 4) return false
  // A hyphenated compound is hard only if one of its parts is ("cabin-gangway" isn't; "half-binnacle" would be).
  if (word.includes('-')) return word.split('-').some(p => p.length >= 4 && isHard(p, set))
  // Contractions, possessives and dialect ("we'll", "d'ye", "whale’s"): never marked.
  if (/[’']/.test(word)) return false
  return !lemmas(word).some(l => set.has(l))
}

export interface Definition { word: string; lemma: string; pos: string; text: string }
const POS: Record<string, string> = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' }

// Shard entries are "pos|definition|zipf" (zipf = wordfreq frequency of the lemma, 0 = unseen).
function shard(c: string) {
  let p = shards.get(c)
  if (!p) shards.set(c, (p = fetch(base() + `defs/${c}.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}))
    .then((d: Record<string, string>) => { loaded.set(c, d); for (const f of waiting) f(); return d })))
  return p
}
const parse = (word: string, lemma: string, hit: string): Definition => {
  const i = hit.indexOf('|'), j = hit.lastIndexOf('|'), pos = hit.slice(0, i)
  return { word, lemma, pos: POS[pos] ?? pos, text: hit.slice(i + 1, j > i ? j : undefined) }
}

export async function define(word: string): Promise<Definition | null> {
  for (const l of lemmas(word)) {
    if (!/[a-z]/.test(l[0])) continue
    const hit = (await shard(l[0]))[l]
    if (hit) return parse(word, l, hit)
  }
  return null
}

/**
 * How rare a word is (wordfreq Zipf of its dictionary form; lower = rarer), synchronously:
 * `null` when it has no offline definition, `undefined` while its shard is still loading
 * (the shard is fetched, and `onDefs` listeners fire when it lands).
 */
export function rarity(word: string): number | null | undefined {
  for (const l of lemmas(word)) {
    if (!/[a-z]/.test(l[0])) continue
    const d = loaded.get(l[0])
    if (!d) { void shard(l[0]); return undefined }
    const hit = d[l]
    if (hit) return +hit.slice(hit.lastIndexOf('|') + 1) || 0
  }
  return null
}
export function onDefs(f: () => void) { waiting.add(f); return () => waiting.delete(f) }
