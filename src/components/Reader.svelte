<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { Book, type TocItem } from '../lib/epub.ts'
  import { Paginator, type Relocation } from '../lib/paginator.ts'
  import type { Settings } from '../lib/settings.ts'
  import { getFile, saveBook, type BookRecord } from '../lib/store.svelte.ts'
  import Appearance from './Appearance.svelte'
  import Sheet from './Sheet.svelte'
  import Toc from './Toc.svelte'

  let { record, settings = $bindable(), onclose }: { record: BookRecord; settings: Settings; onclose: () => void } = $props()

  const rec: BookRecord = untrack(() => $state.snapshot(record)) // local copy we persist
  let host: HTMLDivElement
  let book = $state.raw<Book>()
  let pag: Paginator | undefined
  let loc = $state<Relocation>()
  let chrome = $state(true)
  let tocOpen = $state(false)
  let aaOpen = $state(false)
  let error = $state('')
  let scrub = $state<number | null>(null)
  let saveTimer = 0

  const pct = (p: number) => `${Math.round(p * 100)}%`
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
        setTimeout(() => { if (!tocOpen && !aaOpen) chrome = false }, 1400)
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

  const isCurrent = (t: TocItem) => !!book && !!loc && t.label === loc.chapter && book.spineIndex(t.href) === loc.index

  function pick(href: string) {
    tocOpen = false
    chrome = false
    pag?.goTo(href)
  }
</script>

<svelte:window onkeydown={e => { if (e.key === 'Escape' && !tocOpen && !aaOpen) chrome = !chrome }} />

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

  <header class="bar top">
    <button class="back" onclick={onclose} aria-label="Back to library">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
      <span>Library</span>
    </button>
    <div class="title"><strong>{rec.title}</strong><span>{rec.creator}</span></div>
    <div class="actions">
      <button class="icon-btn" aria-label="Contents" onclick={() => (tocOpen = true)} disabled={!book}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></svg>
      </button>
      <button class="icon-btn aa" aria-label="Appearance" onclick={() => (aaOpen = true)}>
        <span class="a1">A</span><span class="a2">A</span>
      </button>
    </div>
  </header>

  <footer class="bar bottom">
    {#if loc}
      <span class="label">{scrub !== null ? pct(scrub) : loc.chapter}</span>
      <input type="range" min="0" max="1000" aria-label="Book position"
        value={Math.round((scrub ?? loc.progress) * 1000)}
        oninput={e => (scrub = +e.currentTarget.value / 1000)}
        onchange={e => { pag?.goToProgress(+e.currentTarget.value / 1000); scrub = null }}
        style:--p="{(scrub ?? loc.progress) * 100}%" />
      <span class="label">{pct(loc.progress)}</span>
    {/if}
  </footer>

  {#if error}
    <div class="error" role="alert">
      <h2>Couldn’t open this book</h2>
      <p>{error}</p>
      <button class="pill" onclick={onclose}>Back to library</button>
    </div>
  {/if}
</div>

{#if book}
  <Sheet bind:open={tocOpen} title="Contents">
    <Toc toc={book.toc} {isCurrent} onpick={pick} />
  </Sheet>
{/if}
<Sheet bind:open={aaOpen} title="Themes & Settings" seeThrough>
  <Appearance bind:settings />
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
    position: absolute; left: 50%; translate: -50% 0; max-width: 70vw; pointer-events: none;
    font-size: .74rem; letter-spacing: .04em; color: var(--muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: opacity .35s var(--ease);
  }
  .head { top: calc(env(safe-area-inset-top) + 16px); font-family: var(--serif); font-style: italic; letter-spacing: .02em; }
  .foot { bottom: calc(env(safe-area-inset-bottom) + 16px); font-variant-numeric: tabular-nums; }
  .chrome .running { opacity: 0; }

  .bar {
    position: absolute; left: 0; right: 0; z-index: 2; display: flex; align-items: center; gap: 12px;
    background: color-mix(in srgb, var(--surface) 82%, transparent);
    backdrop-filter: blur(24px) saturate(1.5); -webkit-backdrop-filter: blur(24px) saturate(1.5);
    transition: transform .45s var(--ease), opacity .3s;
  }
  .top {
    top: 0; padding: calc(env(safe-area-inset-top) + 6px) max(10px, env(safe-area-inset-right)) 6px max(10px, env(safe-area-inset-left));
    box-shadow: 0 1px 0 color-mix(in srgb, var(--fg) 8%, transparent);
  }
  .bottom {
    bottom: 0; padding: 12px max(18px, env(safe-area-inset-right)) calc(env(safe-area-inset-bottom) + 14px) max(18px, env(safe-area-inset-left));
    box-shadow: 0 -1px 0 color-mix(in srgb, var(--fg) 8%, transparent);
  }
  .reader:not(.chrome) .top { transform: translateY(-100%); opacity: 0; pointer-events: none; }
  .reader:not(.chrome) .bottom { transform: translateY(100%); opacity: 0; pointer-events: none; }

  .back { display: flex; align-items: center; gap: 2px; border: 0; background: none; color: var(--accent); font-size: 1rem; padding: 8px 6px; border-radius: 10px; }
  .back svg { width: 22px; height: 22px; }
  .title { flex: 1; min-width: 0; display: grid; text-align: center; line-height: 1.25; }
  .title strong { font-size: .9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .title span { font-size: .74rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .actions { display: flex; gap: 2px; }
  .aa { font-family: var(--serif); display: inline-flex; align-items: baseline; justify-content: center; gap: 1px; }
  .a1 { font-size: .8rem; }
  .a2 { font-size: 1.15rem; font-weight: 600; }
  @media (max-width: 520px) { .back span, .title span { display: none; } }

  .label { font-size: .74rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 30%; font-variant-numeric: tabular-nums; }
  input[type=range] {
    flex: 1; appearance: none; height: 4px; border-radius: 2px; margin: 0; cursor: pointer;
    background: linear-gradient(var(--accent), var(--accent)) 0 / var(--p) 100% no-repeat, var(--line);
  }
  input[type=range]::-webkit-slider-thumb { appearance: none; width: 22px; height: 22px; border-radius: 50%; background: white; box-shadow: 0 1px 4px rgb(0 0 0 / .3); }
  input[type=range]::-moz-range-thumb { width: 22px; height: 22px; border: 0; border-radius: 50%; background: white; box-shadow: 0 1px 4px rgb(0 0 0 / .3); }

  .spinner {
    position: absolute; top: 50%; left: 50%; width: 28px; height: 28px; margin: -14px;
    border: 2.5px solid var(--line); border-top-color: var(--accent); border-radius: 50%;
    animation: spin .8s linear infinite;
  }
  .error { position: absolute; inset: 0; z-index: 3; display: grid; place-content: center; justify-items: center; text-align: center; padding: 24px; background: var(--bg); }
  .error h2 { font: 600 1.5rem var(--serif); margin: 0 0 8px; }
  .error p { color: var(--muted); max-width: 420px; margin: 0 0 22px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
