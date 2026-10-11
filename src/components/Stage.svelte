<script lang="ts">
  // Stage: Space lifts the paragraph you're on off the page, larger, and reads it with you a sentence
  // at a time. The sentence you're on is in full ink; the next one waits below, what you've read
  // drifts up and fades. Paragraphs breathe before the next rises; a chapter's end waits for you.
  import { tick } from 'svelte'
  import type { Paginator, View } from '../lib/paginator.ts'
  import { fonts, type Settings } from '../lib/settings.ts'
  import { breath, sentenceTime } from '../lib/pacing.ts'

  let { pag, settings, chapter = '', onopen, onpace, ontoast }: {
    pag: Paginator | undefined; settings: Settings; chapter?: string
    onopen?: (open: boolean) => void; onpace?: (wpm: number) => void; ontoast?: (m: string) => void
  } = $props()

  let open = $state(false)
  let playing = $state(false)
  let waiting = $state<'' | 'paragraph' | 'section' | 'end'>('')
  let breathMs = $state(0)
  let heading = $state(false)
  let veil = $state<HTMLDivElement>(), lift = $state<HTMLDivElement>(), para = $state<HTMLDivElement>(), flow = $state<HTMLDivElement>()
  let v: View | undefined, blk = -1, sen = -1, timer = 0, wpm = 260
  let busy = $state(false)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const ANCHOR = 0.38 // the sentence you're on sits at 38% of the screen height
  const EASE = 'cubic-bezier(.22,1,.36,1)'
  const font = $derived(fonts[settings.font]?.stack || 'ui-serif, Georgia, serif')
  $effect(() => { wpm = settings.wpm })

  export const isOpen = () => open

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
      sp.className = s < sen ? 'read' : s === sen ? 'now' : s === sen + 1 ? 'next' : ''
    }
  }
  /** Scroll the flow so the current sentence's first line sits on the anchor. */
  function place(animate = true) {
    const sp = flow!.querySelector<HTMLElement>(`[data-s="${sen}"]`)
    const y = innerHeight * ANCHOR - (sp?.offsetTop ?? 0)
    flow!.style.transition = animate && !reduce ? `transform .75s ${EASE}` : 'none'
    flow!.style.transform = `translateY(${y}px)`
  }
  function setSentence(s: number, animate = true) { sen = s; paint(); place(animate) }

  async function show(b: number, s?: number) {
    const out = !!flow!.firstChild && !reduce
    if (out) await para!.animate([{ opacity: 1, transform: 'none', filter: 'none' }, { opacity: 0, transform: 'translateY(-28px)', filter: 'blur(3px)' }], { duration: 380, easing: 'ease-in' }).finished
    blk = b
    heading = blocks()[b].kind === 'heading'
    flow!.replaceChildren(build(b))
    const [s0] = sentencesOf(b)
    setSentence(s ?? s0, false)
    if (out) para!.animate([{ opacity: 0, transform: 'translateY(44px)' }, { opacity: 1, transform: 'none' }], { duration: 720, easing: EASE })
    syncPage()
  }

  // The page underneath quietly follows, so your place is saved and Esc lands where you are.
  function wordRect(k: number) { const w = v!.ix.words[k], r = v!.doc.createRange(); r.setStart(w.sn, w.so); r.setEnd(w.en, w.eo); return r.getClientRects()[0] }
  function syncPage() {
    const r = wordRect(v!.ix.sentences[sen].a)
    if (r && pag) pag.showPage(pag.pageOf(r))
  }

  // ---------- open / close (the lift) ----------
  export async function start() {
    if (open || busy || !pag?.current || !settings.guide) return
    v = pag.current
    if (!v.ix.words.length) return
    busy = true
    const k = pag.firstWordOnPage(v)
    let b = v.ix.words[k].b
    if (!readable(b)) b = Math.max(0, nextBlock(b, 1))
    open = true; onopen?.(true)
    await tick()
    const src = wordRect(v.ix.blocks[b].a <= k && k <= v.ix.blocks[b].b ? k : v.ix.blocks[b].a), frame = v.iframe.getBoundingClientRect()
    await show(b, v.ix.words[Math.max(k, v.ix.blocks[b].a)].s)
    if (!reduce && src) {
      const tgt = flow!.querySelector<HTMLElement>(`[data-s="${sen}"]`)!.getClientRects()[0], box = lift!.getBoundingClientRect()
      const scale = src.height / tgt.height
      lift!.style.transformOrigin = `${tgt.left - box.left}px ${tgt.top - box.top}px`
      veil!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' })
      await lift!.animate([
        { transform: `translate(${frame.left + src.left - tgt.left}px, ${frame.top + src.top - tgt.top}px) scale(${scale})`, opacity: 0.4 },
        { opacity: 1, offset: 0.3 },
        { transform: 'none', opacity: 1 },
      ], { duration: 780, easing: 'cubic-bezier(.2,.85,.25,1)' }).finished
    }
    busy = false
    play()
  }

  export async function close() {
    if (!open || busy) return
    busy = true
    stop()
    waiting = ''
    const k = v!.ix.sentences[sen].a
    const r = wordRect(k)
    if (r && pag) await pag.showPage(pag.pageOf(r))
    const src = wordRect(k), frame = v!.iframe.getBoundingClientRect()
    if (!reduce && src) {
      const tgt = flow!.querySelector<HTMLElement>(`[data-s="${sen}"]`)!.getClientRects()[0], box = lift!.getBoundingClientRect()
      lift!.style.transformOrigin = `${tgt.left - box.left}px ${tgt.top - box.top}px`
      veil!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 460, easing: 'ease-in', fill: 'forwards' })
      await lift!.animate([
        { transform: 'none', opacity: 1 },
        { transform: `translate(${frame.left + src.left - tgt.left}px, ${frame.top + src.top - tgt.top}px) scale(${src.height / tgt.height})`, opacity: 0 },
      ], { duration: 480, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).finished
    }
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
  async function advance() {
    const [, s1] = sentencesOf(blk)
    if (sen < s1) { setSentence(sen + 1); schedule(); return }
    const br = breath(v!.ix, blk)
    waiting = br.kind
    if (br.kind === 'end' || (br.kind === 'paragraph' && settings.paraEnd === 'wait')) return
    breathMs = br.ms
    timer = window.setTimeout(onward, br.ms)
  }
  async function onward() {
    waiting = ''
    const nb = nextBlock(blk, 1)
    if (nb < 0) return nextChapter()
    busy = true; await show(nb); busy = false
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
    if (pag.current === old) { waiting = 'end'; return } // the book is over
    v = pag.current!
    const b = nextBlock(-1, 1)
    if (b < 0) return
    busy = true; await show(b); busy = false
    schedule()
  }
  /** Manual moves: a sentence (±1) or a paragraph (±2). */
  async function step(dir: 1 | -1, unit: 'sentence' | 'paragraph' = 'sentence') {
    if (busy) return
    clearTimeout(timer)
    const [s0, s1] = sentencesOf(blk)
    if (waiting && dir > 0) return onward()
    waiting = ''
    if (unit === 'sentence' && (dir > 0 ? sen < s1 : sen > s0)) setSentence(sen + dir)
    else {
      const nb = nextBlock(blk, dir)
      if (nb < 0) { if (dir > 0) return nextChapter(); return schedule() }
      busy = true
      await show(nb, dir < 0 && unit === 'sentence' ? sentencesOf(nb)[1] : undefined)
      busy = false
    }
    schedule()
  }
  function speed(f: number) {
    wpm = Math.round(Math.max(120, Math.min(450, wpm * f)))
    onpace?.(wpm); ontoast?.(`${wpm} wpm`)
    schedule()
  }
  function toggle() {
    if (waiting === 'end') return nextChapter()
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
  function wheel(e: WheelEvent) {
    if (Date.now() < wheelLock || Math.abs(e.deltaY) < 12) return
    wheelLock = Date.now() + 420
    step(e.deltaY > 0 ? 1 : -1)
  }
</script>

{#if open}
  <div class="stage" role="dialog" tabindex="-1" aria-label="Stage reading" onpointerdown={down} onpointerup={up} onwheel={wheel}>
    <div class="veil" bind:this={veil}></div>
    <div class="win" style:font-family={font} style:--size="{settings.fontScale / 100}">
      <div class="lift" bind:this={lift}>
        <div class="para" bind:this={para}>
          <div class="flow" class:heading bind:this={flow} aria-live="polite"></div>
        </div>
      </div>
    </div>
    <div class="top">{chapter}</div>
    <div class="foot" aria-live="polite">
      {#if waiting === 'end'}<span>End of chapter · Space to go on</span>
      {:else if waiting && settings.paraEnd === 'wait' && waiting === 'paragraph'}<span>Space for the next paragraph</span>
      {:else if waiting}<span class="breath"><i style:animation-duration="{breathMs}ms"></i></span>
      {:else if !playing && !busy}<span>Paused · Space to go on</span>{/if}
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
    position: absolute; inset: 0 0 0 50%; width: min(32em, calc(100vw - 32px)); translate: -50% 0;
    font-size: calc(var(--size) * clamp(19px, 1.2vw + 12px, 27px)); line-height: 1.62; color: var(--fg);
    -webkit-mask-image: linear-gradient(to bottom, transparent 6%, #000 30%, #000 74%, transparent 97%);
    mask-image: linear-gradient(to bottom, transparent 6%, #000 30%, #000 74%, transparent 97%);
  }
  .lift, .para { will-change: transform, opacity; }
  .flow { position: relative; will-change: transform; text-wrap: pretty; hyphens: auto; }
  .flow :global(*) { margin: 0; font-size: inherit; line-height: inherit; }
  .flow :global(img) { max-height: 30vh; max-width: 100%; }
  .flow.heading { font-weight: 600; letter-spacing: -.01em; font-size: 1.3em; line-height: 1.3; text-wrap: balance; }
  .flow :global([data-s]) { color: color-mix(in srgb, var(--fg) 38%, transparent); transition: color .8s ease; }
  .flow :global([data-s].next) { color: color-mix(in srgb, var(--fg) 52%, transparent); }
  .flow :global([data-s].now) { color: var(--fg); transition-duration: .45s; }
  .flow :global([data-s].read) { color: color-mix(in srgb, var(--fg) 30%, transparent); transition-duration: 1.2s; }
  .top { position: absolute; top: calc(env(safe-area-inset-top) + 22px); left: 0; right: 0; text-align: center; font: 600 11px system-ui; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); pointer-events: none; }
  .foot { position: absolute; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom) + 28px); display: grid; place-items: center; font: 12px system-ui; color: var(--muted); pointer-events: none; min-height: 16px; }
  .foot span { animation: fade .5s ease both; }
  .breath { width: 56px; height: 2px; border-radius: 1px; background: color-mix(in srgb, var(--fg) 12%, transparent); overflow: hidden; display: block; }
  .breath i { display: block; height: 100%; background: var(--accent); transform-origin: left; animation: fill linear both; }
  .x { position: absolute; top: calc(env(safe-area-inset-top) + 12px); right: 12px; width: 40px; height: 40px; border: 0; border-radius: 50%; background: transparent; color: var(--muted); display: grid; place-items: center; cursor: pointer; transition: background-color .2s, color .2s; }
  .x:hover { background: var(--hover); color: var(--fg); }
  @keyframes fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .flow :global([data-s]) { transition: none; } }
</style>
