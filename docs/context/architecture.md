# Architecture (as of v0.2, 2026-10-11)

```
src/
├── main.ts                 mounts App
├── app.css                 global tokens (--ease, --serif), buttons, view-transition + reduced-motion rules
├── App.svelte              settings state → :root base16 vars; Library ⇄ Reader swap via View Transition
├── components/
│   ├── Library.svelte      grid, continue-reading hero, import (picker + drag/drop), remove
│   ├── Cover.svelte        cover image or generated cover (base16 accent picked from title)
│   ├── Reader.svelte       owns Book + Paginator; floating close/menu buttons, running head/foot, one panel (menu → contents | appearance)
│   ├── Progress.svelte     floating capsule: chapter wedges (tap = jump, drag = scrub, hover = preview), page in chapter
│   ├── Sheet.svelte        <dialog> panel: floating bottom sheet (phone) / popover above the menu button (≥720px), back/close, animated height
│   ├── Toc.svelte          recursive TOC, highlights current
│   └── Appearance.svelte   themes (pubre + base16), fonts, size, spacing, margins, toggles
├── epub/                   EPUB protocol layer, UI-free: Epub aggregate + zip, container, package, nav, ncx,
│                           encryption, smil, cfi, semantics, resources, xml, errors (see src/epub/README.md)
└── lib/                    framework-agnostic reader core
    ├── epub.ts             thin adapter: re-exports Epub as Book (+ types) for the app
    ├── paginator.ts        multi-column iframe pagination, animation, input, relocation events
    ├── settings.ts         palettes × modes → resolveTheme(), fonts, Settings, bookCss() override stylesheet
    └── store.svelte.ts     IndexedDB: books (metadata) + files (ArrayBuffer)
tests/**/*.test.ts          node --test (native TS type stripping); tests/epub/* use @xmldom/xmldom as the DOM
```

## Opening a book

1. `store.importFile`: SHA-256 of the bytes becomes the id (so imports dedupe). Then `Book.open` validates the file and reads metadata. The cover becomes a 480px JPEG thumbnail. Both the record and the file go into IDB as ArrayBuffers.
2. `Reader` reads the bytes from IDB, calls `Book.open`, then `new Paginator(host, book, settings)`, then `open(index, fraction)`.
3. `Book.chapterUrl(i)` parses the XHTML (with an HTML fallback), strips `<script>` and `on*` attributes, rewrites `src`, `link href`, SVG `href`/`xlink:href`, `poster`, `object data`, `<style>` and `style=` `url()` to blob URLs, and injects a CSP meta tag. CSS resources get their `url()`/`@import` rewritten recursively. Fonts are deobfuscated in `bytes()`.
4. `Paginator.load` creates an iframe (`sandbox="allow-same-origin allow-scripts"`, see ADR 0006) with the blob src, injects `#pubre-user` (theme/typography) and `#pubre-layout` (columns) styles, waits for fonts and images (1.5s cap), then measures `scrollWidth`, sets the page count, and widens the iframe to `pages × V`.
5. A page turn animates `transform: translate3d(-page×V)` with WAAPI. A chapter turn loads the next iframe beside the current one and slides both. Jumps (TOC, scrubber) crossfade.

## Layout math (paginator.measure / inject), v0.2

- `colW = min(~36em at the current font size, (V − 2·outer − (cols−1)·gap)/cols)`. The margin setting scales both the outer margin and that cap.
- `gap` is independent of the outer margins: 2·outer on phones, 48–96px for spreads. `step = cols·(colW+gap)` is one screen.
- Iframes live in `.pubre-port`: centered, `width = step`, `overflow: hidden`, mask-faded over `gap/2` at each edge. Page `n` is at `translateX(−n·step)`.
- `sectionBreaks()` runs after the styles are injected (see findings). `placeToc()` maps every TOC entry to 0..1 progress, which gives the chapter label and the top-level `Section[]` for the capsule.

## Layout math (v0.1, superseded)

- `V`, `H` are the host size. `cols` is 2 when spread is `auto`, `V ≥ 900`, and the screen is landscape.
- The margin `m` is `pageW × [5%, 8%, 12%]`, with a minimum of 16. Single-column pages are capped at a measure of about 760px.
- `gap = 2m`. `colW = (V − 2m − (cols−1)·gap) / cols`. The html element gets `width = V−2m`, `padding = t m`, `height = H−2t`, `column-width = colW`.
- Overflow columns extend to the right. `ncols = ceil((scrollWidth − m) / (colW+gap))` and `pages = ceil(ncols / cols)`.
- Relayout keeps the reading position by taking a caret range at the current page's top-left, relaying out, then finding the page of that range's rect.

## Positions & progress

- Saved as `{ index, fraction }` per book. **A CFI-based location is a backlog item.**
- Book progress is weighted by the uncompressed size of each spine item.
