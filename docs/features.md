# Features: EPUB capability gaps and the pubre vision

pubre's thesis is that EPUB carries far more structure and intent than readers use. A reader that understands *what each section is* can present each kind differently. That presentation-level creative freedom is the product.

Status legend: **✅ shipped** · **🟡 partial** · **📋 backlog** · **💡 idea**

> Per-app claims below reflect general knowledge as of 2026-10. They are not exhaustively verified. Before building a feature, confirm the competitor behavior in `research/<feature>.md`.

---

## 1. Gap analysis: what EPUB offers vs. what typical readers do

| EPUB capability | Spec mechanism | What typical readers do | pubre opportunity | Status |
|---|---|---|---|---|
| Semantic sections | `epub:type` on elements (chapter, epigraph, footnote, noteref, aside, sidebar, pullquote, bridgehead, glossary, dedication, colophon, letter, poem/verse via markup) | Most ignore it beyond footnotes. Everything renders as flat publisher HTML. | **Section Presenters** (see §2): every semantic type gets its own customizable presentation | 💡 |
| Footnotes / endnotes | `epub:type="noteref"` → `footnote` / `endnote` / `rearnote` | Popups exist in Apple Books, Kobo, Google Play Books, Foliate and Readest. Many web readers jump away instead. | Inline popover that animates from the reference, stacked notes, "all notes in this chapter" drawer, and a heuristic fallback for unmarked notes (superscript links to `#id`) | 📋 |
| Print page list | `<nav epub:type="page-list">` | Rare: Readium/Thorium-style readers, some store apps | "p. 214 (print)" in the footer, jump to a print page for book clubs and citations | 📋 |
| Landmarks | `<nav epub:type="landmarks">` | Partly used (some readers' "go to beginning") | Smart open at `bodymatter` rather than the cover, plus quick jumps to Index, Notes and Bibliography | 📋 |
| Media Overlays | SMIL `<par><text/><audio clipBegin clipEnd/></par>` | Apple Books (mostly fixed-layout children's books), Thorium. Most others ignore it. | Read-along with sentence or word highlight synced to narration, follow-mode page turns, adjustable speed | 📋 |
| Text-to-speech | No spec; reader feature | Common but robotic, with weak highlighting | Web Speech now, on-device neural TTS later (WASM/WebGPU), sentence highlighting, voices per character (💡) | 💡 |
| Fixed layout | `rendition:layout=pre-paginated`, `rendition:spread`, viewport meta | Supported by big apps, often poorly in web readers | Spreads with a real page-turn feel, pinch-zoom, comic panel-by-panel navigation (💡) | 📋 |
| RTL & vertical writing | `page-progression-direction`, `writing-mode: vertical-rl`, `<ruby>` | Apple Books and Kobo handle Japanese well. Web readers are poor. | Correct RTL page turns, vertical-rl pagination, a ruby (furigana) toggle | 📋 |
| Scripted content | `properties="scripted"` | Apple Books runs JS. Most readers disable it. | Opt-in, per-book "interactive mode" in an opaque-origin sandbox with a postMessage bridge | 💡 |
| Accessibility metadata | `schema:accessMode`, `accessibilityFeature`, `accessibilitySummary` (EPUB A11y 1.1) | Thorium shows it. Most hide it. | Book info sheet with a11y badges, and auto-enabling features such as TTS-friendly mode | 📋 |
| Index | EPUB Indexes spec, or plain back-of-book index | Treated as ordinary pages | Searchable, clickable index panel with occurrence previews | 💡 |
| Glossary / dictionary | `epub:type="glossary"`, EPUB Dictionaries spec | Ignored | Hover or long-press glossary cards built from the book's own glossary | 💡 |
| Series / collections | `belongs-to-collection` + `group-position`, `calibre:series` | Series shelves exist mostly for store-bought books | Automatic series shelves in reading order, with a "next in series" prompt at the end | 📋 |
| Precise locations | EPUB CFI | Used internally. Rarely exposed. | Shareable quote links (`#cfi`), highlights that survive reflow and font changes | 📋 |
| Non-linear content | Spine `linear="no"` | Shown inline or skipped | Present as modal "side documents" (answers, maps, appendices) | 💡 |
| Publisher typography | Publisher CSS and embedded fonts | All-or-nothing "publisher defaults" toggle at best | Per-book **respect ↔ override slider** that progressively neutralizes publisher CSS (fonts, sizes, colors, margins) | 💡 |
| Embedded fonts (obfuscated) | `encryption.xml` IDPF/Adobe obfuscation | Supported | ✅ deobfuscation | ✅ |
| Cover & metadata | OPF metadata, `cover-image` | Supported | ✅ cover thumbnails and generated covers for coverless books | ✅ |
| TOC | nav doc / NCX | Supported | ✅ nested TOC sheet with current chapter. Next: progress per chapter and a mini-map | 🟡 |

## 2. pubre's own features (beyond the spec)

### Core concept: Section Presenters

Each kind of section is rendered through a **presenter**: a style plus behavior preset the user, or a theme, can change.

| Section kind (detected by `epub:type`, then heuristics) | Example presentations |
|---|---|
| Chapter opener | Full-page title card, drop cap, ornamental rule, base16-tinted generated art, chapter-length estimate |
| Epigraph / pull quote | Centered, larger italic, fade-in, attribution set apart |
| Letters / documents within the story | "Paper" card with a handwriting-style font |
| Poetry / verse | Preserved line breaks, hanging indents, no justification |
| Dialogue | Optional speaker tinting from a character index (💡 on-device NLP) |
| Footnotes | Popovers, margin notes on wide screens |
| Images / figures | Full-bleed page, tap to zoom, caption overlay |
| Tables / code | Horizontal-scroll cards that never split across columns |

The pipeline is: detect section kind → apply presenter CSS + optional JS behavior in the parent → keep pagination correct.

### Engagement ideas

| Idea | Notes | Status |
|---|---|---|
| Apple Books–grade typography and themes | ✅ v0.1: 6 reading themes + 21 base16 schemes, 9 font stacks, size, spacing, margins, justify, bold | ✅ |
| Animated page turns | ✅ slide plus interactive drag (touch). Next: page-curl (WebGL), fade, and a scroll mode | 🟡 |
| Cover morph open/close | ✅ View Transitions API | ✅ |
| Reading stats | Time per session, pace, "time left in chapter/book", streaks | 📋 |
| Highlights & notes | base16 accent colors (base08–0E) as highlight palette, export to Markdown | 📋 |
| Full-text search | In a worker, with a library-wide index (Rust→WASM if measured slow) | 📋 |
| Character / X-Ray index | On-device NER: who is this, first appearance, spoiler-safe up to the current position | 💡 |
| Chapter recaps | On-device LLM (WebGPU) "previously…" when resuming after a long gap, spoiler-safe | 💡 |
| Ambient mode | Soundscape or color temperature driven by chapter mood (💡 on-device classification) | 💡 |
| Custom base16 import | Paste any base16/base24 YAML to add a theme | 📋 |
| Sync across devices | No backend: export/import file, later WebDAV, Gist or Dropbox | 📋 |
| PWA install + offline | Manifest ✅. Next: service worker for app-shell caching | 🟡 |
| Mobile app | Capacitor wrap for "open with" from Files, share sheet, haptics | 📋 |
