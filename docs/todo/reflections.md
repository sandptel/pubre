# Reflections

After each chunk: what worked, what hurt, what I would do differently, and what to watch next.

## C1 + C2 (2026-10-11): foundation and reading guide

**Worked**
- Building the text index on plain DOM Level 2 APIs made it unit-testable with xmldom.
- Putting the pointer *behind* a transparent iframe kept the book DOM pristine, so CFIs stay stable.
- Disjoint contrast ranges avoided the WebKit priority crash entirely.

**Hurt**
- My first dimming levels (38% for the page) were far too heavy in the real reader. They looked fine in the plan demo, which runs on a card background with a short passage.
- The pad covered the last line until I made guide mode reserve a bottom strip.

**Would do differently**
- Look at a real chapter screenshot *before* tuning visual constants.
- Prototype numbers in the demo don't transfer as-is.

**Next to watch**
- Rect lookups (`getClientRects`) inside `lineSpan()` and `firstWordOnPage` on huge chapters. Cache per-word rects per layout if profiling shows cost.
- Glide across a chapter boundary (pending/resume path) is only lightly tested.

## C3 + C4 + C5 core (2026-10-11): lenses, home and settings, highlights

**Worked**
- Pure, tested modules (names, lexicon, pacing, calm, CFI-ignore) caught real bugs early. The test "failures" on CFI offsets turned out to be my own arithmetic, and the code was right.
- Building C4 in a separate git worktree kept the critic agent's dev server stable.
- Every screenshot pass found something real: dense underlines, citation quotes turning a page teal, `.5 h` ranges, the pad overlapping text.

**Hurt**
- Heuristics tuned on synthetic text failed on the real book (the cast list, hard words). Always run them on Moby-Dick before trusting a heuristic.
- Svelte proxy semantics cost a debugging loop.

**User steering this round**
- Never dim upcoming text.
- Smart pauses.
- Name tint like the plan demo.
- Keep the latest iteration hosted.

**Next to watch**
- Lens painting cost on very long chapters (the parse cache is per view; rebuilt after italic edits).
- WebKit highlight count (we limit painting to pages near the reader).
- Speaker heuristics on non-Gutenberg books.

## Critic #1 + Stage (2026-10-11)

**Worked**
- Splitting the critic's findings by file ownership: a fork fixed lenses/marks/lexicon in the c4 worktree while I built Stage on main, then a clean merge.
- Debugging from the DOM rather than screenshots: a "half-coloured sentence" was really `Intl.Segmenter` ending sentences at source line feeds (UAX #29). Fixed in the text index, which also fixes pacing and pointer focus everywhere.
- Measuring before guessing: the veil's computed style was right in Chrome, so WebKit's backdrop-filter-over-iframe was the culprit.

**Hurt**
- The pointer design passed my own screenshot checks but failed the human test (attention capture). Screenshots can't show where the eye goes; ask how it *feels* sooner.
- File-offset approximations (TOC label placement) looked fine on one book and drifted on others. Prefer real DOM positions once the chapter is loaded.

**Next to watch**
- Stage on very long paragraphs (taller than the screen), verse, images, dialogue-heavy pages.
- Pace learning in Stage (manual → presses could teach wpm, as taps do for the pointer).

## Critic #2 on Stage (2026-10-11)

**Worked**
- Frame-sequence contact sheets + rAF gap tracing made the "feel" measurable: clipped lift, doubled text, and a column that moved on almost every sentence.
- Fixing at the root: dialogue/elision/heading sentence rules went into the text index, so Stage, the pointer and pacing all benefit.

**Hurt**
- A fixed anchor (always scroll the sentence to 38%) looked tidy in stills but moved text under the eye. Motion should be the exception: lazy anchor with a reading band.
- `mask-image` on the column clipped the flying copy. Fades belong in full-width overlays that appear after landing.

**Next to watch**
- Word-wave ink handoff (needs per-word spans in the Stage copy).
- Lens tint consistency for Voices across pages (critic #2 saw an untinted Ahab line beside tinted ones).
- Gradient banding on the edge fades on some displays.
