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
- [x] Research items: "Previously…" retrieval-first card, chapter-end three words, Question highlights resurfacing

### C5b · Stage (user's pivot, ADR 0008)
- [x] Space lifts the paragraph into a zoomed column; sentence at a time at your pace; breaths at paragraph/section; waits at chapter end; Esc lands back on the page.
- [x] Style setting (Stage | Pointer), Paragraph end (Breathe | Wait).
- [ ] Pace learning from manual advances; optional Voices/names inside Stage.

### ⟶ Critic pass #2 (agent): focused on Stage feel + lens density

### C7 · Guide v3 + phone (user request 2026-10-11)
- [x] S1 One-click start: the guide button / Space / G start reading immediately in either style. Pointer: Space tap = play/pause, double-tap = sentence start, hold = glide while held.
- [x] S2 Stage strip: the next paragraph is already there below and scrolls up into focus (no swap). Move by Sentence / Phrase / Word; pointer types inside Stage (Ink, Word, Line, Dot, Ring); words ink in as you go; motion polish.
- [x] S3 Stage highlighting: names (hue, chip on first mention), Voices by speaker, hard words (dotted, gloss on tap/hover/pause), foreign phrases, asides, your own highlights. Stage lenses toggle.
- [x] S4 Pin controls: a quick toggle keeps the reader's buttons visible; the book reserves room so nothing overlaps.
- [x] S5 Phone-first UI pass + critic #3 fixes at 360/390/430/768/1024/1440/2000 wide: Stage controls for thumbs, sheets, library, reader chrome, touch targets. Then critic #3.

- [x] Mid-chunk user asks: hold to read (pad, Space, or the page text) with release = back; shuttle while holding (right faster, left slower → backwards, up = lock); quick speed chip (presets, ±, slider); the lift made visible on phones (card + page sinking back).

### C8 · From the user's comments on The Living Book (one iteration each)
Source: artifact comment threads, 2026-10-11 (thread ids in brackets). Each iteration: build → test (phone first) → commit + push → reply/resolve its thread → reflection.
- [x] I1 · Where am I, in the guide [7414ff45, 6cf2534c + chat ask "dynamic animation to know page & section"]: a compact capsule in the guide (Stage: done — rolling section/page + section line with paragraph ticks); Pointer mode: a top capsule with one wedge per paragraph on the page/section that springs and fills as the pointer crosses it; chapter-crossing pulse.
- [x] I2 · "Type" pointer [89ec5707]: the current word types itself in (letter by letter, with a caret), words ahead stay at page contrast; within the 450 ms motion budget; reduced motion = plain appear. Also epistolary sections ("Dear…", "Yours,") type once.
- [x] I3 · Pick up where you left off, on the homepage [1f888ce5]: continue card with the last sentence you read, time since, chapter, calm time left; mini capsule per book (progress + your position); "Recently read" row (last opened, who was on stage, latest highlight); a return-after-a-gap prompt (recall first, then recap).
- [x] I4 · Ambient palette drift [6ce933bf]: each chapter's dominant colour word pulls the accent toward it over a few seconds, only at a chapter crossing (@property interpolation); toggle; Weather & time of day later (Wave 3).
- [x] I5 · Every chapter gets its own stage [40decf3b]: semantic chapter openers (Classic, Daylight, Nocturne, Stage, Long Swell; auto, overridable); first-line staging for epigraphs/openings (word by word, once); chapter fingerprints (Posavec sentence drawing).
- [x] I6 · The capsule comes alive [eb70bf50]: mood (dark → bright) and dialogue-texture hatching on the wedges; chapter-crossing pulse; story-shape skyline (spoiler-gated).
- [x] I7 · Meet the cast [eb70bf50]: character card (first appearance, how often, seen with; position-bounded); constellation later.
- [x] I8 · Rare-word sparks [eb70bf50]: words used once in the whole book glow softly; long-press defines; the chapter-end card collects them.
- [x] I9 · Finish keepsake [eb70bf50]: on finishing, draw the copy (chapter 1 punctuation spiral ringed by the book's mood) as its shelf cover.
- [x] I10 · Motion set remainder [eb70bf50]: ink-bleed chapter titles, character star-birth, arc reveal after a session.

### C6 · Living capsule (if time allows)
- [ ] Mood-tinted wedges from insights, time left at your pace, and a crossing pulse.

## Status
- 2026-10-11: C1 and C2 landed. The research pass (cognitive-reading.md) added: glide cap at 350 wpm with pauses (done), a gentler contrast ramp (done), and caps/modes for C3 (see the adoption table).
- 2026-10-11: C3, C4 and the C5 core landed and are deployed. User feedback applied:
  - never dim upcoming text
  - smart punctuation and position pauses
  - names as a soft tint with an underline (plan-demo style)
  - the latest iteration is always hosted (push after each chunk)
- 2026-10-11: Critic #1 fixed (dark-mode pointer, guide toggle relayout, phone exit, confident-only Voices, one lens budget per spread, rarity-ranked hard words with definitions only, asides as parentheses only, gentler read-dimming, clamped name hues, queued page turns, reduced motion, running header). User pivot: Stage replaces the pointer as the default guide (ADR 0008). Chapter-end card + "Previously…" deployed.
- 2026-10-11: C7 S1–S4 + hold-to-read + quick speed landed and are deployed; S5 first pass done (phone bar, Reading aids layout, library, tablets, centred covers). Critic #3 running.
- 2026-10-11: C8 I1–I5 live (where-am-I strip + capsule, Type pointer, homepage pick-up, palette drift, chapter openers/staging/fingerprints); phone asks: ‹ › word steps, tap a word to start, swipe steps; critic #3 fixes deployed. Open: I6–I10; one gesture grammar decision (hold = read vs select vs keep).
- 2026-10-11: UI revamp from the user's references (R1 tokens: mono labels, radius/elevation scale, card + ink; R2 library: My Library hero + Continue pill, Recent row, floating dark bar; R3 reader: top cluster, chapter eyebrow titles, mono progress line; R4 control-center settings with preview, font tiles, vertical size/brightness sliders). Deployed.
- 2026-10-11: Idea bank complete (I6 living capsule + highlight dots, I7 cast card + constellation, I8 rare-word sparks, I9 finish keepsake, I10 ink-bleed titles / letters type / star-birth / arc reveal) + weather & time of day + tinted Up next cards + critic #3 remainders. Settings sheets: Geist Mono, opaque accent-tinted surface (user: 'opaque and aesthetically coloured'). Every word gets the marker (phrases stop at line ends).
