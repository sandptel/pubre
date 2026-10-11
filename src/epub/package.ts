// Package document (OPF) for EPUB 2.0.1 and EPUB 3.3: metadata (with refines chains), manifest,
// spine, rendition properties, guide. Pure: a Document in, plain data out.
import { NS, byTag, kids, first, attr, pattr, text, tokens, lang, local } from './xml.ts'
import { resolvePath, resolveHref, fallbackChain, isContentDocument } from './resources.ts'
import { parseClock } from './smil.ts'

// ---------------------------------------------------------------- types

/** A metadata expression: a DC element or a <meta>, with the metas that refine it (chains allowed). */
export interface MetaNode {
  /** "dc:title", "dc:creator", ... for DC elements; the property (EPUB 3) or name (EPUB 2) for metas. */
  property: string
  value: string
  id?: string
  lang?: string
  dir?: string
  scheme?: string
  /** Other attributes, prefix stripped (EPUB 2 opf:role, opf:file-as, opf:scheme, opf:event, ...). */
  attrs: Record<string, string>
  refinements: MetaNode[]
}

export interface AlternateScript { value: string; lang?: string }

export interface Contributor {
  name: string
  id?: string
  lang?: string
  fileAs?: string
  /** MARC relator codes or free values, e.g. ["aut"], ["ill", "trl"]. */
  roles: string[]
  displaySeq?: number
  alternateScripts: AlternateScript[]
}

export interface Title {
  value: string
  id?: string
  lang?: string
  /** main | subtitle | short | collection | edition | expanded */
  type?: string
  displaySeq?: number
  fileAs?: string
  alternateScripts: AlternateScript[]
}

export interface Identifier { value: string; id?: string; scheme?: string; type?: string }

export interface Collection {
  name: string
  id?: string
  /** "series" | "set" | other */
  type?: string
  /** group-position, raw (may be "2.5" or "1.2.3") */
  position?: string
  identifier?: string
  fileAs?: string
  /** Larger collections this one belongs to. */
  collections: Collection[]
}

export interface Series { name: string; position?: number; positionRaw?: string }

export interface Accessibility {
  accessModes: string[]
  /** Each entry is one sufficient combination, e.g. [["textual"], ["textual", "visual"]]. */
  accessModesSufficient: string[][]
  features: string[]
  hazards: string[]
  summary?: string
  conformsTo: string[]
  certifiedBy?: string
  certifierCredential?: string
  certifierReport?: string
  apis: string[]
  controls: string[]
}

export type Layout = 'reflowable' | 'pre-paginated'
export type Orientation = 'auto' | 'landscape' | 'portrait'
export type Spread = 'auto' | 'none' | 'landscape' | 'portrait' | 'both'
export type Flow = 'auto' | 'paginated' | 'scrolled-continuous' | 'scrolled-doc'

export interface Rendition {
  layout: Layout
  orientation: Orientation
  spread: Spread
  flow: Flow
  /** Deprecated rendition:viewport, e.g. { width: 1200, height: 1600 } */
  viewport?: { width?: number; height?: number }
}

export interface MediaMetadata {
  /** Total narration duration (seconds). */
  duration?: number
  narrators: string[]
  activeClass?: string
  playbackActiveClass?: string
}

export interface Metadata {
  /** Main title (title-type main, else first dc:title). */
  title: string
  subtitle?: string
  titles: Title[]
  /** Display string of all creators, e.g. "Jane Doe, John Roe" (kept for the app). */
  creator: string
  creators: Contributor[]
  contributors: Contributor[]
  /** First language. */
  language: string
  languages: string[]
  /** Value of the unique identifier. */
  identifier: string
  identifiers: Identifier[]
  isbn?: string
  publisher: string
  publishers: string[]
  description: string
  subjects: { value: string; authority?: string; term?: string }[]
  rights?: string
  sources: string[]
  types: string[]
  formats: string[]
  coverages: string[]
  relations: string[]
  /** Publication date (dc:date). */
  published?: string
  /** Last modification (dcterms:modified). */
  modified?: string
  dates: { value: string; event?: string }[]
  collections: Collection[]
  series?: Series
  accessibility: Accessibility
  media: MediaMetadata
  /** All top-level expressions (DC + metas), refinements attached. */
  all: MetaNode[]
  links: { href: string; rel: string[]; mediaType?: string; refines?: string; properties: string[]; hreflang?: string }[]
}

export interface ManifestItem {
  id: string
  /** Zip path. */
  href: string
  rawHref: string
  mediaType: string
  properties: Set<string>
  fallback?: string
  mediaOverlay?: string
  /** media:duration of a SMIL item (seconds). */
  duration?: number
  refinements: MetaNode[]
}

export type PageSpread = 'left' | 'right' | 'center'

export interface SpineItem {
  index: number
  idref: string
  /** itemref id (used in CFI id assertions). */
  id?: string
  /** CFI step of the itemref within <spine> (counts every child element, even skipped ones). */
  cfiStep: number
  linear: boolean
  properties: Set<string>
  pageSpread?: PageSpread
  /** Effective rendition: global properties with this itemref's overrides applied. */
  rendition: Rendition
  alignXCenter: boolean
  /** The manifest item the itemref points to. */
  item: ManifestItem
  /** Zip path of the document to render (the item, or the first content document in its fallback chain). */
  href: string
  mediaType: string
  /** Zip path of the media overlay (SMIL), if any. */
  mediaOverlay?: string
}

export interface GuideReference { type: string; title: string; href: string }

export interface Package {
  version: string
  uniqueIdentifier: string
  lang?: string
  dir?: string
  prefixes: Record<string, string>
  metadata: Metadata
  rendition: Rendition
  /** By id, in document order. */
  manifest: Map<string, ManifestItem>
  spine: SpineItem[]
  pageProgressionDirection: 'ltr' | 'rtl' | 'default'
  /** NCX manifest id from <spine toc>. */
  tocId?: string
  guide: GuideReference[]
  /** Child index step of <spine> within <package> (6 in the canonical order), for CFIs. */
  spineCfiStep: number
  warnings: string[]
}

// ---------------------------------------------------------------- parse

const DC_ELEMENTS = new Set(['contributor', 'coverage', 'creator', 'date', 'description', 'format', 'identifier', 'language', 'publisher', 'relation', 'rights', 'source', 'subject', 'title', 'type'])

export function parsePackage(doc: Document, opfPath: string): Package {
  const warnings: string[] = []
  const pkg = doc.documentElement
  const version = attr(pkg, 'version') ?? ''
  const prefixes: Record<string, string> = {}
  for (const m of (attr(pkg, 'prefix') ?? '').matchAll(/([\w.-]+):\s+(\S+)/g)) prefixes[m[1]] = m[2]

  // ---- metadata expressions
  const metadataEl = first(doc, 'metadata')
  const exprEls = metadataEl ? kids(metadataEl).flatMap(e => /^(dc|x)-metadata$/.test(local(e)) ? kids(e) : [e]) : []
  const nodes: { node: MetaNode; refines?: string }[] = []
  const links: Metadata['links'] = []
  for (const el of exprEls) {
    const name = local(el)
    const isDc = el.namespaceURI === NS.DC || (DC_ELEMENTS.has(name) && /^dc:/i.test(el.nodeName))
    const attrs: Record<string, string> = {}
    for (const a of Array.from(el.attributes)) attrs[a.name.replace(/^.*:/, '').toLowerCase()] = a.value
    if (name === 'link') {
      links.push({
        href: resolveHref(opfPath, attr(el, 'href') ?? ''),
        rel: tokens(attr(el, 'rel')),
        mediaType: attr(el, 'media-type'),
        refines: attr(el, 'refines')?.replace(/^#/, ''),
        properties: tokens(attr(el, 'properties')),
        hreflang: attr(el, 'hreflang'),
      })
      continue
    }
    let node: MetaNode
    if (isDc) {
      node = { property: 'dc:' + name, value: text(el), attrs, refinements: [] }
    } else if (name === 'meta' && attr(el, 'property')) {
      node = { property: attr(el, 'property')!.trim(), value: text(el), attrs, refinements: [] }
    } else if (name === 'meta' && attr(el, 'name')) {
      node = { property: attr(el, 'name')!.trim(), value: (attr(el, 'content') ?? '').trim(), attrs, refinements: [] }
    } else continue
    node.id = attr(el, 'id')
    node.lang = lang(el) ?? undefined
    node.dir = attr(el, 'dir')
    node.scheme = attr(el, 'scheme') ?? pattr(el, 'scheme')
    nodes.push({ node, refines: attr(el, 'refines')?.trim().replace(/^#/, '') })
  }
  const byId = new Map(nodes.filter(n => n.node.id).map(n => [n.node.id!, n.node]))
  const all: MetaNode[] = []
  const itemRefinements = new Map<string, MetaNode[]>() // refines targeting manifest items / itemrefs
  for (const { node, refines } of nodes) {
    if (!refines) all.push(node)
    else if (byId.has(refines) && byId.get(refines) !== node) byId.get(refines)!.refinements.push(node)
    else {
      const list = itemRefinements.get(refines) ?? []
      list.push(node)
      itemRefinements.set(refines, list)
    }
  }

  const get = (prop: string) => all.filter(n => n.property === prop)
  const values = (prop: string) => get(prop).map(n => n.value).filter(Boolean)
  const metaValue = (prop: string) => get(prop)[0]?.value || undefined

  // ---- titles & contributors
  const titles = sortBySeq(get('dc:title').filter(n => n.value).map((n): Title => ({
    value: n.value,
    id: n.id,
    lang: n.lang,
    type: ref(n, 'title-type'),
    displaySeq: num(ref(n, 'display-seq')),
    fileAs: ref(n, 'file-as') ?? n.attrs['file-as'],
    alternateScripts: alternates(n),
  })))
  const main = titles.find(t => t.type === 'main') ?? titles.find(t => !t.type) ?? titles[0]
  const contributor = (n: MetaNode): Contributor => ({
    name: n.value,
    id: n.id,
    lang: n.lang,
    fileAs: ref(n, 'file-as') ?? n.attrs['file-as'],
    roles: [...n.refinements.filter(r => r.property === 'role').map(r => r.value), ...(n.attrs.role ? [n.attrs.role] : [])],
    displaySeq: num(ref(n, 'display-seq')),
    alternateScripts: alternates(n),
  })
  const creators = sortBySeq(get('dc:creator').filter(n => n.value).map(contributor))
  const contributors = sortBySeq(get('dc:contributor').filter(n => n.value).map(contributor))

  // ---- identifiers
  const uniqueIdentifier = attr(pkg, 'unique-identifier') ?? ''
  const identifiers = get('dc:identifier').filter(n => n.value).map((n): Identifier => ({
    value: n.value,
    id: n.id,
    scheme: n.scheme ?? n.attrs.scheme ?? n.refinements.find(r => r.property === 'identifier-type')?.scheme,
    type: ref(n, 'identifier-type'),
  }))
  const uid = identifiers.find(i => i.id && i.id === uniqueIdentifier) ?? identifiers[0]
  if (!uid) warnings.push('No dc:identifier')
  else if (uid.id !== uniqueIdentifier) warnings.push(`unique-identifier "${uniqueIdentifier}" does not match any dc:identifier`)
  const isbn = findIsbn(identifiers)

  // ---- dates
  const dates = get('dc:date').filter(n => n.value).map(n => ({ value: n.value, event: n.attrs.event }))
  const published = (dates.find(d => /^(original-)?publication$/i.test(d.event ?? '')) ?? dates.find(d => !d.event) ?? dates[0])?.value
  const modified = metaValue('dcterms:modified') ?? dates.find(d => /^modification$/i.test(d.event ?? ''))?.value

  // ---- collections & series
  const collection = (n: MetaNode): Collection => ({
    name: n.value,
    id: n.id,
    type: ref(n, 'collection-type'),
    position: ref(n, 'group-position'),
    identifier: ref(n, 'dcterms:identifier'),
    fileAs: ref(n, 'file-as'),
    collections: n.refinements.filter(r => r.property === 'belongs-to-collection').map(collection),
  })
  const collections = get('belongs-to-collection').filter(n => n.value).map(collection)
  const seriesCol = collections.find(c => c.type === 'series') ?? collections.find(c => !c.type && c.position)
  let series: Series | undefined
  if (seriesCol) series = { name: seriesCol.name, positionRaw: seriesCol.position, position: num(seriesCol.position) }
  else if (metaValue('calibre:series')) {
    const raw = metaValue('calibre:series_index')
    series = { name: metaValue('calibre:series')!, positionRaw: raw, position: num(raw) }
  }

  // ---- accessibility (schema.org, EPUB Accessibility 1.1; EPUB 2 uses <meta name="schema:...">)
  const a11y = (p: string) => [...values('schema:' + p), ...values(p)]
  const accessibility: Accessibility = {
    accessModes: a11y('accessMode'),
    accessModesSufficient: a11y('accessModeSufficient').map(v => v.split(',').map(s => s.trim()).filter(Boolean)),
    features: a11y('accessibilityFeature'),
    hazards: a11y('accessibilityHazard'),
    summary: a11y('accessibilitySummary')[0],
    conformsTo: [...values('dcterms:conformsTo'), ...links.filter(l => l.rel.includes('dcterms:conformsTo')).map(l => l.href)],
    certifiedBy: metaValue('a11y:certifiedBy'),
    certifierCredential: metaValue('a11y:certifierCredential'),
    certifierReport: links.find(l => l.rel.includes('a11y:certifierReport'))?.href ?? metaValue('a11y:certifierReport'),
    apis: a11y('accessibilityAPI'),
    controls: a11y('accessibilityControl'),
  }

  // ---- rendition (global)
  const rendition = parseRendition(metaValue)
  if (!get('rendition:layout').length && /^true$/i.test(metaValue('fixed-layout') ?? '')) rendition.layout = 'pre-paginated' // KF8/legacy hint

  const media: MediaMetadata = {
    duration: parseClock(metaValue('media:duration')),
    narrators: values('media:narrator'),
    activeClass: metaValue('media:active-class'),
    playbackActiveClass: metaValue('media:playback-active-class'),
  }

  // ---- manifest
  const manifest = new Map<string, ManifestItem>()
  const manifestEl = first(doc, 'manifest')
  for (const el of manifestEl ? kids(manifestEl, 'item') : []) {
    const id = attr(el, 'id') ?? ''
    const rawHref = attr(el, 'href') ?? ''
    if (!rawHref) { warnings.push(`Manifest item "${id}" has no href`); continue }
    if (manifest.has(id)) { warnings.push(`Duplicate manifest id "${id}"`); continue }
    const refinements = itemRefinements.get(id) ?? []
    manifest.set(id, {
      id,
      href: resolvePath(opfPath, rawHref),
      rawHref,
      mediaType: (attr(el, 'media-type') ?? '').trim().toLowerCase(),
      properties: new Set(tokens(attr(el, 'properties'))),
      fallback: attr(el, 'fallback'),
      mediaOverlay: attr(el, 'media-overlay'),
      duration: parseClock(refinements.find(r => r.property === 'media:duration')?.value),
      refinements,
    })
  }

  // ---- spine
  const spineEl = first(doc, 'spine')
  const ppd = attr(spineEl ?? pkg, 'page-progression-direction')?.trim().toLowerCase()
  const spine: SpineItem[] = []
  const spineKids = spineEl ? kids(spineEl) : []
  for (const [k, el] of spineKids.entries()) {
    if (local(el) !== 'itemref') continue
    const idref = attr(el, 'idref') ?? ''
    const item = manifest.get(idref)
    if (!item) { warnings.push(`Spine itemref "${idref}" not in manifest`); continue }
    const target = fallbackChain(item, manifest).find(i => isContentDocument(i.mediaType)) ?? item
    const properties = new Set(tokens(attr(el, 'properties')))
    const { rendition: r, pageSpread, alignXCenter } = applyOverrides(rendition, properties)
    const overlay = item.mediaOverlay ? manifest.get(item.mediaOverlay) : undefined
    spine.push({
      index: spine.length,
      idref,
      id: attr(el, 'id'),
      cfiStep: (k + 1) * 2,
      linear: (attr(el, 'linear') ?? '').trim().toLowerCase() !== 'no',
      properties,
      pageSpread,
      rendition: r,
      alignXCenter,
      item,
      href: target.href,
      mediaType: target.mediaType,
      mediaOverlay: overlay?.href,
    })
  }

  // ---- guide (EPUB 2; deprecated but still common)
  const guideEl = first(doc, 'guide')
  const guide = (guideEl ? kids(guideEl, 'reference') : []).flatMap(el => {
    const href = attr(el, 'href')
    return href ? [{ type: (attr(el, 'type') ?? '').trim().toLowerCase(), title: attr(el, 'title') ?? '', href: resolveHref(opfPath, href) }] : []
  })

  const metadata: Metadata = {
    title: main?.value || 'Untitled',
    subtitle: titles.find(t => t.type === 'subtitle')?.value,
    titles,
    creator: creators.map(c => c.name).join(', '),
    creators,
    contributors,
    language: values('dc:language')[0] ?? '',
    languages: values('dc:language'),
    identifier: uid?.value ?? '',
    identifiers,
    isbn,
    publisher: values('dc:publisher')[0] ?? '',
    publishers: values('dc:publisher'),
    description: values('dc:description')[0] ?? '',
    subjects: get('dc:subject').filter(n => n.value).map(n => ({ value: n.value, authority: ref(n, 'authority') ?? n.attrs.authority, term: ref(n, 'term') ?? n.attrs.term })),
    rights: values('dc:rights')[0],
    sources: values('dc:source'),
    types: values('dc:type'),
    formats: values('dc:format'),
    coverages: values('dc:coverage'),
    relations: values('dc:relation'),
    published,
    modified,
    dates,
    collections,
    series,
    accessibility,
    media,
    all,
    links,
  }

  const pkgKids = kids(pkg)
  const spineCfiStep = spineEl ? (pkgKids.indexOf(spineEl) + 1) * 2 : 6

  return {
    version,
    uniqueIdentifier,
    lang: lang(pkg),
    dir: attr(pkg, 'dir'),
    prefixes,
    metadata,
    rendition,
    manifest,
    spine,
    pageProgressionDirection: ppd === 'rtl' || ppd === 'ltr' ? ppd : 'default',
    tocId: spineEl ? attr(spineEl, 'toc') : undefined,
    guide,
    spineCfiStep,
    warnings,
  }
}

// ---------------------------------------------------------------- helpers

const ref = (n: MetaNode, prop: string) => n.refinements.find(r => r.property === prop)?.value || undefined

const alternates = (n: MetaNode) => n.refinements.filter(r => r.property === 'alternate-script').map(r => ({ value: r.value, lang: r.lang }))

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

/** Stable sort by display-seq; items without one keep document order after those with one. */
function sortBySeq<T extends { displaySeq?: number }>(list: T[]): T[] {
  return list.map((x, i) => [x, i] as const)
    .sort(([a, i], [b, j]) => (a.displaySeq ?? Infinity) - (b.displaySeq ?? Infinity) || i - j)
    .map(([x]) => x)
}

function findIsbn(ids: Identifier[]): string | undefined {
  for (const i of ids) {
    const v = i.value.replace(/^urn:isbn:/i, '')
    const digits = v.replace(/[-\s]/g, '')
    if ((/isbn/i.test(i.scheme ?? '') || /^urn:isbn:/i.test(i.value) || i.type === '15' || i.type === '02') && /^(\d{9}[\dx]|\d{13})$/i.test(digits)) return digits
  }
  for (const i of ids) {
    const d = i.value.replace(/[-\s]/g, '')
    if (/^97[89]\d{10}$/.test(d)) return d
  }
  return undefined
}

const LAYOUTS = ['reflowable', 'pre-paginated']
const ORIENTATIONS = ['auto', 'landscape', 'portrait']
const SPREADS = ['auto', 'none', 'landscape', 'portrait', 'both']
const FLOWS = ['auto', 'paginated', 'scrolled-continuous', 'scrolled-doc']

const pick = <T extends string>(v: string | undefined, allowed: string[], dflt: T): T => (v && allowed.includes(v.trim()) ? v.trim() : dflt) as T

export function parseRendition(meta: (prop: string) => string | undefined): Rendition {
  const spread = meta('rendition:spread')
  const r: Rendition = {
    layout: pick(meta('rendition:layout'), LAYOUTS, 'reflowable'),
    orientation: pick(meta('rendition:orientation'), ORIENTATIONS, 'auto'),
    spread: spread?.trim() === 'portrait' ? 'both' : pick(spread, SPREADS, 'auto'), // "portrait" is deprecated, = both
    flow: pick(meta('rendition:flow'), FLOWS, 'auto'),
  }
  const vp = meta('rendition:viewport')
  if (vp) {
    const w = /width\s*=\s*(\d+(?:\.\d+)?)/.exec(vp)
    const h = /height\s*=\s*(\d+(?:\.\d+)?)/.exec(vp)
    r.viewport = { width: w ? Number(w[1]) : undefined, height: h ? Number(h[1]) : undefined }
  }
  return r
}

/** Spine itemref properties: rendition:* overrides and page-spread-*. */
export function applyOverrides(global: Rendition, props: Set<string>) {
  const rendition: Rendition = { ...global }
  let pageSpread: PageSpread | undefined
  for (const p of props) {
    const m = /^rendition:(layout|orientation|spread|flow)-(.+)$/.exec(p)
    if (m) {
      const [, key, v] = m
      if (key === 'layout' && LAYOUTS.includes(v)) rendition.layout = v as Layout
      if (key === 'orientation' && ORIENTATIONS.includes(v)) rendition.orientation = v as Orientation
      if (key === 'spread' && SPREADS.includes(v)) rendition.spread = v === 'portrait' ? 'both' : v as Spread
      if (key === 'flow' && FLOWS.includes(v)) rendition.flow = v as Flow
    }
    const s = /^(?:rendition:)?page-spread-(left|right|center)$/.exec(p)
    if (s) pageSpread = s[1] as PageSpread
  }
  return { rendition, pageSpread, alignXCenter: props.has('rendition:align-x-center') }
}
