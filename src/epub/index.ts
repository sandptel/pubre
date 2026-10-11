// The EPUB aggregate: opens a book from bytes and exposes everything the protocol defines.
// UI-free: no Svelte, no rendering. Parsers live in their own modules; this file wires them up.
import { Zip } from './zip.ts'
import { EpubError } from './errors.ts'
import { browserParseXml, browserSerializeXml, parseLenient, parseMarkup, byTag, attr, NS, type ParseXml, type SerializeXml } from './xml.ts'
import { parseContainer, checkMimetype, type Container } from './container.ts'
import { parsePackage, type Package, type ManifestItem, type SpineItem as PackageSpineItem, type Metadata, type Rendition, type GuideReference, type Collection, type Series, type Accessibility } from './package.ts'
import { parseNav, type NavItem, type NavList } from './nav.ts'
import { parseNcx, type Ncx } from './ncx.ts'
import { parseEncryption, detectDrm, obfuscationKey, deobfuscate, type Encryption, type Obfuscation } from './encryption.ts'
import { parseSmil, type MediaOverlay } from './smil.ts'
import { cfiFromRange, cfiFromPoint, spineSteps, parseCfi, collapse, type Boundaries, type Cfi, type GenerateOptions } from './cfi.ts'
import { ResourceLoader, resolvePath, resolveHref, splitHref, decodeText, guessMediaType, isCoreMediaType, fallbackChain, isContentDocument } from './resources.ts'

export { EpubError } from './errors.ts'
export type { EpubErrorCode } from './errors.ts'
export type * from './package.ts'
export type { NavItem, NavList, Nav } from './nav.ts'
export type { Ncx, NcxItem } from './ncx.ts'
export type { MediaOverlay, OverlayPar, TimelineEntry } from './smil.ts'
export type { Cfi, CfiPath, CfiStep, CfiOffset, Boundaries } from './cfi.ts'
export type { Container, Rootfile } from './container.ts'
export type { ParseXml, SerializeXml } from './xml.ts'

export interface OpenOptions {
  /** XML/HTML parser. Defaults to the browser's DOMParser. */
  parseXml?: ParseXml
  serializeXml?: SerializeXml
  /** Verify CRC-32 of every entry read. */
  checkCrc?: boolean
}

export interface SpineItem extends PackageSpineItem {
  /** Uncompressed byte size (>= 1): a cheap weight for whole-book progress. */
  size: number
}

export interface OverlayRef { index: number; href: string; smil: string; duration?: number }

export class Epub {
  readonly zip: Zip
  readonly container: Container
  readonly opfPath: string
  readonly package: Package
  readonly metadata: Metadata
  /** Manifest items by id. */
  readonly manifest: Map<string, ManifestItem>
  readonly spine: SpineItem[]
  readonly rendition: Rendition
  readonly guide: GuideReference[]
  toc: NavItem[] = []
  pageList: NavItem[] = []
  landmarks: NavItem[] = []
  /** Every nav of the navigation document (loi, lot, ...). */
  navLists: NavList[] = []
  ncx?: Ncx
  /** Zip path of the cover image. */
  cover?: string
  /** Spine items with a media overlay. */
  readonly overlays: OverlayRef[]
  /** Non-fatal problems found while opening. */
  readonly warnings: string[] = []

  private readonly parse: ParseXml
  private readonly serialize: SerializeXml
  private readonly byPath = new Map<string, ManifestItem>()
  private encryption: Encryption = { obfuscated: new Map(), encrypted: [] }
  private readonly keys = new Map<Obfuscation, Promise<Uint8Array | undefined>>()
  private readonly smil = new Map<string, Promise<MediaOverlay>>()
  private readonly loader: ResourceLoader

  private constructor(zip: Zip, container: Container, opfPath: string, pkg: Package, opts: OpenOptions) {
    this.zip = zip
    this.container = container
    this.opfPath = opfPath
    this.package = pkg
    this.metadata = pkg.metadata
    this.manifest = pkg.manifest
    this.rendition = pkg.rendition
    this.guide = pkg.guide
    this.parse = opts.parseXml ?? browserParseXml
    this.serialize = opts.serializeXml ?? browserSerializeXml
    for (const item of pkg.manifest.values()) {
      item.href = zip.resolve(item.href) ?? item.href // canonical zip names (case-insensitive match)
      if (!this.byPath.has(item.href)) this.byPath.set(item.href, item)
    }
    this.spine = pkg.spine.flatMap(s => {
      const href = zip.resolve(s.href)
      if (!href) { this.warnings.push(`Spine item "${s.idref}" (${s.href}) missing from archive`); return [] }
      return [{ ...s, href, size: zip.get(href)?.size || 1 }]
    })
    this.spine.forEach((s, i) => { s.index = i })
    this.overlays = this.spine.flatMap(s => s.mediaOverlay
      ? [{ index: s.index, href: s.href, smil: zip.resolve(s.mediaOverlay) ?? s.mediaOverlay, duration: pkg.manifest.get(s.item.mediaOverlay!)?.duration }]
      : [])
    this.loader = new ResourceLoader({
      resolve: p => this.zip.resolve(p),
      bytes: p => this.bytes(p),
      mediaType: p => this.mediaType(p),
      fallback: p => this.fallback(p),
      parseXml: this.parse,
      serializeXml: this.serialize,
    })
  }

  static async open(bytes: Uint8Array, opts: OpenOptions = {}): Promise<Epub> {
    const parse = opts.parseXml ?? browserParseXml
    const zip = new Zip(bytes, { checkCrc: opts.checkCrc })
    const warnings = [...zip.warnings]

    const mt = zip.get('mimetype')
    warnings.push(...checkMimetype(mt, mt ? await zip.text('mimetype') : undefined))

    // Container → default rendition's OPF; fall back to any .opf in the archive.
    let container: Container = { rootfiles: [], links: [] }
    const hasContainer = zip.has('META-INF/container.xml')
    if (hasContainer) {
      const doc = parseLenient(parse, decodeText(await zip.bytes('META-INF/container.xml')))
      if (doc) container = parseContainer(doc)
      else warnings.push('META-INF/container.xml is not well-formed')
    } else warnings.push('META-INF/container.xml missing')
    let opfPath = container.rootfile && zip.resolve(container.rootfile.fullPath)
    if (!opfPath) {
      opfPath = [...zip.entries.keys()].find(n => /\.opf$/i.test(n))
      if (!opfPath) {
        throw hasContainer
          ? new EpubError('NO_OPF', 'No package document (OPF) found — is this an EPUB?')
          : new EpubError('NO_CONTAINER', 'Not an EPUB: META-INF/container.xml is missing.')
      }
      warnings.push(`Using ${opfPath} (container rootfile ${container.rootfile ? 'not found' : 'missing'})`)
    }

    // DRM before anything else touches content.
    let encryption: Encryption | undefined
    if (zip.has('META-INF/encryption.xml')) {
      const doc = parseLenient(parse, decodeText(await zip.bytes('META-INF/encryption.xml')))
      if (doc) encryption = parseEncryption(doc)
      else warnings.push('META-INF/encryption.xml is not well-formed')
    }
    const drm = detectDrm(p => zip.has(p), encryption)
    if (drm) throw drm

    const opfText = decodeText(await zip.bytes(opfPath))
    const opf = parseLenient(parse, opfText) ?? parse(opfText, 'text/html')
    if (!opf || !byTag(opf, 'manifest').length) throw new EpubError('BAD_OPF', 'Package document is not valid XML.')
    const pkg = parsePackage(opf, opfPath)
    warnings.push(...pkg.warnings)

    const book = new Epub(zip, container, opfPath, pkg, opts)
    book.warnings.unshift(...warnings)
    if (!book.spine.length) throw new EpubError('EMPTY_SPINE', 'Book has no readable content (empty spine).')
    if (encryption) {
      for (const [path, alg] of encryption.obfuscated) book.encryption.obfuscated.set(zip.resolve(path) ?? path, alg)
    }
    await book.loadNavigation()
    book.cover = await book.findCover()
    return book
  }

  // ------------------------------------------------------------ navigation & cover

  private async loadNavigation() {
    const items = [...this.manifest.values()]
    const nav = items.find(i => i.properties.has('nav'))
    if (nav && this.zip.has(nav.href)) {
      try {
        const { doc } = parseMarkup(this.parse, await this.text(nav.href), nav.mediaType)
        const n = parseNav(doc, nav.href)
        this.toc = n.toc
        this.pageList = n.pageList
        this.landmarks = n.landmarks
        this.navLists = n.lists
      } catch (e) {
        this.warnings.push(`Navigation document unreadable: ${(e as Error).message}`)
      }
    }
    const ncxItem = (this.package.tocId && this.manifest.get(this.package.tocId)) || items.find(i => i.mediaType === 'application/x-dtbncx+xml')
    if (ncxItem && this.zip.has(ncxItem.href)) {
      const doc = parseLenient(this.parse, await this.text(ncxItem.href))
      if (doc) this.ncx = parseNcx(doc, ncxItem.href)
      else this.warnings.push('NCX is not well-formed')
    }
    const canon = (list: NavItem[]): NavItem[] => list.map(i => ({ ...i, href: i.href && this.canonicalHref(i.href), children: canon(i.children) }))
    if (!this.toc.length && this.ncx?.toc.length) this.toc = this.ncx.toc
    if (!this.pageList.length && this.ncx?.pageList.length) this.pageList = this.ncx.pageList
    this.toc = canon(this.toc)
    this.pageList = canon(this.pageList)
    this.landmarks = canon(this.landmarks)
    if (!this.toc.length) {
      this.warnings.push('No table of contents; using the spine')
      this.toc = this.spine.filter(s => s.linear).map((s, i) => ({ label: `Section ${i + 1}`, href: s.href, children: [] }))
    }
  }

  /** EPUB 3 cover-image, EPUB 2 <meta name="cover">, guide/landmarks cover page, then heuristics. */
  private async findCover(): Promise<string | undefined> {
    const items = [...this.manifest.values()]
    const isImage = (i?: ManifestItem) => !!i && i.mediaType.startsWith('image/') && this.zip.has(i.href)
    const byProp = items.find(i => i.properties.has('cover-image'))
    if (isImage(byProp)) return byProp!.href
    const meta = this.metadata.all.find(n => n.property === 'cover')?.value
    if (meta) {
      const m = this.manifest.get(meta) ?? this.byPath.get(this.zip.resolve(resolvePath(this.opfPath, meta)) ?? '')
      if (isImage(m)) return m!.href
    }
    const pages = [
      ...this.guide.filter(g => g.type === 'cover' || g.type === 'title-page').map(g => g.href),
      ...this.landmarks.filter(l => l.type?.includes('cover')).map(l => l.href),
    ]
    for (const href of pages) {
      const path = this.zip.resolve(splitHref(href).path)
      if (!path) continue
      if (isImage(this.byPath.get(path)) || guessMediaType(path).startsWith('image/')) return path
      const img = await this.firstImage(path)
      if (img) return img
    }
    const named = items.find(i => isImage(i) && /cover/i.test(i.id + ' ' + i.href))
    if (named) return named.href
    // Last resort: a first spine page that is just an image.
    const first = this.spine[0]
    if (first && /cover/i.test(first.href + first.idref)) return this.firstImage(first.href)
    return undefined
  }

  private async firstImage(path: string): Promise<string | undefined> {
    try {
      const { doc } = parseMarkup(this.parse, await this.text(path), this.mediaType(path))
      for (const el of Array.from(doc.getElementsByTagName('*'))) {
        const ref = el.getAttribute('src') ?? el.getAttributeNS(NS.XLINK, 'href') ?? (el.localName === 'image' ? attr(el, 'href') : undefined)
        if (!ref || !/^(img|image)$/i.test(el.localName)) continue
        const target = this.zip.resolve(resolvePath(path, ref))
        if (target) return target
      }
    } catch { /* unreadable cover page */ }
    return undefined
  }

  // ------------------------------------------------------------ resources

  get rtl() { return this.package.pageProgressionDirection === 'rtl' }
  get fixedLayout() { return this.rendition.layout === 'pre-paginated' }
  get collections(): Collection[] { return this.metadata.collections }
  get series(): Series | undefined { return this.metadata.series }
  get accessibility(): Accessibility { return this.metadata.accessibility }

  has(path: string) { return this.zip.has(path) }

  /** Manifest item for a zip path. */
  item(path: string): ManifestItem | undefined {
    return this.byPath.get(this.zip.resolve(path) ?? path)
  }

  mediaType(path: string): string {
    return this.item(path)?.mediaType || guessMediaType(path)
  }

  /** Resource bytes, de-obfuscated if needed. */
  async bytes(path: string): Promise<Uint8Array> {
    const p = this.zip.resolve(path) ?? path
    const data = await this.zip.bytes(p)
    const alg = this.encryption.obfuscated.get(p)
    if (!alg) return data
    let key = this.keys.get(alg)
    if (!key) {
      const ids = this.metadata.identifiers.map(i => i.value)
      ids.unshift(this.metadata.identifier)
      key = obfuscationKey(alg, ids)
      this.keys.set(alg, key)
    }
    const k = await key
    if (!k) { this.warnings.push(`No key to de-obfuscate ${p}`); return data }
    return deobfuscate(data, k, alg)
  }

  /** Decoded text of a resource (BOM / XML declaration / meta charset aware). */
  async text(path: string): Promise<string> { return decodeText(await this.bytes(path)) }

  /** A core-media-type replacement for a non-core resource, from its manifest fallback chain. */
  private fallback(path: string): string | undefined {
    const item = this.byPath.get(path)
    if (!item || isCoreMediaType(item.mediaType) || isContentDocument(item.mediaType)) return undefined
    return fallbackChain(item, this.manifest).find(i => isCoreMediaType(i.mediaType) && this.zip.has(i.href))?.href
  }

  private canonicalHref(href: string) {
    const { path, fragment } = splitHref(href)
    return (this.zip.resolve(path) ?? path) + (fragment ? '#' + fragment : '')
  }

  /** Resolve an in-book href to "zip/path#fragment". */
  resolveHref(base: string, href: string): string {
    return this.canonicalHref(resolveHref(base, href))
  }

  /** Spine index of a zip path or "path#fragment", or -1. */
  spineIndex(href: string): number {
    const path = splitHref(href).path
    const i = this.spine.findIndex(s => s.href === path)
    if (i >= 0) return i
    const canon = this.zip.resolve(path)
    return canon ? this.spine.findIndex(s => s.href === canon) : -1
  }

  /** blob: URL for any resource (CSS references rewritten). */
  url(path: string): Promise<string> { return this.loader.url(path) }

  /** blob: URL for spine document `index`: resources rewritten, scripts stripped, CSP injected. */
  chapterUrl(index: number): Promise<string> { return this.loader.chapterUrl(this.spine[index].href) }

  async coverBlob(): Promise<Blob | undefined> {
    if (!this.cover || !this.zip.has(this.cover)) return undefined
    return new Blob([(await this.bytes(this.cover)) as BlobPart], { type: this.mediaType(this.cover) })
  }

  // ------------------------------------------------------------ media overlays

  /** Parsed media overlay (SMIL) of spine item `index`, if it has one. */
  mediaOverlay(index: number): Promise<MediaOverlay> | undefined {
    const ref = this.overlays.find(o => o.index === index)
    if (!ref) return undefined
    let p = this.smil.get(ref.smil)
    if (!p) {
      p = this.text(ref.smil).then(t => {
        const doc = parseLenient(this.parse, t)
        if (!doc) throw new EpubError('MISSING_RESOURCE', `Media overlay ${ref.smil} is not well-formed`)
        const o = parseSmil(doc, ref.smil)
        o.duration ??= ref.duration
        return o
      })
      this.smil.set(ref.smil, p)
    }
    return p
  }

  // ------------------------------------------------------------ CFI

  /** CFI for a range (or collapsed range = location) inside spine item `index`. */
  cfi(index: number, range: Boundaries, opts: Omit<GenerateOptions, 'base'> = {}): string {
    return cfiFromRange(range, { ...opts, base: this.cfiBase(index) })
  }

  /** CFI for a DOM position inside spine item `index`. */
  cfiAt(index: number, node: Node, offset: number, opts: Omit<GenerateOptions, 'base'> = {}): string {
    return cfiFromPoint(node, offset, { ...opts, base: this.cfiBase(index) })
  }

  private cfiBase(index: number) {
    const s = this.spine[index]
    if (!s) throw new EpubError('BAD_CFI', `No spine item ${index}`)
    return spineSteps(this.package.spineCfiStep, s.cfiStep / 2 - 1, s.id)
  }

  /** Which spine item a CFI points into (honoring the itemref id assertion), or -1. */
  cfiSpineIndex(cfi: string | Cfi): number {
    const p = collapse(typeof cfi === 'string' ? parseCfi(cfi) : cfi)
    const step = p.segments.length > 1 ? p.segments[0][1] : undefined
    if (!step) return -1
    if (step.id) {
      const byId = this.spine.findIndex(s => s.id === step.id)
      if (byId >= 0) return byId
    }
    return this.spine.findIndex(s => s.cfiStep === step.index)
  }

  /** Revoke every blob: URL handed out. */
  destroy() { this.loader.destroy() }
}
