<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { fly } from 'svelte/transition'
  import { Book, type TocItem } from '../lib/epub.ts'
  import { Paginator, type Relocation, type Section } from '../lib/paginator.ts'
  import { effective, type Settings } from '../lib/settings.ts'
  import { Guide, type GuideState } from '../lib/guide.ts'
  import { Lenses, type Token } from '../lib/lenses.ts'
  import { define, loadCommon } from '../lib/lexicon.ts'
  import { whoHue, WHO_SLOTS } from '../lib/marks.ts'
  import { resolveTheme } from '../lib/settings.ts'
  import type { View as BookView } from '../lib/paginator.ts'
  import { getFile, saveBook, type BookRecord } from '../lib/store.svelte.ts'
  import Appearance from './Appearance.svelte'
  import Cover from './Cover.svelte'
  import Progress from './Progress.svelte'
  import Sheet from './Sheet.svelte'
  import Toc from './Toc.svelte'

  let { record, settings = $bindable(), onclose }: { record: BookRecord; settings: Settings; onclose: () => void } = $props()

  type View = 'menu' | 'contents' | 'appearance'
  const titles: Record<View, string> = { menu: '', contents: 'Contents', appearance: 'Themes & Settings' }

  const rec: BookRecord = untrack(() => $state.snapshot(record)) // local copy we persist
  let host: HTMLDivElement
  let book = $state.raw<Book>()
  let pag: Paginator | undefined
  let loc = $state<Relocation>()
  let sections = $state.raw<Section[]>([])
  let chrome = $state(true)
  let panel = $state(false)
  let view = $state<View>('menu')
  let dir = $state(1)
  let error = $state('')
  let saveTimer = 0
  let padT = 0, padDown = 0
  let guide: Guide | undefined
  let lenses: Lenses | undefined
  let card = $state<{ x: number; y: number; below: boolean; html: string } | null>(null)
  let cardKey = '', dwellT = 0, hoverT = 0
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  let gstate = $state<GuideState>({ active: false, gliding: false, wpm: 260 })
  let toastMsg = $state('')
  let toastT = 0
  const eff = $derived(effective(settings, rec.prefs))
  function toast(m: string) { toastMsg = m; clearTimeout(toastT); toastT = window.setTimeout(() => (toastMsg = ''), 1800) }

  const left = $derived(loc ? loc.pages - loc.page - 1 : 0)

  function save() {
    clearTimeout(saveTimer)
    saveBook(rec)
  }

  onMount(() => {
    let gone = false
    ;(async () => {
      try {
        const data = await getFile(rec.id)
        if (!data) throw new Error('This book’s file is missing from the library.')
        const b = await Book.open(new Uint8Array(data))
        if (gone) return b.destroy()
        book = b
        pag = new Paginator(host, b, $state.snapshot(eff))
        guide = new Guide(pag, $state.snapshot(eff))
        guide.onState = s => { if (s.active !== gstate.active) { pag?.setReserve(s.active ? 44 : 0); lastFocusBlock = -1; if (!s.active) paintLenses() } gstate = s; if (s.active) chrome = false; if (s.gliding) hideCard() }
        guide.onPace = wpm => (settings.wpm = wpm)
        guide.onToast = toast
        pag.keyHook = e => guide!.key(e)
        pag.tapHook = (v, x, y) => guide!.tapWord(v, x, y)
        lenses = new Lenses($state.snapshot(eff), b.metadata.language)
        pag.onView = v => { guide!.view(v); attachHover(v); paintLenses() }
        guide.onArrive = (v, k) => arrive(v, k)
        loadCommon().then(set => { lenses?.setCommon(set); paintLenses() })
        loadProfile(b)
        pag.onSections = s => (sections = s)
        pag.onRelocate = r => {
          loc = r
          rec.location = { index: r.index, fraction: r.fraction, cfi: r.cfi }
          rec.progress = r.progress
          if (!gstate.active) paintLenses()
          hideCard()
          clearTimeout(saveTimer)
          saveTimer = window.setTimeout(save, 500)
        }
        pag.onTap = zone => { chrome = zone === 'center' ? !chrome : false }
        rec.opened = Date.now()
        if (rec.location?.cfi) await pag.openCfi(rec.location.cfi)
        else await pag.open(rec.location?.index ?? 0, rec.location?.fraction ?? 0)
        setTimeout(() => { if (!panel) chrome = false }, 1400)
      } catch (e) {
        error = (e as Error).message
      }
    })()
    return () => {
      gone = true
      save()
      guide?.destroy()
      pag?.destroy()
      book?.destroy()
    }
  })

  // Only appearance changes re-lay out the book; feature settings (guide, lenses, pace) don't.
  const LAYOUT = ['palette', 'mode', 'font', 'fontScale', 'lineHeight', 'margin', 'justify', 'bold', 'spread'] as const
  let layoutKey = ''
  $effect(() => {
    const s = $state.snapshot(eff)
    const key = JSON.stringify(LAYOUT.map(k => s[k]))
    if (key !== layoutKey) { layoutKey = key; pag?.setSettings(s) }
    guide?.setSettings(s)
    lenses?.setSettings(s)
    paintLenses()
  })
  $effect(() => { if (!panel) setTimeout(() => (view = 'menu'), 400) }) // reset after the close animation

  function go(v: View) {
    dir = v === 'menu' ? -1 : 1
    view = v
  }
  function jump(href: string) {
    panel = false
    chrome = false
    pag?.goTo(href)
  }

  // ---------- lenses ----------
  let lastFocusBlock = -1
  function paintLenses(focusBlock = -1) {
    const v = pag?.current
    if (!v || !lenses || !pag) return
    if (gstate.active) {
      if (focusBlock < 0) focusBlock = lastFocusBlock
      return lenses.paint(v, focusBlock, focusBlock, focusBlock)
    }
    // Only pages near you are painted (keeps WebKit fast; see findings).
    const page = pag.currentPage, ws = v.ix.words
    if (!ws.length) return
    const a = pag.firstWordOnPage(v, Math.max(0, page - 1)), b = page + 2 < v.pages ? pag.firstWordOnPage(v, page + 2) : ws.length - 1
    lenses.paint(v, ws[a].b, ws[b].b)
  }
  async function loadProfile(b: Book) {
    if (rec.profile?.v === 1) { lenses?.setProfile(rec.profile.names); paintLenses(); return }
    const texts = await Promise.all(b.spine.map(s => b.zip.text(s.href).catch(() => '')))
    const worker = new Worker(new URL('../insights/worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = e => {
      rec.profile = { v: 1, names: e.data.names }
      lenses?.setProfile(e.data.names); paintLenses(); save(); worker.terminate()
    }
    worker.postMessage({ texts })
  }
  const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  async function cardHtml(v: BookView, t: Token): Promise<string> {
    const theme = resolveTheme(eff.palette, eff.mode)
    if (t.kind === 'name' || (t.kind === 'speech' && t.key)) {
      const p = lenses!.person(t.key)
      const sofar = p ? p.perSpine.slice(0, v.index + 1).reduce((a, n) => a + n, 0) : 0
      const hue = p && p.slot >= 0 ? whoHue(theme, p.slot % WHO_SLOTS) : 'var(--muted)'
      const lead = t.kind === 'speech' ? 'is speaking.' : sofar > 1 ? `Mentioned ${sofar} times so far.` : 'You’re meeting them now.'
      return `<div class="c-who"><span class="c-av" style="background:${hue}">${escape(t.key[0])}</span><b>${escape(t.key)}</b></div><div class="c-def">${lead}</div><div class="c-meta">Counts stop at your page</div>`
    }
    if (t.kind === 'speech') return `<div class="c-def">Quoted words with no speaker named nearby.</div>`
    if (t.kind === 'foreign') return `<b>${escape(lenses!.rangeOf(v, t).toString().slice(0, 60))}</b><div class="c-def">A phrase in another language (${escape(t.key)}).</div>`
    const d = await define(t.key)
    return `<b>${escape(t.key)}</b>${d ? ` <span class="c-meta">${escape(d.pos)}</span><div class="c-def">${escape(d.text)}</div>` : '<div class="c-def">A rare word. No offline definition for this form.</div>'}`
  }
  async function showCard(v: BookView, t: Token) {
    const key = `${v.index}:${t.blk}:${t.a}:${t.kind}`
    if (key === cardKey) return
    cardKey = key
    const html = await cardHtml(v, t)
    if (cardKey !== key) return
    const r = lenses!.rangeOf(v, t).getClientRects()[0], f = v.iframe.getBoundingClientRect()
    if (!r) return
    const x = Math.max(12, Math.min(innerWidth - 292, f.left + r.left + r.width / 2 - 140))
    const below = f.top + r.top < 110 // never cover the line being read: above it, or below when there's no room
    card = { x, y: below ? f.top + r.bottom + 10 : f.top + r.top - 10, below, html }
  }
  function hideCard() { clearTimeout(dwellT); clearTimeout(hoverT); card = null; cardKey = '' }
  const hooked = new WeakSet<Document>()
  function attachHover(v: BookView) {
    if (hooked.has(v.doc)) return
    hooked.add(v.doc)
    v.doc.addEventListener('mousemove', e => {
      clearTimeout(hoverT)
      hoverT = window.setTimeout(() => {
        const d = v.doc as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }
        const pos = d.caretPositionFromPoint?.(e.clientX, e.clientY), cr = pos ? null : d.caretRangeFromPoint?.(e.clientX, e.clientY)
        const node = pos?.offsetNode ?? cr?.startContainer, off = pos?.offset ?? cr?.startOffset ?? 0
        const t = node && lenses?.tokenAt(v, node, off)
        if (t) showCard(v, t); else hideCard()
      }, 350)
    })
    v.doc.addEventListener('mouseleave', hideCard)
  }
  /** The guide reached word k: repaint lenses if the block changed, bloom names, and offer a card after a dwell. */
  function arrive(v: BookView, k: number) {
    hideCard()
    const w = v.ix.words[k]
    if (!w) return
    if (w.b !== lastFocusBlock) { lastFocusBlock = w.b; paintLenses(w.b) }
    const t = lenses?.tokenAt(v, w.sn, w.so)
    if (t?.kind === 'name' && eff.names && eff.intensity !== 'quiet' && eff.motion === 'full' && !reduceMotion) {
      v.marks.set('bloom', [lenses!.rangeOf(v, t)])
      v.doc.documentElement.animate([{ '--bloom': '0px' }, { '--bloom': '8px' }, { '--bloom': '0px' }] as Keyframe[], { duration: 700, easing: 'ease-out' })
    } else v.marks.set('bloom', [])
    if (t && t.kind !== 'speech') dwellT = window.setTimeout(() => { if (!gstate.gliding) showCard(v, t) }, 600) // help on request, never mid-sentence
  }

  const isCurrent = (t: TocItem) => !!loc && t.label === loc.chapter
</script>

<svelte:window onkeydown={e => { if (e.key === 'Escape' && !panel) chrome = !chrome }} />

<div class="reader" class:chrome>
  <div class="paper" style:view-transition-name="cover">
    <div class="stage" bind:this={host}></div>
    {#if !loc && !error}<div class="spinner" aria-label="Opening book"></div>{/if}
  </div>

  {#if loc}
    <div class="running head" aria-hidden="true">{loc.chapter || rec.title}</div>
    <div class="running foot" aria-hidden="true">
      {left === 0 ? 'Last page in chapter' : `${left} ${left === 1 ? 'page' : 'pages'} left in chapter`}
    </div>
  {/if}

  <button class="fab glass close" aria-label="Close book" onclick={onclose}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>
  </button>

  <div class="dock">
    {#if loc}
      <div class="progress">
        <Progress {sections} progress={loc.progress} chapter={loc.chapter || rec.title} page={loc.page} pages={loc.pages}
          onjump={jump} onscrub={p => pag?.goToProgress(p)} />
      </div>
    {/if}
    {#if eff.guide}
      <button class="fab glass guide-btn" class:on={gstate.active} aria-label={gstate.active ? 'Leave reading guide (G)' : 'Reading guide (G)'} aria-pressed={gstate.active}
        onclick={() => { guide?.toggle(); chrome = false }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="9" width="9" height="6" rx="2" fill="currentColor" opacity=".35" stroke="none" /><path d="M3 18h18M15 12h6" /></svg>
      </button>
    {/if}
    <button class="fab glass menu" aria-label="Reading menu" onclick={() => { view = 'menu'; panel = true }} disabled={!book}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h9" /></svg>
    </button>
  </div>

  {#if gstate.active}
    <button class="pad glass" class:held={gstate.gliding} aria-label="Hold to glide, tap to step, double-tap for sentence start"
      onpointerdown={e => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); padDown = performance.now(); padT = window.setTimeout(() => guide?.holdStart(), 220) }}
      onpointerup={() => { clearTimeout(padT); if (gstate.gliding) guide?.holdEnd(); else if (padDown) guide?.padTap(); padDown = 0 }}
      onpointercancel={() => { clearTimeout(padT); guide?.holdEnd(); padDown = 0 }}
      oncontextmenu={e => e.preventDefault()}>
      <span class="pad-ring"></span><span class="pad-l">{gstate.gliding ? `${gstate.wpm} wpm` : 'Hold'}</span>
    </button>
  {/if}
  {#if card}
    <div class="lens-card glass" class:below={card.below} style:left="{card.x}px" style:top="{card.y}px" role="tooltip">{@html card.html}</div>
  {/if}
  {#if toastMsg}<div class="toast glass" role="status">{toastMsg}</div>{/if}

  {#if error}
    <div class="error" role="alert">
      <h2>Couldn’t open this book</h2>
      <p>{error}</p>
      <button class="pill" onclick={onclose}>Back to library</button>
    </div>
  {/if}
</div>

<Sheet bind:open={panel} title={titles[view]} back={view !== 'menu' ? () => go('menu') : undefined} seeThrough={view === 'appearance'}>
  <div class="views">
    {#key view}
      <div class="view" in:fly={{ x: dir * 40, duration: 380, easing: cubicOut }} out:fly={{ x: -dir * 40, duration: 180 }}>
        {#if view === 'menu'}
          <div class="book">
            <div class="thumb"><Cover book={rec} /></div>
            <div class="info">
              <strong>{rec.title}</strong>
              <span>{rec.creator}</span>
              {#if loc}<span class="where">{Math.round(loc.progress * 100)}%{loc.chapter ? ` · ${loc.chapter}` : ''}</span>{/if}
            </div>
          </div>
          <div class="list">
            <button onclick={() => go('contents')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></svg>
              <span>Contents</span>
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <button onclick={() => go('appearance')}>
              <span class="aa" aria-hidden="true">Aa</span>
              <span>Themes &amp; Settings</span>
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
        {:else if view === 'contents' && book}
          <Toc toc={book.toc} {isCurrent} onpick={jump} />
        {:else if view === 'appearance'}
          <Appearance bind:settings />
        {/if}
      </div>
    {/key}
  </div>
</Sheet>

<style>
  .reader { position: fixed; inset: 0; overflow: hidden; background: var(--bg); }
  .paper { position: absolute; inset: 0; background: var(--bg); }
  .stage {
    position: absolute; overflow: hidden;
    inset: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  .stage :global(.pubre-view) { will-change: transform; color-scheme: normal; }

  .running {
    position: absolute; left: 50%; translate: -50% 0; max-width: 60vw; pointer-events: none;
    font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: opacity .3s var(--ease);
  }
  .head { top: calc(env(safe-area-inset-top) + var(--s4)); font-family: var(--serif); font-style: italic; }
  .foot { bottom: calc(env(safe-area-inset-bottom) + var(--s4)); font-variant-numeric: tabular-nums; }
  .chrome .running { opacity: 0; }

  /* Floating chrome springs in from its edge; the dock trails slightly. */
  .close, .dock { position: absolute; z-index: 2; transition: transform .5s var(--spring), opacity .25s var(--ease); }
  .close { top: calc(env(safe-area-inset-top) + var(--s3)); left: calc(env(safe-area-inset-left) + var(--s3)); }
  .dock {
    left: calc(env(safe-area-inset-left) + var(--s3)); right: calc(env(safe-area-inset-right) + var(--s3));
    bottom: calc(env(safe-area-inset-bottom) + var(--s3));
    display: flex; align-items: end; gap: var(--s2); pointer-events: none; transition-delay: .04s;
  }
  .dock > * { pointer-events: auto; }
  .progress { flex: 1; min-width: 0; }
  .dock .menu { flex: none; margin-left: auto; }
  @media (min-width: 720px) {
    /* Centered capsule; menu button pinned to the corner. */
    .progress { position: absolute; left: 50%; bottom: 0; width: min(560px, calc(100% - 140px)); translate: -50% 0; }
  }
  .reader:not(.chrome) .close { transform: translateY(-12px) scale(.6); opacity: 0; pointer-events: none; }
  .reader:not(.chrome) .dock { transform: translateY(16px) scale(.94); opacity: 0; }
  .reader:not(.chrome) .dock > * { pointer-events: none; }

  .views { display: grid; }
  .view { grid-area: 1 / 1; min-width: 0; }
  .book { display: flex; gap: var(--s4); align-items: center; margin-bottom: var(--s4); padding-right: var(--s6); }
  .thumb { width: 52px; flex: none; }
  .info { display: grid; gap: 2px; min-width: 0; }
  .info strong { font: 600 17px/1.25 var(--serif); }
  .info span { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .info .where { color: var(--accent); font-weight: 600; font-size: 12px; margin-top: 2px; }
  .list { border-radius: 12px; background: var(--hover); overflow: hidden; }
  .list button {
    display: flex; align-items: center; gap: var(--s3); width: 100%; min-height: 50px; padding: 0 var(--s4);
    border: 0; background: none; font-size: 16px; text-align: left; transition: background-color .15s;
  }
  .list button:hover { background: var(--hover); }
  .list button + button { border-top: .5px solid var(--hairline); }
  .list button > span:not(.aa) { flex: 1; }
  .list svg { width: 20px; height: 20px; color: var(--accent); }
  .list .chev { width: 16px; height: 16px; color: var(--muted); }
  .aa { width: 20px; font: 600 15px var(--serif); color: var(--accent); text-align: center; }

  .spinner {
    position: absolute; top: 50%; left: 50%; width: 28px; height: 28px; margin: -14px;
    border: 2.5px solid var(--line); border-top-color: var(--accent); border-radius: 50%;
    animation: spin .8s linear infinite;
  }
  /* Reading guide: pointer (in the page strip, behind the transparent book), pad, toast */
  .reader :global(.pubre-pointer) { position: absolute; left: 0; top: 0; z-index: 0; pointer-events: none; opacity: 0; transition: opacity .2s; }
  .reader :global(.pubre-pointer.on) { opacity: 1; }
  .reader :global(.pubre-pointer.p-word) { background: color-mix(in srgb, var(--accent) 22%, transparent); border-radius: 6px; }
  .reader :global(.pubre-pointer.p-outline) { border-radius: 6px; box-shadow: inset 0 0 0 1.5px var(--accent); }
  .reader :global(.pubre-pointer.p-underline) { background: var(--accent); border-radius: 2px; }
  .reader :global(.pubre-pointer.p-dot) { background: var(--accent); border-radius: 50%; }
  .guide-btn.on { background: var(--accent); color: var(--bg); }
  .pad {
    position: absolute; z-index: 3; right: calc(env(safe-area-inset-right) + var(--s3)); bottom: calc(env(safe-area-inset-bottom) + var(--s3));
    width: 52px; height: 52px; border: 0; border-radius: 50%; display: grid; place-items: center; color: var(--fg);
    touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
    transition: transform .3s var(--ease), opacity .3s; animation: padIn .4s var(--ease);
  }
  .pad.held { transform: scale(.94); }
  .pad-l { font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .pad-ring { position: absolute; inset: -4px; border-radius: 50%; border: 2px solid var(--accent); opacity: 0; }
  .pad.held .pad-ring { opacity: 1; animation: ring 1.2s ease-out infinite; }
  @media (hover: hover) and (pointer: fine) { .pad { opacity: .55; } .pad:hover, .pad.held { opacity: 1; } }
  @keyframes padIn { from { opacity: 0; transform: scale(.8); } }
  @keyframes ring { from { transform: scale(.96); opacity: .9; } to { transform: scale(1.15); opacity: 0; } }
  .lens-card {
    position: fixed; z-index: 5; width: 280px; padding: 10px 14px; border-radius: 14px; font-size: 13.5px; line-height: 1.45;
    transform: translateY(-100%); pointer-events: none; animation: cardIn .2s var(--ease);
  }
  .lens-card.below { transform: none; }
  .lens-card :global(b) { font: 600 16px var(--serif); }
  .lens-card :global(.c-def) { margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .lens-card :global(.c-meta) { font-size: 11.5px; color: var(--muted); }
  .lens-card :global(.c-who) { display: flex; align-items: center; gap: 8px; }
  .lens-card :global(.c-av) { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; color: #fff; font: 600 12px var(--serif); }
  @keyframes cardIn { from { opacity: 0; } }
  .toast { position: absolute; z-index: 4; left: 50%; top: calc(env(safe-area-inset-top) + var(--s5)); translate: -50% 0; padding: 8px 14px; border-radius: 999px; font-size: 13px; animation: toastIn .35s var(--ease); pointer-events: none; }
  @keyframes toastIn { from { opacity: 0; transform: translateY(-6px); } }
  .error { position: absolute; inset: 0; z-index: 3; display: grid; place-content: center; justify-items: center; text-align: center; padding: var(--s5); background: var(--bg); }
  .error h2 { font: 600 1.5rem var(--serif); margin: 0 0 var(--s2); }
  .error p { color: var(--muted); max-width: 420px; margin: 0 0 var(--s5); }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
