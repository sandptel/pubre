// Stage text model: a block's text cut into pieces the Stage can colour one by one, and the
// reading units (sentence / phrase / word) the Stage steps through. Pure, so it is tested.
import type { TextIndex } from './textindex.ts'

export type Step = 'sentence' | 'phrase' | 'word'
/** A decoration over block-text offsets [a, b): a lens mark, a highlight… */
export interface Decor { a: number; b: number; cls: string; css?: string; key?: string }
/** A piece of a block's text. `w` is the word it belongs to (gaps belong to the word before, except
 *  an opening quote, which belongs to the word after); `core` is true inside the word itself. */
export interface Seg { a: number; b: number; w: number; s: number; core: boolean; cls: string; css: string; key: string }

export function segments(ix: TextIndex, b: number, decor: Decor[] = []): Seg[] {
  const k = ix.blocks[b], text = k.text, len = text.length
  const at = (n: Text, o: number) => k.starts[k.nodes.indexOf(n)] + o
  const ws: { a: number; b: number; i: number }[] = []
  for (let i = k.a; i <= k.b; i++) { const w = ix.words[i]; ws.push({ a: at(w.sn, w.so), b: at(w.en, w.eo), i }) }
  if (!ws.length) return []
  const cuts = new Set<number>([0, len])
  for (const w of ws) { cuts.add(w.a); cuts.add(w.b) }
  // In the gap between two words, what follows the last space ("“", "(") opens the next word.
  const tail: number[] = []
  for (let j = 0; j < ws.length - 1; j++) {
    const g = text.slice(ws[j].b, ws[j + 1].a), m = /\s(?=\S+$)/.exec(g)
    tail[j] = m ? ws[j].b + m.index + 1 : Infinity
    if (m) cuts.add(tail[j])
  }
  for (const d of decor) { cuts.add(Math.max(0, Math.min(len, d.a))); cuts.add(Math.max(0, Math.min(len, d.b))) }
  const xs = [...cuts].sort((p, q) => p - q)
  const out: Seg[] = []
  let j = 0
  for (let c = 0; c < xs.length - 1; c++) {
    const a = xs[c], e = xs[c + 1]
    if (e <= a) continue
    while (j + 1 < ws.length && ws[j + 1].a <= a) j++
    let w: number, core = false
    if (a < ws[0].a) w = ws[0].i
    else if (a < ws[j].b) { w = ws[j].i; core = true }
    else w = j + 1 < ws.length && a >= tail[j] ? ws[j + 1].i : ws[j].i
    const on = decor.filter(d => d.a <= a && d.b >= e)
    out.push({ a, b: e, w, s: ix.words[w].s, core, cls: on.map(d => d.cls).join(' '), css: on.map(d => d.css ?? '').filter(Boolean).join(';'), key: on.find(d => d.key)?.key ?? '' })
  }
  return out
}

/** Phrases of sentence s: runs of up to 3 words that end at a pause (comma, sentence end…). */
export function phrases(ix: TextIndex, s: number): [number, number][] {
  const { a, b } = ix.sentences[s], out: [number, number][] = []
  for (let i = a; i <= b;) {
    let e = i
    for (let c = 1; c < 3 && !ix.words[e].pause && e < b; c++) e++
    out.push([i, e]); i = e + 1
  }
  return out
}

/** The unit that starts at (or contains) word k. */
export function unitAt(ix: TextIndex, k: number, step: Step): [number, number] {
  const w = ix.words[k]
  if (step === 'word') return [k, k]
  if (step === 'sentence') { const s = ix.sentences[w.s]; return [s.a, s.b] }
  const p = phrases(ix, w.s).find(([a, b]) => a <= k && k <= b)!
  return [k, p[1]]
}

/** Start of the unit before the one starting at k (−1 at the start of the text). */
export function prevUnit(ix: TextIndex, k: number, step: Step): number {
  if (k <= 0) return -1
  if (step === 'word') return k - 1
  const s = ix.words[k - 1].s
  if (step === 'sentence') return ix.sentences[s].a
  return phrases(ix, s).find(([a, b]) => a <= k - 1 && k - 1 <= b)![0]
}
