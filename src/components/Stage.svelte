<script lang="ts" module>
  export interface StageState { open: boolean; moving: boolean }
</script>

<script lang="ts">
  // Stage: the text you're on lifts off the page like a card, larger, into a calm column, and reads
  // with you at your pace: a sentence, a phrase or a word at a time. The paragraphs around it stay in
  // the column (what's next waits below, dim), so moving on is just the column gliding up, and only
  // when the reading spot would leave the reading band. Paragraphs exhale before the next; chapters
  // breathe longer, or wait for you.
  // Tap (Space, the pad) keeps it up; hold reads only while held and sets it back down on release.
  // While holding, the pad shuttles: right = faster, left = slower, then backwards (see setRate).
  import { tick, untrack } from 'svelte'
  import type { Paginator, View } from '../lib/paginator.ts'
  import { fonts, type Settings } from '../lib/settings.ts'
  import { breath, MAX_WPM, sentenceTime, wordTime, type Breath } from '../lib/pacing.ts'
  import { prevUnit, segments, unitAt, type Decor, type Step } from '../lib/stagetext.ts'

  let { pag, settings, chapter = '', pageEl, decorate, explain, onmark, onopen, onstate, onpace, ontoast }: {
    pag: Paginator | undefined; settings: Settings; chapter?: string; pageEl?: HTMLElement
    decorate?: (v: View, b: number) => Decor[]; explain?: (key: string) => Promise<string>
    /** Long-press a sentence: keep it (true) or let it go again (false). */
    onmark?: (v: View, s: number) => Promise<boolean | null>
    onopen?: (open: boolean) => void; onstate?: (s: StageState) => void
    onpace?: (wpm: number) => void; ontoast?: (m: string) => void
  } = $props()

  let open = $state(false)
  let playing = $state(false) // reading on its own (tap / locked)
  let holdPlay = $state(false) // reading while the pad / Space is held
  let busy = $state(false)
  let landed = $state(false) // the lift has finished: edge fades and the marker on
  let waiting = $state<'' | Breath>('')
  let breathMs = $state(0)
  let breathAt = $state<{ x: number; y: number } | null>(null)
  let gloss = $state<{ key: string; html: string } | null>(null) // "tell me more", when you stop at a word
  let glossT = 0, hoverT = 0
  let root = $state<HTMLDivElement>(), veil = $state<HTMLDivElement>(), lift = $state<HTMLDivElement>(), para = $state<HTMLDivElement>()
  let flow = $state<HTMLDivElement>(), marker = $state<HTMLElement>()
  let v: View | undefined, cur = -1, ue = -1, y = 0, glideT = 0, wpm = 260, closing = false
  let transient = $state(false)
  let rate = 1, gen = 0
  let timer = 0, tStart = 0, tDur = 0, tFn: (() => void) | null = null
  let lifting: Animation[] = [], recede: Animation | null = null
  let lo = 0, hi = -1 // blocks [lo, hi] are in the column (skipped blocks aren't drawn)
  let prevTop: number | null = null
  let sentEls = new Map<number, HTMLElement[]>(), wordEls = new Map<number, HTMLElement[]>(), ownerOf = new WeakMap<HTMLElement, number>()
  let hiddenEls: HTMLElement[] = [] // the page's own paragraphs, hidden while their copies are up
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const touch = matchMedia('(pointer: coarse)').matches
  const font = $derived(fonts[settings.font]?.stack || 'ui-serif, Georgia, serif')
  const step = $derived<Step>(settings.stageStep ?? 'sentence')
  const pointer = $derived(step === 'sentence' ? 'ink' : settings.stagePointer ?? 'ink')
  const go_ = $derived(touch ? 'tap' : 'Space')
  $effect(() => { const w = settings.wpm; untrack(() => { if (w !== wpm) { wpm = w; if (open) setRate(rate) } }) }) // a new pace applies mid-sentence
  $effect(() => { onstate?.({ open, moving: playing || holdPlay }) })

  // ---------- the text model ----------
  const ix = () => v!.ix
  const blocks = () => v!.ix.blocks
  const blk = () => ix().words[cur].b
  const sen = () => ix().words[cur].s
  const readable = (b: number) => { const k = blocks()[b]; return !!k && k.kind !== 'skip' && k.b >= k.a }
  const nextBlock = (b: number, dir: 1 | -1) => { for (let i = b + dir; i >= 0 && i < blocks().length; i += dir) if (readable(i)) return i; return -1 }
  const push = (m: Map<number, HTMLElement[]>, k: number, el: HTMLElement) => { const l = m.get(k); if (l) l.push(el); else m.set(k, [el]) }
  const blockEl = (b: number) => flow?.querySelector<HTMLElement>(`:scope > [data-b="${b}"]`) ?? null

  function stateOf(s: number, w: number) {
    const cs = sen()
    if (s === cs) return step !== 'sentence' && w > ue ? 'ahead' : 'now'
    return s === cs - 1 ? 'prev' : s < cs ? 'read' : s === cs + 1 ? 'next' : 'later'
  }

  /** A copy of block b, its text cut into pieces (words, gaps, lens marks), each a span that knows its sentence and word. */
  function build(b: number): HTMLElement {
    const k = blocks()[b], segs = segments(ix(), b, decorate?.(v!, b) ?? [])
    const el = document.importNode(k.el, true) as HTMLElement
    for (const e of [el, ...el.querySelectorAll('*')]) { e.removeAttribute('id'); e.removeAttribute('class'); e.removeAttribute('style') }
    const orig: Text[] = [], copy: Text[] = []
    for (const [root, out] of [[k.el, orig], [el, copy]] as const) {
      const tw = (root.ownerDocument as Document).createTreeWalker(root, NodeFilter.SHOW_TEXT)
      while (tw.nextNode()) out.push(tw.currentNode as Text)
    }
    let si = 0
    k.nodes.forEach((n, i) => {
      let node: Text | null = copy[orig.indexOf(n)]
      let pos = k.starts[i]
      const end = pos + n.data.length
      while (node && pos < end) {
        while (si < segs.length && segs[si].b <= pos) si++
        const sg = segs[si]
        if (!sg) break
        const stop = Math.min(end, sg.b), piece: Text = node
        node = stop < end ? node.splitText(stop - pos) : null
        const span = document.createElement('span')
        span.dataset.s = String(sg.s)
        if (sg.cls) span.className = sg.cls
        if (sg.css) span.style.cssText = sg.css
        if (sg.key) span.dataset.k = sg.key
        span.dataset.st = stateOf(sg.s, sg.w)
        piece.before(span); span.append(piece)
        ownerOf.set(span, sg.w); push(sentEls, sg.s, span)
        if (sg.core) push(wordEls, sg.w, span)
        pos = stop
      }
    })
    el.dataset.b = String(b)
    if (/^h[1-6]$/i.test(k.el.localName)) el.classList.add('h')
    return el
  }

  /** Keep the blocks around b in the column (two before, three after), keeping the view still. */
  function ensure(b: number) {
    const n = blocks().length, want0 = Math.max(0, b - 2), want1 = Math.min(n - 1, b + 3)
    if (hi < lo) { lo = want0; hi = want0 - 1 }
    while (hi < want1) { hi++; if (readable(hi)) flow!.insertBefore(build(hi), marker!) }
    if (want0 < lo) {
      const anchor = flow!.querySelector<HTMLElement>(':scope > [data-b]'), before = anchor?.offsetTop ?? 0
      while (lo > want0) { lo--; if (readable(lo)) flow!.insertBefore(build(lo), flow!.firstChild) }
      if (anchor) { y -= anchor.offsetTop - before; setY(false) }
    }
    if (landed) hideSources(0)
  }
  /** Drop blocks far behind (during a breath, while nothing moves), keeping the view still. */
  function trim() {
    if (hi - lo < 24 || flow!.getAnimations().length) return
    const keep = blk() - 6, anchor = blockEl(blk()), before = anchor?.offsetTop ?? 0
    for (const el of flow!.querySelectorAll<HTMLElement>(':scope > [data-b]')) {
      if (+el.dataset.b! >= keep) break
      for (const sp of el.querySelectorAll<HTMLElement>('[data-s]')) { sentEls.delete(+sp.dataset.s!); wordEls.delete(ownerOf.get(sp)!) }
      el.remove()
    }
    lo = keep
    if (anchor) { y -= anchor.offsetTop - before; setY(false) }
  }
  function reset() {
    flow?.querySelectorAll(':scope > [data-b]').forEach(e => e.remove())
    sentEls = new Map(); wordEls = new Map(); ownerOf = new WeakMap()
    lo = 0; hi = -1; prevTop = null; y = 0; cur = -1; ue = -1
  }

  // ---------- painting ----------
  function paint(s0: number, s1: number) {
    for (let s = s0; s <= s1; s++) for (const sp of sentEls.get(s) ?? []) {
      const st = stateOf(s, ownerOf.get(sp) ?? -1)
      if (sp.dataset.st !== st) sp.dataset.st = st
    }
  }
  function setY(animate: boolean, ms = 600) {
    flow!.style.transition = animate && !reduce ? `transform ${ms}ms cubic-bezier(.45,0,.2,1)` : 'none'
    flow!.style.transform = `translateY(${y}px)`
  }
  function rectsOf(list: HTMLElement[] | undefined) {
    const f = flow!.getBoundingClientRect(), out: DOMRect[] = []
    for (const sp of list ?? []) for (const r of sp.getClientRects()) out.push(new DOMRect(r.left - f.left, r.top - f.top, r.width, r.height))
    return out
  }
  /** Lazy anchor: leave the column still while the reading spot is inside the band; otherwise glide it
   *  so it rests at 34% (a tall sentence: bottom at 70%, top no higher than 18%). */
  function place(animate = true, ms = 600) {
    const H = innerHeight
    const rs = step === 'sentence' ? rectsOf(sentEls.get(sen())) : rectsOf(wordEls.get(cur)).slice(0, 1)
    if (!rs.length) return
    const top = Math.min(...rs.map(r => r.top)), bottom = Math.max(...rs.map(r => r.bottom))
    const band = step === 'sentence' ? [0.26, 0.66] : [0.24, 0.62]
    if (animate && y + top >= H * band[0] && y + bottom <= H * band[1]) return
    let to = H * 0.34 - top
    if (bottom - top > H * 0.32) to = Math.max(H * 0.7 - bottom, H * 0.18 - top)
    y = to
    clearTimeout(glideT)
    if (animate && !reduce) glideT = window.setTimeout(() => setY(true, ms), 180) // the ink changes first, then the column follows
    else setY(false)
  }
  /** The marker (phrase / word steps): a chip, line, dot or ring on the words you're on. */
  function placeMarker(animate = true) {
    const m = marker
    if (!m) return
    if (pointer === 'ink' || !landed) { m.classList.remove('on'); return }
    const rs: DOMRect[] = []
    for (let k = cur; k <= ue; k++) rs.push(...rectsOf(wordEls.get(k)))
    if (!rs.length) { m.classList.remove('on'); return }
    const f = rs[0], line = rs.filter(r => Math.abs(r.top - f.top) < 4)
    const l = f.left, t = f.top, w = Math.max(...line.map(r => r.right)) - f.left, h = f.height
    const g = ({ word: [l - 4, t - 1, w + 8, h + 2], outline: [l - 4, t - 1, w + 8, h + 2], underline: [l, t + h - 1, w, 3], dot: [l + w / 2 - 3, t + h + 2, 6, 6] } as Record<string, number[]>)[pointer]
    const newLine = prevTop !== null && Math.abs(t - prevTop) > 4
    prevTop = t
    const set = (dur: number) => {
      m.style.transition = dur ? `transform ${dur}ms cubic-bezier(.22,1,.36,1), width ${Math.round(dur * 0.85)}ms cubic-bezier(.25,.8,.25,1), height ${Math.round(dur * 0.85)}ms ease` : 'none'
      m.style.transform = `translate(${g[0]}px, ${g[1]}px)`
      m.style.width = g[2] + 'px'; m.style.height = g[3] + 'px'
    }
    m.dataset.p = pointer; m.classList.add('on') // classList keeps Svelte's scoping class
    if (!animate || reduce) return set(0)
    if (newLine) { // a new line: fade across instead of sweeping diagonally
      m.animate([{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: 260 })
      setTimeout(() => set(0), 100)
      return
    }
    set(Math.min(300, unitMs() * 0.6))
  }

  // ---------- moving ----------
  /** Move to the unit starting at (or containing) word k. */
  function go(k: number, animate = true, sync = true) {
    const x = ix(), oldS = cur >= 0 ? sen() : -1, oldB = cur >= 0 ? blk() : -1
    ;[cur, ue] = unitAt(x, Math.max(0, Math.min(k, x.words.length - 1)), step)
    ensure(blk())
    const ns = sen()
    if (oldS < 0) paint(Math.max(0, ns - 3), ns + 3)
    else paint(Math.min(oldS, ns) - 1, Math.max(oldS, ns) + 1)
    flow!.classList.remove('exhale')
    const newBlock = blk() !== oldB
    place(animate, newBlock ? 800 : 600)
    placeMarker(animate)
    if (newBlock && sync) syncPage()
  }
  function unitMs() {
    const x = ix()
    if (step === 'sentence') return sentenceTime(x, sen(), wpm)
    let ms = 0
    for (let k = cur; k <= ue; k++) ms += wordTime(x, k, wpm)
    return ms
  }
  const moving = () => playing || holdPlay
  function play() { playing = true; hideGloss(); schedule() }
  function stop() { playing = false; if (!holdPlay) { clearTimeout(timer); if (open && landed) glossHere() } }
  /** Time the current unit; when it's done, move on (or back, when shuttling backwards). */
  function schedule() {
    clearTimeout(timer)
    if (!open || busy || waiting || !moving() || Math.abs(rate) < 0.15) return
    tFn = rate > 0 ? advance : retreat
    tDur = unitMs() / Math.abs(rate); tStart = performance.now()
    timer = window.setTimeout(tFn, tDur)
  }
  /** Shuttle while holding: 1 = your pace, 2 = twice as fast, 0 = still, −1 = backwards at your pace.
   *  A change of speed keeps how far into the current unit you are. */
  export function setRate(r: number) {
    const old = rate
    rate = r
    if (!open || !moving()) return
    if (Math.sign(old) !== Math.sign(r) || (Math.abs(old) < 0.15) !== (Math.abs(r) < 0.15)) return schedule()
    if (Math.abs(r) < 0.15 || !tFn) return
    const done = Math.min(1, (performance.now() - tStart) / tDur)
    clearTimeout(timer)
    tDur = unitMs() / Math.abs(r); tStart = performance.now() - done * tDur
    timer = window.setTimeout(tFn, (1 - done) * tDur)
  }
  const waits = (kind: Breath) => kind !== 'section' && settings.paraEnd === 'wait' && !holdPlay
  function advance() {
    const x = ix(), n = ue + 1
    if (n < x.words.length && x.words[n].b === blk()) { go(n); schedule(); return }
    // A paragraph (or chapter) is done: it exhales, the breath line sits under its last line.
    const br = breath(x, blk())
    flow!.classList.add('exhale')
    const be = blockEl(blk())?.getBoundingClientRect()
    breathAt = be ? { x: be.left, y: Math.min(innerHeight * 0.8, be.bottom + 12) } : null
    waiting = br.kind
    trim()
    if (waits(br.kind)) return
    breathMs = rate > 1 ? br.ms / rate : br.ms
    timer = window.setTimeout(onward, breathMs)
  }
  function retreat() {
    const x = ix(), p = prevUnit(x, cur, step)
    if (p < 0) return
    if (!readable(x.words[p].b)) { const pb = nextBlock(blk(), -1); if (pb < 0) return; go(prevUnit(x, blocks()[pb].b + 1, step)) }
    else go(p)
    schedule()
  }
  function onward() {
    const was = waiting
    waiting = ''; breathAt = null
    const nb = nextBlock(blk(), 1)
    if (nb < 0 || was === 'end') return void nextChapter()
    go(blocks()[nb].a)
    schedule()
  }
  async function nextChapter() {
    if (!pag || !v) return
    const old = v
    busy = true
    const idle = async () => { while (pag!.isBusy) await new Promise(r => setTimeout(r, 40)) }
    await idle(); await pag.showPage(old.pages - 1)
    await idle(); await pag.next()
    busy = false
    if (closing) return close()
    if (pag.current === old) { waiting = 'end'; ontoast?.('The end'); return } // the book is over
    v = pag.current!
    const nb = nextBlock(-1, 1)
    if (nb < 0) return
    // A new chapter: the old column floats away, the new one rises.
    const ghost = para!.cloneNode(true) as HTMLElement
    ghost.classList.add('ghost'); lift!.append(ghost)
    ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-16px)' }], { duration: 420, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.then(() => ghost.remove())
    revealSources(0); reset(); go(blocks()[nb].a, false); hideSources(0)
    busy = true
    await para!.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 640, delay: 200, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }).finished.catch(() => {})
    busy = false
    if (closing) return close()
    schedule()
  }

  /** Manual moves. */
  function moved() { waiting = ''; breathAt = null; schedule() }
  function unit(dir: 1 | -1) {
    if (busy) return
    const x = ix()
    if (dir > 0) {
      if (waiting) return onward()
      const n = ue + 1
      if (n >= x.words.length) return void nextChapter()
      if (x.words[n].b !== blk()) { const nb = nextBlock(blk(), 1); if (nb < 0) return void nextChapter(); go(blocks()[nb].a) }
      else go(n)
    } else {
      const p = prevUnit(x, cur, step)
      if (p < 0) return
      if (!readable(x.words[p].b)) { const pb = nextBlock(blk(), -1); if (pb < 0) return; go(prevUnit(x, blocks()[pb].b + 1, step)) }
      else go(p)
    }
    moved()
  }
  function sentence(dir: 1 | -1) {
    if (busy) return
    const x = ix(), s = sen(), first = x.sentences[s].a
    if (dir > 0) {
      if (waiting) return onward()
      const ns = x.sentences[s + 1]
      if (!ns) return void nextChapter()
      if (x.words[ns.a].b !== blk() || !readable(x.words[ns.a].b)) { const nb = nextBlock(blk(), 1); if (nb < 0) return void nextChapter(); go(blocks()[nb].a) }
      else go(ns.a)
    } else {
      if (cur > first) go(first)
      else if (s > 0) { const ps = x.sentences[s - 1]; if (readable(x.words[ps.a].b)) go(ps.a); else { const pb = nextBlock(blk(), -1); if (pb >= 0) go(blocks()[pb].a) } }
    }
    moved()
  }
  function paragraph(dir: 1 | -1) {
    if (busy) return
    if (dir > 0) { const nb = nextBlock(blk(), 1); if (nb < 0) return void nextChapter(); go(blocks()[nb].a) }
    else if (cur > blocks()[blk()].a) go(blocks()[blk()].a)
    else { const pb = nextBlock(blk(), -1); if (pb >= 0) go(blocks()[pb].a) }
    moved()
  }
  function speed(f: number) {
    wpm = Math.round(Math.max(120, Math.min(MAX_WPM, wpm * f)))
    onpace?.(wpm); ontoast?.(`${wpm} wpm`)
    schedule()
  }
  function toggle() {
    if (waiting && waits(waiting)) return onward() // it was waiting for you: go on
    if (playing) return stop() // a pause, even mid-breath
    if (waiting) { playing = true; return onward() } // paused during a breath: carry on past it
    play()
  }

  // ---------- the page underneath ----------
  // It quietly follows, so your place is saved and closing lands exactly where you are.
  function wordRect(k: number) { const w = v!.ix.words[k], r = v!.doc.createRange(); r.setStart(w.sn, w.so); r.setEnd(w.en, w.eo); return r.getClientRects()[0] }
  function syncPage() {
    const r = wordRect(cur)
    if (r && pag) pag.showPage(pag.pageOf(r))
  }
  function hideSource(el: HTMLElement, ms = 160) {
    if (hiddenEls.includes(el)) return
    el.style.transition = `opacity ${ms}ms ease`; el.style.opacity = '0'
    hiddenEls.push(el)
  }
  function hideSources(ms = 160) { for (let b = lo; b <= hi; b++) if (readable(b)) hideSource(blocks()[b].el as HTMLElement, ms) }
  function revealSources(ms = 150) {
    for (const el of hiddenEls) { el.style.transition = ms ? `opacity ${ms}ms ease` : ''; el.style.opacity = ''; if (ms) setTimeout(() => (el.style.transition = ''), ms + 20) }
    hiddenEls = []
  }

  /** Where the Stage starts: the chapter you navigated to if its heading is on this spread, else the first word on it. */
  function startWord(): number {
    const x = ix(), k = pag!.firstWordOnPage(v), end = pag!.currentPage + 1 < v!.pages ? pag!.firstWordOnPage(v, pag!.currentPage + 1) : x.words.length
    const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase(), want = norm(chapter)
    if (want) for (let b = x.words[k].b; b < x.blocks.length && x.blocks[b].a < end; b++) {
      const t = norm(x.blocks[b].text)
      if (x.blocks[b].kind === 'heading' && t && (t.startsWith(want) || want.startsWith(t))) return x.blocks[b].a
    }
    const b = x.words[k].b
    if (readable(b)) return k
    const nb = nextBlock(b, 1)
    return nb < 0 ? k : x.blocks[nb].a
  }
  /** FLIP between the page word k (in the book frame) and its copy in the column: [from, peel]. */
  function flip(k: number): [string, string] | null {
    const src = wordRect(k), frame = v!.iframe.getBoundingClientRect()
    const copy = (wordEls.get(k) ?? sentEls.get(ix().words[k].s))?.[0]?.getClientRects()[0]
    if (!src || !copy) return null
    const box = lift!.getBoundingClientRect()
    lift!.style.transformOrigin = `${copy.left - box.left}px ${copy.top - box.top}px`
    const dx = frame.left + src.left - copy.left, dy = frame.top + src.top - copy.top, s = src.height / copy.height
    // "peel": the card first comes up off the paper (a little larger, a little higher) before it travels
    return [`translate(${dx}px, ${dy}px) scale(${s})`, `translate(${dx}px, ${dy - 10}px) scale(${s * 1.06})`]
  }
  const SHADOW = ['0 0 0 0 rgb(0 0 0 / 0), 0 0 0 0 rgb(0 0 0 / 0)', '0 26px 56px -14px rgb(0 0 0 / .34), 0 4px 12px -2px rgb(0 0 0 / .12)', '0 12px 36px -18px rgb(0 0 0 / .2), 0 2px 6px -2px rgb(0 0 0 / .06)']

  // ---------- open / close (the lift) ----------
  /** Lift the text off the page. `hold`: only while held (release sets it back down). */
  export async function start(hold = false, at = -1) {
    if (open || busy || !pag?.current || !settings.guide) return
    v = pag.current
    if (!v.ix.words.length) { ontoast?.('Nothing to read on this page'); return }
    busy = true; transient = hold; holdPlay = hold; playing = false; rate = 1
    const k = at >= 0 && at < v.ix.words.length ? at : startWord(), my = ++gen
    open = true; landed = false; onopen?.(true)
    await tick()
    reset()
    flow!.classList.add('whole', 'solo') // the paragraph comes up alone and whole, as it was on the page
    go(k, false, false)
    const card = blockEl(blk())
    card?.classList.add('card')
    const f = reduce ? null : flip(k)
    if (f) {
      hideSource(blocks()[blk()].el as HTMLElement) // only the lifted paragraph leaves the page; the rest go once the veil is up
      lifting = [
        lift!.animate([{ transform: f[0], opacity: 0 }, { transform: f[1], opacity: 1, offset: 0.26 }, { transform: 'none', opacity: 1 }], { duration: 920, easing: 'cubic-bezier(.3,.7,.2,1)' }),
        veil!.animate([{ opacity: 0 }, { opacity: 0.55, offset: 0.5 }, { opacity: 1 }], { duration: 920, easing: 'ease-in' }),
        ...(card ? [card.animate(SHADOW.map(boxShadow => ({ boxShadow })), { duration: 920, easing: 'ease-out', fill: 'forwards' })] : []),
      ]
      if (pageEl) recede = pageEl.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.94)', opacity: 0.45 }], { duration: 920, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' })
      if (recede) lifting.push(recede)
      setTimeout(() => { if (gen === my) flow?.classList.remove('whole') }, 560) // then it narrows to where you are
      await lifting[0].finished.catch(() => {})
      if (gen !== my) return // released mid-lift: close() played it backwards
    } else { hideSources(0); flow!.classList.remove('whole') }
    lifting = []
    busy = false; landed = true
    hideSources(0)
    flow!.classList.remove('solo') // its neighbours fade in around it
    if (card) { card.getAnimations().forEach(a => a.cancel()); card.style.boxShadow = SHADOW[2]; requestAnimationFrame(() => { card.style.boxShadow = ''; card.classList.remove('card') }) }
    placeMarker(false)
    if (closing) return close()
    if (!hold) play(); else schedule()
  }

  export async function close() {
    if (!open) return
    if (busy && lifting.length && lifting[0].playState === 'running') { // released mid-lift: play the lift backwards
      gen++; closing = false
      for (const a of lifting) a.reverse()
      await lifting[0].finished.catch(() => {})
      return finish()
    }
    if (busy) { closing = true; root?.getAnimations({ subtree: true }).forEach(a => a.finish()); return }
    closing = false; busy = true; landed = false
    stop(); holdPlay = false; transient = false; waiting = ''; breathAt = null
    placeMarker(false)
    const k = cur, r = wordRect(k)
    if (r && pag) { while (pag.isBusy) await new Promise(res => setTimeout(res, 40)); await pag.showPage(pag.pageOf(r)) }
    hideSources(0)
    recede?.cancel(); recede = null // measure the page at its real size (it is under the veil, so nothing jumps)
    const card = blockEl(blk()), home = blocks()[blk()].el as HTMLElement
    flow!.classList.add('solo'); card?.classList.add('card')
    const f = reduce ? null : flip(k)
    for (const el of [...hiddenEls]) if (el !== home) { el.style.transition = 'opacity .2s ease'; el.style.opacity = ''; hiddenEls.splice(hiddenEls.indexOf(el), 1) } // the rest of the page is whole again
    if (f) { // set it back down: the card travels to its spot, settles into the paper, hands over to the page
      const anims = [
        lift!.animate([{ transform: 'none', opacity: 1 }, { transform: f[1], opacity: 1, offset: 0.72 }, { transform: f[0], opacity: 0 }], { duration: 640, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }),
        veil!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, delay: 120, easing: 'ease-out', fill: 'forwards' }),
        ...(card ? [card.animate([...SHADOW].reverse().map(boxShadow => ({ boxShadow })), { duration: 640, easing: 'ease-in', fill: 'forwards' })] : []),
      ]
      recede = pageEl?.animate([{ transform: 'scale(.94)', opacity: 0.45 }, { transform: 'none', opacity: 1 }], { duration: 640, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }) ?? null
      setTimeout(() => revealSources(160), 460)
      await anims[0].finished.catch(() => {})
    }
    finish()
  }
  function finish() {
    hideGloss()
    revealSources(0)
    recede?.cancel(); recede = null; lifting = []
    clearTimeout(timer); clearTimeout(glideT)
    playing = false; holdPlay = false; transient = false; rate = 1
    open = false; busy = false; landed = false; onopen?.(false)
  }

  // ---------- gloss: a quiet line of "tell me more" when you stop at a marked word ----------
  async function showGloss(key: string) {
    if (!explain || gloss?.key === key) return
    const html = await explain(key)
    if (!html || !open) return
    gloss = { key, html }
    clearTimeout(glossT); glossT = window.setTimeout(() => (gloss = null), 7000)
  }
  function hideGloss() { clearTimeout(glossT); clearTimeout(hoverT); gloss = null }
  /** Paused on a sentence: offer its rare word, if it has one. */
  function glossHere() {
    const sp = (sentEls.get(sen()) ?? []).find(e => e.dataset.k?.startsWith('hard:'))
    if (sp) showGloss(sp.dataset.k!)
  }

  // ---------- hold (the pad, or Space held) ----------
  /** Press-and-hold: closed → lift and read while held; open but paused → read while held. */
  export function holdStart(at = -1) { if (!open) start(true, at); else { holdPlay = true; schedule() } }
  /** Release: a hold-only Stage goes back to the page; otherwise reading continues as before. */
  export function holdEnd() {
    setRate(1)
    if (transient) return void close()
    holdPlay = false
    if (!playing) clearTimeout(timer)
  }
  /** Slide up while holding: keep it up after release. */
  export function lock() { if (!open || !transient) return; transient = false; playing = true; ontoast?.('Locked · tap to pause') }
  /** A tap: open, or pause / play; a quick second tap undoes that and goes back a sentence. */
  let lastTap = 0, playBefore = false
  export function tap() {
    if (!open) return void start()
    const t = performance.now()
    if (t - lastTap < 280) { lastTap = 0; sentence(-1); if (playBefore) play(); else stop(); ontoast?.('Back a sentence'); return }
    lastTap = t; playBefore = playing
    toggle()
  }
  export const isOpen = () => open

  /** The paginator changed chapter (we asked it to, at a chapter's end). */
  export function view(nv: View) { if (open && nv !== v) v = nv }

  // ---------- keys ----------
  let spaceAt = 0
  export function key(e: KeyboardEvent): boolean {
    if ((e.target as HTMLElement)?.closest?.('input, textarea, select, dialog[open]') || e.metaKey || e.ctrlKey) return false
    if (settings.guideStyle !== 'stage' || !settings.guide) return false
    if (e.type === 'keyup') {
      if (e.key !== ' ' || !spaceAt) return open
      const held = performance.now() - spaceAt > 280
      spaceAt = 0
      if (transient) { if (held) close(); else { transient = false; holdPlay = false; play() } return true } // this press opened it: a hold goes back, a tap stays up
      if (held) { holdPlay = false; if (!playing) clearTimeout(timer); return true }
      holdPlay = false; toggle()
      return true
    }
    if (e.key === ' ' && !e.shiftKey) {
      e.preventDefault()
      if (e.repeat || spaceAt) return true
      spaceAt = performance.now()
      if (!open) start(true)
      else if (!playing) setTimeout(() => { if (spaceAt) { holdPlay = true; schedule() } }, 280) // held while paused: read while held
      return true
    }
    if (!open) {
      if ((e.key === 'g' || e.key === 'G') && !e.altKey) { e.preventDefault(); start(); return true }
      return false
    }
    e.preventDefault()
    const act: Record<string, () => unknown> = {
      Escape: close, q: close, g: close, G: close,
      ArrowRight: () => unit(1), l: () => unit(1), ArrowLeft: () => unit(-1), h: () => unit(-1),
      ')': () => sentence(1), '(': () => sentence(-1),
      ArrowDown: () => paragraph(1), j: () => paragraph(1), '}': () => paragraph(1),
      ArrowUp: () => paragraph(-1), k: () => paragraph(-1), '{': () => paragraph(-1),
      ']': () => speed(1.1), '[': () => speed(1 / 1.1),
    }
    act[e.key]?.()
    return true
  }

  // ---------- touch on the text: tap = pause / play, swipe = a sentence, long-press = keep the sentence ----------
  let downY = 0, downX = 0, downAt = 0, wheelLock = 0, markT = 0, marked = false
  function down(e: PointerEvent) {
    downY = e.clientY; downX = e.clientX; downAt = e.timeStamp; marked = false
    clearTimeout(markT)
    const sp = (e.target as HTMLElement).closest<HTMLElement>('.flow [data-s]')
    if (sp && onmark && landed) markT = window.setTimeout(() => mark(+sp.dataset.s!), 520)
  }
  function drag(e: PointerEvent) { if (markT && Math.hypot(e.clientX - downX, e.clientY - downY) > 10) { clearTimeout(markT); markT = 0 } }
  async function mark(s: number) {
    markT = 0; marked = true
    navigator.vibrate?.(10)
    const on = await onmark!(v!, s)
    if (on === null) return
    for (const sp of sentEls.get(s) ?? []) {
      sp.classList.toggle('lx-yours', on)
      if (on) { sp.style.setProperty('--hl', 'var(--base0A)'); sp.classList.add('lx-stamp'); setTimeout(() => sp.classList.remove('lx-stamp'), 700) }
    }
    ontoast?.(on ? 'Kept as Key · long-press again to let go' : 'Highlight removed')
  }
  function up(e: PointerEvent) {
    clearTimeout(markT); markT = 0
    if (marked) { marked = false; return }
    if ((e.target as HTMLElement).closest('button, .gloss')) return
    const dy = e.clientY - downY
    if (Math.abs(dy) > 40) return sentence(dy < 0 ? 1 : -1)
    if (e.timeStamp - downAt >= 500) return
    const k = (e.target as HTMLElement).closest<HTMLElement>('[data-k]')?.dataset.k
    if (k) { if (playing) stop(); showGloss(k); return } // stopping at a word: tell me more
    toggle()
  }
  function over(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return
    clearTimeout(hoverT)
    const k = (e.target as HTMLElement).closest<HTMLElement>('[data-k]')?.dataset.k
    if (k) hoverT = window.setTimeout(() => showGloss(k), 350)
  }
  // One flick, one sentence: trackpad momentum keeps extending the lock until it settles.
  function wheel(e: WheelEvent) {
    const now = Date.now()
    if (now < wheelLock) { wheelLock = now + 250; return }
    if (Math.abs(e.deltaY) < 12) return
    wheelLock = now + 600
    sentence(e.deltaY > 0 ? 1 : -1)
  }
</script>

{#if open}
  <div class="stage" bind:this={root} role="dialog" tabindex="-1" aria-label="Stage reading" onpointerdown={down} onpointermove={drag} onpointerup={up} onpointerover={over} onwheel={wheel}>
    <div class="veil" bind:this={veil}></div>
    <div class="win" style:font-family={font} style:--size="{settings.fontScale / 100}">
      <div class="lift" bind:this={lift}>
        <div class="para" bind:this={para}>
          <div class="flow" bind:this={flow} aria-live="polite"><i class="marker" bind:this={marker} aria-hidden="true"></i></div>
        </div>
      </div>
    </div>
    <div class="fade top-fade" class:on={landed}></div>
    <div class="fade bottom-fade" class:on={landed}></div>
    <div class="top" class:on={landed}>{chapter}</div>
    {#if waiting && breathAt && !waits(waiting)}
      <span class="breath" style:left="{breathAt.x}px" style:top="{breathAt.y}px"><i style:animation-duration="{breathMs}ms"></i></span>
    {/if}
    {#if gloss}<div class="gloss glass" role="note">{@html gloss.html}</div>{/if}
    <div class="foot" aria-live="polite">
      {#if landed && !transient}
        {#if waiting === 'end' && waits(waiting)}<span>End of chapter · {go_} to go on</span>
        {:else if waiting === 'chapter' && waits(waiting)}<span>{go_ === 'tap' ? 'Tap' : 'Space'} for the next chapter</span>
        {:else if waiting === 'paragraph' && waits(waiting)}<span>{go_ === 'tap' ? 'Tap' : 'Space'} for the next paragraph</span>
        {:else if !playing && !holdPlay}<span>Paused · {go_} to go on</span>{/if}
      {/if}
    </div>
    <button class="x" class:on={landed} aria-label="Back to the page (Esc)" onclick={close}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
    </button>
  </div>
{/if}

<style>
  .stage { position: fixed; inset: 0; z-index: 7; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; cursor: default; }
  .veil { position: absolute; inset: 0; background: var(--bg); }
  .win {
    position: absolute; inset: 0 0 0 50%; width: min(26em, calc(100vw - 40px)); translate: -50% 0;
    font-size: calc(var(--size) * clamp(21px, max(1.2vw + 12px, 2.2vmin + 6px), 30px)); line-height: 1.62; color: var(--fg); /* tablets: the short side counts too */
  }
  .lift { position: relative; will-change: transform, opacity; }
  .para { will-change: transform, opacity; }
  .lift :global(.ghost) { position: absolute; inset: 0 0 auto 0; pointer-events: none; }
  .flow { position: relative; text-wrap: pretty; hyphens: manual; color: color-mix(in srgb, var(--fg) 30%, transparent); }
  .flow :global(*) { margin: 0; font-size: inherit; line-height: inherit; }
  .flow > :global([data-b]) { margin: 0 0 .85em; transition: opacity .6s ease; }
  .flow :global(a) { color: inherit; text-decoration: none; }
  .flow :global(img) { display: block; margin: 0 auto .8em; max-height: 38vh; max-width: 100%; }
  .flow > :global(.h) { font-weight: 600; letter-spacing: -.01em; font-size: 1.3em; line-height: 1.3; text-wrap: balance; text-align: center; margin: 1.1em 0 .9em; }
  /* The card: while it travels, the paragraph is a sheet of paper with a shadow (no layout shift). */
  .flow > :global(.card) { background: var(--bg); border-radius: 14px; padding: .45em .7em; margin-left: -.7em; margin-right: -.7em; margin-top: -.45em; transition: box-shadow .5s ease; }
  .flow:global(.solo) > :global([data-b]:not(.card)) { opacity: 0; transition-duration: .25s; }
  /* Ink steps. Every piece knows its state; colour = its ink (a voice's hue, or the text colour) at the step's strength. */
  .flow :global([data-st]) { color: color-mix(in srgb, var(--ink, var(--fg)) var(--a, 30%), transparent); transition: color var(--t, .8s) ease; }
  .flow :global([data-st="now"]) { --a: 100%; --t: .45s; }
  .flow :global([data-st="ahead"]) { --a: 70%; --t: .2s; }
  .flow :global([data-st="next"]) { --a: 56%; }
  .flow :global([data-st="prev"]) { --a: 45%; --t: .5s; }
  .flow :global([data-st="read"]) { --a: 26%; --t: 1.2s; }
  .flow:global(.exhale) :global([data-st="now"]) { --a: 62%; --t: 1.4s; }
  .flow:global(.whole) :global([data-st]) { --a: 100%; transition: none; }
  /* Lenses in the Stage: who (names, voices), tell me more (rare words, other languages), asides, yours. */
  .flow :global(.lx-name) { --ink: var(--who); }
  .flow :global(.lx-chip) { background: color-mix(in srgb, var(--who) 15%, transparent); border-radius: .22em; box-shadow: 0 0 0 .1em color-mix(in srgb, var(--who) 15%, transparent); transition: color var(--t, .8s) ease, background-color .8s ease, box-shadow .8s ease; }
  .flow :global(.lx-chip[data-st="read"]), .flow :global(.lx-chip[data-st="later"]) { background: transparent; box-shadow: none; }
  .flow :global(.lx-chip[data-st="now"]) { animation: chip 1.2s ease-out; }
  .flow :global(.lx-vline) { text-decoration: underline 2px color-mix(in srgb, var(--who) 55%, transparent); text-underline-offset: .24em; }
  .flow :global(.lx-qmark) { --ink: var(--who); }
  .flow :global(.lx-hard) { text-decoration: underline dotted color-mix(in srgb, var(--accent) 75%, transparent); text-decoration-thickness: .07em; text-underline-offset: .22em; cursor: help; transition: color var(--t, .8s) ease, text-decoration-color .8s ease; }
  .flow :global(.lx-hard[data-st="read"]), .flow :global(.lx-hard[data-st="later"]) { text-decoration-color: transparent; }
  .flow :global(.lx-foreign) { font-style: italic; --ink: color-mix(in srgb, var(--base0C, var(--accent)) 65%, var(--fg)); }
  .flow :global(.lx-aside) { opacity: .72; }
  .flow :global(.lx-yours) { background: color-mix(in srgb, var(--hl) 26%, transparent); border-radius: 2px; transition: color var(--t, .8s) ease, background-color .8s ease; }
  .flow :global(.lx-yours[data-st="read"]), .flow :global(.lx-yours[data-st="later"]) { background: color-mix(in srgb, var(--hl) 12%, transparent); }
  .flow :global(.lx-bold) { -webkit-text-stroke: .022em currentColor; }
  .flow :global(.lx-ital) { font-style: italic; }
  .flow :global(.lx-stamp) { animation: stamp .7s cubic-bezier(.22,1,.36,1); }
  @keyframes stamp { from { background-color: color-mix(in srgb, var(--hl) 60%, transparent); } }
  @keyframes chip { from { background-color: color-mix(in srgb, var(--who) 38%, transparent); box-shadow: 0 0 0 .32em color-mix(in srgb, var(--who) 10%, transparent); } }
  .gloss {
    position: absolute; z-index: 2; left: 50%; bottom: calc(env(safe-area-inset-bottom) + 92px); translate: -50% 0; width: max-content; max-width: min(460px, calc(100vw - 32px));
    padding: 10px 16px; border-radius: 16px; font: 14px/1.45 system-ui; color: var(--fg); animation: glossIn .35s cubic-bezier(.22,1,.36,1);
  }
  .gloss :global(b) { font: 600 16px var(--serif, Georgia, serif); margin-right: 4px; }
  .gloss :global(i) { color: var(--muted); margin-right: 4px; }
  @keyframes glossIn { from { opacity: 0; transform: translateY(8px); } }
  /* The marker (phrase / word steps) */
  .marker { position: absolute; left: 0; top: 0; z-index: -1; pointer-events: none; opacity: 0; transition: opacity .25s; }
  .marker:global(.on) { opacity: 1; }
  .marker:global([data-p="word"]) { background: color-mix(in srgb, var(--accent) 18%, transparent); border-radius: 7px; }
  .marker:global([data-p="outline"]) { border-radius: 7px; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 80%, transparent); }
  .marker:global([data-p="underline"]) { background: var(--accent); border-radius: 2px; }
  .marker:global([data-p="dot"]) { background: var(--accent); border-radius: 50%; }
  .fade { position: absolute; left: 0; right: 0; height: 26%; pointer-events: none; opacity: 0; transition: opacity .4s ease; }
  .fade.on { opacity: 1; }
  .top-fade { top: 0; background: linear-gradient(var(--bg) 40%, transparent); }
  .bottom-fade { bottom: 0; height: 30%; background: linear-gradient(transparent, var(--bg) 70%); }
  .top { position: absolute; top: calc(env(safe-area-inset-top) + 22px); left: 56px; right: 56px; text-align: center; font: 600 11px system-ui; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0; transition: opacity .4s ease; }
  .top.on { opacity: 1; }
  .foot { position: absolute; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom) + 28px); display: grid; place-items: center; font: 12px system-ui; color: var(--muted); pointer-events: none; min-height: 16px; }
  .foot span { animation: fade .5s ease both; }
  .breath { position: absolute; width: 56px; height: 2px; border-radius: 1px; background: color-mix(in srgb, var(--fg) 10%, transparent); overflow: hidden; opacity: .4; pointer-events: none; animation: fade .4s ease both; }
  .breath i { display: block; height: 100%; background: var(--accent); transform-origin: left; animation: fill linear both; }
  .x { position: absolute; z-index: 1; top: calc(env(safe-area-inset-top) + 10px); right: calc(env(safe-area-inset-right) + 10px); width: 44px; height: 44px; border: 0; border-radius: 50%; background: transparent; color: var(--muted); display: grid; place-items: center; cursor: pointer; transition: background-color .2s, color .2s, opacity .3s; opacity: 0; }
  .x.on { opacity: 1; }
  .x:hover { background: var(--hover); color: var(--fg); }
  @keyframes fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .flow :global([data-st]) { transition: none; } }
</style>
