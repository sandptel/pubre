// EPUB 2 + 3 parsing and resource loading. Book resources are served to the reader iframe as
// blob: URLs, with every internal reference (img src, link href, CSS url(), @import, SVG href)
// rewritten to point at its own blob. Book scripts are stripped and blocked by CSP.
import { Zip } from './zip.ts'

export interface TocItem { label: string; href: string; children: TocItem[] }
export interface SpineItem { href: string; mediaType: string; linear: boolean; size: number }
export interface ManifestItem { id: string; href: string; mediaType: string; properties: string[] }
export interface Metadata {
  title: string
  creator: string
  language: string
  identifier: string
  publisher: string
  description: string
}

const OPS_NS = 'http://www.idpf.org/2007/ops'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'
const IDPF_OBFUSCATION = 'http://www.idpf.org/2008/embedding'
const ADOBE_OBFUSCATION = 'http://ns.adobe.com/pdf/enc#RC'
// Books may only load their own (blob) resources; reader fonts may come from the app or Google Fonts.
const CSP = "default-src blob: data:; script-src 'none'; object-src 'none'; media-src blob: data: https:; "
  + "style-src blob: data: 'unsafe-inline' 'self' https://fonts.googleapis.com; font-src blob: data: 'self' https://fonts.gstatic.com"

/** Resolve `href` relative to the zip path `base`. Strips the fragment; returns a zip path. */
export function resolvePath(base: string, href: string): string {
  return decodeURIComponent(new URL(href, 'https://x/' + base).pathname.slice(1))
}

const isExternal = (href: string) => /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)

const byTag = (root: Document | Element, tag: string) => Array.from(root.getElementsByTagNameNS('*', tag))

function parseXml(text: string, type: DOMParserSupportedType = 'application/xml') {
  const doc = new DOMParser().parseFromString(text, type)
  return doc.getElementsByTagName('parsererror').length ? null : doc
}

export class Book {
  zip: Zip
  opfPath = ''
  metadata!: Metadata
  manifest = new Map<string, ManifestItem>() // keyed by zip path
  spine: SpineItem[] = []
  toc: TocItem[] = []
  coverPath?: string
  rtl = false
  fixedLayout = false
  private obfuscation = new Map<string, string>() // zip path -> algorithm
  private urls = new Map<string, Promise<string>>()

  private constructor(zip: Zip) { this.zip = zip }

  static async open(bytes: Uint8Array): Promise<Book> {
    const book = new Book(new Zip(bytes))
    await book.parse()
    return book
  }

  private async parse() {
    const { zip } = this
    const container = parseXml(await zip.text('META-INF/container.xml'))
    this.opfPath = container && byTag(container, 'rootfile')[0]?.getAttribute('full-path') || ''
    if (!zip.has(this.opfPath)) throw new Error('No package document (OPF) found — is this an EPUB?')
    const opf = parseXml(await zip.text(this.opfPath))
    if (!opf) throw new Error('Package document is not valid XML')

    const dc = (tag: string) => byTag(opf, tag).map(e => e.textContent?.trim() ?? '').filter(Boolean)
    const uidRef = opf.documentElement.getAttribute('unique-identifier')
    const identifier = (uidRef && opf.getElementById(uidRef)?.textContent?.trim()) || dc('identifier')[0] || ''
    this.metadata = {
      title: dc('title')[0] || 'Untitled',
      creator: dc('creator').join(', '),
      language: dc('language')[0] || '',
      identifier,
      publisher: dc('publisher')[0] || '',
      description: dc('description')[0] || '',
    }

    const byId = new Map<string, ManifestItem>()
    for (const el of byTag(opf, 'item')) {
      const item: ManifestItem = {
        id: el.getAttribute('id') ?? '',
        href: resolvePath(this.opfPath, el.getAttribute('href') ?? ''),
        mediaType: el.getAttribute('media-type') ?? '',
        properties: (el.getAttribute('properties') ?? '').split(/\s+/).filter(Boolean),
      }
      byId.set(item.id, item)
      this.manifest.set(item.href, item)
    }

    const spineEl = byTag(opf, 'spine')[0]
    this.rtl = spineEl?.getAttribute('page-progression-direction') === 'rtl'
    this.spine = byTag(opf, 'itemref').flatMap(ref => {
      const item = byId.get(ref.getAttribute('idref') ?? '')
      if (!item) return []
      return [{
        href: item.href,
        mediaType: item.mediaType,
        linear: ref.getAttribute('linear') !== 'no',
        size: this.zip.entries.get(item.href)?.size ?? 1,
      }]
    })
    if (!this.spine.length) throw new Error('Book has no readable content (empty spine)')

    const metas = byTag(opf, 'meta')
    this.fixedLayout = metas.some(m => m.getAttribute('property') === 'rendition:layout' && m.textContent?.trim() === 'pre-paginated')

    const cover = [...byId.values()].find(i => i.properties.includes('cover-image'))
      ?? byId.get(metas.find(m => m.getAttribute('name') === 'cover')?.getAttribute('content') ?? '')
      ?? [...byId.values()].find(i => i.mediaType.startsWith('image/') && /cover/i.test(i.id + i.href))
    this.coverPath = cover?.mediaType.startsWith('image/') ? cover.href : undefined

    await this.parseEncryption()
    await this.parseToc(byId, spineEl?.getAttribute('toc') ?? '')
  }

  private async parseEncryption() {
    if (!this.zip.has('META-INF/encryption.xml')) return
    const doc = parseXml(await this.zip.text('META-INF/encryption.xml'))
    if (!doc) return
    for (const data of byTag(doc, 'EncryptedData')) {
      const alg = byTag(data, 'EncryptionMethod')[0]?.getAttribute('Algorithm') ?? ''
      const uri = byTag(data, 'CipherReference')[0]?.getAttribute('URI') ?? ''
      if (alg !== IDPF_OBFUSCATION && alg !== ADOBE_OBFUSCATION) {
        throw new Error('This book is DRM-protected. pubre can only open DRM-free EPUBs.')
      }
      this.obfuscation.set(resolvePath('', uri), alg)
    }
  }

  private async parseToc(byId: Map<string, ManifestItem>, ncxId: string) {
    const nav = [...byId.values()].find(i => i.properties.includes('nav'))
    if (nav && this.zip.has(nav.href)) {
      const doc = parseXml(await this.zip.text(nav.href), 'application/xhtml+xml')
        ?? new DOMParser().parseFromString(await this.zip.text(nav.href), 'text/html')
      const navs = byTag(doc, 'nav')
      const tocNav = navs.find(n => (n.getAttributeNS(OPS_NS, 'type') ?? n.getAttribute('epub:type'))?.split(/\s+/).includes('toc')) ?? navs[0]
      const ol = tocNav && Array.from(tocNav.children).find(c => c.localName === 'ol')
      if (ol) this.toc = this.navList(ol, nav.href)
    }
    const ncx = byId.get(ncxId) ?? [...byId.values()].find(i => i.mediaType === 'application/x-dtbncx+xml')
    if (!this.toc.length && ncx && this.zip.has(ncx.href)) {
      const doc = parseXml(await this.zip.text(ncx.href))
      const navMap = doc && byTag(doc, 'navMap')[0]
      if (navMap) this.toc = this.ncxPoints(navMap, ncx.href)
    }
    if (!this.toc.length) {
      this.toc = this.spine.filter(s => s.linear).map((s, i) => ({ label: `Section ${i + 1}`, href: s.href, children: [] }))
    }
  }

  private navList(ol: Element, base: string): TocItem[] {
    return Array.from(ol.children).filter(li => li.localName === 'li').map(li => {
      const a = Array.from(li.children).find(c => c.localName === 'a' || c.localName === 'span')
      const sub = Array.from(li.children).find(c => c.localName === 'ol')
      const href = a?.getAttribute('href')
      return {
        label: a?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        href: href ? this.resolveHref(base, href) : '',
        children: sub ? this.navList(sub, base) : [],
      }
    })
  }

  private ncxPoints(parent: Element, base: string): TocItem[] {
    return Array.from(parent.children).filter(c => c.localName === 'navPoint').map(p => {
      const label = byTag(p, 'text')[0]?.textContent?.trim() ?? ''
      const src = byTag(p, 'content')[0]?.getAttribute('src') ?? ''
      return { label, href: src ? this.resolveHref(base, src) : '', children: this.ncxPoints(p, base) }
    })
  }

  /** Resolve an in-book href to "zip/path#fragment". */
  resolveHref(base: string, href: string) {
    const [path, frag] = href.split('#')
    return (path ? resolvePath(base, path) : base) + (frag ? '#' + frag : '')
  }

  spineIndex(path: string) { return this.spine.findIndex(s => s.href === path.split('#')[0]) }

  async bytes(path: string): Promise<Uint8Array> {
    const data = await this.zip.bytes(path)
    const alg = this.obfuscation.get(path)
    return alg ? this.deobfuscate(data, alg) : data
  }

  /** Font obfuscation (not DRM): XOR the head of the file with a key derived from the book id. */
  private async deobfuscate(data: Uint8Array, alg: string) {
    const out = data.slice()
    let key: Uint8Array, len: number
    if (alg === IDPF_OBFUSCATION) {
      const id = this.metadata.identifier.replace(/[ \u0009\u000d\u000a]/g, '')
      key = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(id)))
      len = 1040
    } else {
      const hex = this.metadata.identifier.replace(/^urn:uuid:/i, '').replace(/-/g, '')
      key = new Uint8Array(hex.match(/../g)!.map(h => parseInt(h, 16)))
      len = 1024
    }
    for (let i = 0; i < Math.min(len, out.length); i++) out[i] ^= key[i % key.length]
    return out
  }

  private mediaType(path: string) {
    return this.manifest.get(path)?.mediaType || 'application/octet-stream'
  }

  /** blob: URL for any resource. CSS gets its url()/@import references rewritten first. */
  url(path: string): Promise<string> {
    let p = this.urls.get(path)
    if (!p) {
      p = (async () => {
        const type = this.mediaType(path)
        const body: BlobPart = type === 'text/css'
          ? await this.rewriteCss(new TextDecoder().decode(await this.bytes(path)), path)
          : (await this.bytes(path)) as BlobPart
        return URL.createObjectURL(new Blob([body], { type }))
      })()
      this.urls.set(path, p)
    }
    return p
  }

  private async rewriteCss(css: string, base: string) {
    const refs = new Set<string>()
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g
    for (const m of css.matchAll(re)) refs.add(m[2] ?? m[4])
    const map = new Map<string, string>()
    await Promise.all([...refs].filter(r => !isExternal(r)).map(async r => {
      const path = resolvePath(base, r)
      if (this.zip.has(path)) map.set(r, await this.url(path) + (r.includes('#') ? '#' + r.split('#')[1] : ''))
    }))
    return css.replace(re, (all, _q, u, _q2, imp) =>
      u ? (map.has(u) ? `url("${map.get(u)}")` : all) : (map.has(imp) ? `@import "${map.get(imp)}"` : all))
  }

  /** blob: URL for a spine document, with resources rewritten and scripts removed. */
  chapterUrl(index: number): Promise<string> {
    const path = this.spine[index].href
    const key = '#chapter:' + path
    let p = this.urls.get(key)
    if (!p) {
      p = this.buildChapter(path)
      this.urls.set(key, p)
    }
    return p
  }

  private async buildChapter(path: string) {
    const text = await this.zip.text(path)
    let doc = this.mediaType(path) === 'text/html' ? null : parseXml(text, 'application/xhtml+xml')
    const xml = !!doc
    doc ??= new DOMParser().parseFromString(text, 'text/html') // malformed XHTML in the wild

    for (const el of byTag(doc, 'script')) el.remove()
    for (const el of byTag(doc, '*')) {
      for (const attr of Array.from(el.attributes)) if (/^on/i.test(attr.name)) el.removeAttributeNode(attr)
    }

    const jobs: Promise<void>[] = []
    const rewrite = (el: Element, attr: string, ns: string | null = null) => {
      const val = ns ? el.getAttributeNS(ns, attr) : el.getAttribute(attr)
      if (!val || isExternal(val)) return
      const target = resolvePath(path, val)
      if (!this.zip.has(target)) return
      const frag = val.includes('#') ? '#' + val.split('#')[1] : ''
      jobs.push(this.url(target).then(u => { ns ? el.setAttributeNS(ns, attr, u + frag) : el.setAttribute(attr, u + frag) }))
    }
    for (const el of byTag(doc, '*')) {
      const name = el.localName
      if (el.hasAttribute('src')) rewrite(el, 'src')
      if (el.hasAttribute('poster')) rewrite(el, 'poster')
      if (name === 'object' && el.hasAttribute('data')) rewrite(el, 'data')
      if (name === 'link' && el.hasAttribute('href')) rewrite(el, 'href')
      if (name === 'image' || name === 'use' || name === 'feImage') {
        if (el.hasAttribute('href')) rewrite(el, 'href')
        if (el.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')) rewrite(el, 'href', 'http://www.w3.org/1999/xlink')
      }
      if (name === 'style') jobs.push(this.rewriteCss(el.textContent ?? '', path).then(css => { el.textContent = css }))
      const style = el.getAttribute('style')
      if (style?.includes('url(')) jobs.push(this.rewriteCss(style, path).then(css => el.setAttribute('style', css)))
    }
    await Promise.all(jobs)

    let head = byTag(doc, 'head')[0]
    if (!head) {
      head = doc.createElementNS(XHTML_NS, 'head')
      doc.documentElement.prepend(head)
    }
    const meta = doc.createElementNS(XHTML_NS, 'meta')
    meta.setAttribute('http-equiv', 'Content-Security-Policy')
    meta.setAttribute('content', CSP)
    head.prepend(meta)

    const out = xml ? new XMLSerializer().serializeToString(doc) : '<!DOCTYPE html>' + doc.documentElement.outerHTML
    return URL.createObjectURL(new Blob([out], { type: xml ? 'application/xhtml+xml' : 'text/html' }))
  }

  async coverBlob(): Promise<Blob | undefined> {
    if (!this.coverPath || !this.zip.has(this.coverPath)) return
    return new Blob([(await this.bytes(this.coverPath)) as BlobPart], { type: this.mediaType(this.coverPath) })
  }

  destroy() {
    for (const p of this.urls.values()) p.then(URL.revokeObjectURL, () => {})
    this.urls.clear()
  }
}
