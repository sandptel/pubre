// Reading guide: a pointer that moves at your pace.
// One click (the guide button, Space or G) starts it moving. Space or the pad: tap to pause or play,
// double-tap for the sentence start, hold to glide only while held. Arrows / vim motions step (and
// teach the pace). Contrast does the focusing (see marks.ts). The pointer element lives
// in the paginator's port, *behind* the transparent book iframe, so the book DOM is never touched.
import type { Paginator, View } from './paginator.ts'
import type { Settings } from './settings.ts'
import { MAX_WPM, wordTime } from './pacing.ts'

export interface GuideState { active: boolean; gliding: boolean; wpm: number }
type Pending = 'start' | 'end' | null

const DOUBLE_TAP = 260 // ms; a second tap inside this window means "back to sentence start"
const HOLD = 220       // ms; longer than this is a hold (glide), shorter is a tap
const LONG_SENTENCE = 40 // words; longer sentences focus on the clause instead

export class Guide {
  onState?: (s: GuideState) => void
  onPace?: (wpm: number) => void
  onArrive?: (v: View, k: number) => void
  onToast?: (msg: string) => void
  active = false
  gliding = false
  private pag: Paginator
  private s: Settings
  private el: HTMLDivElement
  private v?: View
  private i = 0
  private pending: Pending = null
  private resume = false
  private moving = false
  private timer = 0
  private lastTap = 0
  private playBefore = false // play state before the first of a double-tap
  holding = false            // the current glide lasts only while Space / the pad is held
  private transientHold = false // the hold also switched the guide on: release switches it off
  private rate = 1           // shuttle while holding: >1 faster, 0 still, <0 backwards
  private lastStep = 0
  private spaceDown = 0
  private holdT = 0
  private prevTop: number | null = null
  private lastArrive = -1
  private reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  private stop = () => this.stopGlide()
  private onVis = () => { if (document.hidden) this.stopGlide() }

  constructor(pag: Paginator, settings: Settings) {
    this.pag = pag
    this.s = settings
    this.el = document.createElement('div')
    this.el.className = 'pubre-pointer'
    this.el.setAttribute('aria-hidden', 'true')
    pag.port.prepend(this.el)
    // Dead-man's switch: anything that takes attention away stops the glide.
    addEventListener('blur', this.stop)
    document.addEventListener('visibilitychange', this.onVis)
  }

  destroy() {
    this.stopGlide()
    removeEventListener('blur', this.stop)
    document.removeEventListener('visibilitychange', this.onVis)
    this.el.remove()
  }

  setSettings(s: Settings) {
    this.s = s
    if (!s.guide && this.active) this.deactivate()
    this.el.className = `pubre-pointer p-${s.pointer}${this.active ? ' on' : ''}`
    if (this.active) { this.prevTop = null; this.render(0) }
  }

  /** The paginator switched chapter or re-laid out. */
  view(v: View) {
    const changed = v !== this.v
    this.v = v
    if (!this.active) return
    if (changed) {
      this.i = this.pending === 'end' ? Math.max(0, v.ix.words.length - 1) : this.pending === 'start' ? 0 : this.pag.firstWordOnPage(v)
      this.pending = null
      this.lastArrive = -1
    }
    this.prevTop = null
    this.render(0)
    if (this.resume) { this.resume = false; this.gliding = true; this.tick() }
  }

  toggle() { this.active ? this.deactivate() : this.activate() }

  activate() {
    if (this.active || !this.s.guide) return
    this.v = this.pag.current
    if (!this.v || !this.v.ix.words.length) return
    this.active = true
    this.i = this.pag.firstWordOnPage(this.v)
    this.el.className = `pubre-pointer p-${this.s.pointer} on`
    this.prevTop = null
    this.render(0)
    this.emit()
  }

  deactivate() {
    this.stopGlide()
    this.active = false
    this.el.classList.remove('on')
    this.v?.marks.clear('c-')
    this.emit()
  }

  /** One click: guide on and moving. */
  start() { this.activate(); this.startGlide() }

  // ---------- touch / mouse pad ----------
  holdStart() {
    if (!this.active) { this.transientHold = true; this.activate() }
    if (!this.gliding) { this.holding = true; this.startGlide() }
  }
  holdEnd() {
    this.setRate(1)
    if (this.transientHold) { this.transientHold = false; this.deactivate(); return }
    if (this.holding) { this.holding = false; this.stopGlide(); this.lastTap = 0 }
  }
  /** Slide up while holding: keep gliding after release. */
  lock() { this.transientHold = false; this.holding = false; this.onToast?.('Locked · tap to pause') }
  setRate(r: number) {
    const flip = Math.sign(r) !== Math.sign(this.rate) || (Math.abs(r) < 0.15) !== (Math.abs(this.rate) < 0.15)
    this.rate = r
    if (flip && this.gliding) { clearTimeout(this.timer); this.tick() }
  }
  /** A tap on the pad: same as tapping Space (play/pause; double-tap = sentence start). */
  padTap() { if (!this.active) { this.start(); return } this.tap(performance.now()) }
  sentenceStart() { this.activate(); this.toSentenceStart() }

  // ---------- keys (called for keydown and keyup, from the app and the book) ----------
  key(e: KeyboardEvent): boolean {
    if ((e.target as HTMLElement)?.closest?.('input, textarea, select, dialog[open]')) return false
    if (this.s.guideStyle === 'stage' && !this.active) return false
    if (e.metaKey || e.ctrlKey && !['ArrowUp', 'ArrowDown'].includes(e.key)) return false
    if (e.type === 'keyup') {
      if (e.key !== ' ' || !this.spaceDown) return false
      e.preventDefault(); clearTimeout(this.holdT); this.spaceDown = 0
      if (this.holding) this.holdEnd(); else this.tap(performance.now())
      return true
    }
    if ((e.key === 'g' || e.key === 'G') && !e.altKey) { if (!this.s.guide) return false; e.preventDefault(); this.active ? this.deactivate() : this.start(); return true }
    if (!this.active) {
      if (e.key !== ' ' || e.shiftKey || e.repeat || !this.s.guide) return false
      e.preventDefault(); this.start(); this.spaceDown = 0 // Space starts the guide moving; its keyup is ignored
      return true
    }
    if (e.key === ' ') {
      e.preventDefault()
      if (e.shiftKey) { this.stopGlide(); this.go(this.i - 1); return true }
      if (e.repeat || this.spaceDown) return true
      this.spaceDown = performance.now()
      this.holdT = window.setTimeout(() => this.holdStart(), HOLD)
      return true
    }
    const ix = this.v!.ix, w = ix.words[this.i]
    const act: Record<string, () => void> = {
      ArrowRight: () => (e.altKey ? this.speed(1.1) : this.step()), w: () => this.step(), l: () => this.step(), e: () => this.go(this.i + 1),
      ArrowLeft: () => (e.altKey ? this.speed(1 / 1.1) : this.go(this.i - 1)), b: () => this.go(this.i - 1), h: () => this.go(this.i - 1),
      ArrowDown: () => (e.ctrlKey || e.shiftKey ? this.paragraph(1) : this.line(1)), j: () => this.line(1),
      ArrowUp: () => (e.ctrlKey || e.shiftKey ? this.paragraph(-1) : this.line(-1)), k: () => this.line(-1),
      ')': () => { if (w.s < ix.sentences.length - 1) this.go(ix.sentences[w.s + 1].a) }, '(': () => this.toSentenceStart(),
      '}': () => this.paragraph(1), '{': () => this.paragraph(-1),
      '0': () => this.go(this.lineSpan(this.i)[0]), Home: () => this.go(this.lineSpan(this.i)[0]),
      $: () => this.go(this.lineSpan(this.i)[1]), End: () => this.go(this.lineSpan(this.i)[1]),
      p: () => { this.s = { ...this.s, step: this.s.step === 'word' ? 'phrase' : 'word' }; this.onToast?.(this.s.step === 'word' ? 'Stepping by word' : 'Stepping by phrase'); this.render(0) },
      '[': () => this.speed(1 / 1.1), ']': () => this.speed(1.1), Escape: () => this.deactivate(),
    }
    const f = act[e.key]
    if (!f) return ['PageDown', 'PageUp'].includes(e.key) ? false : e.key.startsWith('Arrow')
    e.preventDefault()
    if (!['[', ']'].includes(e.key) && !e.altKey) this.stopGlide()
    f()
    return true
  }

  /** A tap on book text while guiding puts the pointer on that word. */
  tapWord(v: View, x: number, y: number): boolean {
    if (!this.active || v !== this.v) return false
    const d = v.doc as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }
    const pos = d.caretPositionFromPoint?.(x, y), r = pos ? null : d.caretRangeFromPoint?.(x, y)
    const node = pos?.offsetNode ?? r?.startContainer, off = pos?.offset ?? r?.startOffset ?? 0
    if (!node) return false
    const k = v.ix.words.findIndex(w => (w.sn === node && off >= w.so && off <= (w.en === node ? w.eo : Infinity)) || (w.en === node && w.sn !== node && off <= w.eo))
    if (k < 0) return false
    const wr = this.rect(k) // a tap in the margin (no word within a line) is not a pointer move: it shows the controls
    if (Math.abs(y - (wr.top + wr.height / 2)) > wr.height || x < wr.left - wr.height * 2 || x > wr.right + wr.height * 2) return false
    this.stopGlide(); this.go(k)
    return true
  }

  // ---------- motion ----------
  private next(from: number) {
    if (this.s.step === 'word') return from + 1
    const ws = this.v!.ix.words
    let k = from
    for (let c = 1; c < 3 && !ws[k].pause && ws[k + 1]; c++) k++
    return k + 1
  }
  // Glide is a ceiling, not a pacer (reading research): ≤ 350 wpm, with smart pauses for
  // punctuation and position (see pacing.ts).
  private wordMs(k: number) { return wordTime(this.v!.ix, k, this.s.wpm) }
  private startGlide() { if (this.gliding) return; this.activate(); if (!this.active) return; this.gliding = true; this.emit(); this.tick() }
  stopGlide() { this.holding = false; this.rate = 1; if (!this.gliding) return; this.gliding = false; clearTimeout(this.timer); this.emit() }
  private tick() {
    if (!this.gliding || !this.v) return
    if (Math.abs(this.rate) < 0.15) { this.timer = window.setTimeout(() => this.tick(), 120); return } // held still
    const ws = this.v.ix.words, back = this.rate < 0, n = back ? this.i - 1 : this.next(this.i)
    let ms = 0
    if (back) ms = this.wordMs(Math.max(0, n))
    else for (let k = this.i; k < Math.min(n, ws.length); k++) ms += this.wordMs(k)
    this.timer = window.setTimeout(async () => { if (!this.gliding) return; await this.go(n, true); if (this.gliding && !this.resume) this.tick() }, ms / Math.abs(this.rate))
  }
  /** Space / pad tap: play or pause; a quick second tap undoes that and goes to the sentence start. */
  private tap(t: number) {
    if (t - this.lastTap < DOUBLE_TAP) {
      this.lastTap = 0
      this.toSentenceStart(); this.onToast?.('Back to the start of the sentence')
      if (this.playBefore) this.startGlide(); else this.stopGlide()
      return
    }
    this.playBefore = this.gliding; this.lastTap = t
    if (this.gliding) this.stopGlide(); else this.startGlide()
  }
  /** → / l / w: one step; steps in a steady rhythm teach the pace. */
  private step() {
    const t = performance.now()
    if (this.lastStep && t - this.lastStep < 3000) { // longer gaps are pauses, not pace
      const sample = this.s.wpm * this.wordMs(this.i) / (t - this.lastStep) // your time on this word vs. expected
      if (sample > 90 && sample < 900) {
        this.s = { ...this.s, wpm: Math.round(Math.max(120, Math.min(MAX_WPM, this.s.wpm * 0.8 + sample * 0.2))) }
        this.onPace?.(this.s.wpm); this.emit()
      }
    }
    this.lastStep = t
    this.go(this.next(this.i))
  }
  private speed(f: number) { this.s = { ...this.s, wpm: Math.round(Math.max(120, Math.min(MAX_WPM, this.s.wpm * f))) }; this.onPace?.(this.s.wpm); this.onToast?.(`${this.s.wpm} wpm`); this.emit() }
  private toSentenceStart() { const ix = this.v!.ix, w = ix.words[this.i], s = ix.sentences[w.s]; this.go(this.i > s.a ? s.a : w.s > 0 ? ix.sentences[w.s - 1].a : 0) }
  private paragraph(dir: 1 | -1) {
    const ix = this.v!.ix, b = ix.words[this.i].b, blk = ix.blocks[b]
    if (dir > 0) { if (b < ix.blocks.length - 1) this.go(ix.blocks[b + 1].a) }
    else this.go(this.i > blk.a ? blk.a : b > 0 ? ix.blocks[b - 1].a : 0)
  }
  private line(dir: 1 | -1) { const [a, b] = this.lineSpan(this.i), k = dir > 0 ? b + 1 : a - 1; if (this.v!.ix.words[k]) this.go(this.lineSpan(k)[0]); else this.go(k) }

  /** Move to word n, turning the page (or chapter) first if it lies elsewhere. */
  private async go(n: number, glide = false) {
    const v = this.v
    if (!v || this.moving) return
    const ws = v.ix.words
    if (n > ws.length - 1 || n < 0) {
      this.pending = n < 0 ? 'end' : 'start'
      if (this.gliding) { this.resume = true; clearTimeout(this.timer) }
      this.el.classList.remove('on')
      if (n < 0) await this.pag.prev(); else await this.pag.next()
      this.el.classList.add('on')
      return
    }
    this.i = n
    const page = this.pag.pageOf(this.rect(n))
    if (page !== this.pag.currentPage) {
      this.moving = true
      this.el.classList.remove('on')
      await this.pag.showPage(page)
      this.moving = false
      this.prevTop = null
      this.render(0)
      this.el.classList.add('on')
      return
    }
    this.render(glide ? Math.min(480, this.wordMs(n) * (this.s.step === 'phrase' ? 1.6 : 0.8)) : 300, glide)
  }

  // ---------- drawing ----------
  private range(a: number, b = a) {
    const ws = this.v!.ix.words, r = this.v!.doc.createRange()
    r.setStart(ws[a].sn, ws[a].so); r.setEnd(ws[b].en, ws[b].eo); return r
  }
  private rect(k: number) { return this.range(k).getClientRects()[0] ?? new DOMRect() }
  private lineSpan(k: number): [number, number] {
    const ws = this.v!.ix.words, t = this.rect(k).top
    let a = k, b = k
    while (ws[a - 1] && Math.abs(this.rect(a - 1).top - t) < 4) a--
    while (ws[b + 1] && Math.abs(this.rect(b + 1).top - t) < 4) b++
    return [a, b]
  }
  private focusSpan(k: number): [number, number] {
    const ix = this.v!.ix, w = ix.words[k]
    if (this.s.focus === 'line') return this.lineSpan(k)
    if (this.s.focus === 'paragraph') return [ix.blocks[w.b].a, ix.blocks[w.b].b]
    const s = ix.sentences[w.s]
    if (s.b - s.a < LONG_SENTENCE) return [s.a, s.b]
    let a = k, b = k
    while (a > s.a && !ix.words[a - 1].pause) a--
    while (b < s.b && !ix.words[b].pause) b++
    while (b - a < 6 && (a > s.a || b < s.b)) {
      if (a > s.a) { a--; while (a > s.a && !ix.words[a - 1].pause) a-- }
      if (b - a < 6 && b < s.b) { b++; while (b < s.b && !ix.words[b].pause) b++ }
    }
    return [a, b]
  }

  private render(dur = 300, glide = false) {
    const v = this.v
    if (!this.active || !v || !v.ix.words.length) return
    const k = this.i, j = this.s.step === 'phrase' ? Math.min(v.ix.words.length - 1, this.next(k) - 1) : k
    const r0 = this.rect(k), r1 = this.rect(j)
    const r = Math.abs(r1.top - r0.top) < 4 ? new DOMRect(r0.left, r0.top, r1.right - r0.left, r0.height) : r0
    const newLine = this.prevTop !== null && Math.abs(r0.top - this.prevTop) > 4
    this.prevTop = r0.top
    if (this.reduce) dur = 0
    else if (newLine) { this.el.animate([{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: Math.min(260, dur || 260) }); dur = 0 }
    const x = r.left + this.pag.xOf(v), y = r.top, w = r.width, h = r.height
    const g = ({ word: [x - 3, y - 1, w + 6, h + 2], outline: [x - 3, y - 1, w + 6, h + 2], underline: [x, y + h + 1, w, 3], dot: [x + w / 2 - 3, y + h + 2, 6, 6] } as const)[this.s.pointer]
    // Calm motion: position settles barely (≈0.5%), size eases monotonically, glides ease in-out.
    const move = glide ? 'cubic-bezier(.45,0,.25,1)' : 'cubic-bezier(.22,1.12,.36,1)', size = 'cubic-bezier(.25,.8,.25,1)'
    this.el.style.transition = dur ? `transform ${dur}ms ${move}, width ${Math.round(dur * 0.85)}ms ${size}, height ${Math.round(dur * 0.85)}ms ${size}, opacity .2s` : 'opacity .2s'
    this.el.style.transform = `translate(${g[0]}px, ${g[1]}px)`
    this.el.style.width = g[2] + 'px'
    this.el.style.height = g[3] + 'px'
    this.paintFocus()
    if (k !== this.lastArrive) { this.lastArrive = k; this.onArrive?.(v, k) }
  }

  /** Contrast levels as disjoint ranges (no overlapping highlights; see marks.ts). */
  private paintFocus() {
    const v = this.v!, ix = v.ix, ws = ix.words, m = v.marks, k = this.i, w = ws[k]
    const [fa, fb] = this.focusSpan(k), blk = ix.blocks[w.b], pa = blk.a, pb = blk.b, last = ws[ws.length - 1]
    const span = (sn: Node, so: number, en: Node, eo: number) => { const r = v.doc.createRange(); r.setStart(sn, so); r.setEnd(en, eo); return r }
    const docStart = ws[0]
    const before = pa > 0 ? span(docStart.sn, docStart.so, ws[pa].sn, ws[pa].so) : null
    const paraBefore = fa > pa ? span(ws[pa].sn, ws[pa].so, ws[fa].sn, ws[fa].so) : null
    const focusRead = k > fa ? span(ws[fa].sn, ws[fa].so, w.sn, w.so) : null
    const paraAfter = fb < pb ? span(ws[fb].en, ws[fb].eo, ws[pb].en, ws[pb].eo) : null
    const after = pb < ws.length - 1 ? span(ws[pb].en, ws[pb].eo, last.en, last.eo) : null
    // Upcoming text is never dimmed (user preference): focus comes from the pointer and from fading
    // what you've already read, not from greying out what's ahead.
    void after; void paraAfter
    const dim = this.s.dimRead, ok = (r: Range | null): r is Range => !!r
    m.set('c-page', [dim ? null : before].filter(ok))
    m.set('c-para', [dim ? null : paraBefore].filter(ok))
    m.set('c-read', [dim ? before : null].filter(ok))
    m.set('c-readpara', [dim ? paraBefore : null].filter(ok))
    m.set('c-readfocus', [dim ? focusRead : null].filter(ok))
  }

  private emit() { this.onState?.({ active: this.active, gliding: this.gliding, wpm: this.s.wpm }) }
}
