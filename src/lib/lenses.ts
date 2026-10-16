import { FEMALE, MALE, TITLES } from '../insights/gazetteer.ts'
// Lenses: the visual grammar's "who" (names, Voices) and "tell me more" (hard words, foreign phrases),
// plus asides (contrast). Richness without clutter, per plan v3 + reading research + critic pass #1:
//  · attention budget per painted range (≈ the pages around you), scaled by intensity: names tinted at
//    first mention, at most 3 character hues (5 at Rich), hard words ≤ 3 (6) and ≤ 1 per sentence, rarest first
//  · confident only: a quote takes a voice colour only from an explicit speech tag; a hard word is
//    marked only when it is rare (Zipf < 2.3) and has an offline definition
//  · focus scoping: while guiding only the focus block is painted
//  · graceful softening: dialogue-heavy blocks (> 60% speech) get softer Voices ink
import type { View } from './paginator.ts'
import type { Settings } from './settings.ts'
import type { NameInfo } from '../insights/names.ts'
import { isHard, rarity, onDefs } from './lexicon.ts'
import { blockOffsets, blockRange } from './textindex.ts'

export type TokenKind = 'name' | 'hard' | 'foreign' | 'speech' | 'aside'
export interface Token { kind: TokenKind; blk: number; a: number; b: number; key: string; slot: number; range?: Range; guess?: boolean }
interface Parsed { tokens: Token[]; byBlock: Map<number, Token[]>; share: Map<number, number> }

const SAY = 'said|says|whispered|cried|repeated|muttered|asked|shouted|rejoined|replied|answered|exclaimed|called|roared|sighed|added|continued|returned|observed|admitted|agreed|insisted|protested|laughed|murmured'
const HON = '(?:(?:Mr|Mrs|Miss|Ms|Captain|Capt|Dr|Lady|Sir|Lord)\\.?\\s+)?'
const QUOTES = /“[^”]*”?|"[^"\n]{1,600}"?/g
const ASIDES = /\([^)]{2,160}\)/g // parentheses only: dash pairs are often emphasis, not asides
const SMALL = /^(of|the|a|an|and|in|on|to|for|at|by|or|with)$/
export const RARE = 2.3 // Zipf below which a defined word is worth marking
/** A short quote whose words are all capitalised ("The Night Before Christmas") is a title, not speech. */
const isTitle = (q: string) => { const w = q.replace(/[“”"]/g, '').trim().split(/\s+/); return w.length <= 6 && !/[.!?,]$/.test(q.replace(/[“”"]/g, '').trim()) && w.every(x => /^[A-Z0-9]/.test(x) || SMALL.test(x)) }

export interface Quote { a: number; b: number; speaker: string | null; guess?: boolean }
/**
 * Who speaks each quote, confident only: an explicit tag next to the quote ("said Mr. Darcy",
 * "Ahab cried"), else the paragraph's single tagged speaker, else an unclosed quote carried from a
 * tagged previous paragraph. Anything else stays unattributed (plain ink). Titles and epigraphs
 * (a paragraph that is > 80% one untagged quote) are not speech at all.
 */
export function attribute(blocks: string[], names: string[], gender: (name: string) => '' | 'm' | 'f' = () => ''): Quote[][] {
  const alt = names.map(esc).join('|')
  const pron = new RegExp(`^[\\s,;—]*(?:(?:${SAY})\\s+(he|she)\\b|(he|she)\\s+(?:\\w+\\s+)?(?:${SAY})\\b)`, 'i')
  const rel = new RegExp(`^[\\s,;—]*(?:(?:${SAY})\\s+(?:his|her)\\s+(wife|lady|husband|mother|father|daughter|son|sister|brother|aunt|uncle)\\b|(?:his|her)\\s+(wife|lady|husband|mother|father|daughter|son|sister|brother|aunt|uncle)\\s+(?:\\w+\\s+)?(?:${SAY})\\b)`, 'i')
  const voc = alt ? new RegExp(`^[“"]\\s*(?:(?:[Mm]y\\s+)?[Dd]ear(?:est)?\\s+|[Oo]h,?\\s+)?${HON}(${alt})\\s*[,!]`) : null
  const mention = alt ? new RegExp(`(?<![A-Za-z])${HON}(${alt})(?![A-Za-z])`, 'g') : null
  const mentioned: string[] = [] // names in the text, most recent first (narration counts, not only speakers)
  const about: string[] = [] // names in the narration only (who is in the room, not who is talked about)
  const noted = (n: string) => { const i = mentioned.indexOf(n); if (i >= 0) mentioned.splice(i, 1); mentioned.unshift(n); mentioned.length = Math.min(mentioned.length, 12) }
  const surname = (n: string) => n.replace(/^(?:Mr|Mrs|Miss|Ms|Sir|Lady|Lord)\.?\s+/, '')
  const FEM = /wife|lady|mother|daughter|sister|aunt/i
  /** "his wife" when Mr. Bennet is about → Mrs. Bennet; "her mother" → the latest Mrs.; else the latest of that gender. */
  const kin = (noun: string): string | null => {
    const fem = FEM.test(noun), pool = [...new Set([...recent, ...mentioned])]
    if (/wife|lady/i.test(noun)) { const m = pool.find(n => /^Mr\.?\s/.test(n)); const w = m && names.find(n => /^Mrs\.?\s/.test(n) && surname(n) === surname(m)); if (w) return w }
    if (/husband/i.test(noun)) { const f = pool.find(n => /^Mrs\.?\s/.test(n)); const h = f && names.find(n => /^Mr\.?\s/.test(n) && surname(n) === surname(f)); if (h) return h }
    if (/mother/i.test(noun)) return pool.find(n => /^Mrs\.?\s/.test(n)) ?? names.find(n => /^Mrs\.?\s/.test(n)) ?? null
    if (/father/i.test(noun)) return pool.find(n => /^Mr\.?\s/.test(n)) ?? null
    return pool.find(n => gender(n) === (fem ? 'f' : 'm')) ?? null
  }
  const recent: string[] = [] // speakers, most recent first
  const learned = new Map<string, 'm' | 'f'>() // genders the text gives away: "said Tobias … he laughed"
  const sex = (n: string) => gender(n) || learned.get(n) || ''
  let lastTo: string | null = null // who the previous turn was spoken to ("My dear Mr. Bennet, …"): the likeliest to answer
  const full = (n: string) => names.find(x => x !== n && surname(x) === n && /^Mr\.?\s/.test(x)) ?? n
  const heard = (n: string | null) => { if (!n) return; const i = recent.indexOf(n); if (i >= 0) recent.splice(i, 1); recent.unshift(n); recent.length = Math.min(recent.length, 6) }
  let turns: (string | null)[] = [] // speakers of the run of dialogue paragraphs just before
  const after = alt ? new RegExp(`^[\\s,;—]*(?:(?:${SAY})\\s+${HON}(${alt})\\b|${HON}(${alt})\\s+(?:\\w+\\s+)?(?:${SAY})\\b)`) : null
  const before = alt ? new RegExp(`(?:(?:${SAY})\\s+${HON}(${alt})|${HON}(${alt})\\s+(?:\\w+\\s+)?(?:${SAY}))[\\s,:—]*$`) : null
  let carry: string | null = null
  return blocks.map(text => {
    const found = [...text.matchAll(QUOTES)].filter(m => !isTitle(m[0]))
    if (!found.length) { carry = null; if (mention) for (const m of text.matchAll(mention)) { const n = names.includes(m[0].trim()) ? m[0].trim() : m[1]; noted(n); const i = about.indexOf(n); if (i >= 0) about.splice(i, 1); about.unshift(n) } if (text.trim().length > 240) { turns = []; lastTo = null }; return [] } // a long stretch of narration ends the exchange
    const qs: Quote[] = found.map(m => {
      const a = m.index!, b = a + m[0].length
      const t = (after && text.slice(b, b + 60).match(after)) || (before && text.slice(Math.max(0, a - 60), a).match(before))
      return { a, b, speaker: t ? t[1] ?? t[2] : null }
    })
    const tagged1 = qs.length === 1 && (pron.test(text.slice(qs[0].b, qs[0].b + 40)) || rel.test(text.slice(qs[0].b, qs[0].b + 50)))
    if (qs.length === 1 && !qs[0].speaker && !carry && !tagged1 && !turns.some(Boolean) && qs[0].b - qs[0].a > 0.8 * text.trim().length) { carry = null; return [] } // an epigraph, not a turn in an exchange
    const tagged = new Set(qs.map(q => q.speaker).filter(Boolean))
    const own = tagged.size === 1 ? [...tagged][0]! : null
    if (carry && /^\s*[“"]/.test(text) && !qs[0].speaker && (!own || own === carry)) qs[0].speaker = carry
    for (const q of qs) q.speaker ??= own
    // Guesses, marked as such: "he said" → the last man who spoke; an untagged turn in a two-person exchange →
    // the one who isn't the last speaker (the Muzny sieve's turn-taking rule).
    if (mention) for (const m of text.matchAll(mention)) noted(names.includes(m[0].trim()) ? m[0].trim() : m[1])
    const outside = qs.reduceRight((t, q) => t.slice(0, q.a) + ' '.repeat(q.b - q.a) + t.slice(q.b), text)
    if (mention) for (const m of outside.matchAll(mention)) { const n = names.includes(m[0].trim()) ? m[0].trim() : m[1]; const i = about.indexOf(n); if (i >= 0) about.splice(i, 1); about.unshift(n) }
    const named = new Set(mention ? [...text.slice(qs[0].a, qs[qs.length - 1].b).matchAll(mention)].map(m => m[1]) : []) // nobody names themselves
    for (const q of qs) {
      if (q.speaker) continue
      const r = text.slice(q.b, q.b + 50).match(rel)
      if (r) { const who = kin(r[1] ?? r[2]); if (who) { q.speaker = who; q.guess = true; continue } }
      const g = text.slice(q.b, q.b + 40).match(pron)
      if (g) { const want = (g[1] ?? g[2]).toLowerCase() === 'she' ? 'f' : 'm'; const hit = [...(lastTo ? [lastTo] : []), ...recent, ...mentioned].find(n => sex(n) === want); if (hit) { q.speaker = hit; q.guess = true } }
    }
    // a turn that names who it's spoken to ("My dear Mr. Bennet, …"): in a two-person exchange, it's the other one
    const to = voc && qs[0] && !qs[0].speaker ? text.slice(qs[0].a, qs[0].a + 60).match(voc) : null
    if (to) { const addressee = to[1], other = [...new Set([...turns.slice(-3).filter(Boolean) as string[], ...recent])].find(n => n !== addressee && surname(n) !== addressee); if (other) { qs[0].speaker = other; qs[0].guess = true } }
    const opens = /^\s*[“"]/.test(text)
    if (opens && !qs[0].speaker && lastTo && turns[turns.length - 1] && turns[turns.length - 1] !== lastTo) { qs[0].speaker = lastTo; qs[0].guess = true } // answering who spoke to them
    if (opens && !qs[0].speaker && turns.length >= 2) {
      const b = turns[turns.length - 1], a = b ? [...turns].reverse().find(t => t && t !== b) : null
      if (a && b) { qs[0].speaker = a; qs[0].guess = true; for (const q of qs.slice(1)) if (!q.speaker) { q.speaker = a; q.guess = true } }
    }
    // only one side of the exchange known yet: the reply goes to whoever is about (spoken to, or last named)
    const lastTurn = turns[turns.length - 1]
    if (opens && !qs[0].speaker && lastTurn) {
      const other = [...(lastTo ? [lastTo] : []), ...about].find(n => n !== lastTurn && surname(n) !== surname(lastTurn) && !lastTurn.includes(n) && !n.includes(lastTurn) && !named.has(n) && !named.has(surname(n)))
      if (other) { qs[0].speaker = other; qs[0].guess = true }
    }
    for (const q of qs) heard(q.speaker)
    // a named speaker and a he or she outside the quotes in the same paragraph: that's their gender
    const own1 = qs.find(q => q.speaker && !q.guess)?.speaker
    if (own1 && !gender(own1)) { const out = qs.reduceRight((t, q) => t.slice(0, q.a) + ' ' + t.slice(q.b), text); const he = /\b(he|his|him)\b/i.test(out), she = /\b(she|her)\b/i.test(out); if (he !== she) learned.set(own1, he ? 'm' : 'f') }
    const said = voc ? qs.map(q => text.slice(q.a, q.a + 60).match(voc)?.[0] ? text.slice(q.a, q.a + 60).match(voc)![1] : null).find(Boolean) : null
    if (said) lastTo = full(said) // kept for the exchange: who she talks to is who answers
    if (opens) turns.push(qs[0].speaker); else turns = qs.some(q => q.speaker) ? [qs.find(q => q.speaker)!.speaker] : []
    const last = found[found.length - 1][0]
    carry = /[”"]$/.test(last) && last.length > 1 ? null : qs[qs.length - 1].speaker
    return qs
  })
}
const HARDWORD = /(?<![A-Za-z’'-])[a-z][a-z’'-]{3,}(?![A-Za-z])/g
/** A character's gender from a title or a known given name ('' when the text doesn't say). */
export function genderOf(name: string, alias = name): '' | 'm' | 'f' {
  for (const n of [alias, name]) {
    const [first, second] = n.replace(/\./g, '').split(/\s+/)
    const t = TITLES.get(first)
    if (t) return t
    if (FEMALE.has(first) || (second && FEMALE.has(second) && !MALE.has(first))) return 'f'
    if (MALE.has(first)) return 'm'
  }
  return ''
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export class Lenses {
  private s: Settings
  private cache = new WeakMap<View, Parsed>()
  private people: NameInfo[] = []
  private canon = new Map<string, string>() // any form of a name ("Lizzy", "Mr. Darcy") → its character's name
  private nameRe: RegExp | null = null
  private common = new Set<string>()
  private lang = 'en'

  /** Called (debounced) when definitions arrive, so hard words held back while loading can be painted. */
  onChange?: () => void
  /** Words used once in the whole book (rare-word sparks): word → spine item. */
  hapax: Record<string, number> = {}
  private changeT = 0

  constructor(s: Settings, lang = 'en') {
    this.s = s; this.lang = (lang || 'en').slice(0, 2).toLowerCase()
    onDefs(() => { clearTimeout(this.changeT); this.changeT = setTimeout(() => this.onChange?.(), 60) as unknown as number })
  }
  setSettings(s: Settings) { this.s = s }
  setCommon(set: Set<string>) { this.common = set; this.cache = new WeakMap() }
  setProfile(names: NameInfo[]) {
    this.people = names.filter(n => n.kind === 'person')
    this.canon = new Map(this.people.flatMap(p => [[p.name, p.name] as const, ...(p.aliases ?? []).map(a => [a, p.name] as const)]))
    const all = [...this.canon.keys()].sort((a, b) => b.length - a.length).map(esc)
    this.nameRe = all.length ? new RegExp(`(?<![A-Za-z])(${all.join('|')})(?:[’']s)?(?![A-Za-z])`, 'g') : null
    this.cache = new WeakMap()
  }
  invalidate(v: View) { this.cache.delete(v) }
  person(name: string) { const n = this.canon.get(name) ?? name; return this.people.find(p => p.name === n) }

  private parse(v: View): Parsed {
    let p = this.cache.get(v)
    if (p) return p
    p = { tokens: [], byBlock: new Map(), share: new Map() }
    const add = (t: Token) => { p!.tokens.push(t); let l = p!.byBlock.get(t.blk); if (!l) p!.byBlock.set(t.blk, (l = [])); l.push(t) }
    const blocks = v.ix.blocks.map(blk => (blk.kind === 'text' && !blk.el.closest?.('[data-pubre-caption], [data-pubre-plate]') ? blk.text : '')) // a picture's caption isn't a turn of speech
    const quotes = attribute(blocks, [...this.canon.keys()], n => genderOf(this.canon.get(n) ?? n, n))
    blocks.forEach((text, bi) => {
      if (!text) return
      if (this.nameRe) for (const m of text.matchAll(this.nameRe)) {
        const n = this.person(m[1])!
        add({ kind: 'name', blk: bi, a: m.index!, b: m.index! + m[1].length, key: n.name, slot: n.slot })
      }
      if (this.common.size) for (const m of text.matchAll(HARDWORD)) if (isHard(m[0], this.common)) add({ kind: 'hard', blk: bi, a: m.index!, b: m.index! + m[0].length, key: m[0].toLowerCase(), slot: -1 })
      for (const m of text.matchAll(ASIDES)) add({ kind: 'aside', blk: bi, a: m.index!, b: m.index! + m[0].length, key: '', slot: -1 })
      const qs = quotes[bi]
      p!.share.set(bi, qs.reduce((n, q) => n + q.b - q.a, 0) / Math.max(1, text.length))
      for (const q of qs) { const who = q.speaker ? this.person(q.speaker) : undefined; add({ kind: 'speech', blk: bi, a: q.a, b: q.b, key: who?.name ?? q.speaker ?? '', slot: who?.slot ?? -1, guess: q.guess }) }
    })
    // Foreign phrases: elements whose language differs from the book's.
    for (const el of Array.from(v.doc.querySelectorAll('[lang], [*|lang]'))) {
      const l = (el.getAttribute('lang') || el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') || '').slice(0, 2).toLowerCase()
      if (!l || l === this.lang || el === v.doc.documentElement || el.localName === 'body') continue
      const bi = v.ix.blocks.findIndex(b => b.el.contains(el))
      if (bi < 0) continue
      const r = v.doc.createRange(); r.selectNodeContents(el)
      add({ kind: 'foreign', blk: bi, a: 0, b: 0, key: l, slot: -1, range: r })
    }
    this.cache.set(v, p)
    return p
  }

  /** Paint marks for blocks in [fromBlock, toBlock] under one attention budget for the whole range. */
  paint(v: View, fromBlock: number, toBlock: number, _focus = -1) { // _focus: unused now that the budget is per range
    const m = v.marks, s = this.s
    const out: Record<string, Range[]> = {}
    const put = (name: string, r: Range) => (out[name] ||= []).push(r)
    if (s.intensity !== 'quiet') {
      const p = this.parse(v), rich = s.intensity === 'rich'
      const from = Math.max(0, fromBlock), to = Math.min(toBlock, v.ix.blocks.length - 1)
      const inRange: Token[] = []
      for (let bi = from; bi <= to; bi++) inRange.push(...(p.byBlock.get(bi) ?? []))
      const range = (t: Token) => t.range ?? blockRange(v.doc, v.ix.blocks[t.blk], t.a, t.b)
      // Hue budget: only the most present characters here keep their colour (names and Voices alike).
      const weight = new Map<string, number>()
      for (const t of inRange) if ((t.kind === 'name' || t.kind === 'speech') && t.slot >= 0) weight.set(t.key, (weight.get(t.key) ?? 0) + 1)
      const hued = new Set([...weight].sort((a, b) => b[1] - a[1]).slice(0, rich ? 5 : 3).map(([k]) => k))
      // who: first mention per range only
      if (s.names) {
        const seen = new Set<string>()
        for (const t of inRange) if (t.kind === 'name' && hued.has(t.key) && !seen.has(t.key)) { seen.add(t.key); put(`who-${t.slot}`, range(t)) }
      }
      // tell me more: rare words with a definition, rarest first, ≤ 1 per sentence
      if (s.hardWords && s.hardStyle === 'shown') {
        const sentence = (t: Token) => {
          const blk = v.ix.blocks[t.blk]
          for (let i = blk.a; i <= blk.b; i++) { const w = v.ix.words[i]; if (blk.starts[blk.nodes.indexOf(w.sn)] + w.so >= t.a) return w.s }
          return -1 - t.blk
        }
        const cands = inRange.filter(t => t.kind === 'hard').map(t => ({ t, z: rarity(t.key) })).filter((c): c is { t: Token; z: number } => typeof c.z === 'number' && c.z < RARE)
        const used = new Set<number>()
        let cap = rich ? 6 : 3
        for (const { t } of cands.sort((a, b) => a.z - b.z)) {
          if (cap <= 0) break
          const sn = sentence(t)
          if (used.has(sn)) continue
          used.add(sn); cap--; put(t.key in this.hapax ? 'spark' : 'hard', range(t)) // used once in the whole book: it glows
        }
      }
      if (s.foreign) inRange.filter(t => t.kind === 'foreign').slice(0, rich ? 4 : 2).forEach(t => put('foreign', range(t)))
      // Voices: only confidently attributed quotes, by characters inside the hue budget
      if (s.voices !== 'off') for (const t of inRange) {
        if (t.kind !== 'speech' || t.slot < 0 || !hued.has(t.key)) continue
        const blk = v.ix.blocks[t.blk], k = String(t.slot), soft = (p.share.get(t.blk) ?? 0) > 0.6
        if (s.voices === 'ink') put(`${soft ? 'v-soft' : 'v-ink'}-${k}`, range(t))
        else if (s.voices === 'underline') put(`v-under-${k}`, range(t))
        else { put(`v-marks-${k}`, blockRange(v.doc, blk, t.a, t.a + 1)); if (/[”"]$/.test(blk.text.slice(t.b - 1, t.b))) put(`v-marks-${k}`, blockRange(v.doc, blk, t.b - 1, t.b)) }
      }
      if (s.asides) for (const t of inRange) if (t.kind === 'aside') put('aside', range(t))
    }
    for (const prefix of ['who-', 'hard', 'foreign', 'v-', 'aside']) m.clear(prefix)
    for (const [name, rs] of Object.entries(out)) m.set(name, rs)
  }

  /** The name whisper: who speaks each dialogue paragraph in [from, to], only where the speaker changes and the
   *  paragraph doesn't name them already. `guess`: worked out from turn-taking or a pronoun, not a tag. */
  whispers(v: View, from: number, to: number): { blk: number; name: string; slot: number; guess: boolean }[] {
    const p = this.parse(v), out: { blk: number; name: string; slot: number; guess: boolean }[] = []
    let prev = ''
    for (let bi = Math.max(0, from - 12); bi <= to; bi++) {
      const ts = p.byBlock.get(bi) ?? [], sp = ts.find(t => t.kind === 'speech' && t.key)
      if (!sp) { if ((v.ix.blocks[bi]?.text.length ?? 0) > 240) prev = ''; continue }
      if (bi >= from && sp.key !== prev && !ts.some(t => t.kind === 'name' && t.key === sp.key))
        out.push({ blk: bi, name: sp.key, slot: sp.slot, guess: !!sp.guess })
      prev = sp.key
    }
    return out
  }
  /** Lens token under a DOM position (for hover / dwell cards). */
  tokenAt(v: View, node: Node, offset: number): Token | null {
    const p = this.parse(v)
    const bi = v.ix.blocks.findIndex(b => b.nodes.includes(node as Text))
    if (bi < 0) return null
    const blk = v.ix.blocks[bi], pos = blk.starts[blk.nodes.indexOf(node as Text)] + offset
    const hits = (p.byBlock.get(bi) ?? []).filter(t => t.kind !== 'aside' && (t.range ? t.range.isPointInRange(node, offset) : pos >= t.a && pos < t.b))
    const order: TokenKind[] = ['name', 'hard', 'foreign', 'speech']
    return hits.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0] ?? null
  }
  rangeOf(v: View, t: Token) { return t.range ?? blockRange(v.doc, v.ix.blocks[t.blk], t.a, t.b) }
  /** Every lens token in block b, unbudgeted (the Stage shows one paragraph at a time and has room). */
  tokensIn(v: View, b: number): Token[] { return this.parse(v).byBlock.get(b) ?? [] }
  /** Share of block b's text inside quotes (dialogue-heavy blocks get softer Voices). */
  shareOf(v: View, b: number) { return this.parse(v).share.get(b) ?? 0 }
  /** A token as offsets into its block's text. */
  offsets(v: View, t: Token): [number, number] | null { return t.range ? blockOffsets(v.ix.blocks[t.blk], t.range) : [t.a, t.b] }
}
