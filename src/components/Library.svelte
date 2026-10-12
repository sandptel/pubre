<script lang="ts">
  import { flushSync, onMount, untrack } from 'svelte'
  import { flip } from 'svelte/animate'
  import { cubicOut } from 'svelte/easing'
  import { fly, scale } from 'svelte/transition'
  import { importFile, listAnnotations, listBooks, removeBook, saveBook, type BookRecord } from '../lib/store.svelte.ts'
  import type { Settings } from '../lib/settings.ts'
  import { bookMinutesLeft, calmRange, since } from '../lib/calm.ts'
  import { tintOf } from '../lib/tint.ts'
  import Cover from './Cover.svelte'
  import MiniCapsule from './MiniCapsule.svelte'
  import Skyline from './Skyline.svelte'
  import Sheet from './Sheet.svelte'
  import Appearance from './Appearance.svelte'
  import ReadingAids from './ReadingAids.svelte'

  let { lastId, settings = $bindable(), onopen, onview }: { lastId: string; settings: Settings; onopen: (r: BookRecord) => void; onview: (r: BookRecord) => void } = $props()

  let books = $state<BookRecord[]>([])
  let loaded = $state(false)
  let busy = $state(0)
  let dragging = $state(false)
  let error = $state('')
  let morphId = $state(untrack(() => lastId))
  let menu = $state<{ book: BookRecord; x: number; y: number } | null>(null)
  let undo = $state<{ book: BookRecord; timer: number } | null>(null)
  let input: HTMLInputElement

  let settingsOpen = $state(false)
  let sview = $state<'menu' | 'look' | 'aids'>('menu')
  // Pick up where you left off: the book you read most recently comes first.
  const lastRead = (b: BookRecord) => b.readAt ?? b.opened ?? 0
  const reading = $derived(books.filter(b => b.progress > 0 && b.progress < 0.995).sort((x, y) => lastRead(y) - lastRead(x)))
  const current = $derived(reading[0])
  const away = $derived(!!current?.readAt && Date.now() - current.readAt > 3 * 864e5) // after a gap: recall first, then the reminder
  let recalled = $state(false)
  const chapterLeft = (b: BookRecord) => { const r = b.chapterLeft ? calmRange(b.chapterLeft / Math.max(60, settings.wpm)) : ''; return r ? `${r} left in chapter` : '' }
  let marks = $state<Record<string, string>>({}) // your latest highlight per book you're reading
  $effect(() => { for (const b of reading) if (!(b.id in marks)) listAnnotations(b.id).then(l => { const a = l.sort((x, y) => y.created - x.created)[0]; marks = { ...marks, [b.id]: a ? a.exact.replace(/\s+/g, ' ').slice(0, 120) : '' } }) })
  const recent = $derived(books.filter(b => b !== current && b.progress < 0.995 && (b.progress > 0 || b.readAt)).sort((x, y) => lastRead(y) - lastRead(x)).slice(0, 12))
  // Up next as tinted cards: each takes its cover's own colour (averaged once, cached on the record).
  let tints = $state<Record<string, string>>({})
  $effect(() => { for (const b of books) if (!b.progress && !(b.id in tints)) tintOf(b).then(t => (tints = { ...tints, [b.id]: t })) })
  const anyStarted = $derived(books.some(b => b.progress > 0)) // a "new" dot means nothing while every book is new
  // Shelves: what you're reading, what's next, what you've finished. Empty shelves are hidden.
  const shelves = $derived([

    { id: 'next', title: 'Up next', list: books.filter(b => !b.progress) },
    { id: 'done', title: 'Finished', list: books.filter(b => b.progress >= 0.995) },
  ].filter(s => s.list.length))
  const timeLeft = (b: BookRecord) => {
    const r = calmRange(bookMinutesLeft(b.profile?.words, b.location?.index ?? 0, b.location?.fraction ?? 0, settings.wpm))
    return r ? `${r} left at your pace` : ''
  }
  async function markFinished(b: BookRecord, done: boolean) {
    menu = null
    b.progress = done ? 1 : 0
    if (!done) b.location = undefined
    await saveBook(b)
    books = [...books]
  }

  onMount(async () => {
    books = await listBooks()
    loaded = true
    setTimeout(() => (morphId = ''), 700) // let the cover morph land, then free the name
  })

  async function add(files: Iterable<File>) {
    const list = Array.from(files) // FileList is live: the input reset / drop end empties it
    error = ''
    for (const f of list) {
      if (!/\.epub$/i.test(f.name) && f.type !== 'application/epub+zip') { error = `${f.name} is not an EPUB`; continue }
      busy++
      try {
        const r = await importFile(f)
        books = [r, ...books.filter(b => b.id !== r.id)]
      } catch (e) {
        error = `${f.name}: ${(e as Error).message}`
      } finally {
        busy--
      }
    }
  }

  /** A book: its landing page first. Continue reading goes straight in. */
  function open(r: BookRecord, direct = false) {
    if (pressed) return
    morphId = r.id
    flushSync() // the cover must carry its view-transition-name before the snapshot
    if (direct) onopen(r); else onview(r)
  }

  // Remove immediately; delete for real only if not undone.
  function remove(r: BookRecord) {
    menu = null
    commitUndo()
    books = books.filter(b => b.id !== r.id)
    undo = { book: r, timer: window.setTimeout(commitUndo, 5000) }
  }
  function commitUndo() {
    if (!undo) return
    clearTimeout(undo.timer)
    removeBook(undo.book.id)
    undo = null
  }
  function restore() {
    if (!undo) return
    clearTimeout(undo.timer)
    const b = undo.book
    books = [...books, b].sort((x, y) => y.opened - x.opened)
    undo = null
  }

  // Item actions: right-click, or long-press on touch (iOS has no contextmenu event).
  let pressTimer = 0, pressed = false
  function showMenu(book: BookRecord, x: number, y: number) {
    menu = { book, x: Math.min(x, innerWidth - 220), y: Math.min(y, innerHeight - 120) }
    navigator.vibrate?.(8)
  }
  function pressStart(e: PointerEvent, b: BookRecord) {
    pressed = false
    if (e.pointerType === 'mouse') return
    const { clientX: x, clientY: y } = e
    pressTimer = window.setTimeout(() => { pressed = true; showMenu(b, x, y) }, 480)
  }
  const pressEnd = () => { clearTimeout(pressTimer); setTimeout(() => (pressed = false), 0) }

  const pct = (p: number) => (p >= 0.995 ? 'Finished' : p > 0 ? `${Math.round(p * 100)}%` : '')
</script>

<svelte:window
  onkeydown={e => { if (e.key === 'Escape') menu = null }}
  ondragover={e => { e.preventDefault(); dragging = true }}
  ondragleave={e => { if (!e.relatedTarget) dragging = false }}
  ondrop={e => { e.preventDefault(); dragging = false; if (e.dataTransfer) add(e.dataTransfer.files) }}
/>

<main class="library" class:aside={settingsOpen}>
  <header class="lib-h">
    <div>
      <h1>My Library</h1>
      <p class="sub">{current ? 'Pick up where you left off' : books.length ? `${books.length} ${books.length === 1 ? 'book' : 'books'}` : 'Your shelf, at your pace'}</p>
    </div>
    <input bind:this={input} type="file" accept=".epub,application/epub+zip" multiple hidden
      onchange={e => { add(e.currentTarget.files ?? []); e.currentTarget.value = '' }} />
  </header>

  {#if error}<p class="error" role="alert" transition:fly={{ y: -8, duration: 250 }}>{error}</p>{/if}

  {#if current}
    <section class="hero" in:fly={{ y: 12, duration: 500, easing: cubicOut }} aria-label="Pick up where you left off">
      <div class="h-top">
        <button class="h-cover" aria-label="Open {current.title}" onclick={() => open(current)} style:view-transition-name={morphId === current.id ? 'cover' : undefined}><Cover book={current} /></button>
        <div class="h-info">
          <span class="eyebrow">{away ? 'Welcome back' : 'Now reading'}{current.readAt ? ` · ${since(current.readAt)}` : ''}</span>
          <b class="h-title">{current.title}</b>
          <span class="h-author">{current.creator}</span>
          {#if current.chapter}<span class="h-chapter">{current.chapter}</span>{/if}
          <span class="h-prog">{#if (current.profile?.chapters?.length ?? 0) > 2}<Skyline chapters={current.profile?.chapters} progress={current.progress} from={current.sessionFrom ?? current.progress} />{:else}<MiniCapsule words={current.profile?.words} progress={current.progress} />{/if}<span class="num">{pct(current.progress)}</span></span>
          {#if chapterLeft(current) || timeLeft(current)}<span class="h-left">{chapterLeft(current) || timeLeft(current)}</span>{/if}
        </div>
      </div>
      {#if current.lastLine}
        {#if away && !recalled}
          <div class="c-recall"><span>What happened last? Take a moment to recall it.</span><button onclick={() => (recalled = true)}>Remind me</button></div>
        {:else}
          <blockquote class="c-line" in:fly={{ y: 6, duration: 400, easing: cubicOut }}>
            <p>“{current.lastLine}”</p>
            {#if current.who?.length || marks[current.id]}<cite>{current.who?.length ? `with ${current.who.join(', ')}` : ''}{current.who?.length && marks[current.id] ? ' · ' : ''}{marks[current.id] ? `your last mark: “${marks[current.id]}”` : ''}</cite>{/if}
          </blockquote>
        {/if}
      {/if}
      <button class="go" onclick={() => open(current, true)}>Continue reading
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
    </section>
  {/if}

  {#if loaded && !books.length}
    <section class="empty" in:fly={{ y: 16, duration: 600, easing: cubicOut }}>
      <div class="art" aria-hidden="true"><span></span><span></span><span></span></div>
      <h2>Your library is empty</h2>
      <p>Drop an <strong>.epub</strong> here, or add one with the + below.</p>
      <button class="go small" onclick={() => input.click()}>Add books</button>
      <p class="hint">DRM-free books work — try <a href="https://standardebooks.org" target="_blank" rel="noopener">Standard Ebooks</a>
        or <a href="https://www.gutenberg.org" target="_blank" rel="noopener">Project Gutenberg</a>.</p>
    </section>
  {:else}
    {#if recent.length}
      <section class="shelf" aria-label="Recent">
        <h2 class="shelf-h">Recent</h2>
        <div class="row">
          {#each recent as b (b.id)}
            <button class="tile" aria-label="Open {b.title}" onclick={() => open(b)} oncontextmenu={e => { e.preventDefault(); showMenu(b, e.clientX, e.clientY) }}
              onpointerdown={e => pressStart(e, b)} onpointerup={pressEnd} onpointercancel={pressEnd} onpointerleave={pressEnd}>
              <span class="cover" style:view-transition-name={morphId === b.id && b !== current ? 'cover' : undefined}><Cover book={b} /></span>
              <span class="title">{b.title}</span>
              <span class="author">{b.creator}</span>
              <span class="t-prog">{#if b.progress >= 0.995}Finished{:else}<span class="mini"><i style:width="{b.progress * 100}%"></i></span><span class="num">{pct(b.progress)}</span>{/if}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
    {#each shelves as shelf (shelf.id)}
      <section class="shelf" aria-label={shelf.title}>
        <h2 class="shelf-h">{shelf.title}<span class="num">{shelf.list.length}</span></h2>
        {#if shelf.id === 'next'}
          <div class="stack">
            {#each shelf.list as b, i (b.id)}
              <button class="tcard" style:--t={tints[b.id] || 'var(--card)'} style:--i={i} aria-label="Start {b.title}" onclick={() => open(b)}
                oncontextmenu={e => { e.preventDefault(); showMenu(b, e.clientX, e.clientY) }}
                onpointerdown={e => pressStart(e, b)} onpointerup={pressEnd} onpointercancel={pressEnd} onpointerleave={pressEnd}>
                <span class="tc-title">{b.title}</span>
                <span class="tc-cover" style:view-transition-name={morphId === b.id && b !== current ? 'cover' : undefined}><Cover book={b} /></span>
                <span class="tc-foot"><span class="tc-author">{b.creator}</span><span class="tc-go">Start <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></span></span>
              </button>
            {/each}
          </div>
        {:else}
        <ul class="grid">
          {#each shelf.list as b, i (b.id)}
            <li style:--i={i} animate:flip={{ duration: 450, easing: cubicOut }} out:scale={{ start: 0.85, duration: 250 }}>
              <button class="book" aria-label="Open {b.title}" onclick={() => open(b)}
                oncontextmenu={e => { e.preventDefault(); showMenu(b, e.clientX, e.clientY) }}
                onpointerdown={e => pressStart(e, b)} onpointerup={pressEnd} onpointercancel={pressEnd} onpointerleave={pressEnd}>
                <span class="cover" style:view-transition-name={morphId === b.id && b !== current ? 'cover' : undefined}><Cover book={b} /></span>
                <span class="title">{#if !b.progress && anyStarted}<i class="dot" title="New"></i>{/if}{b.title}</span>
                <span class="author">{b.creator}</span>
              </button>
            </li>
          {/each}
        </ul>
        {/if}
      </section>
    {/each}
  {/if}
</main>

<!-- The bar: one dark pill in the thumb's reach — your library, add a book, settings. -->
<nav class="dockbar" aria-label="Library">
  <button class="b-item on" aria-current="page" onclick={() => scrollTo({ top: 0, behavior: 'smooth' })}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4v16H5zM10.5 4h4v16h-4zM16 5.2l3.6-1 3.4 15.4-3.6 1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
    <span>Library</span></button>
  <button class="b-add" aria-label="Add books" onclick={() => input.click()} disabled={busy > 0} class:busy={busy > 0}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg></button>
  <button class="b-item" onclick={() => { sview = 'menu'; settingsOpen = true }}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.8" /><circle cx="8" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
    <span>Settings</span></button>
</nav>

{#if menu}
  <div class="scrim" role="presentation" onclick={() => (menu = null)} oncontextmenu={e => { e.preventDefault(); menu = null }}></div>
  <div class="menu glass" role="menu" style:left="{menu.x}px" style:top="{menu.y}px" transition:scale={{ start: 0.7, duration: 220, easing: cubicOut }}>
    <span class="m-title">{menu.book.title}</span>
    <button role="menuitem" onclick={() => markFinished(menu!.book, menu!.book.progress < 0.995)}>
      {menu.book.progress >= 0.995 ? 'Mark as unread' : 'Mark as finished'}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </button>
    <button role="menuitem" class="danger" onclick={() => remove(menu!.book)}>
      Remove from library
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
    </button>
  </div>
{/if}

<Sheet bind:open={settingsOpen} title={sview === 'menu' ? 'Settings' : sview === 'look' ? 'Themes & Settings' : 'Reading aids'} back={sview !== 'menu' ? () => (sview = 'menu') : undefined}>
  {#if sview === 'menu'}
    <div class="slist">
      <button onclick={() => (sview = 'look')}><span class="aa">Aa</span><span>Themes &amp; Settings<small>Palette, mode, font, layout</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg></button>
      <button onclick={() => (sview = 'aids')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="9" width="9" height="6" rx="2" fill="currentColor" opacity=".35" stroke="none" /><path d="M3 18h18M15 12h6" /></svg><span>Reading aids<small>Guide, lenses, comfort</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg></button>
    </div>
    <p class="about">pubre reads on your device: books, notes and insights never leave it. Word data: wordfreq (CC BY-SA) and Open English WordNet (CC BY).</p>
  {:else if sview === 'look'}
    <Appearance bind:settings />
  {:else}
    <ReadingAids bind:value={settings} part="guide" />
  {/if}
</Sheet>

{#if undo}
  <div class="toast glass" role="status" transition:fly={{ y: 40, duration: 450, easing: cubicOut }}>
    <span>Removed “{undo.book.title}”</span>
    <button onclick={restore}>Undo</button>
  </div>
{/if}

{#if dragging}
  <div class="drop" aria-hidden="true"><div>Drop to add</div></div>
{/if}

<style>
  /* desktop: settings dock on the left and the shelf steps aside, side by side */
  @media (min-width: 1000px) { .library.aside { transform: translateX(max(0px, calc(min(460px, 36vw) - (100vw - min(100vw, 1180px)) / 2 + 24px))); } }
  .library {
    max-width: 1180px; margin: 0 auto; transition: transform .55s var(--spring);
    padding: max(var(--s6), env(safe-area-inset-top)) max(var(--s5), env(safe-area-inset-right)) calc(var(--s7) + 88px + env(safe-area-inset-bottom)) max(var(--s5), env(safe-area-inset-left));
  }
  .lib-h { display: flex; align-items: end; gap: var(--s3); margin-bottom: var(--s5); }
  h1 { font: 400 36px/1.05 var(--serif); letter-spacing: -.015em; margin: 0; }
  .sub { margin: 6px 0 0; font-size: 14px; color: var(--muted); }
  .error { background: color-mix(in srgb, var(--base08) 14%, transparent); color: var(--base08); padding: var(--s3) var(--s4); border-radius: var(--r2); margin: 0 0 var(--s5); }
  .num { font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 12px; color: var(--muted); }
  .eyebrow { font: 600 10.5px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--accent); }

  /* Pick up where you left off: a card that lifts off the page — the book, your place, the line you stopped on. */
  .hero { width: min(100%, 640px); box-sizing: border-box; margin-bottom: var(--s6); padding: var(--s4); border-radius: var(--r4); background: var(--card); box-shadow: var(--e1); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s4); } /* minmax: long lines clip instead of widening the card */
  .h-top { display: flex; gap: var(--s4); align-items: start; }
  .h-cover { all: unset; cursor: pointer; width: 92px; flex: none; transition: transform .45s var(--spring); }
  .h-cover:active { transform: scale(.97); }
  .h-info { display: grid; gap: 4px; min-width: 0; flex: 1; padding-top: 2px; }
  .h-title { font: 500 21px/1.2 var(--serif); letter-spacing: -.01em; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .h-author { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .h-chapter { font: italic 13.5px var(--serif); color: color-mix(in srgb, var(--fg) 72%, var(--bg)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .h-prog { display: flex; align-items: center; gap: var(--s2); margin-top: 6px; }
  .h-prog :global(.mini), .h-prog :global(.sky) { flex: 1; }
  .h-prog { align-items: end; }
  .h-left { font: 12px var(--mono); color: var(--muted); }
  .c-line { margin: 0; padding: 0 2px; }
  .c-line p { margin: 0; font: italic 15px/1.5 var(--serif); color: color-mix(in srgb, var(--fg) 82%, var(--bg)); display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .c-line cite { display: block; margin-top: 6px; font: 12px system-ui; color: var(--muted); font-style: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c-recall { display: flex; align-items: center; gap: var(--s3); font: italic 14px/1.4 var(--serif); color: var(--muted); }
  .c-recall span { flex: 1; }
  .c-recall button { flex: none; border: 0; border-radius: 999px; padding: 8px 14px; background: var(--bg); color: var(--fg); font: 600 13px system-ui; font-style: normal; box-shadow: var(--e1); }
  /* The ink pill (the one strong action on the screen) */
  .go { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 52px; padding: 0 var(--s4) 0 var(--s5); border: 0; border-radius: var(--r3); background: var(--ink); color: var(--on-ink); font: 600 15px system-ui; transition: transform .35s var(--spring), filter .2s; }
  .go svg { width: 20px; height: 20px; }
  .go:active { transform: scale(.98); }
  .go:hover { filter: brightness(1.12); }
  .go.small { width: auto; gap: var(--s3); padding: 0 var(--s5); }

  /* Recent: covers in a row, with how far along */
  .row { display: flex; gap: var(--s4); overflow-x: auto; padding: 4px 2px 10px; margin: 0 calc(-1 * var(--s5)); padding-inline: var(--s5); scroll-snap-type: x mandatory; scrollbar-width: none; }
  .row::-webkit-scrollbar { display: none; }
  .tile { all: unset; box-sizing: border-box; cursor: pointer; flex: none; width: 112px; display: grid; gap: 2px; scroll-snap-align: start; -webkit-touch-callout: none; user-select: none; }
  .tile .title { font-size: 13px; }
  .t-prog { display: flex; align-items: center; gap: 6px; margin-top: 3px; font: 11px var(--mono); color: var(--muted); }
  .t-prog .num { font-size: 11px; }
  .mini { flex: 1; height: 3px; border-radius: 2px; background: color-mix(in srgb, var(--fg) 12%, transparent); overflow: hidden; }
  .mini i { display: block; height: 100%; background: var(--accent); }
  .shelf + .shelf { margin-top: var(--s6); }
  /* Up next: tinted cards, each in its cover's colour (softened toward the page), a big title, Start */
  .stack { display: grid; gap: var(--s3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); }
  .tcard {
    all: unset; box-sizing: border-box; cursor: pointer; position: relative; display: grid; grid-template-columns: 1fr 64px; grid-template-rows: 1fr auto; gap: var(--s3);
    min-height: 168px; padding: var(--s4) var(--s4) var(--s3); border-radius: var(--r4); overflow: hidden;
    background: color-mix(in srgb, var(--t) 46%, var(--bg)); color: var(--fg); box-shadow: var(--e1);
    animation: rise .5s var(--ease) both; animation-delay: calc(min(var(--i), 10) * 50ms); transition: transform .4s var(--spring); -webkit-touch-callout: none; user-select: none;
  }
  .tcard:active { transform: scale(.98); }
  .tcard:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .tc-title { font: 500 25px/1.08 var(--serif); letter-spacing: -.015em; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .tc-cover { width: 64px; align-self: start; transform: rotate(3deg); }
  .tc-foot { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: var(--s2); padding-top: var(--s2); border-top: 1px solid color-mix(in srgb, var(--fg) 14%, transparent); }
  .tc-author { font-size: 12px; color: color-mix(in srgb, var(--fg) 70%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tc-go { display: inline-flex; align-items: center; gap: 6px; flex: none; padding: 7px 12px; border-radius: 999px; background: var(--ink); color: var(--on-ink); font: 600 11px var(--mono); letter-spacing: .08em; text-transform: uppercase; }
  .tc-go svg { width: 14px; height: 14px; }
  .shelf-h { font: 500 19px var(--serif); color: var(--fg); margin: 0 0 var(--s4); display: flex; gap: var(--s2); align-items: baseline; }

  /* The bar: a dark pill that floats in the thumb's reach */
  .dockbar {
    position: fixed; z-index: 8; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom) + var(--s4)); margin-inline: auto; width: fit-content;
    display: flex; align-items: center; gap: var(--s2); padding: 6px; border-radius: 999px; background: var(--ink); color: var(--on-ink); box-shadow: var(--e2);
  }
  .b-item { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 var(--s4); border: 0; border-radius: 999px; background: transparent; color: color-mix(in srgb, var(--on-ink) 65%, transparent); font: 600 12px var(--mono); letter-spacing: .06em; text-transform: uppercase; transition: color .2s, background-color .2s; }
  .b-item svg { width: 18px; height: 18px; }
  .b-item.on { color: var(--on-ink); }
  .b-item:hover { color: var(--on-ink); background: color-mix(in srgb, var(--on-ink) 10%, transparent); }
  .b-add { width: 44px; height: 44px; border: 0; border-radius: 50%; display: grid; place-items: center; background: var(--on-ink); color: var(--ink); transition: transform .35s var(--spring); }
  .b-add svg { width: 20px; height: 20px; }
  .b-add:active { transform: scale(.9); }
  .b-add.busy svg { animation: spin 1s linear infinite; }
  .slist { border-radius: 12px; background: var(--hover); overflow: hidden; }
  .slist button { display: flex; align-items: center; gap: var(--s3); width: 100%; min-height: 58px; padding: 0 var(--s4); border: 0; background: none; text-align: left; font-size: 16px; }
  .slist button + button { border-top: .5px solid var(--hairline); }
  .slist button > span:not(.aa) { flex: 1; display: grid; }
  .slist small { font-size: 12px; color: var(--muted); }
  .slist svg { width: 20px; height: 20px; color: var(--accent); }
  .slist .chev { width: 16px; height: 16px; color: var(--muted); }
  .aa { width: 20px; font: 600 15px var(--serif); color: var(--accent); text-align: center; }
  .about { font-size: 12px; color: var(--muted); line-height: 1.5; margin: var(--s4) 0 0; }

  .grid {
    list-style: none; padding: 0; margin: 0;
    display: grid; gap: var(--s6) var(--s5);
    grid-template-columns: repeat(auto-fill, minmax(clamp(132px, 16vw, 200px), 1fr));
  }
  .grid li { animation: rise .5s var(--ease) both; animation-delay: calc(min(var(--i), 12) * 35ms); }
  .book { all: unset; box-sizing: border-box; cursor: pointer; display: grid; gap: 2px; width: 100%; -webkit-touch-callout: none; user-select: none; }
  .book:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 4px; }
  .cover { position: relative; display: block; margin-bottom: var(--s2); transition: transform .45s var(--spring); }
  .book:hover .cover { transform: translateY(-6px) rotate(-.4deg); }
  .book:active .cover { transform: scale(.96); }
  .dot { display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: var(--accent); vertical-align: 1px; }
  .title { font-size: 14px; font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .author { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .empty { text-align: center; padding: 12vh var(--s4); display: grid; justify-items: center; }
  .empty h2 { font: 600 24px var(--serif); margin: var(--s6) 0 var(--s2); }
  .empty p { color: var(--muted); margin: 0 0 var(--s5); line-height: 1.5; }
  .empty .hint { font-size: 13px; margin-top: var(--s5); }
  .empty a { color: var(--accent); }
  .art { display: inline-flex; gap: var(--s2); align-items: end; height: 120px; }
  .art span { width: 52px; border-radius: 4px 8px 8px 4px; box-shadow: var(--shadow-cover); animation: float 4s ease-in-out infinite; }
  .art span:nth-child(1) { height: 92px; background: var(--base0D); }
  .art span:nth-child(2) { height: 116px; background: var(--base09); animation-delay: -1.3s; }
  .art span:nth-child(3) { height: 100px; background: var(--base0B); animation-delay: -2.6s; }

  .scrim { position: fixed; inset: 0; z-index: 9; }
  .menu {
    position: fixed; z-index: 10; width: 210px; border-radius: 14px; padding: var(--s1); transform-origin: top left;
    background: var(--glass-solid);
  }
  .m-title { display: block; padding: var(--s2) var(--s3); font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .menu button {
    display: flex; align-items: center; justify-content: space-between; width: 100%; padding: var(--s3); border: 0; border-radius: 10px;
    background: none; font-size: 15px; text-align: left;
  }
  .menu button:hover { background: var(--hover); }
  .menu svg { width: 18px; height: 18px; }
  .danger { color: var(--base08); }

  .toast {
    position: fixed; z-index: 10; left: 50%; translate: -50% 0; bottom: calc(env(safe-area-inset-bottom) + var(--s5));
    display: flex; align-items: center; gap: var(--s4); padding: var(--s2) var(--s2) var(--s2) var(--s5); border-radius: 999px;
    font-size: 14px; max-width: calc(100vw - 32px); white-space: nowrap;
  }
  .toast span { overflow: hidden; text-overflow: ellipsis; }
  .toast button { border: 0; border-radius: 999px; padding: var(--s2) var(--s4); background: var(--accent); color: var(--bg); font-weight: 600; }

  .drop {
    position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; pointer-events: none;
    background: color-mix(in srgb, var(--bg) 70%, transparent); backdrop-filter: blur(10px);
    animation: fade .2s ease-out;
  }
  .drop div { padding: var(--s6) var(--s7); border: 2px dashed var(--accent); border-radius: 24px; font: 600 20px var(--serif); color: var(--accent); animation: pop .4s var(--spring); }

  @keyframes rise { from { opacity: 0; transform: translateY(14px); } }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { transform: scale(.9); } }
  @keyframes float { 50% { transform: translateY(-8px); } }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
