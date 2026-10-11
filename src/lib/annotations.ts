// Highlights & notes ("yours" in the visual grammar): a coloured wash per meaning, your own bold
// (a hairline stroke, no reflow) and italic (CFI-transparent data-pubre spans), and a note.
// Stored with a CFI range plus a TextQuote (exact/prefix/suffix) so they survive book edits.
import type { View } from './paginator.ts'
import { cfiToRange } from '../epub/cfi.ts'

export interface Annotation {
  id: string
  book: string
  spine: number
  cfi: string
  exact: string
  prefix: string
  suffix: string
  color: string // base16 slot: '0A' Key · '0B' Beautiful · '0D' Idea · '08' Feeling · '09' Question · '0E' Revisit
  bold: boolean
  italic: boolean
  note: string
  chapter: string
  created: number
}

// ---------------------------------------------------------------- ranges

/** Resolve an annotation in a chapter document: CFI first, then its quote. */
export function resolveAnnotation(doc: Document, a: Annotation): Range | null {
  try {
    const r = cfiToRange(doc, a.cfi)
    if (r.toString() === a.exact) return r
  } catch { /* fall through to quote */ }
  return findQuote(doc, a.exact, a.prefix)
}

function findQuote(doc: Document, exact: string, prefix: string): Range | null {
  if (!exact) return null
  const nodes: Text[] = [], starts: number[] = []
  let text = ''
  const tw = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT)
  while (tw.nextNode()) { const n = tw.currentNode as Text; starts.push(text.length); nodes.push(n); text += n.data }
  let i = prefix ? text.indexOf(prefix + exact) : -1
  i = i >= 0 ? i + prefix.length : text.indexOf(exact)
  if (i < 0) return null
  const at = (pos: number, end: boolean): [Text, number] => {
    let k = 0
    while (k + 1 < starts.length && (end ? starts[k + 1] < pos : starts[k + 1] <= pos)) k++
    return [nodes[k], pos - starts[k]]
  }
  const [sn, so] = at(i, false), [en, eo] = at(i + exact.length, true), r = doc.createRange()
  r.setStart(sn, so); r.setEnd(en, eo)
  return r
}

/** Quote context around a range (for re-anchoring). */
export function quoteOf(r: Range): { exact: string; prefix: string; suffix: string } {
  const exact = r.toString()
  const before = r.cloneRange(); before.collapse(true)
  const pre = r.startContainer.nodeType === 3 ? (r.startContainer as Text).data.slice(Math.max(0, r.startOffset - 32), r.startOffset) : ''
  const suf = r.endContainer.nodeType === 3 ? (r.endContainer as Text).data.slice(r.endOffset, r.endOffset + 32) : ''
  return { exact, prefix: pre, suffix: suf }
}

// ---------------------------------------------------------------- italic spans (CFI-transparent)

/** Wrap each text segment of `r` in its own span, so no element (paragraph) is ever split. */
export function wrapItalic(doc: Document, r: Range, id: string) {
  const segs: [Text, number, number][] = []
  const root = r.commonAncestorContainer
  const tw = doc.createTreeWalker(root.nodeType === 3 ? root.parentNode! : root, NodeFilter.SHOW_TEXT)
  while (tw.nextNode()) {
    const n = tw.currentNode as Text
    if (!r.intersectsNode(n)) continue
    const a = n === r.startContainer ? r.startOffset : 0, b = n === r.endContainer ? r.endOffset : n.data.length
    if (b > a) segs.push([n, a, b])
  }
  for (const [n, a, b] of segs) {
    let mid = n
    if (a > 0) mid = mid.splitText(a)
    if (b - a < mid.data.length) mid.splitText(b - a)
    const span = doc.createElementNS(doc.documentElement.namespaceURI, 'span') as HTMLElement
    span.setAttribute('data-pubre', 'i'); span.setAttribute('data-ann', id)
    mid.parentNode!.insertBefore(span, mid); span.appendChild(mid)
  }
}
export function unwrapItalic(doc: Document, id: string) {
  for (const span of Array.from(doc.querySelectorAll(`[data-ann="${id}"]`))) {
    const parent = span.parentNode!
    while (span.firstChild) parent.insertBefore(span.firstChild, span)
    span.remove(); parent.normalize()
  }
}

// ---------------------------------------------------------------- painting

/** Paint a chapter's annotations; returns resolved ranges by id (for hit-testing and notes). */
export function paintAnnotations(v: View, list: Annotation[]): Map<string, Range> {
  const out = new Map<string, Range>(), byColor: Record<string, Range[]> = {}, bold: Range[] = []
  for (const a of list) {
    if (a.spine !== v.index) continue
    const r = resolveAnnotation(v.doc, a)
    if (!r) continue
    out.set(a.id, r)
    ;(byColor[a.color] ||= []).push(r)
    if (a.bold) bold.push(r)
  }
  v.marks.clear('u-')
  for (const [c, rs] of Object.entries(byColor)) v.marks.set(`u-${c}`, rs)
  v.marks.set('u-bold', bold)
  return out
}

// ---------------------------------------------------------------- export

const MEANING: Record<string, string> = { '0A': 'Key', '0B': 'Beautiful', '0D': 'Idea', '08': 'Feeling', '09': 'Question', '0E': 'Revisit' }
const W3C: Record<string, string> = { '0A': 'yellow', '0B': 'green', '0D': 'blue', '08': 'pink', '09': 'orange', '0E': 'purple' }

export function toMarkdown(title: string, author: string, list: Annotation[]): string {
  const lines = [`# ${title}`, author ? `*${author}*` : '', '']
  let chapter = ''
  for (const a of [...list].sort((x, y) => x.spine - y.spine || x.created - y.created)) {
    if (a.chapter !== chapter) { chapter = a.chapter; lines.push(`## ${chapter || 'Untitled'}`, '') }
    lines.push(`> ${a.exact.replace(/\s+/g, ' ').trim()}`, '', `— **${MEANING[a.color] ?? 'Highlight'}**${a.note ? `: ${a.note}` : ''}`, '')
  }
  return lines.join('\n')
}

/** Readium Annotations (W3C Web Annotation profile) export. */
export function toReadium(title: string, identifier: string, list: Annotation[]) {
  return {
    '@context': 'http://www.w3.org/ns/anno.jsonld', type: 'AnnotationSet', generator: { name: 'pubre' },
    about: { 'dc:title': title, 'dc:identifier': [identifier] },
    items: list.map(a => ({
      id: `urn:uuid:${a.id}`, type: 'Annotation', created: new Date(a.created).toISOString(),
      body: { type: 'TextualBody', value: a.note, color: W3C[a.color] ?? 'yellow', highlight: 'solid', 'pubre:meaning': MEANING[a.color], 'pubre:style': [a.bold && 'bold', a.italic && 'italic'].filter(Boolean) },
      target: { selector: [{ type: 'FragmentSelector', conformsTo: 'http://www.idpf.org/epub/linking/cfi/epub-cfi.html', value: a.cfi }, { type: 'TextQuoteSelector', exact: a.exact, prefix: a.prefix, suffix: a.suffix }] },
    })),
  }
}
