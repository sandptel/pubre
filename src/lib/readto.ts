// Your place, as a mark on the page: the word the reading guide (Stage or pointer) last stood on.
// Stored like a highlight (a CFI plus its quote), so it survives relayouts and small book edits.
import type { View } from './paginator.ts'
import { quoteOf, resolveAnnotation, type Annotation } from './annotations.ts'
import { wordAt } from './textindex.ts'

export interface ReadTo { spine: number; cfi: string; exact: string; prefix: string; suffix: string; at: number }

/** Words a..b (inclusive) as a DOM range. */
export function wordsRange(v: View, a: number, b = a): Range {
  const r = v.doc.createRange(), w0 = v.ix.words[a], w1 = v.ix.words[b]
  r.setStart(w0.sn, w0.so); r.setEnd(w1.en, w1.eo)
  return r
}
export function readToOf(v: View, k: number, cfi: (r: Range) => string): ReadTo {
  const r = wordsRange(v, k)
  return { spine: v.index, cfi: cfi(r), ...quoteOf(r), at: Date.now() }
}
/** The word your place is on in this chapter view, or -1. */
export function wordOf(v: View, t: ReadTo | undefined): number {
  if (!t || t.spine !== v.index || !v.ix.words.length) return -1
  const r = resolveAnnotation(v.doc, t as unknown as Annotation)
  return r ? wordAt(v.ix, r.startContainer, r.startOffset) : -1
}
