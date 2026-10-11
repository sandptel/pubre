<script lang="ts">
  // Stage: Space lifts the paragraph you're on off the page, larger, and reads it with you a sentence
  // at a time. It lands whole, then narrows to the sentence you're on: full ink, the next waits below,
  // what you've read fades. The column only moves when a sentence would leave the reading band.
  // Paragraphs exhale before the next rises; chapters wait (or breathe longer).
  import { tick } from 'svelte'
  import type { Paginator, View } from '../lib/paginator.ts'
  import { fonts, type Settings } from '../lib/settings.ts'
  import { breath, MAX_WPM, sentenceTime, type Breath } from '../lib/pacing.ts'

  let { pag, settings, chapter = '', onopen, onpace, ontoast }: {
    pag: Paginator | undefined; settings: Settings; chapter?: string
    onopen?: (open: boolean) => void; onpace?: (wpm: number) => void; ontoast?: (m: string) => void
  } = $props()

  let open = $state(false)
  let playing = $state(false)
  let busy = $state(false)
  let landed = $state(false) // the lift has finished: edge fades on
  let waiting = $state<'' | Breath>('')
  let breathMs = $state(0)
  let breathAt = $state<{ x: number; y: number } | null>(null)
  let heading = $state(false)
  let root = $state<HTMLDivElement>(), veil = $state<HTMLDivElement>(), lift = $state<HTMLDivElement>(), para = $state<HTMLDivElement>(), flow = $state<HTMLDivElement>()
  let v: View | undefined, blk = -1, sen = -1, timer = 0, glideT = 0, wpm = 260, y = 0, closing = false
  let hidden: HTMLElement | null = null // the page's own paragraph, hidden while its copy is in flight
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const touch = matchMedia('(pointer: coarse)').matches
  const BAND = [0.26, 0.66], REST = 0.34 // the reading band, and where a sentence settles when it has to move
  const RISE = 'cubic-bezier(.22,1,.36,1)'
  const font = $derived(fonts[settings.font]?.stack || 'ui-serif, Georgia, serif')
  const go = $derived(touch ? 'tap' : 'Space')
  $effect(() => { wpm = settings.wpm })

  // ---------- content ----------
  const blocks = () => v!.ix.blocks
  const readable = (b: number) => { const k = blocks()[b]; return !!k && k.kind !== 'skip' && k.b >= k.a }
  const nextBlock = (b: number, dir: 1 | -1) => { for (let i = b + dir; i >= 0 && i < blocks().length; i += dir) if (readable(i)) return i; return -1 }
  const sentencesOf = (b: number) => { const k = blocks()[b], ws = v!.ix.words; return [ws[k.a].s, ws[k.b].s] as const }

  /** A copy of block b in this document, each sentence's text wrapped in span[data-s]. */
  function build(b: number): HTMLElement {
    const k = blocks()[b], ix = v!.ix
    const el = document.importNode(k.el, true) as HTMLElement
    const orig: Text[] = [], copy: Text[] = []
    for (const [root, out] of [[k.el, orig], [el, copy]] as const) {
      const tw = (root.ownerDocument as Document).createTreeWalker(root, NodeFilter.SHOW_TEXT)
      while (tw.nextNode()) out.push(tw.currentNode as Text)
    }
    const [s0, s1] = sentencesOf(b)
    const at = (w: number) => k.starts[k.nodes.indexOf(ix.words[w].sn)] + ix.words[w].so
    const cuts: number[] = []
    for (let s = s0 + 1; s <= s1; s++) cuts.push(at(ix.sentences[s].a))
    k.nodes.forEach((n, i) => {
      let node = copy[orig.indexOf(n)], pos = k.starts[i]
      if (!node) return
      const end = pos + n.data.length
      let s = s0 + cuts.filter(c => c <= pos).length
      while (node && pos < end) {
        const stop = Math.min(end, cuts[s - s0] ?? Infinity)
        const piece = node
        node = stop < end ? node.splitText(stop - pos) : (null as unknown as Text)
        const span = document.createElement('span')
        span.dataset.s = String(s)
        piece.before(span); span.append(piece)
        pos = stop; s++
      }
    })
    for (const e of [el, ...el.querySelectorAll('*')]) { e.removeAttribute('id'); e.removeAttribute('class'); e.removeAttribute('style') }
    return el
  }

  function paint() {
    for (const sp of flow!.querySelectorAll<HTMLElement>('[data-s]')) {
      const s = +sp.dataset.s!
      sp.className = s === sen ? 'now' : s === sen - 1 ? 'prev' : s < sen ? 'read' : s === sen + 1 ? 'next' : ''
    }
  }
  /** Where sentence s sits inside the flow (layout px, ignoring the flow's own translate). */
  function extent(s: number) {
    const top0 = flow!.getBoundingClientRect().top
    let top = Infinity, bottom = -Infinity
    for (const sp of flow!.querySelectorAll<HTMLElement>(`[data-s="${s}"]`)) for (const r of sp.getClientRects()) { top = Math.min(top, r.top - top0); bottom = Math.max(bottom, r.bottom - top0) }
    return top === Infinity ? { top: 0, bottom: 0 } : { top, bottom }
  }
  /** Lazy anchor: leave the column still while the sentence is inside the reading band; otherwise
   *  glide it so its top rests at 34% (a tall sentence: bottom at 70%, top no higher than 18%). */
  function place(animate = true) {
    const H = innerHeight, { top, bottom } = extent(sen)
    if (animate && y + top >= H * BAND[0] && y + bottom <= H * BAND[1]) return
    let to = H * REST - top
    if (bottom - top > H * (BAND[1] - REST)) to = Math.max(H * 0.7 - bottom, H * 0.18 - top)
    y = to
    clearTimeout(glideT)
    const apply = () => {
      flow!.style.transition = animate && !reduce ? 'transform .6s cubic-bezier(.45,0,.2,1)' : 'none'
      flow!.style.transform = `translateY(${y}px)`
    }
    if (animate && !reduce) glideT = window.setTimeout(apply, 180) // the ink changes first, then the column follows
    else apply()
  }
  function setSentence(s: number, animate = true) { sen = s; paint(); place(animate) }

  async function show(b: number, s?: number) {
    const leaving = !!flow!.firstChild && !reduce
    if (leaving) { // the finished paragraph exhales up and away while the next one rises in
      const ghost = para!.cloneNode(true) as HTMLElement
      ghost.classList.add('ghost')
      lift!.append(ghost)
      ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-16px)' }], { duration: 420, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.then(() => ghost.remove())
    }
    blk = b
    heading = /^h[1-6]$/i.test(blocks()[b].el.localName)
    flow!.classList.remove('exhale')
    flow!.replaceChildren(build(b))
    const [s0] = sentencesOf(b)
    setSentence(s ?? s0, false)
    if (leaving) await para!.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 640, delay: 200, easing: RISE, fill: 'backwards' }).finished
    syncPage()
  }

  // The page underneath quietly follows, so your place is saved and Esc lands where you are.
  function wordRect(k: number) { const w = v!.ix.words[k], r = v!.doc.createRange(); r.setStart(w.sn, w.so); r.setEnd(w.en, w.eo); return r.getClientRects()[0] }
  function syncPage() {
    const r = wordRect(v!.ix.sentences[sen].a)
    if (r && pag) pag.showPage(pag.pageOf(r))
  }
  function hide(el: HTMLElement | null, ms = 160) {
    if (hidden && hidden !== el) show_(hidden, ms)
    hidden = el
    if (el) { el.style.transition = `opacity ${ms}ms ease`; el.style.opacity = '0' }
  }
  function show_(el: HTMLElement, ms = 150) { el.style.transition = `opacity ${ms}ms ease`; el.style.opacity = ''; setTimeout(() => { if (el !== hidden) el.style.transition = '' }, ms) }

  /** Where the Stage starts: the chapter you navigated to if its heading is on this spread, else the first word on it. */
  function startBlock(): number {
    const ix = v!.ix, k = pag!.firstWordOnPage(v), end = pag!.currentPage + 1 < v!.pages ? pag!.firstWordOnPage(v, pag!.currentPage + 1) : ix.words.length
    const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()
    const want = norm(chapter)
    if (want) for (let b = ix.words[k].b; b < ix.blocks.length && ix.blocks[b].a < end; b++) {
      const t = norm(ix.blocks[b].text)
      if (ix.blocks[b].kind === 'heading' && t && (t.startsWith(want) || want.startsWith(t))) return b
    }
    const b = ix.words[k].b
    return readable(b) ? b : Math.max(0, nextBlock(b, 1))
  }

  // ---------- open / close (the lift) ----------
  export async function start() {
    if (open || busy || !pag?.current || !settings.guide) return
    v = pag.current
    if (!v.ix.words.length) { ontoast?.('Nothing to read on this page'); return }
    busy = true
    const b = startBlock(), k0 = pag.firstWordOnPage(v)
    const k = v.ix.blocks[b].a <= k0 && k0 <= v.ix.blocks[b].b ? k0 : v.ix.blocks[b].a
    open = true; onopen?.(true)
    await tick()
    const src = wordRect(k), frame = v.iframe.getBoundingClientRect()
    await show(b, v.ix.words[k].s)
    if (!reduce && src) {
      // Arrive whole, then focus: the paragraph flies up in full ink, then narrows to your sentence.
      flow!.classList.add('whole')
      const tgt = extent(sen), box = flow!.getBoundingClientRect(), first = flow!.querySelector(`[data-s="${sen}"]`)!.getClientRects()[0]
      const ox = first.left - lift!.getBoundingClientRect().left, oy = box.top + tgt.top - lift!.getBoundingClientRect().top
      lift!.style.transformOrigin = `${ox}px ${oy}px`
      hide(blocks()[b].el as HTMLElement)
      veil!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.4,0,.2,1)' })
      const fly = lift!.animate([
        { transform: `translate(${frame.left + src.left - first.left}px, ${frame.top + src.top - (box.top + tgt.top)}px) scale(${src.height / first.height})`, opacity: 0 },
        { opacity: 1, offset: 0.18 },
        { transform: 'none', opacity: 1 },
      ], { duration: 820, easing: 'cubic-bezier(.16,1,.3,1)' })
      setTimeout(() => flow?.classList.remove('whole'), 490)
      await fly.finished.catch(() => {})
    }
    busy = false; landed = true
    if (closing) return close()
    play()
  }

  export async function close() {
    if (!open) return
    if (busy) { closing = true; root?.getAnimations({ subtree: true }).forEach(a => a.finish()); return }
    closing = false
    busy = true; landed = false
    stop()
    waiting = ''
    const k = v!.ix.sentences[sen].a, b = blk
    const r = wordRect(k)
    if (r && pag) { while (pag.isBusy) await new Promise(res => setTimeout(res, 40)); await pag.showPage(pag.pageOf(r)) }
    const src = wordRect(k), frame = v!.iframe.getBoundingClientRect()
    if (!reduce && src) {
      // Set it back down: the copy glides to its spot and hands over to the page's own paragraph.
      const box = flow!.getBoundingClientRect(), tgt = extent(sen), first = flow!.querySelector(`[data-s="${sen}"]`)!.getClientRects()[0]
      lift!.style.transformOrigin = `${first.left - lift!.getBoundingClientRect().left}px ${box.top + tgt.top - lift!.getBoundingClientRect().top}px`
      hide(blocks()[b].el as HTMLElement, 0)
      veil!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 460, delay: 120, easing: 'ease-out', fill: 'forwards' })
      setTimeout(() => { if (hidden) show_(hidden, 150); hidden = null }, 370)
      await lift!.animate([
        { transform: 'none', opacity: 1 },
        { opacity: 1, offset: 0.7 },
        { transform: `translate(${frame.left + src.left - first.left}px, ${frame.top + src.top - (box.top + tgt.top)}px) scale(${src.height / first.height})`, opacity: 0 },
      ], { duration: 520, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.catch(() => {})
    }
    if (hidden) { show_(hidden, 0); hidden = null }
    open = false; busy = false; onopen?.(false)
  }

  /** The paginator changed chapter (we asked it to, at a chapter's end). */
  export function view(nv: View) { if (open && nv !== v) v = nv }

  // ---------- reading ----------
  function play() { playing = true; schedule() }
  function stop() { playing = false; clearTimeout(timer) }
  function schedule() {
    clearTimeout(timer)
    if (!playing || waiting || busy) return
    timer = window.setTimeout(advance, sentenceTime(v!.ix, sen, wpm))
  }
  const waits = (kind: Breath) => kind === 'paragraph' ? settings.paraEnd === 'wait' : kind === 'chapter' || kind === 'end' ? settings.paraEnd === 'wait' : false
  function advance() {
    const [, s1] = sentencesOf(blk)
    if (sen < s1) { setSentence(sen + 1); schedule(); return }
    const br = breath(v!.ix, blk)
    // Exhale: the finished paragraph eases toward read, and the breath line sits under its last line.
    flow!.classList.add('exhale')
    const box = flow!.getBoundingClientRect(), { bottom } = extent(sen)
    breathAt = { x: box.left, y: Math.min(innerHeight * 0.8, box.top + bottom + 14) }
    waiting = br.kind
    if (waits(br.kind)) return
    breathMs = br.ms
    timer = window.setTimeout(onward, br.ms)
  }
  async function onward() {
    const was = waiting
    waiting = ''; breathAt = null
    const nb = nextBlock(blk, 1)
    if (nb < 0 || was === 'end') return nextChapter()
    busy = true; await show(nb); busy = false
    if (closing) return close()
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
    const b = nextBlock(-1, 1)
    if (b < 0) return
    busy = true; await show(b); busy = false
    if (closing) return close()
    schedule()
  }
  /** Manual moves by sentence or paragraph. */
  async function step(dir: 1 | -1, unit: 'sentence' | 'paragraph' = 'sentence') {
    if (busy) return
    clearTimeout(timer)
    const [s0, s1] = sentencesOf(blk)
    if (waiting && dir > 0) return onward()
    waiting = ''; breathAt = null; flow!.classList.remove('exhale')
    if (unit === 'sentence' && (dir > 0 ? sen < s1 : sen > s0)) setSentence(sen + dir)
    else {
      const nb = nextBlock(blk, dir)
      if (nb < 0) { if (dir > 0) return nextChapter(); return schedule() }
      busy = true
      await show(nb, dir < 0 && unit === 'sentence' ? sentencesOf(nb)[1] : undefined)
      busy = false
      if (closing) return close()
    }
    schedule()
  }
  function speed(f: number) {
    wpm = Math.round(Math.max(120, Math.min(MAX_WPM, wpm * f)))
    onpace?.(wpm); ontoast?.(`${wpm} wpm`)
    schedule()
  }
  function toggle() {
    if (waiting) return onward()
    playing ? stop() : play()
  }

  // ---------- input ----------
  let spaceHeld = false
  export function key(e: KeyboardEvent): boolean {
    if ((e.target as HTMLElement)?.closest?.('input, textarea, select, dialog[open]') || e.metaKey || e.ctrlKey) return false
    if (settings.guideStyle !== 'stage' || !settings.guide) return false
    if (e.type === 'keyup') { if (e.key === ' ' && spaceHeld) { spaceHeld = false; return true } return open }
    if (!open) {
      if ((e.key === ' ' && !e.shiftKey) || ((e.key === 'g' || e.key === 'G') && !e.altKey)) { e.preventDefault(); if (!e.repeat) { spaceHeld = e.key === ' '; start() } return true }
      return false
    }
    e.preventDefault()
    if (e.repeat && e.key === ' ') return true
    const act: Record<string, () => unknown> = {
      ' ': () => { spaceHeld = true; toggle() },
      Escape: close, q: close, g: close, G: close,
      ArrowRight: () => step(1), l: () => step(1), ArrowLeft: () => step(-1), h: () => step(-1),
      ArrowDown: () => step(1, 'paragraph'), j: () => step(1, 'paragraph'), '}': () => step(1, 'paragraph'),
      ArrowUp: () => step(-1, 'paragraph'), k: () => step(-1, 'paragraph'), '{': () => step(-1, 'paragraph'),
      ']': () => speed(1.1), '[': () => speed(1 / 1.1),
    }
    act[e.key]?.()
    return true
  }

  let downY = 0, downAt = 0, wheelLock = 0
  function down(e: PointerEvent) { downY = e.clientY; downAt = e.timeStamp }
  function up(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    const dy = e.clientY - downY
    if (Math.abs(dy) > 40) step(dy < 0 ? 1 : -1)
    else if (e.timeStamp - downAt < 500) toggle()
  }
  // One flick, one step: trackpad momentum keeps extending the lock until it settles.
  function wheel(e: WheelEvent) {
    const now = Date.now()
    if (now < wheelLock) { wheelLock = now + 250; return }
    if (Math.abs(e.deltaY) < 12) return
    wheelLock = now + 600
    step(e.deltaY > 0 ? 1 : -1)
  }
</script>

{#if open}
  <div class="stage" bind:this={root} role="dialog" tabindex="-1" aria-label="Stage reading" onpointerdown={down} onpointerup={up} onwheel={wheel}>
    <div class="veil" bind:this={veil}></div>
    <div class="win" style:font-family={font} style:--size="{settings.fontScale / 100}">
      <div class="lift" bind:this={lift}>
        <div class="para" bind:this={para}>
          <div class="flow" class:heading bind:this={flow} aria-live="polite"></div>
        </div>
      </div>
    </div>
    <div class="fade top-fade" class:on={landed}></div>
    <div class="fade bottom-fade" class:on={landed}></div>
    <div class="top">{chapter}</div>
    {#if waiting && breathAt && !waits(waiting)}
      <span class="breath" style:left="{breathAt.x}px" style:top="{breathAt.y}px"><i style:animation-duration="{breathMs}ms"></i></span>
    {/if}
    <div class="foot" aria-live="polite">
      {#if waiting === 'end' && waits(waiting)}<span>End of chapter · {go} to go on</span>
      {:else if waiting === 'chapter' && waits(waiting)}<span>{go === 'tap' ? 'Tap' : 'Space'} for the next chapter</span>
      {:else if waiting === 'paragraph' && waits(waiting)}<span>{go === 'tap' ? 'Tap' : 'Space'} for the next paragraph</span>
      {:else if !waiting && !playing && !busy}<span>Paused · {go} to go on</span>{/if}
    </div>
    <button class="x" aria-label="Back to the page (Esc)" onclick={close}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
    </button>
  </div>
{/if}

<style>
  .stage { position: fixed; inset: 0; z-index: 7; overflow: hidden; touch-action: none; user-select: none; cursor: default; }
  .veil { position: absolute; inset: 0; background: var(--bg); } /* opaque: WebKit shows iframes unblurred through backdrop-filter */
  .win {
    position: absolute; inset: 0 0 0 50%; width: min(26em, calc(100vw - 32px)); translate: -50% 0;
    font-size: calc(var(--size) * clamp(21px, 1.2vw + 12px, 27px)); line-height: 1.62; color: var(--fg);
  }
  .lift { position: relative; will-change: transform, opacity; }
  .para { will-change: transform, opacity; }
  .lift :global(.ghost) { position: absolute; inset: 0 0 auto 0; pointer-events: none; }
  .flow { position: relative; text-wrap: pretty; hyphens: manual; }
  .flow :global(*) { margin: 0; font-size: inherit; line-height: inherit; }
  .flow :global(img) { display: block; margin: 0 auto .8em; max-height: 38vh; max-width: 100%; }
  .flow.heading { font-weight: 600; letter-spacing: -.01em; font-size: 1.3em; line-height: 1.3; text-wrap: balance; text-align: center; }
  /* Colour steps (light/dark contrast ≈ next 4.5, later 2.8, just read 3.4, read 2.2) */
  .flow :global([data-s]) { color: color-mix(in srgb, var(--fg) 30%, transparent); transition: color .8s ease; }
  .flow :global([data-s].next) { color: color-mix(in srgb, var(--fg) 56%, transparent); }
  .flow :global([data-s].now) { color: var(--fg); transition-duration: .5s; }
  .flow :global([data-s].prev) { color: color-mix(in srgb, var(--fg) 45%, transparent); transition-duration: .5s; }
  .flow :global([data-s].read) { color: color-mix(in srgb, var(--fg) 26%, transparent); transition-duration: 1.2s; }
  .flow:global(.exhale) :global([data-s].now) { color: color-mix(in srgb, var(--fg) 62%, transparent); transition-duration: 1.4s; }
  .flow:global(.whole) :global([data-s]) { color: var(--fg); transition: none; }
  .fade { position: absolute; left: 0; right: 0; height: 26%; pointer-events: none; opacity: 0; transition: opacity .3s ease; }
  .fade.on { opacity: 1; }
  .top-fade { top: 0; background: linear-gradient(var(--bg) 40%, transparent); }
  .bottom-fade { bottom: 0; height: 30%; background: linear-gradient(transparent, var(--bg) 70%); }
  .top { position: absolute; top: calc(env(safe-area-inset-top) + 22px); left: 0; right: 0; text-align: center; font: 600 11px system-ui; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); pointer-events: none; }
  .foot { position: absolute; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom) + 28px); display: grid; place-items: center; font: 12px system-ui; color: var(--muted); pointer-events: none; min-height: 16px; }
  .foot span { animation: fade .5s ease both; }
  .breath { position: absolute; width: 56px; height: 2px; border-radius: 1px; background: color-mix(in srgb, var(--fg) 10%, transparent); overflow: hidden; opacity: .4; pointer-events: none; animation: fade .4s ease both; }
  .breath i { display: block; height: 100%; background: var(--accent); transform-origin: left; animation: fill linear both; }
  .x { position: absolute; z-index: 1; top: calc(env(safe-area-inset-top) + 12px); right: 12px; width: 40px; height: 40px; border: 0; border-radius: 50%; background: transparent; color: var(--muted); display: grid; place-items: center; cursor: pointer; transition: background-color .2s, color .2s; }
  .x:hover { background: var(--hover); color: var(--fg); }
  @keyframes fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .flow :global([data-s]) { transition: none; } }
</style>
