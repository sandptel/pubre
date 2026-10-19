# Page Lab: idea board and compass (2026-10-16)

The working plan for pubre's next phase: richer presentation, motion, typesetting, pointer, passage weather and speaker hints. **Read this before picking up any of these ideas.** It records what was proposed, why, what the user asked for, and how to run the build loop.

## Status

- **Round 1** (idea board) is done. The user's picks (read 2026-10-16): M1 M2 M4 M5 T1 T2 T3 T4 T5 P1 P3 P5 P6 L2 PV1 PV2 PV3 PV4 PV8 R2 R4 R5 R7 R8 R9 R11 R13, with pointer direction **D1**. Their note on turning: "add page turning animation". They also ticked R1, which already exists. They saw the board before the UI (U*) and weather (E*) sections were added, but they asked for speaker hints and passage weather by message.
- **Round 2** choices were read on 2026-10-16 and **everything is built and pushed** (see todo/done.md, "Page Lab, rounds 1–2"). The user's follow-ups: whisper needs more variants (next board); weather must stay a small touch; the pointer tail was removed ("animation looks broken"); every feature needs an on/off or variant switch (Reading aids → The page).
- The Keeper's Year (`showcase/`) is the test book for all of it: open it to see weather change by chapter, speakers, letters, plates, tables and punctuation.
- Previously: **Round 2** (variant picker) was published and waited for the user's choices. It has 2–4 live variants per pick plus speaker hints (U8) and passage weather (E1). URL: https://claude.ai/artifact/PZYBDd19xeRE17NvYqkFAU. Read the choices with `ArtifactData get`, collection `choices`, doc_id `main`. Shape: `{choice: {turn, settle, scroll, peek, punct, hang, bottoms, justify, breaks, letters, figures, tables, lastpage, step, preview, tail, glide, quote, recap, cast, map, initials, speaker, weather: variantValue}, notes: {key: text}, at}`. My recommendation for each item is the card tagged "Recommended".
- Local copies of both boards are in `research/page-lab/round1-ideas.html` and `round2-variants.html`. They are self-contained; the db only works when published.
- Once choices arrive, start the build loop below in this order: bugs → typesetting (T*) → page turn and settle → pointer (D1 set) → presenters (P*) → last page → speaker and weather → R items.

- **Speaker hints decided (2026-10-19):** colour only: quote marks in the speaker's colour plus a small dot in the margin where the speaker changes (ring = guessed). Vertical and horizontal name labels were tried and dropped.
- **Round 3** board: https://claude.ai/artifact/UoJeXzAnMgDaTxcpkHHNpg (local copy research/page-lab/round3-variants.html). Read with `ArtifactData get`, collection `choices`, doc_id `round3`: `{choice: {speaker, density, glyphs, wxcolor, wxwhere}, ideas: string[], notes, at}`. Waiting for the user.

## Where things live

- **Idea board (artifact):** https://claude.ai/artifact/5iK8TsWdnRn9LeEtynv76r. Local source: the session scratchpad `pubre-ideas.html`. If it is lost, rebuild it by reading the artifact with the Artifact tool's `read` action.
- **The user's picks:** saved in the artifact's db. Read them with `ArtifactData` `get`, url above, collection `picks`, doc_id `main`. Shape: `{ids: string[], direction: 'D1'..'D4' | null, notes: {turn, type, present, place, ui, env, pointer, ladder: string}, note, at}`. The page also has a "Copy picks" fallback the user may paste instead.
- **Research behind it:**
  - `research/motion-and-feeling.md`: motion grammar and the rules for what moves near the line being read. **Load this before any animation work.**
  - `research/speaker-models.md`: on-device models for speaker attribution and passage environment.
  - Rules get "said X" quotes right 94–99% of the time; the gap is untagged (37%) and "he said" (29%) quotes.
  - Step 1: Muzny-style rules in `lenses.ts`, measured on PDNC (CC-BY 4.0).
  - Step 2: an optional small cross-encoder that we train ourselves, int8 ONNX at 15–35 MB, running in the insights worker.
  - No browser LLM for v1.
  - Weather v1: per-paragraph-window rules, with figurative-use filters and hysteresis (enter above 0.6, exit below 0.3, hold at least 2 pages).
  - Weather v2: embedding prototypes with bge-small (34 MB) or MiniLM (23 MB).
  - Android latency is unmeasured, so benchmark before building.
  - `research/reading-guide-and-lenses.md`: earlier pointer, lens and visual-grammar research. It is still valid.
- **Current-UI screenshots** from the tour: `../pubre-samples/tour/*.png` (Pixel 7). The scripts are `tour.mjs` and `tour2.mjs`, and `lab-shot*.mjs` screenshots the artifact itself.

## What the user asked for (their words, condensed)

1. Since we own the text, improve how it is presented: page scrolling/turn animation and text alignment, plus how EPUB content (notes, verse, letters, figures) is shown.
2. Present the ideas as an artifact with choices. The user picks one or many, then I implement them **iteratively**.
3. Give each section a comment box, so the user can steer iterations per section.
4. Research the pointer and offer variants and **one direction** to pick.
5. Show ideas from **basic to extreme**.
6. Show UI changes across every surface as a product designer would, with **mockups that look exactly like the real UI**. Do not use abstract boxes.
7. Ideas for text markups, the dictionary card and the book cover page.
8. Research small models: who is speaking, shown cleanly with speaker initials or avatars, and without overwhelming the reader.
9. Research how motion makes people feel, and load it as context when implementing.
10. Detect weather and environment per page or per Stage passage with a good classifier. Show it as a **small touch in the background**, never loud and never harming legibility.
11. **Automated run:** build each pick, then look at the result yourself (screenshots or frames on a phone viewport), fix bugs and polish animations, and iterate. Then present the next round of ideas the same way.
12. Annotate all of this so later agents have a compass. That is this file.

## The idea board (IDs are stable; use them in commits and notes)

| Group | IDs | Start-here picks (mine) |
|---|---|---|
| Turning & scrolling | M1 weighted turn · M2 lines settle · M3 ink-through fade · M4 scroll mode · M5 peek next page | M1 |
| Setting the type | T1 printer's punctuation · T2 better line breaks · T3 hanging quotes · T4 even page bottoms · T5 justify only when it fits · T6 book-style paragraphs | T1, T2 |
| Presenting content | P1 scene breaks · P2 verse/epigraphs · P3 letters · P4 footnote popovers · P5 full-page figures + zoom · P6 sliding tables | P1 |
| Page knows your place | L1 eye-lands-here sweep · L2 real last page (replaces the top pill) · L3 carry-over line tint | – |
| Across the reader (UI) | U1 book page cover · U2 cover swings open · U3 anchored dictionary card · U4 character card · U5 quiet markups · U6 footer (+bug) · U7 book's own initials (+bug) · U8 speaker hints · U9 continue-from-line library card · U10 margin flag pin · U11 no blinking caret | U1, U3, U5 |
| Passage weather | E1 weather follows the page/paragraph · E2 real scene classifier · E3 weather in the Stage card; strengths: margins only / behind text / tint only | E1 |
| Pointer | PV1 eye-sized steps · PV2 preview window · PV3 comet tail · PV4 pacer glide · PV5 line handoff · PV6 finger trace · PV7 shape by context · PV8 haptic ticks. Directions: D1 quiet place-keeper (recommended) · D2 pacer · D3 finger-led · D4 conductor | PV1, PV2, D1 |
| Basic → extreme | R2 quote cards · R3 search · R4 offline/PWA · R5 story so far · R6 soundscape · R7 character cards · R8 margin notes · R9 map · R10 voices · R11 illuminated openers · R12 ask the book (WebGPU LLM) · R13 WebGL curl · R14 gaze turning · R15 read together (needs a server) | – |

R1 ("time left") was dropped: it already exists in the page footer. Check what exists before proposing anything (`todo/done.md`, the screenshots).

The build notes for each idea are on the artifact cards. Each names the files it touches.

## Bugs found on the tour (fix regardless of picks)

- **U6:** a chapter's first page footer shows "of 12" with no page number (Moby-Dick ch. 1; Pride shows "1 of 8", so it may depend on the book or on the Ticker).
- **U7:** Pride and Prejudice's image initial "I" plus our classic drop cap gives a misaligned "I / T is a truth". Skip the drop cap when the first paragraph starts with an image.
- **U10:** the pin head overlaps the line above the word.
- **U3:** the definition card covers the lines above the word, and nothing anchors it to the word.
- **U5:** hard words use a wavy red underline, which reads as a spelling error.
- Pride's TOC labels look like "I hope Mr. Bingley will like it. CHAPTER II." Check whether that is the book's own nav or our label derivation.
- The book page lists Gutenberg front matter before Chapter 1, and the reader opens on the cover image (backlog 5: open at bodymatter).

## Design compass (apply to every pick)

- Motion grammar: see `motion-and-feeling.md`. In short:
  - Only the pointer moves on the line being read.
  - Ambient effects cycle over 6–10 s with ±3–6% lightness change.
  - Pointer steps take 100–160 ms, ease-out, with no overshoot.
  - Page turns take 300–450 ms, follow the finger on one axis and can be cancelled.
  - Springs belong to chrome only.
  - Closure moments run 600–1200 ms and settle rather than loom.
  - Read text never disappears.
- Research-flagged ideas: M1 (no page bounce), M2, PV3, PV4 and PV7. Build these only in their safe form, described on their cards.
- Phone first (the user reads in Android Chrome). Mockups and screenshots go at 390–412 px wide first.
- Product-design checklist: `instructions/product-design.md`. Minimal, nothing duplicated, progressive disclosure.
- Every new behavior respects `motion: 'calm'`, the OS reduced-motion setting and the intensity setting (Quiet/Guided/Rich).

## The build loop (what "automated run" means here)

For each picked ID, in the order the user ticked them within a section:

1. Read the card's build note, the relevant source, and this compass.
2. Implement the smallest version that matches the card.
3. Run `npm test && npm run check && npm run build`.
4. Look at it: a Playwright script in `../pubre-samples` on a Pixel 7 context. Screenshots, plus for motion, frames from `recordVideo` extracted with ffmpeg.
5. Critique the frames against the motion rules and fix what's off. Repeat steps 4–5 until it looks right. Keep the before and after frames.
6. Commit once per ID (`feat(scope): … (U3)`), with no AI attribution. Update `todo/done.md`. Add findings and ADRs where needed.
7. After a round, put a contact sheet in front of the user, add the next round of ideas to the artifact (same structure: now vs proposed, comment box per section), and read their picks again.

## Open questions for the user

- Which pointer direction (D1–D4).
- Which weather strength (margins / behind / tint).
- Whether Extreme-tier items that break the no-backend rule (R15) or need 1–2 GB downloads (R12) are in scope at all.
