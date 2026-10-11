// XML plumbing shared by the parsers. The DOM implementation is injected (browser DOMParser by
// default; xmldom in Node tests), and every helper sticks to DOM Level 2 APIs that both provide.
import { EpubError } from './errors.ts'

export type XmlType = 'application/xml' | 'application/xhtml+xml' | 'image/svg+xml' | 'text/html'
/** Parse `text`; return null when it is not well-formed (browsers signal this with <parsererror>). */
export type ParseXml = (text: string, type: XmlType) => Document | null
export type SerializeXml = (doc: Document) => string

export const NS = {
  OPF: 'http://www.idpf.org/2007/opf',
  DC: 'http://purl.org/dc/elements/1.1/',
  OPS: 'http://www.idpf.org/2007/ops',
  XHTML: 'http://www.w3.org/1999/xhtml',
  XLINK: 'http://www.w3.org/1999/xlink',
  XML: 'http://www.w3.org/XML/1998/namespace',
} as const

export const browserParseXml: ParseXml = (text, type) => {
  if (typeof DOMParser === 'undefined') throw new EpubError('NO_DOM', 'No DOMParser available; pass `parseXml` to Epub.open().')
  const doc = new DOMParser().parseFromString(text, type)
  return type !== 'text/html' && doc.getElementsByTagName('parsererror').length ? null : doc
}

export const browserSerializeXml: SerializeXml = doc => new XMLSerializer().serializeToString(doc)

const XML_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos'])
const HTML_ENTITIES: Record<string, number> = {
  nbsp: 160, shy: 173, copy: 169, reg: 174, trade: 8482, mdash: 8212, ndash: 8211, hellip: 8230, lsquo: 8216,
  rsquo: 8217, ldquo: 8220, rdquo: 8221, laquo: 171, raquo: 187, bull: 8226, middot: 183, deg: 176, eacute: 233,
  egrave: 232, aacute: 225, agrave: 224, iacute: 237, oacute: 243, uacute: 250, ccedil: 231, ntilde: 241, uuml: 252,
  ouml: 246, auml: 228, szlig: 223, thinsp: 8201, ensp: 8194, emsp: 8195, zwnj: 8204, zwj: 8205, times: 215,
}

/** Common real-world breakage: BOM/whitespace before the XML declaration, HTML entities, bare ampersands. */
export function repairXml(text: string): string {
  return text
    .replace(/^[﻿\s]+/, '')
    .replace(/&(?!#\d+;|#x[\da-f]+;)([a-z][\w.-]*;)?/gi, (all, ent?: string) => {
      if (!ent) return '&amp;'
      const name = ent.slice(0, -1)
      if (XML_ENTITIES.has(name)) return all
      const code = HTML_ENTITIES[name] ?? HTML_ENTITIES[name.toLowerCase()]
      return code ? `&#${code};` : '&amp;' + ent
    })
}

/** Strict parse, then a repaired parse; null if both fail. */
export function parseLenient(parse: ParseXml, text: string, type: XmlType = 'application/xml'): Document | null {
  return parse(text, type) ?? parse(repairXml(text), type)
}

/** XHTML that is not well-formed (HTML served as .xhtml) falls back to the HTML parser. */
export function parseMarkup(parse: ParseXml, text: string, mediaType = 'application/xhtml+xml'): { doc: Document; xml: boolean } {
  if (mediaType !== 'text/html') {
    const type: XmlType = mediaType === 'image/svg+xml' ? 'image/svg+xml' : 'application/xhtml+xml'
    const doc = parseLenient(parse, text, type)
    if (doc) return { doc, xml: true }
  }
  const doc = parse(text, 'text/html')
  if (!doc) throw new Error('HTML parser returned no document') // only reachable with a broken injected parser
  return { doc, xml: false }
}

/** Local name without any prefix, lowercased (HTML-parsed docs keep "dc:title" as the local name). */
export const local = (n: Node) => ((n as Element).localName ?? n.nodeName ?? '').replace(/^.*:/, '').toLowerCase()

/** All descendant elements with local name `name` (case-insensitive, any namespace/prefix). */
export function byTag(root: Document | Element, name: string): Element[] {
  const want = name.toLowerCase()
  return Array.from(root.getElementsByTagName('*')).filter(e => local(e) === want)
}

/** Element children, optionally filtered by local name(s). */
export function kids(el: Node, ...names: string[]): Element[] {
  const out: Element[] = []
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (!names.length || names.includes(local(n)))) out.push(n as Element)
  }
  return out
}

export const first = (root: Document | Element, name: string): Element | undefined => byTag(root, name)[0]

/** Attribute value or undefined. */
export function attr(el: Element, name: string): string | undefined {
  return el.getAttribute(name) ?? undefined
}

/** Prefixed attribute by local name, whatever the prefix/namespace binding: pattr(el, 'role') finds opf:role. */
export function pattr(el: Element, name: string): string | undefined {
  for (const a of Array.from(el.attributes)) {
    const n = a.name.toLowerCase()
    if (n.includes(':') && !n.startsWith('xmlns') && n.slice(n.indexOf(':') + 1) === name) return a.value
  }
  return undefined
}

/** Whitespace-normalized text content. */
export const text = (n: Node | undefined | null) => (n?.textContent ?? '').replace(/\s+/g, ' ').trim()

export const tokens = (v: string | undefined | null) => (v ?? '').split(/\s+/).filter(Boolean)

/** xml:lang (or lang) of the element or its nearest ancestor. */
export function lang(el: Element | null): string | undefined {
  for (let e = el; e && e.nodeType === 1; e = e.parentNode as Element | null) {
    const v = e.getAttributeNS(NS.XML, 'lang') || e.getAttribute('xml:lang') || e.getAttribute('lang')
    if (v) return v
  }
  return undefined
}

export function removeNode(n: Node) { n.parentNode?.removeChild(n) }
