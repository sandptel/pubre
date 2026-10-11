# src/epub — EPUB protocol layer

UI-free implementation of EPUB 2.0.1 and EPUB 3.3: bytes in, typed data and blob URLs out.
No Svelte, no rendering, zero runtime dependencies. Every module is importable by `node --test`
(erasable TypeScript, explicit `.ts` imports).

## Architecture

```
index.ts       Epub aggregate: open(bytes) wires the parsers below, exposes data + methods
├─ zip.ts         ZIP reader (ZIP64, data descriptors, CRC, CP437/UTF-8 names, recovery)
├─ container.ts   META-INF/container.xml (renditions) + mimetype checks
├─ encryption.ts  encryption.xml, font de-obfuscation, DRM detection
├─ package.ts     OPF: metadata (refines chains), manifest, spine, rendition, guide
├─ nav.ts         EPUB 3 navigation document
├─ ncx.ts         EPUB 2 NCX
├─ smil.ts        Media Overlays → per-document timelines
├─ cfi.ts         EPUB CFI parse / stringify / compare / generate / resolve
├─ semantics.ts   epub:type + DPUB-ARIA classification (data only)
├─ resources.ts   href ↔ zip path, media types, fallbacks, text decoding, blob loader
├─ xml.ts         injectable XML parser + DOM Level 2 helpers
└─ errors.ts      EpubError with typed codes
```

Parsers are pure functions (`Document` in, plain data out). Only `index.ts` and the loader in
`resources.ts` touch the archive. XML parsing is injected: `Epub.open(bytes, { parseXml })`
defaults to the browser `DOMParser`; tests pass `@xmldom/xmldom` (see `tests/epub/helpers.ts`).
Malformed XML is retried after repair (BOM, bare `&`, HTML entities); XHTML that still fails
falls back to the HTML parser.

## Public API

```ts
import { Epub, EpubError } from './epub/index.ts'

const book = await Epub.open(bytes)          // throws EpubError
book.metadata        // title, subtitle, titles[], creator, creators[], contributors[], language(s),
                     // identifier(s), isbn, publisher(s), description, subjects, rights, sources,
                     // published, modified, dates, collections, series, accessibility, media, all, links
book.manifest        // Map<id, ManifestItem> (href = zip path, properties: Set, fallback, mediaOverlay)
book.spine           // SpineItem[]: href, mediaType, linear, pageSpread, rendition (effective), size, cfiStep
book.toc / pageList / landmarks / navLists / ncx / guide
book.rendition / rtl / fixedLayout / cover / series / collections / accessibility / overlays / warnings

await book.bytes(path) / text(path)          // de-obfuscated; charset-aware
book.resolveHref(base, href) / spineIndex(href) / item(path) / mediaType(path)
await book.url(path) / chapterUrl(index)     // blob: URLs; chapters sanitized (no scripts, CSP)
await book.coverBlob()
await book.mediaOverlay(index)               // MediaOverlay with timelines
book.cfi(index, range) / cfiAt(index, node, offset) / cfiSpineIndex(cfi)
book.destroy()                               // revoke blob URLs
```

`cfi.ts` is usable standalone: `parseCfi`, `stringifyCfi`, `compareCfi`, `collapse`,
`cfiFromPoint`, `cfiFromElement`, `cfiFromRange`, `resolveCfi` (boundaries), `cfiToRange` (DOM Range).

Error codes: `NOT_ZIP`, `CORRUPT_ZIP`, `UNSUPPORTED_COMPRESSION`, `NO_CONTAINER`, `NO_OPF`,
`BAD_OPF`, `EMPTY_SPINE`, `DRM` (`detail`: `adobe-adept` | `lcp` | `apple-fairplay` |
`zip-encryption` | `unknown`), `MISSING_RESOURCE`, `BAD_CFI`, `NO_DOM`.

The app imports `Book` from `src/lib/epub.ts`, a re-export of `Epub`.

## Spec coverage

| Area | Status | Notes |
|---|---|---|
| OCF ZIP: stored/deflate, ZIP64, data descriptors, CRC-32, UTF-8/CP437/Unicode Path names | implemented | truncated archives recovered from local headers |
| OCF container: rootfiles, multiple renditions (default = first OPF) | implemented | rendition selection attributes exposed, not evaluated |
| OCF mimetype rules | implemented | warnings only |
| Font obfuscation: IDPF, Adobe | implemented | |
| DRM detection: encryption.xml, rights.xml (ADEPT), license.lcpl (LCP), sinf.xml (FairPlay) | implemented | refused with `EpubError('DRM')` |
| OPF metadata: all DC elements, refines chains, EPUB 2 `opf:*` attributes | implemented | |
| Titles (title-type, display-seq, file-as, alternate-script), contributors (role, file-as, display-seq) | implemented | |
| Collections / series (belongs-to-collection, collection-type, group-position, calibre) | implemented | nested collections supported |
| Accessibility metadata (schema.org, a11y:, dcterms:conformsTo) | implemented | |
| Rendition: layout, orientation, spread, flow, viewport; per-itemref overrides, page-spread-* | implemented | `rendition:viewport` refining items not applied |
| Media overlay metadata (duration, narrator, active classes) | implemented | |
| Manifest: properties, fallback chains, media-overlay | implemented | |
| Spine: linear, properties, non-content items via fallback, page-progression-direction | implemented | |
| EPUB 2 guide | implemented | |
| OPF `<collection>` elements (preview, index, dictionary) | not yet | |
| Nav document: toc, page-list, landmarks, loi/lot/custom, span headings, hidden | implemented | |
| NCX: navMap, pageList, navList | implemented | |
| Media Overlays SMIL: seq/par/text/audio, all clock formats, per-document timeline | implemented | no `epub:textref` structure tree |
| EPUB CFI: grammar, escaping, assertions, side bias, ranges, temporal/spatial | implemented | |
| CFI generation/resolution, id + text assertion correction, sorting | implemented | indirection beyond the content document (iframes/objects) not resolved; no "ignore injected nodes" filter |
| Structural semantics (epub:type, DPUB-ARIA) | implemented | classification only |
| Resource loading: blob URLs, CSS url()/@import, srcset, SVG href, sanitizing, CSP | implemented | nested documents in iframe/object/embed sanitized too |
| Core media types and fallbacks for non-core resources | implemented | |
| Fixed-layout rendering, spreads, scripting | n/a here | presentation concerns for the UI layer |
| Apple `com.apple.ibooks.display-options.xml`, Kindle-specific metadata | not yet | |
| Multiple-rendition mapping documents | partial | links exposed, not parsed |
