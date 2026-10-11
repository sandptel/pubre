# EPUB primer: structure, features, limits

Researched on 2026-10-11 for project kickoff.

## Container (OCF)

An EPUB is a ZIP file. The `mimetype` entry comes first, is stored uncompressed, and contains `application/epub+zip`.
`META-INF/container.xml` points to the **OPF** package document. `META-INF/encryption.xml` lists obfuscated fonts, or DRM-encrypted resources.

## OPF (package document)

- `<metadata>`: Dublin Core (title, creator, language, identifier, publisher, date, subject, description). It can also hold `meta refines` chains, `belongs-to-collection` series info, accessibility metadata (schema.org), and `rendition:*` properties.
- `<manifest>`: every resource, with its `media-type` and `properties` (`nav`, `cover-image`, `scripted`, `svg`, `mathml`, `remote-resources`).
- `<spine>`: the reading order. Items with `linear="no"` are outside the main flow. `page-progression-direction="rtl"` marks RTL books. The `toc` attribute points to the EPUB 2 NCX.
- `rendition:layout` is `reflowable` or `pre-paginated`. Related properties: `rendition:spread`, `rendition:orientation`, `rendition:flow`.

## Versions in the wild

EPUB 2.0.1 (2010) uses NCX and XHTML 1.1, and is still a big share of real libraries. EPUB 3.0/3.0.1 (2011–14). EPUB 3.2 (2019). **EPUB 3.3 (W3C Rec, 2023)** is current. pubre must handle both 2 and 3.
Kindle formats (AZW3, KFX, MOBI) are not EPUB and are out of scope.

## Content

- XHTML5 must be well-formed XML, and real books often are not. We fall back to an HTML parse.
- SVG content documents, MathML, and CSS (nearly all of it) are allowed. The common publisher CSS problems are `!important`, px sizes, and hardcoded colors.
- Fonts: OTF, TTF, WOFF, WOFF2. Images: JPEG, PNG, GIF, WebP, SVG. Audio: MP3, AAC/MP4, Opus. Video is allowed.
- Remote resources are only allowed for audio, video and fonts.
- JS is allowed only in documents marked `scripted`, and reading systems may disable it.

## Under-used features

These are the source of pubre's opportunities; see `features.md`.

- `epub:type` semantics
- page-list
- landmarks
- Media Overlays (SMIL)
- fixed layout
- RTL / vertical text / ruby
- accessibility metadata
- Indexes and Dictionaries specs
- collections
- CFI
- `linear="no"`

## Hard limits

1. **DRM** (Adobe ADEPT, FairPlay, Kobo, Readium LCP): we cannot open these. LCP needs an EDRLab certificate. pubre is **DRM-free only**.
2. **Font obfuscation is not DRM.**
   - IDPF method: the key is SHA-1 of the unique identifier with whitespace stripped, XOR'd over the first 1040 bytes.
   - Adobe method: the key is the 16 bytes of the UUID, XOR'd over the first 1024 bytes.
   - Both are implemented in `src/lib/epub.ts`.
3. **Publisher CSS vs. user control** is a tradeoff every reader has to make.
4. **Browsers have no native pagination.** The only approach is the CSS multi-column trick. Exact total page counts mean laying out every chapter.
5. **WASM cannot do layout.** Use it for data work only: search, NLP, image processing.
6. **Book JS is a security risk** if it runs same-origin. We strip scripts and apply a CSP; see ADR 0006.
7. **Fixed-layout books cannot reflow.** Zoom is the only option.

## Platform limits (GitHub Pages + browsers)

- No custom headers, so no COOP/COEP, so no `SharedArrayBuffer` or WASM threads. The workaround is `coi-serviceworker`. CSP has to go in a `<meta>` tag.
- iOS evicts script storage after about 7 days of non-use unless the app is installed to the home screen. Mitigate with `navigator.storage.persist()` and nudging users to install.
- File System Access API and PWA `file_handlers` are Chromium only. Share Target is Android only.
- There is no backend, so cross-device sync needs the user's own storage.
- Web Speech voices and boundary events vary by OS.
