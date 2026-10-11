<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { fly } from 'svelte/transition'
  import { Book, type TocItem } from '../lib/epub.ts'
  import { Paginator, type Relocation, type Section } from '../lib/paginator.ts'
  import type { Settings } from '../lib/settings.ts'
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
        pag = new Paginator(host, b, $state.snapshot(settings))
        pag.onSections = s => (sections = s)
        pag.onRelocate = r => {
          loc = r
          rec.location = { index: r.index, fraction: r.fraction }
          rec.progress = r.progress
          clearTimeout(saveTimer)
          saveTimer = window.setTimeout(save, 500)
        }
        pag.onTap = zone => { chrome = zone === 'center' ? !chrome : false }
        rec.opened = Date.now()
        await pag.open(rec.location?.index ?? 0, rec.location?.fraction ?? 0)
        setTimeout(() => { if (!panel) chrome = false }, 1400)
      } catch (e) {
        error = (e as Error).message
      }
    })()
    return () => {
      gone = true
      save()
      pag?.destroy()
      book?.destroy()
    }
  })

  $effect(() => {
    const s = $state.snapshot(settings)
    pag?.setSettings(s)
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
    <button class="fab glass menu" aria-label="Reading menu" onclick={() => { view = 'menu'; panel = true }} disabled={!book}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h9" /></svg>
    </button>
  </div>

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
  .error { position: absolute; inset: 0; z-index: 3; display: grid; place-content: center; justify-items: center; text-align: center; padding: var(--s5); background: var(--bg); }
  .error h2 { font: 600 1.5rem var(--serif); margin: 0 0 var(--s2); }
  .error p { color: var(--muted); max-width: 420px; margin: 0 0 var(--s5); }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
