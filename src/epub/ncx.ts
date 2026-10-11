// EPUB 2 NCX (DAISY/NISO Z39.86-2005 subset): navMap, pageList, navList.
import { byTag, kids, first, attr, text } from './xml.ts'
import { resolveHref } from './resources.ts'
import type { NavItem } from './nav.ts'

export interface NcxItem extends NavItem {
  id?: string
  playOrder?: number
  /** navPoint class / pageTarget type ("front" | "normal" | "special"). */
  kind?: string
  /** pageTarget value attribute. */
  value?: string
  children: NcxItem[]
}

export interface Ncx {
  title?: string
  authors: string[]
  uid?: string
  toc: NcxItem[]
  pageList: NcxItem[]
  navLists: { label: string; items: NcxItem[] }[]
}

export function parseNcx(doc: Document, base: string): Ncx {
  const head = first(doc, 'head')
  const uid = head && byTag(head, 'meta').find(m => attr(m, 'name') === 'dtb:uid')
  const navMap = first(doc, 'navMap')
  const pageList = first(doc, 'pageList')
  const docTitle = first(doc, 'docTitle')
  return {
    title: docTitle ? text(first(docTitle, 'text')) || undefined : undefined,
    authors: byTag(doc, 'docAuthor').map(a => text(first(a, 'text'))).filter(Boolean),
    uid: uid ? attr(uid, 'content') : undefined,
    toc: navMap ? points(navMap, 'navPoint', base) : [],
    pageList: pageList ? points(pageList, 'pageTarget', base) : [],
    navLists: byTag(doc, 'navList').map(l => ({
      label: text(first(kids(l, 'navLabel')[0] ?? l, 'text')),
      items: points(l, 'navTarget', base),
    })),
  }
}

function points(parent: Element, tag: string, base: string): NcxItem[] {
  return kids(parent, tag.toLowerCase()).map(p => {
    const label = kids(p, 'navlabel')[0]
    const src = attr(kids(p, 'content')[0] ?? p, 'src') ?? ''
    const order = attr(p, 'playOrder') ?? attr(p, 'playorder')
    const item: NcxItem = {
      label: label ? text(first(label, 'text') ?? label) : '',
      href: src ? resolveHref(base, src) : '',
      children: points(p, tag, base),
      id: attr(p, 'id'),
      playOrder: order !== undefined && Number.isFinite(Number(order)) ? Number(order) : undefined,
      kind: attr(p, tag === 'pageTarget' ? 'type' : 'class'),
      value: attr(p, 'value'),
    }
    return item
  })
}
