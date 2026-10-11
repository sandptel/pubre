// Lenses: the visual grammar's "who" (names, Voices) and "tell me more" (hard words, foreign phrases),
// plus asides (contrast). Richness without clutter, per plan v3 + reading research:
//  · attention budget per block, scaled by intensity; hard words ≤ 1 per sentence and ≈ 2% of words
//  · focus scoping: while guiding only the focus block is rich; otherwise only pages near you are painted
//  · graceful softening: dialogue-heavy blocks (> 60% speech) get softer Voices ink
import type { View } from './paginator.ts'
import type { Settings } from './settings.ts'
import type { NameInfo } from '../insights/names.ts'
import { isHard } from './lexicon.ts'
import { blockRange } from './textindex.ts'

export type TokenKind = 'name' | 'hard' | 'foreign' | 'speech' | 'aside'
export interface Token { kind: TokenKind; blk: number; a: number; b: number; key: string; slot: number; range?: Range }
interface Parsed { tokens: Token[]; byBlock: Map<number, Token[]>; share: Map<number, number> }

const SAY = 'said|whispered|cried|repeated|muttered|asked|shouted|rejoined|replied|answered|exclaimed|called|roared|sighed|added'
const QUOTES = /“[^”]*”?|"[^"\n]{1,600}"?/g
const ASIDES = /\([^)]{2,160}\)|—[^—.!?“”"]{3,120}—/g
const HARDWORD = /(?<![A-Za-z’'-])[a-z][a-z’'-]{3,}(?![A-Za-z])/g
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export class Lenses {
  private s: Settings
  private cache = new WeakMap<View, Parsed>()
  private people: NameInfo[] = []
  private nameRe: RegExp | null = null
  private common = new Set<string>()
  private lang = 'en'

  constructor(s: Settings, lang = 'en') { this.s = s; this.lang = (lang || 'en').slice(0, 2).toLowerCase() }
  setSettings(s: Settings) { this.s = s }
  setCommon(set: Set<string>) { this.common = set; this.cache = new WeakMap() }
  setProfile(names: NameInfo[]) {
    this.people = names.filter(n => n.kind === 'person')
    const all = [...this.people].sort((a, b) => b.name.length - a.name.length).map(n => esc(n.name))
    this.nameRe = all.length ? new RegExp(`(?<![A-Za-z])(${all.join('|')})(?:[’']s)?(?![A-Za-z])`, 'g') : null
    this.cache = new WeakMap()
  }
  invalidate(v: View) { this.cache.delete(v) }
    person(name: string) { return this.people.find(p => p.name === name) }

  private parse(v: View): Parsed {
    let p = this.cache.get(v)
    if (p) return p
    p = { tokens: [], byBlock: new Map(), share: new Map() }
    const add = (t: Token) => { p!.tokens.push(t); let l = p!.byBlock.get(t.blk); if (!l) p!.byBlock.set(t.blk, (l = [])); l.push(t) }
    const names = this.people.map(n => esc(n.name)).join('|')
    const saidAfter = names ? new RegExp(`^[\\s,;—]*(?:\\w+\\s+){0,2}?(?:${SAY})\\s+(${names})`) : null
    const saidBefore = names ? new RegExp(`^[\\s,;—]*(${names})\\s+(?:${SAY})`) : null
    const vocRe = names ? new RegExp(`,\\s*(${names})\\b[?!.,]`) : null
    let pair: string[] = [], turn = 0, carry: string | null = null
    v.ix.blocks.forEach((blk, bi) => {
      if (blk.kind !== 'text') return
      const text = blk.text
      if (this.nameRe) for (const m of text.matchAll(this.nameRe)) {
        const n = this.person(m[1])!
        add({ kind: 'name', blk: bi, a: m.index!, b: m.index! + m[1].length, key: n.name, slot: n.slot })
      }
      if (this.common.size) for (const m of text.matchAll(HARDWORD)) if (isHard(m[0], this.common)) add({ kind: 'hard', blk: bi, a: m.index!, b: m.index! + m[0].length, key: m[0].toLowerCase(), slot: -1 })
      for (const m of text.matchAll(ASIDES)) add({ kind: 'aside', blk: bi, a: m.index!, b: m.index! + m[0].length, key: '', slot: -1 })
      // Voices: who speaks each quote (explicit "said X" › nobody addresses themselves › an unclosed
      // quote continues › alternate between the two people last named in narration).
      const quotes = [...text.matchAll(QUOTES)]
      const qChars = quotes.reduce((n, m) => n + m[0].length, 0)
      p!.share.set(bi, qChars / Math.max(1, text.length))
      if (!quotes.length) {
        if (this.nameRe) { const ns = [...new Set([...text.matchAll(this.nameRe)].map(m => m[1]))]; if (ns.length) { pair = ns.slice(0, 2); turn = 0 } }
        carry = null
        return
      }
      const quoteOnly = /^\s*[“"]/.test(text)
      let speaker: string | null = null
      for (const m of quotes) {
        const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 60)
        const said = saidAfter && (after.match(saidAfter) || after.match(saidBefore!))
        if (said) { speaker = said[1]; break }
      }
      const voc = vocRe && quotes[0][0].match(vocRe)
      if (!speaker) {
        if (quoteOnly && pair.length === 2 && voc && (!carry || carry === voc[1])) speaker = pair.find(n => n !== voc[1]) ?? null
        else if (carry) speaker = carry
        else if (quoteOnly && pair.length) speaker = pair[turn++ % pair.length]
      }
      if (speaker && pair.length === 2) turn = pair.indexOf(speaker) + 1
      const last = quotes[quotes.length - 1][0]
      carry = /[”"]$/.test(last) && last.length > 1 ? null : speaker
      const slot = speaker ? this.person(speaker)?.slot ?? -1 : -1
      for (const m of quotes) add({ kind: 'speech', blk: bi, a: m.index!, b: m.index! + m[0].length, key: speaker ?? '', slot })
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

  /** Paint marks for blocks in [fromBlock, toBlock]; `focus` = the guide's block (gets a double budget). */
  paint(v: View, fromBlock: number, toBlock: number, focus = -1) {
    const m = v.marks, s = this.s
    const out: Record<string, Range[]> = {}
    const put = (name: string, r: Range) => (out[name] ||= []).push(r)
    if (s.intensity !== 'quiet') {
      const p = this.parse(v)
      for (let bi = Math.max(0, fromBlock); bi <= toBlock && bi < v.ix.blocks.length; bi++) {
        const list = p.byBlock.get(bi)
        if (!list) continue
        const blk = v.ix.blocks[bi], rich = s.intensity === 'rich', focused = bi === focus
        const range = (t: Token) => t.range ?? blockRange(v.doc, blk, t.a, t.b)
        // who: first mention per block (every mention in the focus block); only the main cast is tinted
        if (s.names) {
          const seen = new Set<string>()
          for (const t of list) if (t.kind === 'name' && t.slot >= 0 && (focused || !seen.has(t.key))) { seen.add(t.key); put(`who-${t.slot}`, range(t)) }
        }
        // tell me more: hard words, capped (≤ 1 per sentence, ≈ 2% of words), longest first
        if (s.hardWords && s.hardStyle === 'shown') {
          const words = blk.b - blk.a + 1, sentences = new Set(v.ix.words.slice(blk.a, blk.b + 1).map(w => w.s)).size
          let cap = Math.min(sentences, Math.max(1, Math.round(words * 0.02)) * (rich ? 2 : 1)) // ≤ 1 per sentence, always
          for (const t of list.filter(t => t.kind === 'hard').sort((a, b) => b.key.length - a.key.length)) { if (cap-- <= 0) break; put('hard', range(t)) }
        }
        if (s.foreign) list.filter(t => t.kind === 'foreign').slice(0, rich ? 3 : 1).forEach(t => put('foreign', range(t)))
        // Voices: the speaker's ink (softer when the block is mostly dialogue)
        if (s.voices !== 'off') for (const t of list.filter(t => t.kind === 'speech')) {
          const k = t.slot >= 0 ? String(t.slot) : 'x'
          // Unattributed quotes in blocks that are mostly quotation are citations, not conversation: leave them as ink.
          if (k === 'x' && (p.share.get(bi) ?? 0) > 0.6) continue
          if (s.voices === 'ink') put(`${(p.share.get(bi) ?? 0) > 0.6 ? 'v-soft' : 'v-ink'}-${k}`, range(t))
          else if (s.voices === 'underline') put(`v-under-${k}`, range(t))
          else { put(`v-marks-${k}`, blockRange(v.doc, blk, t.a, t.a + 1)); if (/[”"]$/.test(blk.text.slice(t.b - 1, t.b))) put(`v-marks-${k}`, blockRange(v.doc, blk, t.b - 1, t.b)) }
        }
        if (s.asides) for (const t of list) if (t.kind === 'aside') put('aside', range(t))
      }
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
}
