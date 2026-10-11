# 0008 — Stage replaces the word pointer as the default reading guide

**Date:** 2026-10-11 · **Status:** accepted

## Context
The word pointer (C2) moved over the page at the reader's pace. In real use the user found it
pulled the eye: "I just keep looking at the pointer", and the page is too big a field for a
small moving mark to focus. The critic pass also found it invisible in dark modes (fixed) and
easy to get trapped in on phones.

## Decision
New default guide style **Stage** (monkeytype-inspired, user's idea):
- Space lifts the current paragraph off the page (FLIP from the sentence's spot on the page,
  scale ≈ page-size/stage-size → 1, 780 ms, `cubic-bezier(.2,.85,.25,1)`), into a centered
  column at ~1.3× size; the page fades behind an opaque veil.
- Sentence at a time: current = full ink; next = 52 %; later = 38 %; read = 30 %. The flow scrolls
  so the current sentence's first line sits at 38 % of the screen height (750 ms
  `cubic-bezier(.22,1,.36,1)`); a mask fades lines far above and below.
- Timing from `pacing.ts`: `sentenceTime` (word times + punctuation pauses + 200 ms rise beat),
  `breath` (paragraph 500 ms, section 1200 ms, chapter end = wait for Space).
- Paragraph change: old floats up and out (380 ms, blur 3 px); new rises 44 px (720 ms).
- The page follows underneath (`showPage`), so Esc lands the paragraph back where you are.
- The word pointer stays available (Reading aids → Style → Pointer).

## Consequences
- Stage clones the block DOM (`importNode`) and wraps sentences in `span[data-s]`; book CSS
  classes don't apply there, so inline semantics (em/i/strong) survive but book-specific styling doesn't.
- No lenses inside Stage yet (deliberately calm); candidates: Voices ink, names tint.
- WebKit draws iframe content unblurred through `backdrop-filter`, so the veil is opaque.
