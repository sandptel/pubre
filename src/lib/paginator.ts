// Paginated renderer: each spine document lives in an iframe laid out with CSS multi-column,
// one column (or two, for spreads) per screen. The iframe is as wide as all its pages and is
// translated horizontally, so page turns are GPU transforms we can animate and drag.
// ponytail: LTR horizontal text only; RTL / vertical-rl / fixed-layout books need their own layout paths.
import { type Book, type TocItem } from './epub.ts'
import { bookCss, resolveTheme, type Settings } from './settings.ts'
import { indexDocument, type TextIndex } from './textindex.ts'
import { Marks, marksCss } from './marks.ts'
import { cfiToRange } from '../epub/cfi.ts'

export interface View { iframe: HTMLIFrameElement; doc: Document; index: number; pages: number; ix: TextIndex; marks: Marks }
export interface Relocation { index: number; page: number; pages: number; fraction: number; progress: number; chapter: string; cfi?: string
  /** Book-progress (0..1) at the top of this page, and where the current TOC chapter ends. */
  top: number; chapterEnd: number
  /** The page within the current section (chapter), and how many pages the section has in this file. */
  cpage: number; cpages: number }
/** A top-level TOC entry placed on the whole-book progress axis (0..1). */
export interface Section { label: string; href: string; start: number }
export type Zone = 'left' | 'center' | 'right'

const XHTML_NS = 'http://www.w3.org/1999/xhtml'
const EASE = 'cubic-bezier(.2,.75,.25,1)'
const HOLD_MS = 380 // press-and-hold on text (before the system's own long-press, ~500 ms)
const TURN_MS = 420

const PAGE_BREAK = /^(page|always|left|right|recto|verso)$/
const SECTION_TYPES = /\b(part|chapter|division|volume|titlepage|halftitlepage|toc|dedication|epigraph|copyright-page|preface|foreword|prologue|introduction|epilogue|afterword|appendix|colophon|index|glossary|bibliography|endnotes|rearnotes)\b/
const SECTION_CONTAINERS = new Set(['section', 'div', 'nav', 'article', 'aside', 'header', 'body'])
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
    // Semantic/class hints only count on containers: a `p.toc` line or `a[epub:type=toc]` is not a section.
    const container = SECTION_CONTAINERS.has(el.localName)
    if (el.localName === 'h1' || (container && (SECTION_TYPES.test(type) || SECTION_CLASSES.test(cls)))) before.add(el)
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
  onSections?: (s: Section[]) => void
  /** Fires when a different chapter view becomes current, and after every relayout. */
  onView?: (v: View) => void
  /** Return true to take a key event (keydown or keyup, window or book) away from page turning. */
  keyHook?: (e: KeyboardEvent) => boolean
  /** Return true when a tap on book text was handled (e.g. the guide moved its pointer there). */
  tapHook?: (v: View, clientX: number, clientY: number) => boolean
  /** Press-and-hold on book text (no movement for HOLD_MS): return true to take the gesture; then
   *  `move` gets the finger's offset from where it pressed and `end` the release. */
  holdHook?: { start: (v: View, clientX: number, clientY: number) => boolean; move: (dx: number, dy: number) => void; end: () => void }
  /** Last touches to a chapter's DOM before it is laid out (e.g. chapter openers). */
  prepareHook?: (doc: Document, index: number) => void
  readonly port: HTMLDivElement // clipped, centered strip the iframes slide in (overlays live here too)
  private host: HTMLElement
  private book: Book
  private settings: Settings
  private view?: View
  private page = 0
  private busy = false
  private L = { V: 0, H: 0, t: 0, cols: 1, colW: 0, gap: 0, step: 0, left: 0 }
  private reserve = 0 // extra bottom margin (e.g. room for pinned controls)
  private reserveTop = 0 // extra top margin
  private starts: number[] = [] // cumulative spine weights, for whole-book progress
  private marks: Mark[] = [] // every TOC entry on the progress axis
  private wheelLock = 0
  private queued: 0 | 1 | -1 = 0 // one turn asked for while another was still moving
  private reduce = matchMedia('(prefers-reduced-motion: reduce)')
  private wheelAcc = 0
  private ro: ResizeObserver
  private resizeTimer = 0
  private onKey = (e: KeyboardEvent) => this.key(e)
  private onKeyUp = (e: KeyboardEvent) => { this.keyHook?.(e) }

  constructor(host: HTMLElement, book: Book, settings: Settings) {
    this.host = host
    this.book = book
    this.settings = settings
    const total = book.spine.reduce((a, s) => a + s.size, 0)
    let acc = 0
    this.starts = book.spine.map(s => { const st = acc / total; acc += s.size; return st }).concat(1)
    this.port = document.createElement('div')
    this.port.className = 'pubre-port'
    host.append(this.port)
    // Taps and wheel in the outer margins (outside the port) still turn pages.
    host.addEventListener('click', e => { if (e.target === host || e.target === this.port) this.tap(e.clientX) })
    host.addEventListener('wheel', e => this.wheel(e), { passive: true })
    this.placeToc()
    this.ro = new ResizeObserver(() => {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = window.setTimeout(() => this.relayout(), 120)
    })
    this.ro.observe(host)
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKeyUp)
  }

  destroy() {
    this.ro.disconnect()
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKeyUp)
    this.host.replaceChildren()
  }

  // ---------- public navigation ----------

  async open(index: number, fraction = 0) {
    await this.show(index, v => Math.round(fraction * (v.pages - 1)))
  }

  /** Open at a CFI (exact word); falls back to the chapter start if it no longer resolves. */
  async openCfi(cfi: string) {
    const index = this.book.cfiSpineIndex(cfi)
    if (index < 0) return this.open(0)
    await this.show(index, v => {
      try { const r = cfiToRange(v.doc, cfi).getClientRects()[0]; return r ? this.pageOfRect(r) : 0 } catch { return 0 }
    })
  }

  // ---------- for overlays (reading guide, lenses) ----------

  get current() { return this.view }
  get currentPage() { return this.page }
  get isBusy() { return this.busy }
  /** Horizontal offset of a view's iframe inside the port (its translateX). */
  xOf(v: View) { return this.currentX(v) }
  /** Page (screen) a client rect inside the book document falls on. */
  pageOf(r: DOMRect) { return this.pageOfRect(r) }
  /** The left edge of the column holding document x, in port coordinates. */
  columnLeft(v: View, x: number) { const { gap, colW } = this.L, c = colW + gap; return gap / 2 + Math.floor((x - gap / 2 + 1) / c) * c + this.currentX(v) }
  /** Slide to a page of the current chapter. */
  async showPage(page: number) {
    const v = this.view
    if (!v || this.busy || page === this.page || page < 0 || page >= v.pages) return
    await this.slide(page)
  }
  /** Index of the first word on the current page (binary search on word rects). */
  firstWordOnPage(v = this.view, page = this.page) {
    if (!v) return 0
    const ws = v.ix.words, left = page * this.L.step
    let lo = 0, hi = ws.length - 1, ans = ws.length - 1
    const x = (k: number) => { const r = v.doc.createRange(); r.setStart(ws[k].sn, ws[k].so); r.setEnd(ws[k].en, ws[k].eo); return r.getClientRects()[0]?.left ?? 0 }
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (x(mid) >= left - 2) { ans = mid; hi = mid - 1 } else lo = mid + 1 }
    return ans
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
    if (v && this.busy) this.queued = 1
    if (!v || this.busy) return
    if (this.page < v.pages - 1) return this.slide(this.page + 1)
    if (v.index < this.book.spine.length - 1) return this.turnChapter(1)
    this.bounce(-1)
  }

  async prev() {
    const v = this.view
    if (v && this.busy) this.queued = -1
    if (!v || this.busy) return
    if (this.page > 0) return this.slide(this.page - 1)
    if (v.index > 0) return this.turnChapter(-1)
    this.bounce(1)
  }

  /** Re-measure after the book DOM changed (e.g. italic highlights), keeping your place. */
  refresh() { const v = this.view; if (!v) return; v.ix = indexDocument(v.doc, this.book.metadata.language || 'en'); this.relayout() }

  /** Book progress (0..1) at the start of a spine item (for marks on the capsule). */
  progressAt(index: number) { return this.starts[Math.max(0, Math.min(index, this.starts.length - 1))] ?? 0 }

  /** Keep `px` free at the bottom of every page (relayouts, keeping your place). */
  setReserve(px: number, top = 0) { if (px === this.reserve && top === this.reserveTop) return; this.reserve = px; this.reserveTop = top; this.relayout() }

  setSettings(s: Settings) {
    this.settings = s
    this.relayout()
  }

  // ---------- layout ----------

  private measure() {
    const V = this.host.clientWidth, H = this.host.clientHeight, s = this.settings
    const cols = s.spread === 'auto' && V >= 900 && V > H * 1.1 ? 2 : 1
    // Measure ≈ 36em (60–75 characters); margins setting trades measure for whitespace.
    const maxCol = Math.round(16 * s.fontScale / 100 * (s.measure === 'short' ? 22 : [40, 36, 31][s.margin]) * (1 + (s.letterSpacing || 0) * 4))
    const outer = Math.max(16, Math.round(V * [0.04, 0.06, 0.09][s.margin]))
    const gap = cols === 2 ? Math.min(96, Math.max(48, Math.round(V * 0.045))) : 2 * outer
    const colW = Math.floor(Math.min(maxCol, (V - 2 * outer - (cols - 1) * gap) / cols))
    const step = cols * (colW + gap) // one screen of columns, incl. half a gap each side
    const t = Math.round(Math.min(72, Math.max(36, H * 0.065)))
    this.L = { V, H, t, cols, colW, gap, step, left: Math.round((V - step) / 2) }
    const fade = `${Math.min(gap / 2, 10)}px` // enough to soften neighbouring pages in a slide; the margin stays clear for the place flag
    Object.assign(this.port.style, {
      position: 'absolute', top: '0', bottom: '0', overflow: 'hidden', left: this.L.left + 'px', width: step + 'px',
      maskImage: `linear-gradient(90deg, transparent, #000 ${fade}, #000 calc(100% - ${fade}), transparent)`,
    })
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
    const { H, t, cols, gap } = this.L
    // A cover or plate (an image and next to no text) on a two-column spread: one column as wide as
    // the spread, so the picture is centred instead of sitting in the left half.
    const solo = cols > 1 && (v.doc.body?.textContent ?? '').trim().length < 40 && !!v.doc.querySelector('img, svg, image')
    const colW = solo ? cols * this.L.colW + (cols - 1) * gap : this.L.colW
    this.style(v.doc, 'pubre-user', bookCss(this.settings, H - 2 * t))
    this.style(v.doc, 'pubre-marks', marksCss(resolveTheme(this.settings.palette, this.settings.mode), this.settings.inkRead))
    this.style(v.doc, 'pubre-layout', `
html { box-sizing: content-box !important; margin: 0 !important; max-width: none !important;
  width: ${solo ? colW : cols * colW + (cols - 1) * gap}px !important; height: ${H - 2 * t - this.reserve - this.reserveTop}px !important; padding: ${t + this.reserveTop}px ${gap / 2}px ${t + this.reserve}px !important;
  column-width: ${colW}px !important; column-gap: ${gap}px !important; column-fill: auto !important;
  overflow: hidden !important; touch-action: none; }${solo ? `
img, svg { display: block !important; margin-left: auto !important; margin-right: auto !important; }
body > div, body > section, body > p, body > figure { text-align: center !important; }` : ''}`)
  }

  private paginate(v: View) {
    const { step, cols, colW, gap } = this.L
    v.iframe.style.width = step + 'px'
    v.iframe.style.height = this.L.H + 'px'
    const ncols = Math.max(1, Math.ceil((v.doc.documentElement.scrollWidth - gap / 2) / (colW + gap)))
    v.pages = Math.ceil(ncols / cols)
    v.iframe.style.width = v.pages * step + 'px'
  }

  private pageOfRect(r: DOMRect) {
    return Math.max(0, Math.floor((r.left + 1) / this.L.step))
  }

  /** Text position at the top-left of the current page, used to keep place across relayouts. */
  private anchor(): Range | null {
    const v = this.view
    if (!v) return null
    const x = this.page * this.L.step + this.L.gap / 2 + 4, y = this.L.t + this.reserveTop + 12
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
    this.setX(v, -this.page * this.L.step)
    this.emit()
    this.onView?.(v)
  }

  // ---------- views ----------

  private async load(index: number): Promise<View> {
    const iframe = document.createElement('iframe')
    // allow-scripts is only so WebKit delivers our listeners; book scripts are stripped + CSP-blocked.
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts')
    iframe.setAttribute('title', this.book.metadata.title)
    iframe.className = 'pubre-view'
    iframe.style.cssText = `position:absolute;inset:0 auto auto 0;z-index:1;border:0;opacity:0;width:${this.L.step}px;height:${this.L.H}px`
    this.port.append(iframe)
    const loaded = new Promise(r => iframe.addEventListener('load', r, { once: true }))
    iframe.src = await this.book.chapterUrl(index)
    await loaded
    const doc = iframe.contentDocument!
    if (!doc.documentElement.getAttribute('lang') && this.book.metadata.language) {
      doc.documentElement.setAttribute('lang', this.book.metadata.language) // enables hyphenation
    }
    const v: View = { iframe, doc, index, pages: 1, ix: { words: [], sentences: [], blocks: [] }, marks: new Marks(doc) }
    this.inject(v)
    sectionBreaks(doc)
    this.prepareHook?.(doc, index)
    this.bind(v)
    const timeout = new Promise(r => setTimeout(r, 1500))
    await Promise.race([Promise.allSettled([doc.fonts?.ready, ...Array.from(doc.images, i => i.decode())]), timeout])
    this.paginate(v)
    v.ix = indexDocument(doc, this.book.metadata.language || 'en')
    return v
  }

  /** Replace the current view (jumps, first open): crossfade, no slide. */
  private async show(index: number, pageFor: (v: View) => number) {
    if (this.busy) return
    this.busy = true
    try {
      if (!this.L.step) this.measure()
      const old = this.view
      const v = old && old.index === index ? old : await this.load(index)
      this.page = Math.max(0, Math.min(v.pages - 1, pageFor(v)))
      this.setX(v, -this.page * this.L.step)
      this.view = v
      if (v !== old) {
        await v.iframe.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' }).finished
        v.iframe.style.opacity = '1'
        old?.iframe.remove()
      }
      this.emit()
      if (v !== old) this.onView?.(v)
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
    if (this.reduce.matches) return
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
    try { await this.move(v, -page * this.L.step) } finally { this.busy = false; this.flush() }
  }

  private async turnChapter(dir: 1 | -1) {
    const old = this.view!
    this.busy = true
    try {
      const v = await this.load(old.index + dir)
      const start = dir > 0 ? 0 : v.pages - 1
      const shift = dir * this.L.step
      const oldX = this.currentX(old)
      this.setX(v, -start * this.L.step + shift + (oldX + this.page * this.L.step)) // follow any drag offset
      v.iframe.style.opacity = '1'
      this.view = v
      this.page = start
      this.emit()
      await Promise.all([this.move(old, -this.pageIndexOf(old) * this.L.step - shift), this.move(v, -start * this.L.step)])
      old.iframe.remove()
      this.onView?.(v)
    } finally {
      this.busy = false
      this.flush()
    }
  }

  private flush() { const d = this.queued; this.queued = 0; if (d > 0) this.next(); else if (d < 0) this.prev() }

  private pageIndexOf(v: View) {
    return Math.round(-new DOMMatrix(v.iframe.style.transform).m41 / this.L.step)
  }

  private bounce(dir: number) {
    const v = this.view!
    const x = -this.page * this.L.step
    v.iframe.animate(
      [{ transform: `translate3d(${x}px,0,0)` }, { transform: `translate3d(${x + dir * 36}px,0,0)` }, { transform: `translate3d(${x}px,0,0)` }],
      { duration: 360, easing: 'ease-out' },
    )
  }

  // ---------- input ----------

  private key(e: KeyboardEvent) {
    if (this.keyHook?.(e)) return
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
    if ((e.target as HTMLElement)?.closest?.('input, textarea, select, dialog[open], [role=slider]')) return
    if (['ArrowRight', 'PageDown', ' '].includes(e.key) && !e.shiftKey) { e.preventDefault(); this.next() }
    else if (['ArrowLeft', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); this.prev() }
  }

  private tap(clientX: number) {
    const x = clientX - this.host.getBoundingClientRect().left
    const zone: Zone = x < this.L.V * 0.28 ? 'left' : x > this.L.V * 0.72 ? 'right' : 'center'
    if (zone === 'left') this.prev()
    else if (zone === 'right') this.next()
    this.onTap?.(zone)
  }

  private wheel(e: WheelEvent) {
    this.wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (Date.now() < this.wheelLock || Math.abs(this.wheelAcc) < 40) return
    this.wheelLock = Date.now() + 450
    ;(this.wheelAcc > 0 ? this.next() : this.prev())
    this.wheelAcc = 0
  }

  private bind(v: View) {
    const doc = v.doc
    doc.addEventListener('keydown', this.onKey)
    doc.addEventListener('keyup', this.onKeyUp)

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

    doc.addEventListener('wheel', e => this.wheel(e), { passive: true })

    // Tap zones (any pointer) + drag-to-turn (touch/pen) + press-and-hold (holdHook).
    let start: { x: number; y: number; t: number; id: number; touch: boolean } | null = null
    let dragging = false, holding = false, holdT = 0
    const root = doc.documentElement as HTMLElement
    const selectable = (on: boolean) => { root.style.userSelect = root.style.webkitUserSelect = on ? '' : 'none' }
    doc.addEventListener('contextmenu', e => { if (holding || holdT) e.preventDefault() }) // Android's long-press menu
    doc.addEventListener('pointerdown', e => {
      if (!e.isPrimary || this.busy) return
      start = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId, touch: e.pointerType !== 'mouse' }
      dragging = false
      clearTimeout(holdT); holdT = 0
      if (this.holdHook && e.pointerType !== 'mouse' && !(e.target as Element).closest?.('a[href]')) { // a mouse press-pause-drag is a selection; Space holds on desktop
        const s0 = start
        holdT = window.setTimeout(() => {
          holdT = 0
          if (start !== s0 || dragging || doc.getSelection()?.toString()) return
          if (!this.holdHook!.start(v, s0.x, s0.y)) return
          holding = true
          selectable(false); doc.getSelection()?.removeAllRanges()
          try { root.setPointerCapture(s0.id) } catch { /* pointer already gone */ }
        }, HOLD_MS)
      }
    })
    doc.addEventListener('pointermove', e => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x, dy = e.clientY - start.y
      if (holding) { this.holdHook?.move(dx, dy); return }
      if (holdT && Math.hypot(dx, dy) > 8) { clearTimeout(holdT); holdT = 0 }
      if (!start.touch || this.view !== v) return
      if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2 && !doc.getSelection()?.toString()) dragging = true
      if (!dragging) return
      const atEdge = (dx > 0 && this.page === 0 && v.index === 0) || (dx < 0 && this.page === v.pages - 1 && v.index === this.book.spine.length - 1)
      this.setX(v, -this.page * this.L.step + (atEdge ? dx * 0.3 : dx))
    })
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x, dy = e.clientY - start.y, dt = Date.now() - start.t
      start = null
      clearTimeout(holdT); holdT = 0
      if (holding) { holding = false; selectable(true); this.holdHook?.end(); return }
      if (dragging) {
        dragging = false
        const fast = Math.abs(dx) / dt > 0.4
        if (e.type !== 'pointercancel' && (Math.abs(dx) > this.L.step * 0.18 || fast)) {
          dx < 0 ? this.next() : this.prev()
        } else {
          this.busy = true
          this.move(v, -this.page * this.L.step, 260).finally(() => { this.busy = false })
        }
        return
      }
      if (e.type === 'pointercancel' || Math.hypot(dx, dy) > 8 || dt > 600) return
      if ((e.target as Element).closest?.('a[href]') || doc.getSelection()?.toString()) return
      if (this.tapHook?.(v, e.clientX, e.clientY)) return
      this.tap(v.iframe.getBoundingClientRect().left + e.clientX)
    }
    doc.addEventListener('pointerup', end)
    doc.addEventListener('pointercancel', end)
  }

  // ---------- reporting ----------

  /** Place every TOC entry on the progress axis, using the fragment's offset inside its file.
   *  Gives precise chapter labels even when one spine file holds many chapters. */
  private async placeToc() {
    const texts = new Map<number, string>()
    const at = async (href: string) => {
      const i = this.book.spineIndex(href)
      if (i < 0) return -1
      const [, frag] = href.split('#')
      let f = 0
      if (frag) {
        if (!texts.has(i)) texts.set(i, await this.book.zip.text(this.book.spine[i].href).catch(() => ''))
        const t = texts.get(i)!
        const pos = t.search(new RegExp(`id=["']${frag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`))
        f = pos > 0 ? pos / t.length : 0
      }
      return this.starts[i] + (this.starts[i + 1] - this.starts[i]) * f
    }
    const marks: Mark[] = []
    const walk = async (items: TocItem[]) => {
      for (const t of items) {
        if (t.href) marks.push({ label: tidy(t.label), at: await at(t.href), index: this.book.spineIndex(t.href), frag: decodeURIComponent(t.href.split('#')[1] ?? '') })
        await walk(t.children)
      }
    }
    await walk(this.book.toc)
    this.marks = marks.filter(m => m.at >= 0).sort((a, b) => a.at - b.at)
    const sections: Section[] = []
    for (const t of this.book.toc) {
      const start = t.href ? await at(t.href) : -1
      if (start >= 0 && !sections.some(s => s.start === start)) sections.push({ label: t.label, href: t.href, start })
    }
    this.onSections?.(sections.sort((a, b) => a.start - b.start))
    this.emit()
  }

  private emit() {
    const v = this.view
    if (!v) return
    const fraction = v.pages > 1 ? this.page / (v.pages - 1) : 0
    const w = this.starts[v.index + 1] - this.starts[v.index]
    const progress = this.starts[v.index] + w * ((this.page + 1) / v.pages)
    const top = this.starts[v.index] + w * (this.page / v.pages) // position of this page's first line
    // In the chapter on screen, a TOC entry sits where its anchor element actually is (file offsets drift).
    const pos = (m: Mark) => {
      if (m.index !== v.index) return m.at
      const el = m.frag ? v.doc.getElementById(m.frag) : null
      return el ? this.starts[v.index] + w * (this.pageOfRect(el.getBoundingClientRect()) / v.pages) : m.frag ? m.at : this.starts[v.index]
    }
    const placed = this.marks.map(m => ({ label: m.label, at: pos(m) }))
    const here = placed.findLast(m => m.at <= top + w / v.pages * 0.5)
    const chapter = here?.label ?? ''
    let cfi: string | undefined
    const k = v.ix.words.length ? this.firstWordOnPage(v) : -1
    if (k >= 0) try { const wd = v.ix.words[k]; cfi = this.book.cfiAt(v.index, wd.sn, wd.so) } catch { /* unresolvable node */ }
    const chapterEnd = placed.find(m => m.at > top + w / v.pages * 0.5)?.at ?? 1
    // Pages of this section within this file (a section that began in an earlier file counts from here).
    const pageAt = (at: number) => Math.round((at - this.starts[v.index]) / w * v.pages)
    const s0 = here ? Math.max(0, Math.min(this.page, pageAt(here.at))) : 0, s1 = Math.max(s0 + 1, Math.min(v.pages, pageAt(chapterEnd)))
    this.onRelocate?.({ index: v.index, page: this.page, pages: v.pages, fraction, progress, chapter, cfi, top, chapterEnd, cpage: this.page - s0, cpages: Math.max(this.page - s0 + 1, s1 - s0) })
  }
}

interface Mark { label: string; at: number; index: number; frag: string }
/** TOC labels sometimes carry an illustration caption before the chapter ("He rode a black horse. CHAPTER III."). */
const tidy = (label: string) => label.match(/\bCHAPTER\s*[IVXLCDM\d]+\b.*/i)?.[0] ?? label
