// Paginated renderer: each spine document lives in an iframe laid out with CSS multi-column,
// one column (or two, for spreads) per screen. The iframe is as wide as all its pages and is
// translated horizontally, so page turns are GPU transforms we can animate and drag.
// ponytail: LTR horizontal text only; RTL / vertical-rl / fixed-layout books need their own layout paths.
import { type Book, type TocItem } from './epub.ts'
import { bookCss, type Settings } from './settings.ts'

interface View { iframe: HTMLIFrameElement; doc: Document; index: number; pages: number }
export interface Relocation { index: number; page: number; pages: number; fraction: number; progress: number; chapter: string }
export type Zone = 'left' | 'center' | 'right'

const XHTML_NS = 'http://www.w3.org/1999/xhtml'
const EASE = 'cubic-bezier(.2,.75,.25,1)'
const TURN_MS = 420

const PAGE_BREAK = /^(page|always|left|right|recto|verso)$/
const SECTION_TYPES = /\b(part|chapter|division|volume|titlepage|halftitlepage|toc|dedication|epigraph|copyright-page|preface|foreword|prologue|introduction|epilogue|afterword|appendix|colophon|index|glossary|bibliography|endnotes|rearnotes)\b/
const SECTION_CLASSES = /\b(chapter|toc|titlepage|title-page|halftitle)\b/

/** Decide where sections start. Inside multi-column layout, paged-media breaks
 *  (`page-break-before: always`, `break-after: page`…) are ignored, and many books never mark
 *  breaks at all. Combine the publisher's CSS breaks with structural ones (h1, epub:type
 *  sections, chapter/TOC blocks, Gutenberg boilerplate) and express them as column breaks. */
function sectionBreaks(doc: Document) {
  const body = doc.body ?? doc.documentElement
  const before = new Set<Element>(), after = new Set<Element>()
  const check = (style: CSSStyleDeclaration, el: () => Iterable<Element>) => {
    if (PAGE_BREAK.test(style.breakBefore) || PAGE_BREAK.test(style.pageBreakBefore)) for (const e of el()) before.add(e)
    if (PAGE_BREAK.test(style.breakAfter) || PAGE_BREAK.test(style.pageBreakAfter)) for (const e of el()) after.add(e)
  }
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if ('selectorText' in r && 'style' in r) {
        const rule = r as CSSStyleRule
        check(rule.style, () => { try { return doc.querySelectorAll(rule.selectorText) } catch { return [] } })
      } else if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules)
    }
  }
  for (const sheet of Array.from(doc.styleSheets)) {
    try { walk(sheet.cssRules) } catch { /* unreadable sheet */ }
  }
  for (const el of Array.from(body.querySelectorAll('*'))) {
    const inline = (el as HTMLElement).style
    if (inline?.cssText.includes('break')) check(inline, () => [el])
    const type = el.getAttribute('epub:type') ?? el.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ?? ''
    const cls = el.getAttribute('class') ?? ''
    if (el.localName === 'h1' || SECTION_TYPES.test(type) || SECTION_CLASSES.test(cls)) before.add(el)
    if (/\bpg-boilerplate\b/.test(cls)) after.add(el)
  }

  // "Break after X" becomes "break before the next element with content", so adjacent breaks
  // (with empty spacer elements between them) collapse into one.
  const hasContent = (n: Node) => !!n.textContent?.trim() || !!(n as Element).querySelector?.('img, svg, image, video')
    || ['img', 'svg', 'image', 'video'].includes((n as Element).localName)
  for (const el of after) {
    let n: Element | null = el
    while (n && n !== body) {
      let sib = n.nextElementSibling
      while (sib && !hasContent(sib)) sib = sib.nextElementSibling
      if (sib) { before.add(sib); break }
      n = n.parentElement
    }
  }

  // Apply in document order, skipping a break when nothing was laid out since the previous one
  // (start of document, or a section heading right after its section's own break): it would
  // only produce an empty page.
  const range = doc.createRange()
  range.setStart(body, 0)
  for (const el of Array.from(body.querySelectorAll('*'))) {
    if (!before.has(el)) continue
    range.setEndBefore(el)
    if (!hasContent(range.cloneContents())) continue
    const st = (el as HTMLElement).style
    st?.setProperty('break-before', 'column', 'important')
    st?.setProperty('-webkit-column-break-before', 'always', 'important')
    range.setStartBefore(el)
  }
}

export class Paginator {
  onRelocate?: (r: Relocation) => void
  onTap?: (zone: Zone) => void
  private host: HTMLElement
  private book: Book
  private settings: Settings
  private view?: View
  private page = 0
  private busy = false
  private L = { V: 0, H: 0, m: 0, t: 0, cols: 1, colW: 0, gap: 0 }
  private starts: number[] = [] // cumulative spine weights, for whole-book progress
  private labels: string[] = []
  private ro: ResizeObserver
  private resizeTimer = 0
  private onKey = (e: KeyboardEvent) => this.key(e)

  constructor(host: HTMLElement, book: Book, settings: Settings) {
    this.host = host
    this.book = book
    this.settings = settings
    const total = book.spine.reduce((a, s) => a + s.size, 0)
    let acc = 0
    this.starts = book.spine.map(s => { const st = acc / total; acc += s.size; return st }).concat(1)
    this.labels = this.chapterLabels(book.toc)
    this.ro = new ResizeObserver(() => {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = window.setTimeout(() => this.relayout(), 120)
    })
    this.ro.observe(host)
    window.addEventListener('keydown', this.onKey)
  }

  destroy() {
    this.ro.disconnect()
    window.removeEventListener('keydown', this.onKey)
    this.host.replaceChildren()
  }

  // ---------- public navigation ----------

  async open(index: number, fraction = 0) {
    await this.show(index, v => Math.round(fraction * (v.pages - 1)))
  }

  async goTo(href: string) {
    const index = this.book.spineIndex(href)
    if (index < 0) return
    const frag = href.split('#')[1]
    await this.show(index, v => {
      const el = frag ? v.doc.getElementById(decodeURIComponent(frag)) : null
      return el ? this.pageOfRect(el.getBoundingClientRect()) : 0
    })
  }

  async goToProgress(p: number) {
    let index = this.starts.findIndex((s, i) => p >= s && p < this.starts[i + 1])
    if (index < 0) index = this.book.spine.length - 1
    const fraction = (p - this.starts[index]) / (this.starts[index + 1] - this.starts[index] || 1)
    await this.show(index, v => Math.min(v.pages - 1, Math.floor(fraction * v.pages)))
  }

  async next() {
    const v = this.view
    if (!v || this.busy) return
    if (this.page < v.pages - 1) return this.slide(this.page + 1)
    if (v.index < this.book.spine.length - 1) return this.turnChapter(1)
    this.bounce(-1)
  }

  async prev() {
    const v = this.view
    if (!v || this.busy) return
    if (this.page > 0) return this.slide(this.page - 1)
    if (v.index > 0) return this.turnChapter(-1)
    this.bounce(1)
  }

  setSettings(s: Settings) {
    this.settings = s
    this.relayout()
  }

  // ---------- layout ----------

  private measure() {
    const V = this.host.clientWidth, H = this.host.clientHeight, s = this.settings
    const cols = s.spread === 'auto' && V >= 900 && V > H * 1.1 ? 2 : 1
    const pageW = V / cols
    let m = Math.max(16, Math.round(pageW * [0.05, 0.08, 0.12][s.margin]))
    if (cols === 1) m = Math.max(m, Math.round((V - 760) / 2)) // keep a readable measure on wide screens
    const gap = 2 * m
    this.L = { V, H, m, t: H < 600 ? 40 : 56, cols, colW: (V - 2 * m - (cols - 1) * gap) / cols, gap }
  }

  private style(doc: Document, id: string, css: string) {
    let el = doc.getElementById(id)
    if (!el) {
      el = doc.createElementNS(XHTML_NS, 'style')
      el.id = id
      ;(doc.head ?? doc.documentElement).append(el)
    }
    el.textContent = css
  }

  private inject(v: View) {
    const { V, H, m, t, colW, gap } = this.L
    this.style(v.doc, 'pubre-user', bookCss(this.settings, H - 2 * t))
    this.style(v.doc, 'pubre-layout', `
html { box-sizing: content-box !important; margin: 0 !important; max-width: none !important;
  width: ${V - 2 * m}px !important; height: ${H - 2 * t}px !important; padding: ${t}px ${m}px !important;
  column-width: ${colW}px !important; column-gap: ${gap}px !important; column-fill: auto !important;
  overflow: hidden !important; touch-action: none; }`)
  }

  private paginate(v: View) {
    const { V, m, cols, colW, gap } = this.L
    v.iframe.style.width = V + 'px'
    v.iframe.style.height = this.L.H + 'px'
    const ncols = Math.max(1, Math.ceil((v.doc.documentElement.scrollWidth - m) / (colW + gap)))
    v.pages = Math.ceil(ncols / cols)
    v.iframe.style.width = v.pages * V + 'px'
  }

  private pageOfRect(r: DOMRect) {
    return Math.max(0, Math.floor((r.left + 1) / this.L.V))
  }

  /** Text position at the top-left of the current page, used to keep place across relayouts. */
  private anchor(): Range | null {
    const v = this.view
    if (!v) return null
    const x = this.page * this.L.V + this.L.m + 4, y = this.L.t + 12
    const d = v.doc as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }
    const pos = d.caretPositionFromPoint?.(x, y)
    if (pos) {
      const r = d.createRange()
      r.setStart(pos.offsetNode, pos.offset)
      return r
    }
    return d.caretRangeFromPoint?.(x, y) ?? null
  }

  private relayout() {
    const v = this.view
    if (!v) return
    const range = this.anchor()
    const fraction = this.page / Math.max(1, v.pages)
    this.measure()
    this.inject(v)
    this.paginate(v)
    const rect = range?.getClientRects()[0]
      ?? (range?.startContainer instanceof Element ? range.startContainer.getBoundingClientRect() : undefined)
    this.page = Math.min(v.pages - 1, rect ? this.pageOfRect(rect) : Math.floor(fraction * v.pages))
    this.setX(v, -this.page * this.L.V)
    this.emit()
  }

  // ---------- views ----------

  private async load(index: number): Promise<View> {
    const iframe = document.createElement('iframe')
    // allow-scripts is only so WebKit delivers our listeners; book scripts are stripped + CSP-blocked.
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts')
    iframe.setAttribute('title', this.book.metadata.title)
    iframe.className = 'pubre-view'
    iframe.style.cssText = `position:absolute;inset:0 auto auto 0;border:0;opacity:0;width:${this.L.V}px;height:${this.L.H}px`
    this.host.append(iframe)
    const loaded = new Promise(r => iframe.addEventListener('load', r, { once: true }))
    iframe.src = await this.book.chapterUrl(index)
    await loaded
    const doc = iframe.contentDocument!
    if (!doc.documentElement.getAttribute('lang') && this.book.metadata.language) {
      doc.documentElement.setAttribute('lang', this.book.metadata.language) // enables hyphenation
    }
    const v: View = { iframe, doc, index, pages: 1 }
    this.inject(v)
    sectionBreaks(doc)
    this.bind(v)
    const timeout = new Promise(r => setTimeout(r, 1500))
    await Promise.race([Promise.allSettled([doc.fonts?.ready, ...Array.from(doc.images, i => i.decode())]), timeout])
    this.paginate(v)
    return v
  }

  /** Replace the current view (jumps, first open): crossfade, no slide. */
  private async show(index: number, pageFor: (v: View) => number) {
    if (this.busy) return
    this.busy = true
    try {
      if (!this.L.V) this.measure()
      const old = this.view
      const v = old && old.index === index ? old : await this.load(index)
      this.page = Math.max(0, Math.min(v.pages - 1, pageFor(v)))
      this.setX(v, -this.page * this.L.V)
      this.view = v
      if (v !== old) {
        await v.iframe.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' }).finished
        v.iframe.style.opacity = '1'
        old?.iframe.remove()
      }
      this.emit()
    } finally {
      this.busy = false
    }
  }

  private setX(v: View, x: number) {
    v.iframe.style.transform = `translate3d(${x}px,0,0)`
  }

  private currentX(v: View) {
    return new DOMMatrix(getComputedStyle(v.iframe).transform).m41
  }

  private async move(v: View, to: number, ms = TURN_MS) {
    const from = this.currentX(v)
    this.setX(v, to)
    await v.iframe.animate(
      [{ transform: `translate3d(${from}px,0,0)` }, { transform: `translate3d(${to}px,0,0)` }],
      { duration: ms, easing: EASE },
    ).finished
  }

  private async slide(page: number) {
    const v = this.view!
    this.busy = true
    this.page = page
    this.emit()
    try { await this.move(v, -page * this.L.V) } finally { this.busy = false }
  }

  private async turnChapter(dir: 1 | -1) {
    const old = this.view!
    this.busy = true
    try {
      const v = await this.load(old.index + dir)
      const start = dir > 0 ? 0 : v.pages - 1
      const shift = dir * this.L.V
      const oldX = this.currentX(old)
      this.setX(v, -start * this.L.V + shift + (oldX + this.page * this.L.V)) // follow any drag offset
      v.iframe.style.opacity = '1'
      this.view = v
      this.page = start
      this.emit()
      await Promise.all([this.move(old, -this.pageOf(old) * this.L.V - shift), this.move(v, -start * this.L.V)])
      old.iframe.remove()
    } finally {
      this.busy = false
    }
  }

  private pageOf(v: View) {
    return Math.round(-new DOMMatrix(v.iframe.style.transform).m41 / this.L.V)
  }

  private bounce(dir: number) {
    const v = this.view!
    const x = -this.page * this.L.V
    v.iframe.animate(
      [{ transform: `translate3d(${x}px,0,0)` }, { transform: `translate3d(${x + dir * 36}px,0,0)` }, { transform: `translate3d(${x}px,0,0)` }],
      { duration: 360, easing: 'ease-out' },
    )
  }

  // ---------- input ----------

  private key(e: KeyboardEvent) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
    if ((e.target as HTMLElement)?.closest?.('input, textarea, select, dialog[open]')) return
    if (['ArrowRight', 'PageDown', ' '].includes(e.key) && !e.shiftKey) { e.preventDefault(); this.next() }
    else if (['ArrowLeft', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); this.prev() }
  }

  private bind(v: View) {
    const doc = v.doc
    doc.addEventListener('keydown', this.onKey)

    doc.addEventListener('click', e => {
      const a = (e.target as Element).closest?.('a[href]')
      if (!a) return
      e.preventDefault()
      const href = a.getAttribute('href')!
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        if (/^(https?|mailto):/i.test(href)) window.open(href, '_blank', 'noopener')
        return
      }
      this.goTo(this.book.resolveHref(this.book.spine[v.index].href, href))
    })

    let wheelLock = 0, wheelAcc = 0
    doc.addEventListener('wheel', e => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      wheelAcc += d
      if (Date.now() < wheelLock || Math.abs(wheelAcc) < 40) return
      wheelLock = Date.now() + 450
      ;(wheelAcc > 0 ? this.next() : this.prev())
      wheelAcc = 0
    }, { passive: true })

    // Tap zones (any pointer) + drag-to-turn (touch/pen).
    let start: { x: number; y: number; t: number; id: number; touch: boolean } | null = null
    let dragging = false
    doc.addEventListener('pointerdown', e => {
      if (!e.isPrimary || this.busy) return
      start = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId, touch: e.pointerType !== 'mouse' }
      dragging = false
    })
    doc.addEventListener('pointermove', e => {
      if (!start || e.pointerId !== start.id || !start.touch || this.view !== v) return
      const dx = e.clientX - start.x, dy = e.clientY - start.y
      if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2 && !doc.getSelection()?.toString()) dragging = true
      if (!dragging) return
      const atEdge = (dx > 0 && this.page === 0 && v.index === 0) || (dx < 0 && this.page === v.pages - 1 && v.index === this.book.spine.length - 1)
      this.setX(v, -this.page * this.L.V + (atEdge ? dx * 0.3 : dx))
    })
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x, dy = e.clientY - start.y, dt = Date.now() - start.t
      start = null
      if (dragging) {
        dragging = false
        const fast = Math.abs(dx) / dt > 0.4
        if (e.type !== 'pointercancel' && (Math.abs(dx) > this.L.V * 0.18 || fast)) {
          dx < 0 ? this.next() : this.prev()
        } else {
          this.busy = true
          this.move(v, -this.page * this.L.V, 260).finally(() => { this.busy = false })
        }
        return
      }
      if (e.type === 'pointercancel' || Math.hypot(dx, dy) > 8 || dt > 600) return
      if ((e.target as Element).closest?.('a[href]') || doc.getSelection()?.toString()) return
      const x = v.iframe.getBoundingClientRect().left + e.clientX - this.host.getBoundingClientRect().left
      const zone: Zone = x < this.L.V * 0.28 ? 'left' : x > this.L.V * 0.72 ? 'right' : 'center'
      if (zone === 'left') this.prev()
      else if (zone === 'right') this.next()
      this.onTap?.(zone)
    }
    doc.addEventListener('pointerup', end)
    doc.addEventListener('pointercancel', end)
  }

  // ---------- reporting ----------

  private chapterLabels(toc: TocItem[]) {
    const flat: TocItem[] = []
    const walk = (items: TocItem[]) => items.forEach(i => { flat.push(i); walk(i.children) })
    walk(toc)
    let last = ''
    return this.book.spine.map((_, i) => {
      const hit = flat.find(t => this.book.spineIndex(t.href) === i)
      return (last = hit?.label || last)
    })
  }

  private emit() {
    const v = this.view
    if (!v) return
    const fraction = v.pages > 1 ? this.page / (v.pages - 1) : 0
    const progress = this.starts[v.index] + (this.starts[v.index + 1] - this.starts[v.index]) * ((this.page + 1) / v.pages)
    this.onRelocate?.({ index: v.index, page: this.page, pages: v.pages, fraction, progress, chapter: this.labels[v.index] })
  }
}
