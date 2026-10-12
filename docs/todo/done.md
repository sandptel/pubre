# Done (newest first)

## v0.2: design pass + section breaks (2026-10-11)

- `merge`: **standalone EPUB protocol module `src/epub/`** (13 commits, built in parallel). ZIP (ZIP64, data descriptors, CRC), OCF container, OPF (full EPUB 2/3 metadata, refines, series, a11y, rendition), nav (toc, page-list, landmarks, all navs), NCX, encryption (IDPF/Adobe deobfuscation, typed DRM errors), SMIL timelines, **CFI** (parse/stringify/compare/generate/resolve), semantics, resources (srcset, fallbacks, sanitized loader). 68 tests. `src/lib/epub.ts` is now an adapter. Verified in Chrome and WebKit.

- `fix(reader)`: section breaks are honored in the multi-column layout (publisher and structural breaks, empty pages avoided)
- `feat(theme)`: base16 **palette × mode** (ADR 0007), with tests
- `feat(reader)`: book-like layout (measure about 36em, independent gutter, faded port, margin taps); chapters placed on the progress axis using TOC fragments
- `feat(ui)`: design tokens (spacing scale, spring, glass, 44px floating buttons)
- `feat(ui)`: floating reader chrome: close button, menu button, **segmented chapter progress capsule** (tap a wedge to jump, drag to scrub, hover to preview); one menu panel with push/pop views
- `feat(ui)`: compact Themes & Settings (size capsule, mode swatches, palette strip, Font and Customize disclosures, crossfade on color change)
- `feat(ui)`: minimal library (+ button, compact continue card, long-press or right-click menu, undo toast, FLIP removal, unread dot)
- Docs: product & design playbook, ADR 0007, research `content-to-ui.md`, smoke e2e now covers 3 viewports

## v0.1: first iteration (2026-10-11)

- `ci`: Pages workflow (test, check, build, deploy on push to main) and README
- `feat(ui)`: reader chrome, running head/foot, progress scrubber, Contents sheet, Themes & Settings sheet
- `feat(ui)`: library with continue-reading hero, generated base16 covers, drag-and-drop or picker import, cover-morph View Transition
- `feat(reader)`: column paginator with animated page and chapter slides, touch drag, tap zones, wheel/keys, relayout that preserves the anchor (verified across a resize)
- `feat(theme)`: base16 theme system: 6 pubre reading themes + 21 tinted-theming schemes, 9 font stacks, size, line spacing, margins, justify, bold, two-page spreads
- `feat(store)`: IndexedDB library (ArrayBuffers), SHA-256 dedupe, cover thumbnails, `storage.persist()`
- `feat(core)`: EPUB 2/3 parser (OPF, spine, nav/NCX, cover, IDPF/Adobe font deobfuscation, DRM detection) and blob-URL loader with script stripping + CSP
- `feat(core)`: ZIP reader on DecompressionStream, with test
- `chore`: scaffold

Verified in Chrome (desktop 1440×900) and WebKit (390×844 touch): import of 3 books, open, page turns, TOC jump, theme switch, return to library.
- Stage reading mode (Space lifts the paragraph; sentence-at-a-time; breaths; chapter continuation) — 2026-10-11
- Chapter-end card (three words, Question resurfacing) and "Previously…" recap — 2026-10-11
- Critic #1 fixes (see implementation-plan status) — 2026-10-11

## v1.0.0 release (2026-10-12)
- README (live link, trailer GIF), CONTRIBUTING, 20 repo topics, homepage, release v1.0.0 with MP4 trailer.
- Trailer source: ../pubre-samples/reel/trailer2.html (recreated UI, light gruvbox, e-ink pixel refresh); record with record2.mjs.

## Punctuation beats (2026-10-12)
- d138908 feat(guide): pacing.beat() gives each situation its own pause + cue (list, clause turn, speech tag, cut-off speech, short-sentence landing); pauses scale with pace (pauseScale).
- 6f67dfd feat(stage): the mark hops during its pause (copy of the mark animated over the original; per-kind motion).
- 941fab8 trailer v3: device-framed UI (phone/tablet/desktop), camera zooms, a different e-ink transition per cut. Source ../pubre-samples/reel/trailer3.html, record3.mjs.
- Trailer v3 re-cut: 120 bpm grid (BEAT=500ms, scene lengths in beats, absolute-time scheduler), refreshes only at the four act breaks, hard cuts with a 140ms e-ink ghost elsewhere.
- README video: GitHub only plays inline video from user-attachments uploads (CSP media-src); repo/raw and release URLs are blocked. Needs a manual drag-and-drop upload.
- 6350103 feat(guide): one pause ladder (list<comma<dash<colon<semicolon<sentence<paragraph<section), paragraph end = sentence-end beat + 400 (+200 dialogue, +600 heading); Stage paragraph breath 500 -> 300; Settings.pauses multiplier (0.5-3).
- 9f3bb12 feat(ui): Pauses slider in Reading aids + Stage quick panel, PauseBars chart, ReadPreview honours pauses.
- feat(stage): MOVES per kind (rotating) + BY_HOW (short/spoken/long) picks; wash() of quoted/bracketed passage (accent), ?-sentence (base0D), !-sentence (base08).
- 02dbb2c fix(library): hero grid minmax(0,1fr), long cite no longer widens card.
- c33a915 feat(ui): Sheet docks full-height on the left at >=1000px; library translates aside; lens caption no longer absolute.
- feat(reader): readTo place marker (r-read/r-here highlights, .pubre-place pin in port), Stage starts from it when on page, tap pin then word to move, resume ripple after 2h away.
- feat(ui): Credits card in library settings (portrait, GitHub ask with stepping ring, bug/idea/contribute links, version from package.json).
- chore: MIT LICENSE.
- 8fb9c03 fix(stage): startWord() asks Reader (resumeAt) for your place first; Space/G/pad all resume. Selection bar ▶ "Read from here".
- d5c74c3 feat(ui): maker portrait = Zoro-style ink-stamp SVG (inline in Credits.svelte).
- 865472e feat(book): desktop BookPage = sticky full cover left (42%) + details column right; phones unchanged.
- feat(reader): Coach.svelte + lib/hints.ts (localStorage pubre:hints; learned=-1 / show counts): space hint (keycap / finger), stage moves x3, pin hint x2.
- feat(reader): gentle Space reminder after learn: 12s idle on a text page, guide off, cooldown 2 min, fades in 6.4s.
- 6b6adc0 test(names): six-book cast eval + baseline (P@20 73%, R@30 64%).
- b9bbb9a feat(insights): cast finder v2 (evidence, titles, aliases, gazetteer): P@20 100%, R@30 94%.
- 03663ec feat(lenses): aliases mark their character (lenses, speech, cast links).
- 0ae582f feat(insights): background cast job with progress chip, partial cast, PROFILE_V 6.
- 5ddb2ea feat(library): welcome guide EPUB (guide/ → public/guide.epub via scripts/guide.mjs), seeded once for new libraries, Settings → The guide.
- feat(reader): chapter-end card → timed pill in the running-head strip (9s, pauses on hover, tap to open).
- fix(reader): removed first-line staging (word-by-word reveal + letter typing, stage-* highlights); title ink-soak kept.
