// Resource resolution (href <-> zip path), media types, fallbacks, text decoding, and the loader
// that serves book resources as blob: URLs. Every internal reference in a chapter (src, srcset,
// poster, data, link href, SVG href, CSS url()/@import) is rewritten to its own blob. Book scripts
// are stripped, on* handlers removed, and a CSP meta is injected so nothing executes.
import { normalizePath } from './zip.ts'
import { NS, byTag, local, parseMarkup, type ParseXml, type SerializeXml } from './xml.ts'

// ---------------------------------------------------------------- paths

export function safeDecode(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

/** Split an href into path and fragment (query dropped; fragment kept raw). */
export function splitHref(href: string): { path: string; fragment: string } {
  const h = href.trim()
  const hash = h.indexOf('#')
  const path = hash < 0 ? h : h.slice(0, hash)
  const q = path.indexOf('?')
  return { path: q < 0 ? path : path.slice(0, q), fragment: hash < 0 ? '' : h.slice(hash + 1) }
}

export const dirname = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)

/** Resolve `href` relative to the zip path `base`: percent-decoded, fragment stripped, zip path returned. */
export function resolvePath(base: string, href: string): string {
  const path = safeDecode(splitHref(href).path.replace(/\\/g, '/'))
  if (!path) return base
  return normalizePath(path.startsWith('/') ? path : dirname(base) + path)
}

/** Resolve an in-book href to "zip/path#fragment" (fragment-only hrefs stay in `base`). */
export function resolveHref(base: string, href: string): string {
  const { fragment } = splitHref(href)
  return resolvePath(base, href) + (fragment ? '#' + fragment : '')
}

/** Shortest relative href from the zip path `from` to the zip path `to`. */
export function relativeHref(from: string, to: string): string {
  const a = dirname(from).split('/').filter(Boolean)
  const b = to.split('/')
  let i = 0
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++
  return '../'.repeat(a.length - i) + b.slice(i).map(encodeURIComponent).join('/')
}

/** Absolute URLs, fragment-only links, protocol-relative URLs: not in the book. */
export const isExternal = (href: string) => /^\s*([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)

// ---------------------------------------------------------------- media types

/** EPUB 3.3 core media types (§3.2): usable without a fallback. */
export const CORE_MEDIA_TYPES = new Set([
  'image/gif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/opus',
  'text/css',
  'font/ttf', 'application/font-sfnt', 'font/otf', 'application/vnd.ms-opentype', 'font/woff', 'application/font-woff', 'font/woff2',
  'application/xhtml+xml', 'application/javascript', 'application/ecmascript', 'text/javascript',
  'application/x-dtbncx+xml', 'application/smil+xml', 'application/pls+xml',
])

export const isCoreMediaType = (t: string) => CORE_MEDIA_TYPES.has(t.split(';')[0].trim().toLowerCase()) || /^audio\/ogg\b/.test(t)

/** Spine-renderable documents. text/html is not valid EPUB but is common in the wild. */
export const isContentDocument = (t: string) => t === 'application/xhtml+xml' || t === 'image/svg+xml' || t === 'text/html'

const BY_EXT: Record<string, string> = {
  xhtml: 'application/xhtml+xml', xht: 'application/xhtml+xml', html: 'text/html', htm: 'text/html',
  xml: 'application/xml', opf: 'application/oebps-package+xml', ncx: 'application/x-dtbncx+xml',
  css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', oga: 'audio/ogg', ogg: 'audio/ogg', opus: 'audio/opus', wav: 'audio/wav',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
  smil: 'application/smil+xml', pls: 'application/pls+xml', txt: 'text/plain', json: 'application/json',
}

export function guessMediaType(path: string): string {
  return BY_EXT[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream'
}

/** `item` followed by its manifest fallback chain (cycle-safe). */
export function fallbackChain<T extends { id: string; fallback?: string }>(item: T, byId: Map<string, T>): T[] {
  const chain = [item]
  for (let f = item.fallback && byId.get(item.fallback); f && !chain.includes(f); f = f.fallback && byId.get(f.fallback)) chain.push(f)
  return chain
}

// ---------------------------------------------------------------- text

/** Decode a text resource: BOM, then XML declaration / meta charset, then UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  if (bytes[0] === 0x3c && bytes[1] === 0 && bytes[2] === 0x3f) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0 && bytes[1] === 0x3c && bytes[3] === 0x3f) return new TextDecoder('utf-16be').decode(bytes)
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  const label = /^(?:﻿)?<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i.exec(head)?.[1]
    ?? /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1]
  if (label && !/^utf-?8$/i.test(label) && !/^utf-?16/i.test(label)) {
    try { return new TextDecoder(label).decode(bytes) } catch { /* unknown label: fall through */ }
  }
  return new TextDecoder().decode(bytes)
}

// ---------------------------------------------------------------- srcset

/** Parse a srcset attribute into [url, descriptor] candidates (HTML "parse a srcset attribute", simplified). */
export function parseSrcset(value: string): [string, string][] {
  const out: [string, string][] = []
  let i = 0
  while (i < value.length) {
    while (i < value.length && /[\s,]/.test(value[i])) i++
    if (i >= value.length) break
    let j = i
    while (j < value.length && !/\s/.test(value[j])) j++
    let url = value.slice(i, j)
    let desc = ''
    if (url.endsWith(',')) url = url.replace(/,+$/, '')
    else {
      let k = j
      let depth = 0
      while (k < value.length && (value[k] !== ',' || depth)) {
        if (value[k] === '(') depth++
        else if (value[k] === ')') depth--
        k++
      }
      desc = value.slice(j, k).trim()
      j = k + 1
    }
    out.push([url, desc])
    i = j
  }
  return out
}

// ---------------------------------------------------------------- loader

// Books may only load their own (blob) resources; reader fonts may come from the app or Google Fonts.
export const CSP = "default-src blob: data:; script-src 'none'; object-src 'none'; media-src blob: data: https:; "
  + "style-src blob: data: 'unsafe-inline' 'self' https://fonts.googleapis.com; font-src blob: data: 'self' https://fonts.gstatic.com"

export interface ResourceHost {
  /** Canonical zip path for `path`, or undefined if it is not in the book. */
  resolve(path: string): string | undefined
  /** Resource bytes (already deobfuscated). */
  bytes(path: string): Promise<Uint8Array>
  mediaType(path: string): string
  /** A renderable replacement for a non-core resource (manifest fallback chain), if any. */
  fallback?(path: string): string | undefined
  parseXml: ParseXml
  serializeXml: SerializeXml
}

const EMBEDS = new Set(['iframe', 'object', 'embed', 'frame'])

export class ResourceLoader {
  private readonly host: ResourceHost
  private readonly urls = new Map<string, Promise<string>>()

  constructor(host: ResourceHost) { this.host = host }

  /** blob: URL for any resource. CSS gets its url()/@import references rewritten first. */
  url(path: string): Promise<string> {
    const p0 = this.host.resolve(path) ?? path
    let p = this.urls.get(p0)
    if (!p) {
      p = (async () => {
        const type = this.host.mediaType(p0)
        const body: BlobPart = type === 'text/css'
          ? await this.rewriteCss(decodeText(await this.host.bytes(p0)), p0)
          : (await this.host.bytes(p0)) as BlobPart
        return URL.createObjectURL(new Blob([body], { type }))
      })()
      this.urls.set(p0, p)
    }
    return p
  }

  /** blob: URL for a content document, with resources rewritten and scripts removed. */
  chapterUrl(path: string): Promise<string> {
    const p0 = this.host.resolve(path) ?? path
    const key = '#chapter:' + p0
    let p = this.urls.get(key)
    if (!p) {
      p = this.buildChapter(p0)
      this.urls.set(key, p)
    }
    return p
  }

  private target(base: string, ref: string): string | undefined {
    if (isExternal(ref)) return
    const path = this.host.resolve(resolvePath(base, ref))
    return path && (this.host.fallback?.(path) ?? path)
  }

  async rewriteCss(css: string, base: string): Promise<string> {
    const refs = new Set<string>()
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g
    for (const m of css.matchAll(re)) refs.add(m[2] ?? m[4])
    const map = new Map<string, string>()
    await Promise.all([...refs].map(async r => {
      const path = this.target(base, r)
      if (path) map.set(r, await this.url(path) + fragmentOf(r))
    }))
    return css.replace(re, (all, _q, u, _q2, imp) =>
      u ? (map.has(u) ? `url("${map.get(u)}")` : all) : (map.has(imp) ? `@import "${map.get(imp)}"` : all))
  }

  private async buildChapter(path: string) {
    const { host } = this
    const type = host.mediaType(path)
    const { doc, xml } = parseMarkup(host.parseXml, decodeText(await host.bytes(path)), type)

    for (const el of byTag(doc, 'script')) el.parentNode?.removeChild(el)
    for (const el of Array.from(doc.getElementsByTagName('*'))) {
      for (const a of Array.from(el.attributes)) if (/^on/i.test(a.name)) el.removeAttribute(a.name)
    }

    const jobs: Promise<void>[] = []
    const rewrite = (el: Element, attr: string, ns: string | null = null) => {
      const val = ns ? el.getAttributeNS(ns, attr) : el.getAttribute(attr)
      const target = val && this.target(path, val)
      if (!target) return
      const sanitize = EMBEDS.has(local(el)) && isContentDocument(host.mediaType(target)) // nested documents get the same treatment
      jobs.push((sanitize ? this.chapterUrl(target) : this.url(target)).then(u => {
        if (ns) el.setAttributeNS(ns, attr, u + fragmentOf(val))
        else el.setAttribute(attr, u + fragmentOf(val))
      }))
    }
    for (const el of Array.from(doc.getElementsByTagName('*'))) {
      const name = local(el)
      if (el.hasAttribute('src')) rewrite(el, 'src')
      if (el.hasAttribute('poster')) rewrite(el, 'poster')
      if (name === 'object' && el.hasAttribute('data')) rewrite(el, 'data')
      if (name === 'link' && el.hasAttribute('href')) rewrite(el, 'href')
      if (name === 'image' || name === 'use' || name === 'feimage') {
        if (el.hasAttribute('href')) rewrite(el, 'href')
        if (el.hasAttributeNS(NS.XLINK, 'href')) rewrite(el, 'href', NS.XLINK)
      }
      const srcset = el.getAttribute('srcset')
      if (srcset) jobs.push(this.rewriteSrcset(srcset, path).then(v => el.setAttribute('srcset', v)))
      if (name === 'style') jobs.push(this.rewriteCss(el.textContent ?? '', path).then(css => { el.textContent = css }))
      const style = el.getAttribute('style')
      if (style?.includes('url(')) jobs.push(this.rewriteCss(style, path).then(css => el.setAttribute('style', css)))
    }
    await Promise.all(jobs)

    const root = doc.documentElement
    let head = byTag(doc, 'head')[0]
    if (!head) {
      head = doc.createElementNS(NS.XHTML, 'head')
      root.insertBefore(head, root.firstChild)
    }
    const meta = doc.createElementNS(NS.XHTML, 'meta')
    meta.setAttribute('http-equiv', 'Content-Security-Policy')
    meta.setAttribute('content', CSP)
    head.insertBefore(meta, head.firstChild)

    const out = xml ? host.serializeXml(doc) : '<!DOCTYPE html>' + (root.outerHTML ?? host.serializeXml(doc))
    return URL.createObjectURL(new Blob([out], { type: xml ? 'application/xhtml+xml' : 'text/html' }))
  }

  private async rewriteSrcset(value: string, base: string) {
    const parts = await Promise.all(parseSrcset(value).map(async ([u, d]) => {
      const path = this.target(base, u)
      return (path ? await this.url(path) : u) + (d ? ' ' + d : '')
    }))
    return parts.join(', ')
  }

  destroy() {
    for (const p of this.urls.values()) p.then(URL.revokeObjectURL, () => {})
    this.urls.clear()
  }
}

const fragmentOf = (ref: string) => (ref.includes('#') ? '#' + ref.split('#')[1] : '')
