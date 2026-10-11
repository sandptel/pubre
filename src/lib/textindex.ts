// Word / sentence / block index of one book document, shared by the reading guide, the lenses
// and CFI positions. Uses only DOM Level 2 traversal (works in browsers and in xmldom for tests).

export interface Word {
  sn: Text; so: number // start node / offset
  en: Text; eo: number // end node / offset (a word can straddle inline elements)
  text: string
  s: number   // sentence index
  b: number   // block index
  pause: 0 | 1 | 2 | 3 // after this word: none, comma-like, sentence end, block end
}
export interface Span { a: number; b: number } // inclusive word indices
export type BlockKind = 'text' | 'heading' | 'skip'
export interface Block extends Span { el: Element; kind: BlockKind; text: string }
export interface TextIndex { words: Word[]; sentences: Span[]; blocks: Block[] }

const BLOCK = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'dd', 'dt', 'div', 'figcaption',
  'td', 'th', 'pre', 'section', 'article', 'aside', 'header', 'footer', 'body', 'caption', 'summary', 'address'])
const HEADING = /^h[1-6]$/
const SKIP = new Set(['pre', 'code', 'kbd', 'samp', 'tt', 'table', 'td', 'th', 'script', 'style', 'svg', 'math', 'rt', 'rp'])
// Sentence breaks that UAX #29 gets wrong in English prose.
const ABBREV = /(?:\b(?:Mr|Mrs|Ms|Messrs|Dr|St|Jr|Sr|Mt|Capt|Col|Gen|Gov|Rev|Prof|vs|etc|No|Vol|ch|cf|viz)|\b[A-Z]|\be\.g|\bi\.e)\.\s*$/

const name = (n: Node) => (n as Element).localName ?? n.nodeName.toLowerCase()

function blockOf(n: Node): Element | null {
  for (let p = n.parentNode; p; p = p.parentNode) if (p.nodeType === 1 && BLOCK.has(name(p))) return p as Element
  return null
}
function kindOf(n: Node, block: Element): BlockKind {
  for (let p = n.parentNode; p; p = p.parentNode) {
    if (p.nodeType !== 1) break
    if (SKIP.has(name(p))) return 'skip'
    if ((p as Element).getAttribute?.('data-pubre')) continue
    if (p === block) break
  }
  return HEADING.test(name(block)) ? 'heading' : 'text'
}
function textNodes(root: Node, out: Text[] = []): Text[] {
  for (let c = root.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3) out.push(c as Text)
    else if (c.nodeType === 1 && !['script', 'style', 'head'].includes(name(c))) textNodes(c, out)
  }
  return out
}

export function indexDocument(doc: Document, lang = 'en'): TextIndex {
  const root = (doc as Document & { body?: HTMLElement }).body ?? doc.documentElement
  const words: Word[] = [], sentences: Span[] = [], blocks: Block[] = []
  let wseg: Intl.Segmenter, sseg: Intl.Segmenter
  try { wseg = new Intl.Segmenter(lang, { granularity: 'word' }); sseg = new Intl.Segmenter(lang, { granularity: 'sentence' }) }
  catch { wseg = new Intl.Segmenter('en', { granularity: 'word' }); sseg = new Intl.Segmenter('en', { granularity: 'sentence' }) }

  // Group consecutive text nodes by their block ancestor.
  const groups: { el: Element; nodes: Text[]; kind: BlockKind }[] = []
  for (const t of textNodes(root)) {
    const el = blockOf(t) ?? (root as Element)
    const last = groups[groups.length - 1]
    if (last && last.el === el) last.nodes.push(t)
    else groups.push({ el, nodes: [t], kind: kindOf(t, el) })
  }

  for (const g of groups) {
    const starts: number[] = []
    let text = ''
    for (const n of g.nodes) { starts.push(text.length); text += n.data }
    if (!text.trim()) continue
    const at = (pos: number, end = false): [Text, number] => {
      let k = 0
      while (k + 1 < starts.length && (end ? starts[k + 1] < pos : starts[k + 1] <= pos)) k++
      return [g.nodes[k], pos - starts[k]]
    }
    const ba = words.length
    // Sentences, with abbreviation merge.
    const sents: { i: number; t: string }[] = []
    for (const s of sseg.segment(text)) {
      const prev = sents[sents.length - 1]
      if (prev && ABBREV.test(prev.t)) prev.t += s.segment
      else sents.push({ i: s.index, t: s.segment })
    }
    for (const s of sents) {
      const sa = words.length
      for (const w of wseg.segment(s.t)) {
        if (!w.isWordLike) continue
        const a = s.i + w.index, b = a + w.segment.length
        const nxt = text.slice(b, b + 2)
        const [sn, so] = at(a), [en, eo] = at(b, true)
        words.push({ sn, so, en, eo, text: w.segment, s: sentences.length, b: blocks.length,
          pause: /^[”’"»)\]]?[.!?…]/.test(nxt) ? 2 : /^[”’"»)\]]?[,;:—–]/.test(nxt) ? 1 : 0 })
      }
      if (words.length > sa) sentences.push({ a: sa, b: words.length - 1 })
    }
    if (words.length > ba) {
      words[words.length - 1].pause = 3
      blocks.push({ a: ba, b: words.length - 1, el: g.el, kind: g.kind, text })
    }
  }
  return { words, sentences, blocks }
}

/** Word containing (node, offset), or -1. */
export function wordAt(ix: TextIndex, node: Node, offset: number): number {
  return ix.words.findIndex(w => (w.sn === node && offset >= w.so && (w.en !== node || offset <= w.eo)) || (w.en === node && w.sn !== node && offset <= w.eo))
}
