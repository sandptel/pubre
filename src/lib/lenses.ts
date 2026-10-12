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
export interface Token { kind: TokenKind; blk: number; a: number; b: number; key: string; slot: number; range?: Range }
interface Parsed { tokens: Token[]; byBlock: Map<number, Token[]>; share: Map<number, number> }

const SAY = 'said|says|whispered|cried|repeated|muttered|asked|shouted|rejoined|replied|answered|exclaimed|called|roared|sighed|added|continued|returned|observed'
const HON = '(?:(?:Mr|Mrs|Miss|Ms|Captain|Capt|Dr|Lady|Sir|Lord)\\.?\\s+)?'
const QUOTES = /“[^”]*”?|"[^"\n]{1,600}"?/g
const ASIDES = /\([^)]{2,160}\)/g // parentheses only: dash pairs are often emphasis, not asides
const SMALL = /^(of|the|a|an|and|in|on|to|for|at|by|or|with)$/
export const RARE = 2.3 // Zipf below which a defined word is worth marking
/** A short quote whose words are all capitalised ("The Night Before Christmas") is a title, not speech. */
const isTitle = (q: string) => { const w = q.replace(/[“”"]/g, '').trim().split(/\s+/); return w.length <= 6 && !/[.!?,]$/.test(q.replace(/[“”"]/g, '').trim()) && w.every(x => /^[A-Z0-9]/.test(x) || SMALL.test(x)) }

export interface Quote { a: number; b: number; speaker: string | null }
/**
 * Who speaks each quote, confident only: an explicit tag next to the quote ("said Mr. Darcy",
 * "Ahab cried"), else the paragraph's single tagged speaker, else an unclosed quote carried from a
 * tagged previous paragraph. Anything else stays unattributed (plain ink). Titles and epigraphs
 * (a paragraph that is > 80% one untagged quote) are not speech at all.
 */
export function attribute(blocks: string[], names: string[]): Quote[][] {
  const alt = names.map(esc).join('|')
  const after = alt ? new RegExp(`^[\\s,;—]*(?:(?:${SAY})\\s+${HON}(${alt})\\b|${HON}(${alt})\\s+(?:\\w+\\s+)?(?:${SAY})\\b)`) : null
  const before = alt ? new RegExp(`(?:(?:${SAY})\\s+${HON}(${alt})|${HON}(${alt})\\s+(?:\\w+\\s+)?(?:${SAY}))[\\s,:—]*$`) : null
  let carry: string | null = null
  return blocks.map(text => {
    const found = [...text.matchAll(QUOTES)].filter(m => !isTitle(m[0]))
    if (!found.length) { carry = null; return [] }
    const qs: Quote[] = found.map(m => {
      const a = m.index!, b = a + m[0].length
      const t = (after && text.slice(b, b + 60).match(after)) || (before && text.slice(Math.max(0, a - 60), a).match(before))
      return { a, b, speaker: t ? t[1] ?? t[2] : null }
    })
    if (qs.length === 1 && !qs[0].speaker && !carry && qs[0].b - qs[0].a > 0.8 * text.trim().length) { carry = null; return [] }
    const tagged = new Set(qs.map(q => q.speaker).filter(Boolean))
    const own = tagged.size === 1 ? [...tagged][0]! : null
    if (carry && /^\s*[“"]/.test(text) && !qs[0].speaker && (!own || own === carry)) qs[0].speaker = carry
    for (const q of qs) q.speaker ??= own
    const last = found[found.length - 1][0]
    carry = /[”"]$/.test(last) && last.length > 1 ? null : qs[qs.length - 1].speaker
    return qs
  })
}
const HARDWORD = /(?<![A-Za-z’'-])[a-z][a-z’'-]{3,}(?![A-Za-z])/g
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
    const blocks = v.ix.blocks.map(blk => (blk.kind === 'text' ? blk.text : ''))
    const quotes = attribute(blocks, [...this.canon.keys()])
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
      for (const q of qs) { const who = q.speaker ? this.person(q.speaker) : undefined; add({ kind: 'speech', blk: bi, a: q.a, b: q.b, key: who?.name ?? q.speaker ?? '', slot: who?.slot ?? -1 }) }
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
