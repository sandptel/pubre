# Content → UI: turning book content into reader UI (researched 2026-10-11)

This is a background research agent's report, kept for reference. The pubre proposal built from it is **The Living Book** (artifact: https://claude.ai/artifact/2ZbuGXiqwUCNJcr2AtdPEs; local copy `research/living-book-proposal.html`; data script `research/living-book-compute.mjs`, run on Gutenberg #2701). The proposal has three waves: (1) the capsule comes alive, (2) meet the cast, (3) atmosphere and keepsakes. The user picks.

## Key takeaways
- Shipping readers keep content intelligence in side panels: Kindle X-Ray, Recaps and "Ask this Book"; Kobo "Beyond the Book". Progress bars stay dumb or show chapter ticks (Foliate), or time spent per page (KOReader Book Map). **pubre's per-chapter capsule can carry content signals in peripheral vision. That is the gap.**
- Almost everything can be computed in plain JS in a Web Worker in about 0.1–3 s per novel: names (capitalization heuristic plus alias clustering), dialogue ratio, sentence rhythm, punctuation, lexicon sentiment, colour, season and time words, in-book rarity (hapax). ML NER via transformers.js is optional; its smallest model is about 94 MB (q4f16 bert-base-NER).
- **Spoiler safety is a first-class rule.** Anything beyond the reader's high-water mark shows structure only (length, shape), never content. Amazon's "Ask this Book" (Dec 2025) set the "up to your position" norm.

## Prior art (sources)
- Kindle X-Ray: https://www.slashgear.com/1475659/kindle-x-ray-feature-explained/
- Kindle Recaps: https://www.aboutamazon.com/md/news/books-and-authors/kindle-recaps-feature-ebook-series-refreshers
- Kindle "Ask this Book": https://engadget.com/ai/kindles-in-book-ai-assistant-can-answer-all-your-questions-without-spoilers-190609961.html
- Kobo reading stats and chapter-length graph: https://blog.the-ebook-reader.com/2012/12/23/new-kobo-firmware-2-3-adds-in-book-reading-stats-to-kobo-ereaders/
- KOReader Book Map / Page Browser: https://koreader.rocks/user_guide/
- Google Play Books Bubble Zoom: https://android.googleblog.com/2016/07/google-play-books-introduces-bubble-zoom.html
- Readwise Bionic Reading study (no speed benefit): https://blog.readwise.io/bionic-reading-results/
- RSVP hurts comprehension (Schotter et al. 2014): https://www.psychologicalscience.org/news/releases/speed-reading-apps-may-impair-reading-comprehension-by-limiting-ability-to-backtrack.html
- StoryGraph moods and pace: https://thestorygraph.com
- Jeff Clark, Novel Views (character mentions): https://flowingdata.com/2013/01/14/character-mentions-in-les-miserables
- Stefanie Posavec, Writing Without Words: https://stefanieposavec.com/writing-without-words
- Nicholas Rougeux, Between the Words: https://www.c82.net/work/between-the-words
- Reagan et al. 2016, emotional arcs: https://arxiv.org/pdf/1606.07772
- BookNLP (alias clustering): https://arxiv.org/html/2307.03734v1

## Technical notes
- **Native first:** use `Intl.Segmenter` for sentences and words (0 KB). Use the CSS Custom Highlight API to tint names without mutating the DOM. Use CSS `@property` on base16 vars so palette changes animate.
- **Libraries, if needed:** compromise (MIT, about 150–210 KB, English); wink-nlp plus wink-eng-lite-web-model (MIT, about 1 MB gz); the `sentiment` package (AFINN, MIT); a VADER JS port (MIT).
- **Avoid:** the NRC Emotion Lexicon (non-commercial, no redistribution). Check labMT's licence before use. wordfreq data is CC-BY-SA (attribute it, ship a trimmed list).
- **ML (optional, lazy, behind an "enhance" toggle):** transformers.js v3 (Apache-2.0, WASM, or WebGPU via `device:'webgpu'`). Xenova/bert-base-NER is about 94–108 MB quantized. GLiNER small is about 130 MB.
- **Privacy:** text never leaves the device. Cache derived stats in IndexedDB keyed by book hash, and offer "forget".
- **Haptics:** `navigator.vibrate` works on Android only. iOS has none.

## Candidate ideas (from the report; effort S/M/L, impact 1–5)
Mood-tinted wedges (S, 5) · story-shape skyline (S, 4) · character heat strips (M, 5) · "who's here" chips (S, 4) · spoiler-safe character card (M, 5) · "Previously…" resume card (M, 4) · chapter fingerprint glyph (S, 4) · punctuation spiral (S, 3) · dialogue texture (S, 3) · speaker margin (M, 4) · ambient palette drift from colour words (S, 4) · weather and season layer (M, 4) · time-of-day lighting (S, 3) · pace meter (S, 3) · rare-word sparks (S, 3) · chapter vocabulary card (S, 3) · place trail (M, 3) · co-occurrence constellation (M, 4) · time left per wedge (S, 4) · radial capsule mode (M, 3) · semantic chapter openers (M, 5) · epigraph staging (S, 4) · letters/documents mode (M, 3) · highlight constellation on the capsule (S, 4) · re-read echoes (L, 4, only after finishing) · book "tasting" card (S, 3) · finish keepsake poster (M, 4) · name lens (S, 4).

## Animation ideas
- Page curl: a WebGL cylinder deform, for chapter turns only.
- Wedge → chapter-title View Transition morph.
- Ink-bleed reveals (SVG `feTurbulence` + `feDisplacementMap`).
- Kinetic epigraphs paced by punctuation.
- `@property` palette drift.
- Wedge pulse on chapter crossing.
- Character "star-birth" particle flying to the capsule.
- Weather canvas layer.
- Typewriter reveal for letters.
- Illuminated drop caps.
- Sentence-drawing stroke trace.
- Arc reveal via `clip-path`.
- Android haptic beats on wedge boundaries.
- Book close morphing into a keepsake poster.
