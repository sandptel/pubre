# Reading guide, visual grammar and word lenses (researched 2026-10-11)

Plan v2 artifact: https://claude.ai/artifact/2ZbuGXiqwUCNJcr2AtdPEs. Local copy: `living-book-proposal.html`. Build sources are in `living-book-src/` (assemble by replacing the `/*DATA*/ /*LENS*/ /*GRAMMAR*/ /*PARTS*/` placeholders in `template.html`). **Status:** waiting for the user's comments; nothing is implemented yet.

## Visual grammar (decided in plan v2, pending user sign-off)

Each channel carries one meaning, and each meaning has one motion verb. Motion plays only at the cursor, runs once, lasts under 450 ms, and has still equivalents for reduced motion.

| Channel | Meaning | Verb |
|---|---|---|
| Ink colour | Who: a character or speaking voice, one base16 hue per character | Bloom (plus a spark on first mention) |
| Underline | Tell me more. Dotted means a definition, dashed means a term or place, double means a note | Draw (plus a peek card while guiding) |
| Coloured wash | Yours: highlights in 6 meanings (Key, Beautiful, Idea, Feeling, Question, Revisit), mapped to the W3C colours yellow, green, blue, pink, orange, purple | Breathe |
| Neutral wash | Where you are: the current sentence or line, plus the cursor bar | Glide |
| Weight and slant | Your emphasis only. The author's italics are never touched | Still |
| Opacity | Time: already read (optional dim), or ahead (spoiler-gated) | Settle |
| Margin mark | Notes and structure | Spark / pulse |

There is one intensity control instead of many toggles: **Quiet** (yours + where), **Guided** (adds who + tell-me-more; the default), and **Rich** (adds motion, sparks and the capsule).

## Key research facts (sources in the agent report, summarised)

**Reading speed and comprehension**
- Silent reading speed is about 238 wpm for non-fiction and 260 wpm for fiction; most adults read at 175–300 (Brysbaert 2019).
- Blocking regressions hurts comprehension (Schotter, Tran & Rayner 2014), and RSVP hurts it too. Going back must stay cheap.
- Short lines gave dyslexic readers +27% speed and roughly half the regressions (Schneps 2013). This supports Line focus.
- No adult study shows that a moving pointer improves comprehension. Present the guide as a focus and place-keeping aid. Dimming is off by default.

**Key bindings and segmentation**
- Use Vimium caret-mode bindings: w/b/e, ( ), { }, 0 $, j/k.
- `Selection.modify` with sentence or paragraph granularity is missing in Firefox, so use `Intl.Segmenter` and merge abbreviations ("Mr.", "Dr.") in a post-pass.

**CSS Custom Highlight API**
- Supported in Chrome 105, Safari 17.2 and Firefox 140; Baseline since 2026-03.
- Allowed properties: color, background-color, text-decoration*, text-shadow and -webkit-text-stroke*.
- **No** font-weight or font-style. That is why bold is a stroke and italic uses a CFI-ignored span (the epub.js `ignoreClass` approach).
- Text-underline-offset and thickness are ignored in WebKit (bug 282027).
- The highlight registry is per document, so use `iframe.contentWindow.CSS.highlights`.
- Safari slows down with many ranges (bug 323171). Register ranges only for the visible spread ±1 and merge adjacent ones.

**Cursor**
- Draw it as an overlay in the parent document, positioned from `getClientRects`.
- Before stepping, check whether the next word's rect lies beyond the page and turn the page first.

**Tap, hold and double-tap**
- Ignore `e.repeat`.
- A 200 ms hold timer separates tap from hold.
- Double-tap acts immediately, then undoes the step and jumps to the sentence start if a second tap lands within about 300 ms. This conflicts with fast stepping taps, which is an open question for the user.
- Dead-man's switch: stop on blur, visibilitychange and pointercancel.

**Pacing**
- Time per word: `t = 60000/wpm × (0.7+0.3·len/5) × punct(1.5/2.0/2.5) × rarity(1.3)`.
- Learn speed with an EMA (α 0.2), discard intervals over 3 s, and clamp to 120–450 wpm.

**Text-to-speech**
- Web Speech boundary events are unreliable with Chrome's remote voices and on Android, so keep a timer fallback.
- Prefer EPUB Media Overlays when the book has them.

**Data**
- Word difficulty: wordfreq Zipf < 3 (data is CC-BY-SA; about 150–200 KB gzipped for 50k words, estimated).
- Definitions: Open English WordNet 2025 (CC-BY 4.0; JSON), sharded and lazy-loaded.
- dictionaryapi.dev is an opt-in online fallback.
- Avoid SUBTLEX and the Kuperman age-of-acquisition norms (unclear licences).

**Parts of speech (later lens):** wink-nlp is about 95% accurate on WSJ and about 1 MB; compromise is about 250 KB.

**Annotations:** export Readium Annotations (a W3C Web Annotation profile) with both CFI and TextQuote selectors. Namespace pubre's extra styles as `pubre:style`.
