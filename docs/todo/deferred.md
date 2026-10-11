# Deferred: deliberately left out of v0.1

| What | Ceiling today | Upgrade path |
|---|---|---|
| ZIP64 | Books > 4 GB or > 65k entries fail | Parse the ZIP64 EOCD locator in `zip.ts` |
| `srcset` rewriting | Responsive images in books fall back to `src` | Rewrite each candidate URL in `buildChapter` |
| RTL / vertical / fixed-layout | Rendered as LTR reflowable | Separate layout paths in `paginator.ts` |
| Position = `{index, fraction}` | Drifts slightly after a font change when reopening | CFI (backlog #3) |
| Non-UTF-8 XHTML | Mis-decoded | Honor the XML declaration's encoding |
| Preloading adjacent chapters | A chapter turn waits for load (fast for normal books, slow for 5 MB chapters) | Preload next/prev views |
| Literata from Google Fonts | Not available offline | Self-host the woff2 in `public/` with the service worker |
| `confirm()` to remove a book | Native dialog, not themed | Themed action sheet |
| Scripted EPUBs | Scripts stripped | Opaque-origin "interactive mode" (ADR 0006) |
