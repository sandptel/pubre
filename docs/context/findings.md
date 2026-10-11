# Findings: things learned the hard way

Each entry: date · finding · evidence · where handled.

- **2026-10-11 · WebKit does not deliver parent-attached event listeners into an iframe sandboxed without `allow-scripts`.** Evidence: a Playwright A/B test (`tap.mjs`). With `sandbox="allow-same-origin"`, Chrome taps turned pages but WebKit taps did nothing. Adding `allow-scripts` fixed WebKit. Handled in `paginator.ts` `load()`, with book scripts stripped and CSP-blocked instead (ADR 0006). Chrome logs a console warning about the combination. This is expected.
- **2026-10-11 · WebKit rejects `Blob` values in IndexedDB** (`UnknownError: Error preparing Blob/File data to be stored in object store`). This happens in Playwright WebKit and is known in Safari private mode. Handled by storing `ArrayBuffer` for both files and covers (`store.svelte.ts`).
- **2026-10-11 · `<input type=file>`.files is live.** Resetting `value = ''` after an async handler starts empties the list mid-loop, so only the first file was imported. Handled by copying it with `Array.from` synchronously in `Library.add`. The same applies to `DataTransfer.files`.
- **2026-10-11 · In Safari, a `<button>` with `all: unset; display: block` shrinks to fit its content,** so an `aspect-ratio` child collapsed to zero width and covers were invisible. Handled with an explicit `width: 100%`.
- **2026-10-11 · Node 26 type stripping rejects non-erasable TS** (for example constructor parameter properties). `tsconfig` sets `erasableSyntaxOnly` so the checker catches it, and lib code must stay erasable so `node --test` can import it.
- **2026-10-11 · TypeScript 7 (native) is `latest` on npm, but `svelte-check` peers on `^5 || ^6`.** We pin `typescript@6`.
- **2026-10-11 · Gutenberg EPUBs put many chapters in one spine file.** Running-head labels per spine item are therefore coarse ("MOBY-DICK; or, THE WHALE." during Chapter 1). Fixing that needs TOC fragment → page mapping; see the backlog.
- **2026-10-11 · Backdrop blur is missing in Playwright WebKit screenshots,** so a sheet at 86% opacity was hard to read over text. Raised to 95%.
