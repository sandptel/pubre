// "Letters type themselves": the pointer grows across a word one letter at a time, with a caret at its
// edge. Letters are measured with Ranges (nothing in the book DOM changes, nothing reflows).

/** The box of every non-space letter in the given text segments [node, from, to). */
export function letterRects(doc: Document, segs: [Text, number, number][]): DOMRect[] {
  const out: DOMRect[] = [], r = doc.createRange()
  for (const [n, a, b] of segs) for (let i = a; i < b; i++) {
    if (/\s/.test(n.data[i] ?? ' ')) continue
    r.setStart(n, i); r.setEnd(n, i + 1)
    const q = r.getClientRects()[0]
    if (q) out.push(q)
  }
  return out
}

/** Right edges (relative to the first letter's left) of the letters on the first line. */
export function edgesOnFirstLine(rects: DOMRect[]): { left: number; top: number; height: number; edges: number[] } | null {
  if (!rects.length) return null
  const f = rects[0], line = rects.filter(q => Math.abs(q.top - f.top) < 4)
  return { left: f.left, top: f.top, height: f.height, edges: line.map(q => q.right - f.left) }
}

/** Keyframes for a width that steps from the first letter to the last (one jump per letter). */
export function typeFrames(edges: number[], pad = 2): Keyframe[] {
  const n = edges.length
  return edges.map((e, i) => ({ width: `${Math.round(e + pad)}px`, offset: n > 1 ? i / (n - 1) : 1, easing: 'steps(1, end)' }))
}
