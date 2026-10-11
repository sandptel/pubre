// Structural semantics: epub:type (EPUB 3 Structural Semantics Vocabulary) and DPUB-ARIA roles,
// normalized to one vocabulary. Data only: UI "section presenters" decide what to do with it.
import { NS, tokens, attr, text } from './xml.ts'
import { splitHref } from './resources.ts'

/** Raw epub:type tokens (namespace-bound or literal "epub:type" in HTML-parsed docs). */
export function epubTypes(el: Element): string[] {
  return tokens(el.getAttributeNS(NS.OPS, 'type') || el.getAttribute('epub:type'))
}

export const roles = (el: Element) => tokens(el.getAttribute('role'))

// Deprecated / legacy terms → current ones.
const ALIASES: Record<string, string> = {
  rearnote: 'endnote', rearnotes: 'endnotes', annoref: 'noteref', annotation: 'note',
  'copyright': 'copyright-page', 'acknowledgements': 'acknowledgments', 'help': 'tip', 'marginalia': 'note',
}

/** Known kinds, most specific first: `classify` returns the first one an element carries. */
export const KINDS = [
  'noteref', 'backlink', 'biblioref', 'glossref', 'pagebreak',
  'footnote', 'endnote', 'note', 'footnotes', 'endnotes',
  'glossterm', 'glossdef', 'glossary', 'biblioentry', 'bibliography', 'index',
  'toc', 'landmarks', 'page-list', 'loi', 'lot', 'loa', 'lov',
  'epigraph', 'pullquote', 'sidebar', 'tip', 'notice', 'example', 'qna', 'abstract',
  'cover', 'titlepage', 'halftitlepage', 'frontispiece', 'dedication', 'acknowledgments', 'colophon',
  'copyright-page', 'credits', 'credit', 'errata', 'contributors', 'other-credits',
  'foreword', 'preface', 'prologue', 'introduction', 'preamble', 'epilogue', 'afterword', 'conclusion',
  'appendix', 'chapter', 'part', 'volume', 'subchapter', 'division',
  'frontmatter', 'bodymatter', 'backmatter',
  'title', 'subtitle', 'fulltitle', 'covertitle', 'halftitle', 'label', 'ordinal', 'bridgehead',
] as const
export type SemanticKind = (typeof KINDS)[number]
const KNOWN = new Set<string>(KINDS)

/** Normalized semantics of an element: epub:type terms plus doc-* roles, deduplicated. */
export function semanticsOf(el: Element): string[] {
  const out = new Set<string>()
  for (const t of epubTypes(el)) out.add(ALIASES[t.toLowerCase()] ?? t.toLowerCase())
  for (const r of roles(el)) {
    const t = r.toLowerCase()
    if (t.startsWith('doc-')) out.add(ALIASES[t.slice(4)] ?? t.slice(4))
    else if (t === 'note') out.add('note')
  }
  return [...out]
}

export function classify(el: Element): SemanticKind | undefined {
  const s = new Set(semanticsOf(el))
  return KINDS.find(k => s.has(k))
}

export const hasSemantic = (el: Element, kind: string) => semanticsOf(el).includes(kind)

export interface NoteRef { el: Element; target: string } // target = fragment id
export interface Note { el: Element; id: string; kind: 'footnote' | 'endnote' | 'note' }
export interface PageBreak { el: Element; id?: string; label: string }
export interface Section { el: Element; kind: SemanticKind }

/** Page-break label: title, aria-label, then text content. */
export const pageBreakLabel = (el: Element) => attr(el, 'title') || attr(el, 'aria-label') || text(el)

/** Everything classifiable in a content document, in document order. */
export function collectSemantics(doc: Document) {
  const noterefs: NoteRef[] = []
  const notes: Note[] = []
  const pagebreaks: PageBreak[] = []
  const sections: Section[] = []
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    const kind = classify(el)
    if (!kind) continue
    if (kind === 'noteref') {
      const href = attr(el, 'href') ?? el.getAttributeNS(NS.XLINK, 'href') ?? ''
      noterefs.push({ el, target: splitHref(href).fragment })
    } else if (kind === 'footnote' || kind === 'endnote' || kind === 'note') {
      notes.push({ el, id: attr(el, 'id') ?? '', kind })
    } else if (kind === 'pagebreak') {
      pagebreaks.push({ el, id: attr(el, 'id'), label: pageBreakLabel(el) })
    } else if (KNOWN.has(kind)) {
      sections.push({ el, kind })
    }
  }
  return { noterefs, notes, pagebreaks, sections }
}
