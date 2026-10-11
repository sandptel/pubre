<script lang="ts">
  import { flushSync, onMount, untrack } from 'svelte'
  import { flip } from 'svelte/animate'
  import { cubicOut } from 'svelte/easing'
  import { fly, scale } from 'svelte/transition'
  import { importFile, listAnnotations, listBooks, removeBook, saveBook, type BookRecord } from '../lib/store.svelte.ts'
  import type { Settings } from '../lib/settings.ts'
  import { bookMinutesLeft, calmRange, since } from '../lib/calm.ts'
  import Cover from './Cover.svelte'
  import MiniCapsule from './MiniCapsule.svelte'
  import Sheet from './Sheet.svelte'
  import Appearance from './Appearance.svelte'
  import ReadingAids from './ReadingAids.svelte'

  let { lastId, settings = $bindable(), onopen }: { lastId: string; settings: Settings; onopen: (r: BookRecord) => void } = $props()

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
  const anyStarted = $derived(books.some(b => b.progress > 0)) // a "new" dot means nothing while every book is new
  // Shelves: what you're reading, what's next, what you've finished. Empty shelves are hidden.
  const shelves = $derived([
    { id: 'reading', title: 'Recently read', list: reading.filter(b => b !== current) },
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

  function open(r: BookRecord) {
    if (pressed) return
    morphId = r.id
    flushSync() // the cover must carry its view-transition-name before the snapshot
    onopen(r)
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

<main class="library">
  <header>
    <h1>Library</h1>
    <button class="fab gear" aria-label="Settings" onclick={() => { sview = 'menu'; settingsOpen = true }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
    </button>
    <button class="fab add" aria-label="Add books" onclick={() => input.click()} disabled={busy > 0} class:busy={busy > 0}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
    </button>
    <input bind:this={input} type="file" accept=".epub,application/epub+zip" multiple hidden
      onchange={e => { add(e.currentTarget.files ?? []); e.currentTarget.value = '' }} />
  </header>

  {#if error}<p class="error" role="alert" transition:fly={{ y: -8, duration: 250 }}>{error}</p>{/if}

  {#if current}
    <section class="continue" in:fly={{ y: 12, duration: 500, easing: cubicOut }} aria-label="Pick up where you left off">
      <button class="c-main" onclick={() => open(current)}>
        <span class="c-cover" style:view-transition-name={morphId === current.id ? 'cover' : undefined}><Cover book={current} /></span>
        <span class="c-info">
          <span class="eyebrow">{away ? 'Welcome back' : 'Now reading'}{current.readAt ? ` · ${since(current.readAt)}` : ''}</span>
          <span class="c-title">{current.title}</span>
          {#if current.chapter}<span class="c-chapter">{current.chapter}</span>{/if}
          <span class="c-cap"><MiniCapsule words={current.profile?.words} progress={current.progress} /></span>
          <span class="c-meta">{pct(current.progress)}{chapterLeft(current) ? ` · ${chapterLeft(current)}` : timeLeft(current) ? ` · ${timeLeft(current)}` : ''}</span>
        </span>
      </button>
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
    </section>
  {/if}

  {#if loaded && !books.length}
    <section class="empty" in:fly={{ y: 16, duration: 600, easing: cubicOut }}>
      <div class="art" aria-hidden="true"><span></span><span></span><span></span></div>
      <h2>Your library is empty</h2>
      <p>Drop an <strong>.epub</strong> here, or add one from your device.</p>
      <button class="pill" onclick={() => input.click()}>Add books</button>
      <p class="hint">DRM-free books work — try <a href="https://standardebooks.org" target="_blank" rel="noopener">Standard Ebooks</a>
        or <a href="https://www.gutenberg.org" target="_blank" rel="noopener">Project Gutenberg</a>.</p>
    </section>
  {:else}
    {#each shelves as shelf (shelf.id)}
      <section class="shelf" aria-label={shelf.title}>
        <h2 class="shelf-h">{shelf.title}<span>{shelf.list.length}</span></h2>
    {#if shelf.id === 'reading'}
      <div class="recent">
        {#each shelf.list as b (b.id)}
          <button class="r-card" onclick={() => open(b)} oncontextmenu={e => { e.preventDefault(); showMenu(b, e.clientX, e.clientY) }}
            onpointerdown={e => pressStart(e, b)} onpointerup={pressEnd} onpointercancel={pressEnd} onpointerleave={pressEnd}>
            <span class="r-cover"><Cover book={b} /></span>
            <span class="r-info">
              <b>{b.title}</b>
              {#if b.chapter}<span class="c-chapter">{b.chapter}</span>{/if}
              {#if b.lastLine}<span class="r-line">“{b.lastLine}”</span>{/if}
              <span class="r-cap"><MiniCapsule words={b.profile?.words} progress={b.progress} /></span>
              <span class="c-meta">{b.readAt ? since(b.readAt) : pct(b.progress)}{b.who?.length ? ` · with ${b.who.join(', ')}` : ''}</span>
            </span>
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
            <span class="cover" style:view-transition-name={morphId === b.id && b !== current ? 'cover' : undefined}>
              <Cover book={b} />
              {#if b.progress > 0 && b.progress < 0.995}<span class="bar"><span style:width="{b.progress * 100}%"></span></span>{/if}
            </span>
            <span class="title">{#if !b.progress && anyStarted}<i class="dot" title="New"></i>{/if}{b.title}</span>
            <span class="author">{b.creator}{b.progress >= 0.995 ? ' · Finished' : ''}</span>
          </button>
        </li>
      {/each}
    </ul>
    {/if}
      </section>
    {/each}
  {/if}
</main>

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
    <ReadingAids bind:value={settings} />
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
  .library {
    max-width: 1180px; margin: 0 auto;
    padding: max(var(--s6), env(safe-area-inset-top)) max(var(--s5), env(safe-area-inset-right)) var(--s7) max(var(--s5), env(safe-area-inset-left));
  }
  header { display: flex; align-items: center; gap: var(--s2); margin-bottom: var(--s5); }
  header h1 { flex: 1; }
  .gear { background: var(--hover); }
  h1 { font: 700 34px/1.1 var(--serif); letter-spacing: -.02em; margin: 0; }
  .add { background: var(--accent); color: var(--bg); box-shadow: 0 4px 14px -4px color-mix(in srgb, var(--accent) 60%, transparent); }
  .add:hover { background: var(--accent); filter: brightness(1.06); }
  .add.busy svg { animation: spin 1s linear infinite; }
  .error { background: color-mix(in srgb, var(--base08) 14%, transparent); color: var(--base08); padding: var(--s3) var(--s4); border-radius: 12px; margin: 0 0 var(--s5); }

  /* Pick up where you left off: the book, your place in it, and the line you stopped on. */
  .continue { box-sizing: border-box; width: min(100%, 560px); margin-bottom: var(--s6); border-radius: 20px; background: var(--hover); overflow: hidden; }
  .c-main {
    all: unset; box-sizing: border-box; cursor: pointer; display: flex; gap: var(--s4); align-items: center; width: 100%;
    padding: var(--s3); transition: transform .4s var(--spring), background-color .2s;
  }
  .c-main:hover { background: color-mix(in srgb, var(--fg) 5%, transparent); }
  .c-main:active { transform: scale(.985); }
  .c-main:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: 20px; }
  .c-cap { display: block; margin: 6px 0 2px; }
  .c-line { margin: 0; padding: var(--s1) var(--s4) var(--s4) calc(var(--s3) + 64px + var(--s4)); }
  .c-line p { margin: 0; font: italic 15px/1.5 var(--serif); color: color-mix(in srgb, var(--fg) 82%, var(--bg)); display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .c-line cite { display: block; margin-top: 6px; font: 12px system-ui; color: var(--muted); font-style: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c-recall { display: flex; align-items: center; gap: var(--s3); padding: 0 var(--s4) var(--s4) calc(var(--s3) + 64px + var(--s4)); font: italic 14px/1.4 var(--serif); color: var(--muted); }
  .c-recall span { flex: 1; }
  .c-recall button { flex: none; border: 0; border-radius: 999px; padding: 8px 14px; background: var(--bg); color: var(--fg); font: 600 13px system-ui; font-style: normal; box-shadow: 0 1px 3px rgb(0 0 0 / .08); }
  @media (max-width: 480px) { .c-line, .c-recall { padding-left: var(--s4); } }
  .recent { display: grid; gap: var(--s3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); }
  .r-card { all: unset; box-sizing: border-box; cursor: pointer; display: flex; gap: var(--s3); padding: var(--s3); border-radius: 16px; background: var(--hover); -webkit-touch-callout: none; user-select: none; transition: transform .4s var(--spring), background-color .2s; }
  .r-card:hover { background: color-mix(in srgb, var(--fg) 9%, transparent); }
  .r-card:active { transform: scale(.98); }
  .r-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .r-cover { width: 56px; flex: none; }
  .r-info { display: grid; gap: 3px; min-width: 0; align-content: start; }
  .r-info b { font: 600 16px/1.25 var(--serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .r-line { font: italic 13.5px/1.45 var(--serif); color: color-mix(in srgb, var(--fg) 75%, var(--bg)); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .r-cap { display: block; margin: 4px 0 1px; }
  .c-cover { width: 64px; flex: none; }
  .c-info { display: grid; gap: var(--s1); min-width: 0; flex: 1; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
  .c-title { font: 600 18px/1.25 var(--serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c-chapter { font-size: 13px; font-style: italic; font-family: var(--serif); color: color-mix(in srgb, var(--fg) 75%, var(--bg)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .shelf + .shelf { margin-top: var(--s6); }
  .shelf-h { font: 600 13px var(--sans, system-ui); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 0 0 var(--s4); display: flex; gap: var(--s2); align-items: baseline; }
  .shelf-h span { font-weight: 400; }
  .slist { border-radius: 12px; background: var(--hover); overflow: hidden; }
  .slist button { display: flex; align-items: center; gap: var(--s3); width: 100%; min-height: 58px; padding: 0 var(--s4); border: 0; background: none; text-align: left; font-size: 16px; }
  .slist button + button { border-top: .5px solid var(--hairline); }
  .slist button > span:not(.aa) { flex: 1; display: grid; }
  .slist small { font-size: 12px; color: var(--muted); }
  .slist svg { width: 20px; height: 20px; color: var(--accent); }
  .slist .chev { width: 16px; height: 16px; color: var(--muted); }
  .aa { width: 20px; font: 600 15px var(--serif); color: var(--accent); text-align: center; }
  .about { font-size: 12px; color: var(--muted); line-height: 1.5; margin: var(--s4) 0 0; }
  .c-meta { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar span { display: block; height: 100%; background: var(--accent); border-radius: 2px; }

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
  .bar { position: absolute; left: 8%; right: 8%; bottom: 7px; height: 3px; border-radius: 2px; background: rgb(255 255 255 / .45); overflow: hidden; box-shadow: 0 1px 3px rgb(0 0 0 / .3); }
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
