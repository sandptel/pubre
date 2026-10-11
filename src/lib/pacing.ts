// How long the reading guide lingers on a word while gliding. A word's own time grows with its length;
// punctuation and position add breathing room the way a reader's eyes and inner voice pause:
// a question lingers longer than a statement, an ellipsis longest; semicolons and colons more than
// commas; paragraph ends, dialogue turns and headings get extra room. Glide is capped at 350 wpm.
import type { TextIndex } from './textindex.ts'

export const MAX_WPM = 350

/** What a reader does after word k: the pause and the cue the Stage shows on the mark (none: no pause). */
export type Cue = 'list' | 'comma' | 'turn' | 'pause' | 'dash' | 'cut' | 'paren' | 'quote' | 'stop' | 'ask' | 'bang' | 'trail'
const CONJ = /^(and|but|or|nor|yet|so|for|while|though|because)$/i

/** How a sentence ends: its own beat, then room for what it was (short lines land; long ones need a breath). */
function sentenceEnd(p: string, len: number): { ms: number; cue: Cue } {
  const [ms, cue]: [number, Cue] = /…|\.\.\./.test(p) ? [720, 'trail'] : /\?!|!\?/.test(p) ? [640, 'ask'] : /\?/.test(p) ? [620, 'ask'] : /!/.test(p) ? [560, 'bang'] : [520, 'stop']
  return { ms: ms + (/[”"’»]/.test(p) ? 80 : 0) + (len <= 4 ? 120 : len > 30 ? 100 : 0), cue }
}

/** The pause (ms, at 260 wpm and the default length) after word k, its cue, and whether a block ends there.
 *  One ladder, always in this order: list < comma < dash < colon < semicolon < sentence < paragraph < section. */
export function beat(ix: TextIndex, k: number): { ms: number; cue: Cue | null; end?: 'para' | 'section' } {
  const w = ix.words[k], next = ix.words[k + 1], p = w.punct
  const s = ix.sentences[w.s], len = s.b - s.a + 1
  if (!next || next.b !== w.b) { // end of a paragraph (or other block): the sentence ends, then the paragraph does
    const nb = next && ix.blocks[next.b], e = sentenceEnd(p, len)
    let ms = e.ms + 400
    if (nb && /^\s*[“"«]/.test(nb.text)) ms += 200       // a dialogue turn
    if (nb?.kind === 'heading') ms += 600                  // a new section is coming
    return { ms, cue: p ? e.cue : null, end: nb?.kind === 'heading' ? 'section' : 'para' }
  }
  if (next.s !== w.s) return sentenceEnd(p, len)
  if (!p) return { ms: 0, cue: null }
  const quoteClose = /[”"’»]/.test(p)
  if (/…|\.\.\./.test(p)) return { ms: 460, cue: 'trail' }  // trailing off mid-sentence
  if (/[—–]/.test(p)) return quoteClose ? { ms: 420, cue: 'cut' } : { ms: 240, cue: 'dash' } // speech cut off; an aside
  if (/;/.test(p)) return { ms: 340, cue: 'pause' }
  if (/:/.test(p)) return { ms: 300, cue: 'pause' }
  if (/,/.test(p)) {
    if (quoteClose) return { ms: 220, cue: 'turn' }        // a spoken line, then who said it
    if (ix.words.slice(k + 1, k + 3).some(x => x.s === w.s && /,/.test(x.punct))) return { ms: 90, cue: 'list' } // a series: quick beats
    if (CONJ.test(next.text)) return { ms: len > 30 ? 260 : 220, cue: 'comma' } // a clause turns
    return { ms: len > 30 ? 200 : 160, cue: 'comma' }      // commas carry more weight in long sentences
  }
  if (/[()]/.test(p)) return { ms: 120, cue: 'paren' }
  if (quoteClose) return { ms: 90, cue: 'quote' }
  return { ms: 0, cue: null }
}

/** Sample pauses for the settings preview: [mark, ms at the default length]. */
export const LADDER: [string, number][] = [[',', 160], [';', 340], ['.', 520], ['?', 620], ['¶', 920]]
export const pauseName = (p: number) => (p < 0.75 ? 'Brisk' : p < 1.25 ? 'Natural' : p < 1.75 ? 'Unhurried' : p < 2.5 ? 'Lingering' : 'Slow')

/** Extra pause (ms) after word k. */
export const pauseAfter = (ix: TextIndex, k: number): number => beat(ix, k).ms

/** Pauses stretch at a slow pace and tighten at a fast one, so rhythm survives any speed. */
export const pauseScale = (wpm: number) => Math.max(0.75, Math.min(1.4, Math.sqrt(260 / wpm)))

/** Total time on word k (ms) at `wpm`; `pauses` lengthens or shortens every pause (the reader's setting). */
export function wordTime(ix: TextIndex, k: number, wpm: number, pauses = 1): number {
  const w = ix.words[k]
  let base = (60000 / Math.min(MAX_WPM, wpm)) * (0.7 + 0.3 * Math.min(w.text.length, 14) / 5) / 1.25
  const prev = ix.words[k - 1]
  if (!prev || prev.b !== w.b) base *= 1.15       // first word of a paragraph: the eye lands on a new line
  else if (prev.s !== w.s) base *= 1.08           // first word of a sentence
  if (/^\d/.test(w.text)) base *= 1.2             // numbers take longer to read
  return base + pauseAfter(ix, k) * pauseScale(wpm) * pauses
}

// ---------- Stage (sentence at a time) ----------

/** Time on sentence s (ms): its words at your pace, plus a beat for the sentence to rise into place. */
export function sentenceTime(ix: TextIndex, s: number, wpm: number, pauses = 1): number {
  const { a, b } = ix.sentences[s]
  let ms = 200
  for (let k = a; k <= b; k++) ms += wordTime(ix, k, wpm, pauses)
  return Math.max(ms, 1100) // even "Strange!" gets time to land before the next rises
}

export type Breath = 'paragraph' | 'section' | 'chapter' | 'end'

/** The breath after a block before the next one rises (on top of its last word's pause):
 *  'section' before a heading, 'paragraph' otherwise; 'end' when the chapter is over (wait for the reader). */
export function breath(ix: TextIndex, blk: number): { kind: Breath; ms: number } {
  const next = ix.blocks.slice(blk + 1).findIndex(b => b.kind !== 'skip' && b.b >= b.a)
  if (next < 0) return { kind: 'end', ms: 2400 }
  const nb = ix.blocks[blk + 1 + next], here = ix.blocks[blk]
  if (nb.kind === 'heading' && /^h[12]$/i.test(nb.el.localName)) return { kind: 'chapter', ms: 2400 } // a new chapter in the same file
  if (nb.kind === 'heading' || here.kind === 'heading') return { kind: 'section', ms: 1200 }
  return { kind: 'paragraph', ms: 300 } // most of a paragraph's pause is its last word's beat
}
