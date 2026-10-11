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
