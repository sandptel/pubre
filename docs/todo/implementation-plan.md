# Implementation plan: Living Book v1 (started 2026-10-11)

The source of truth for *what* to build is plan v3.2: https://claude.ai/artifact/2ZbuGXiqwUCNJcr2AtdPEs (local copy at `research/living-book-proposal.html`). This file defines *how* and *in what order*. Tick items as they land, with commit hashes. A reflection goes in `todo/reflections.md` after each chunk.

## Ground rules

- Every feature can be switched on or off in **global Settings** and overridden **per book** (book settings).
- No `Highlight.priority`: register highlights once, in grammar order (see findings).
- The pointer overlay lives **outside** the book DOM, behind the transparent iframe. The book DOM is only mutated for user italics, and then only with CFI-ignored `data-pubre` spans.
- Reading motion must stay calm: no overshoot on size (see product-design §7).
- Peeks appear only after a dwell. Run the 3-viewport smoke test plus WebKit after every UI chunk.

## Chunks

### C1 · Foundation
- [x] `settings.ts`: a feature-settings model (guide, lenses, voices, motion, definitions) plus per-book overrides (`BookRecord.prefs`) and an `effective()` merge.
- [x] `src/lib/textindex.ts`: a per-document index of words, sentences and blocks built with Intl.Segmenter, with text-node offset maps and an abbreviation merge. It skips headings, pre, code and tables for lenses. Tests.
- [x] `src/lib/marks.ts`: a highlight registry per book document (fixed order, clear/add) plus the grammar CSS injected into books.
- [x] Reading position as a **CFI** (first word on the page). Restore by CFI, with fraction as the fallback.

### C2 · Reading guide
- [x] `src/lib/guide.ts` controller:
  - pointer overlay with Word, Underline, Dot and Outline styles
  - contrast levels as disjoint ranges, including a clause focus for long sentences
  - Space hold, tap, double-tap and Shift+Space; arrows and vim motions; `[` `]` for speed
  - G toggles guide mode
  - pace learned with an EMA
  - dead-man's switch on blur
- [x] The page turns when the next word is off-page, and the pointer follows across chapter turns.
- [x] Reader UI: a guide button in the dock (tap toggles, press-and-hold glides), with options in Themes & Settings.

### C3 · Insights + lenses
- [x] `src/insights/`: a worker that scans the whole book. It finds names (capitalised tokens that aren't sentence-initial, frequency, alias merge), dialogue share, asides and foreign phrases (lang attributes). The resulting `BookProfile` is cached in IDB.
- [x] Hard words: `public/data/common-en.txt` (wordfreq words with Zipf ≥ 3, CC-BY-SA, with attribution). A word is hard if it's absent from that list.
- [x] Lens painter: attention budget, focus scoping, Voices (ink, underline, marks, off) with speaker attribution, asides, foreign phrases, names, hard words.
- [x] Tooltip layer in the parent (hover or tap, dwell-only while guiding). Definitions come from sharded offline WordNet glosses if feasible, otherwise a rarity card and an opt-in online lookup.
- [x] Arrival verbs: bloom on names and a cast chip on first mention, kept modest.

### ⟶ Critic pass #1 (agent): screenshots plus a feel review of the guide and lenses; fix what it finds

### C4 · Homepage redesign + Settings UI
- [x] Library redesign: a now-reading hero with time left at your pace, shelves (Reading, Up next, Finished), progress rings, and a Settings entry point.
- [x] Global Settings sheet with every feature toggle and defaults. In the reader menu, a per-book "This book" section with overrides and a reset.

### C5 · Highlights & notes
- [x] Selection toolbar in the reader: 6 meaning colours, bold (stroke), italic (span + CFI ignore), note, remove.
- [x] Persistence by CFI + TextQuote. A Highlights list in the menu. Export as Markdown and Readium annotations JSON.
- [ ] Margin dots for notes, and highlight dots on the capsule (later)
- [ ] Research items: "Previously…" retrieval-first card, chapter-end three words, Question highlights resurfacing

### ⟶ Critic pass #2 (agent)

### C6 · Living capsule (if time allows)
- [ ] Mood-tinted wedges from insights, time left at your pace, and a crossing pulse.

## Status
- 2026-10-11: C1 and C2 landed. The research pass (cognitive-reading.md) added: glide cap at 350 wpm with pauses (done), a gentler contrast ramp (done), and caps/modes for C3 (see the adoption table).
- 2026-10-11: C3, C4 and the C5 core landed and are deployed. User feedback applied:
  - never dim upcoming text
  - smart punctuation and position pauses
  - names as a soft tint with an underline (plan-demo style)
  - the latest iteration is always hosted (push after each chunk)
