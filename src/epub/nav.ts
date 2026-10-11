// EPUB 3 navigation document: every <nav> (toc, page-list, landmarks, loi, lot, ...), with nested
// lists, unlinked <span> headings and the hidden attribute.
import { byTag, kids, local, attr, text } from './xml.ts'
import { resolveHref } from './resources.ts'
import { epubTypes, roles } from './semantics.ts'

export interface NavItem {
  label: string
  /** "zip/path#fragment"; empty for unlinked (span) headings. */
  href: string
  children: NavItem[]
  /** epub:type of the link (landmarks: "toc", "bodymatter", "cover", ...). */
  type?: string[]
  hidden?: boolean
}

export interface NavList {
  /** epub:type tokens of the <nav> (and doc-* role names). */
  types: string[]
  /** Heading (h1-h6) of the nav, if any. */
  title?: string
  hidden: boolean
  items: NavItem[]
}

export interface Nav {
  toc: NavItem[]
  pageList: NavItem[]
  landmarks: NavItem[]
  /** All navs in document order, including loi, lot, loa, lov and custom ones. */
  lists: NavList[]
}

const isHidden = (el: Element) => el.hasAttribute('hidden')

export function parseNav(doc: Document, base: string): Nav {
  const lists = byTag(doc, 'nav').map((nav): NavList => {
    const types = [...epubTypes(nav), ...roles(nav).filter(r => r.startsWith('doc-')).map(r => r.slice(4))]
    const heading = kids(nav).find(c => /^h[1-6]$/.test(local(c)))
    const list = kids(nav, 'ol', 'ul')[0] ?? findList(nav)
    return { types, title: heading ? text(heading) : undefined, hidden: isHidden(nav), items: list ? items(list, base) : [] }
  })
  const of = (type: string) => lists.find(l => l.types.includes(type))?.items
  return {
    toc: of('toc') ?? lists.find(l => !l.types.length)?.items ?? [],
    pageList: of('page-list') ?? [],
    landmarks: of('landmarks') ?? [],
    lists,
  }
}

/** A list anywhere inside the nav (wrapping <div>s are common). */
const findList = (nav: Element) => byTag(nav, 'ol')[0] ?? byTag(nav, 'ul')[0]

function items(list: Element, base: string): NavItem[] {
  const out: NavItem[] = []
  for (const li of kids(list)) {
    const name = local(li)
    if (name === 'ol' || name === 'ul') { // malformed: list directly inside list → children of the previous item
      const sub = items(li, base)
      if (out.length) out[out.length - 1].children.push(...sub)
      else out.push(...sub)
      continue
    }
    if (name !== 'li') continue
    const a = kids(li, 'a', 'span')[0] ?? byTag(li, 'a')[0]
    const sub = kids(li, 'ol', 'ul')[0]
    const href = a && local(a) === 'a' ? attr(a, 'href') : undefined
    const item: NavItem = {
      label: label(a ?? li, sub),
      href: href ? resolveHref(base, href) : '',
      children: sub ? items(sub, base) : [],
    }
    const type = a ? epubTypes(a) : []
    if (type.length) item.type = type
    if (isHidden(li) || (a && isHidden(a))) item.hidden = true
    out.push(item)
  }
  return out
}

/** Text label; falls back to title, then img alt / aria-label (links containing only an image). */
function label(el: Element, exclude?: Element): string {
  let t = ''
  const walk = (n: Node) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c === exclude) continue
      if (c.nodeType === 3 || c.nodeType === 4) t += c.nodeValue
      else if (c.nodeType === 1) walk(c)
    }
  }
  walk(el)
  t = t.replace(/\s+/g, ' ').trim()
  if (t) return t
  return attr(el, 'title') || attr(el, 'aria-label') || byTag(el, 'img').map(i => attr(i, 'alt')).find(Boolean) || ''
}
