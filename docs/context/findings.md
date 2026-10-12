# Findings: things learned the hard way

Each entry: date · finding · evidence · where handled.

- **2026-10-11 · WebKit does not deliver parent-attached event listeners into an iframe sandboxed without `allow-scripts`.** Evidence: a Playwright A/B test (`tap.mjs`). With `sandbox="allow-same-origin"`, Chrome taps turned pages but WebKit taps did nothing. Adding `allow-scripts` fixed WebKit. Handled in `paginator.ts` `load()`, with book scripts stripped and CSP-blocked instead (ADR 0006). Chrome logs a console warning about the combination. This is expected.
- **2026-10-11 · WebKit rejects `Blob` values in IndexedDB** (`UnknownError: Error preparing Blob/File data to be stored in object store`). This happens in Playwright WebKit and is known in Safari private mode. Handled by storing `ArrayBuffer` for both files and covers (`store.svelte.ts`).
- **2026-10-11 · `<input type=file>`.files is live.** Resetting `value = ''` after an async handler starts empties the list mid-loop, so only the first file was imported. Handled by copying it with `Array.from` synchronously in `Library.add`. The same applies to `DataTransfer.files`.
- **2026-10-11 · In Safari, a `<button>` with `all: unset; display: block` shrinks to fit its content,** so an `aspect-ratio` child collapsed to zero width and covers were invisible. Handled with an explicit `width: 100%`.
- **2026-10-11 · Node 26 type stripping rejects non-erasable TS** (for example constructor parameter properties). `tsconfig` sets `erasableSyntaxOnly` so the checker catches it, and lib code must stay erasable so `node --test` can import it.
- **2026-10-11 · TypeScript 7 (native) is `latest` on npm, but `svelte-check` peers on `^5 || ^6`.** We pin `typescript@6`.
- **2026-10-11 · Gutenberg EPUBs put many chapters in one spine file.** Running-head labels per spine item are therefore coarse ("MOBY-DICK; or, THE WHALE." during Chapter 1). **Resolved:** `placeToc()` places every TOC entry on the progress axis by the fragment's offset in its file.
- **2026-10-11 · Backdrop blur is missing in Playwright WebKit screenshots,** so a sheet at 86% opacity was hard to read over text. Raised to 95%.
- **2026-10-11 · Paged-media breaks do nothing inside CSS multi-column.** `page-break-before: always` and `break-before: page` are ignored. Many books (Gutenberg, for example) also never mark section breaks at all, so the boilerplate, contents list and title page ran together. Handled by `sectionBreaks()` in `paginator.ts`: publisher CSS breaks are re-expressed as column breaks, and structural breaks are added (h1, `epub:type` sections, chapter/toc class *on containers only*, Gutenberg boilerplate). Adjacent breaks collapse, and a break with nothing laid out since the previous one is skipped (it would make an empty page).
- **2026-10-11 · Section-class heuristics must apply to containers only.** Gutenberg marks *every TOC line* as `p.toc`, which briefly made each line its own page.
- **2026-10-11 · Headless Playwright WebKit renders `backdrop-filter` wrongly:** content behind looks barely covered. With the filter disabled, the 94%-opaque surface renders correctly. Don't chase this as an app bug. Check in real Safari.
- **2026-10-11 · `showModal()` focuses the first button**, and WebKit then shows a focus ring on it. Handled by focusing the dialog itself (`tabindex=-1`).
- **2026-10-11 · Protocol tests run on `@xmldom/xmldom`, which tolerates more broken XML than browsers do.** Always verify parser changes in a real browser too (smoke e2e in Chrome and WebKit). The XML repair step is only unit-tested.
- **2026-10-11 · Setting `Highlight.priority` crashes WebKit when highlights overlap** (Playwright WebKit: the page crashed on the first step; disabling the priority setter fixed it). Never use priority. Register every highlight once at startup, in grammar order (later registrations paint on top), and mutate it with `clear()` / `add()`. Make contrast levels disjoint ranges.
- **2026-10-11 · Truncated excerpts can drop a closing ”**, which fools the "unclosed quote means the same speaker continues" rule. Attribution heuristics need whole paragraphs.
- **2026-10-11 · Svelte 5 deep `$state` proxies copy objects.** Mutating the original object (or a proxy held elsewhere) doesn't update the other copy, which is why bold and italic only appeared after a reload. Keep records that you mutate in place in `$state.raw` and reassign arrays/objects to trigger updates.
- **2026-10-11 · Book-scale name finding:**
  - What failed: possessives ("Ahab’s"), contractions ("I’ll"), ships ("the Pequod"), capitalised common phrases ("Sperm Whale"), demonyms and Gutenberg boilerplate all showed up as names.
  - Fixes that worked: prepositions mark places; "the" marks things; two-word phrases made of common words are dropped; possessives fold into the base name.
- **2026-10-11 · Hard-word false positives:** hyphenated compounds of common words, and contractions. A word now counts as hard only if a part, or its base before the apostrophe, is hard.
- **2026-10-11 · Calm time estimates must use TOC chapters, not spine files.** Gutenberg files contain many chapters ("~0.5–1 h left" was wrong). Estimate to the next TOC entry.
- **Intl.Segmenter ends a sentence at every LF** (UAX #29 Sep). EPUB XHTML often wraps paragraphs with source newlines. `indexDocument` replaces line breaks with spaces (same length) before sentence segmentation.
- **WebKit shows iframe content unblurred through `backdrop-filter`** on an overlay above it. Use an opaque veil over book iframes.
- **TOC fragment positions from file byte offsets drift** from the rendered page. Once a chapter is loaded, place TOC entries by their anchor element's page (`getElementById` + `pageOfRect`).
- **An iframe whose element `color-scheme` differs from its document's** gets an opaque canvas; keep the iframe inheriting the theme's scheme.
- **Android Chrome sends emulated mouse moves for a held finger.** A `mousemove` hover card pops up under a long-press. Use `pointermove` and check `pointerType === 'mouse'` for hover UI.
- **Measuring through a scaled ancestor:** while the page `.paper` had a WAAPI `scale(.94)` with `fill: forwards`, `iframe.getBoundingClientRect()` was scaled but word rects inside the frame were not; adding them flew the set-down off-screen. Cancel the scale before measuring.
- **Svelte scoped classes vs `el.className = …`:** assigning `className` drops the `svelte-xyz` class and every scoped rule stops matching. Use `classList`/data attributes, and `:global(...)` for classes added at runtime (Svelte prunes selectors it can't see in the template).
- **Grid items default to `min-width: auto`:** a flex row with an unwrapped title inside a grid item widened the progress bar on phones; `min-width: 0` on the grid item fixes it. A flex track of 136 `min-width: 1px` wedges + gaps also can't shrink below ~270 px.
- **A two-column multicol spread can host a single "page" as wide as the spread:** set `column-width` to the spread width for image-only documents; the page step stays the same.
- **A caret between two words matches no word.** Word lookup from `caretPositionFromPoint` must take the nearest word in the node (`nearestWord`), or taps/holds on spaces silently do nothing.
- **`left: 50%` + translate caps an auto-width absolutely positioned box at half the container.** Centre with `inset-inline: 0; margin-inline: auto; width: fit-content`.
- **`overflow: hidden` containers are still scrollable** (find-in-page, focus, scrollIntoView). Use `overflow: clip` for overlays that must never scroll.
- **Highlights can stage text without touching the DOM:** `::highlight(x) { color: transparent }` on a shrinking range reveals words one by one (first-line staging); the text index and CFIs stay valid.
- **A registered `@property --accent: <color>`** lets the accent itself transition (palette drift) everywhere it's used.
- **A multi-word unit across a line break hides words:** markers measure the first line only; stop phrases at line ends.
- **Gutenberg books end in a license:** 'finished' must also count back matter near the end, or nobody ever finishes.
- **SVG used as an `<img>`/data URL is parsed as strict XML:** a duplicated attribute (fine inline in HTML) makes the image silently blank. Test generated SVG with an XML parser.
- **Web fonts inside the book iframe need their own @import** (in the injected book CSS); the chapter CSP allows fonts.googleapis/gstatic.

## Svelte scopes keyframe names, not names inside custom properties
`--j: hop` + `animation-name: var(--j)` never matches a scoped `@keyframes hop`. Use `@keyframes -global-pq-hop` (prefixed) for names passed through variables.

## Individual `scale`/`rotate` apply before `transform`
They scale a `transform: translate(...)` offset too, so an element positioned by transform jumps when its keyframes use `scale`. Position with left/top when animating scale/rotate.

## smoke-e2e.mjs is stale
It waits for `.grid li:nth-child(4)`, which the redesigned library no longer has. Needs updating.

## Grid items default to min-width: auto
A one-column grid with a `white-space: nowrap` child grows its track to that line and spills out of a width-capped card. Use `grid-template-columns: minmax(0, 1fr)`.

## WebKit paints some custom highlights a few letters off
In Playwright WebKit, a highlight range on a word after a hyphenated/justified line painted ~4 characters right of where the same range's getClientRects() put it (the pin, drawn from those rects, was right). Clearing and re-adding did not help; Chromium is correct. Open: check on a real iPhone before trusting highlight geometry in WebKit.

## "Mr." ended sentences in the v1 cast finder
The sentence-start check treated the dot in "Mr." as a full stop, so every titled name (Mr. Collins, Mrs. Bennet, Mr. Jaggers) was dropped as sentence-initial. Any boundary check must skip titles and initials.

## Book CSS clears backgrounds, so guide visuals are SVG
bookCss forces `body *:not(a) { background-color: transparent; color: inherit }`. Anything visual inside a book we author (the guide) must be SVG fills/strokes, which survive. SVG is also a SKIP block in textindex, so the Stage never reads figure text.

## A :focus-within pause never resumes after a click
Clicking a button keeps focus on it, so a timer paused on :focus-within stays paused. Pause on :hover only.

## Measure after the lift card comes off
The Stage lifts a paragraph wearing `.card` (padding + negative margins); on a heading its margin-top replaces the heading margin. Anything measured at landing (marker, column position) must wait for the rAF that removes `.card`.
