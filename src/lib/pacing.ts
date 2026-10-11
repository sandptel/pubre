// How long the reading guide lingers on a word while gliding. A word's own time grows with its length;
// punctuation and position add breathing room the way a reader's eyes and inner voice pause:
// a question lingers longer than a statement, an ellipsis longest; semicolons and colons more than
// commas; paragraph ends, dialogue turns and headings get extra room. Glide is capped at 350 wpm.
import type { TextIndex } from './textindex.ts'

export const MAX_WPM = 350

/** Extra pause (ms) after word k. */
export function pauseAfter(ix: TextIndex, k: number): number {
  const w = ix.words[k], next = ix.words[k + 1], p = w.punct
  if (!next) return 600
  const quoteClose = /[”"’»]/.test(p)
  if (next.b !== w.b) { // end of a paragraph (or other block)
    const nb = ix.blocks[next.b]
    let ms = 600
    if (nb.kind === 'heading') ms += 400                  // a new section is coming
    if (/^\s*[“"«]/.test(nb.text)) ms += 150               // a dialogue turn
    if (/\?/.test(p)) ms += 120
    return ms
  }
  if (next.s !== w.s) { // end of a sentence
    let ms = /…|\.\.\./.test(p) ? 380 : /\?/.test(p) ? 320 : /!/.test(p) ? 300 : 250
    if (quoteClose) ms += 60                               // end of a spoken line
    return ms
  }
  if (!p) return 0
  const s = ix.sentences[w.s], long = s.b - s.a + 1 > 30
  if (/…|\.\.\./.test(p)) return 300                       // trailing off mid-sentence
  if (/[;:]/.test(p)) return 180
  if (/[—–]/.test(p)) return 150
  if (/,/.test(p)) return long ? 140 : 90                  // commas carry more weight in long sentences
  if (/[()]/.test(p)) return 70
  if (quoteClose) return 60
  return 0
}

/** Total time on word k (ms) at `wpm`. */
export function wordTime(ix: TextIndex, k: number, wpm: number): number {
  const w = ix.words[k]
  let base = (60000 / Math.min(MAX_WPM, wpm)) * (0.7 + 0.3 * Math.min(w.text.length, 14) / 5) / 1.25
  const prev = ix.words[k - 1]
  if (!prev || prev.b !== w.b) base *= 1.15       // first word of a paragraph: the eye lands on a new line
  else if (prev.s !== w.s) base *= 1.08           // first word of a sentence
  if (/^\d/.test(w.text)) base *= 1.2             // numbers take longer to read
  return base + pauseAfter(ix, k)
}
