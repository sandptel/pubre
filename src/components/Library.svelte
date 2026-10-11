<script lang="ts">
  import { flushSync, onMount, untrack } from 'svelte'
  import { importFile, listBooks, removeBook, type BookRecord } from '../lib/store.svelte.ts'
  import Cover from './Cover.svelte'

  let { lastId, onopen }: { lastId: string; onopen: (r: BookRecord) => void } = $props()

  let books = $state<BookRecord[]>([])
  let loaded = $state(false)
  let busy = $state(0)
  let dragging = $state(false)
  let error = $state('')
  let morphId = $state(untrack(() => lastId))
  let input: HTMLInputElement

  const current = $derived(books.find(b => b.progress > 0 && b.progress < 0.995))

  onMount(async () => {
    books = await listBooks()
    loaded = true
    // Let the cover morph land, then stop naming it so a different book can morph next.
    setTimeout(() => (morphId = ''), 700)
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
    morphId = r.id
    flushSync() // the cover must carry its view-transition-name before the snapshot
    onopen(r)
  }

  async function remove(r: BookRecord) {
    if (!confirm(`Remove “${r.title}” from your library?`)) return
    await removeBook(r.id)
    books = books.filter(b => b.id !== r.id)
  }

  const pct = (p: number) => (p >= 0.995 ? 'Finished' : p > 0 ? `${Math.round(p * 100)}%` : 'New')
</script>

<svelte:window
  ondragover={e => { e.preventDefault(); dragging = true }}
  ondragleave={e => { if (!e.relatedTarget) dragging = false }}
  ondrop={e => { e.preventDefault(); dragging = false; if (e.dataTransfer) add(e.dataTransfer.files) }}
/>

<main class="library">
  <header>
    <div>
      <h1>Library</h1>
      {#if loaded}<p class="sub">{books.length} {books.length === 1 ? 'book' : 'books'}</p>{/if}
    </div>
    <button class="pill" onclick={() => input.click()} disabled={busy > 0}>
      {busy ? 'Adding…' : 'Add books'}
    </button>
    <input bind:this={input} type="file" accept=".epub,application/epub+zip" multiple hidden
      onchange={e => { add(e.currentTarget.files ?? []); e.currentTarget.value = '' }} />
  </header>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if current}
    <section class="hero" aria-label="Continue reading">
      <button class="hero-cover" onclick={() => open(current)}
        style:view-transition-name={morphId === current.id ? 'cover' : undefined}>
        <Cover book={current} />
      </button>
      <div class="hero-info">
        <p class="eyebrow">Continue reading</p>
        <h2>{current.title}</h2>
        <p class="author">{current.creator}</p>
        <div class="bar"><span style:width="{current.progress * 100}%"></span></div>
        <p class="sub">{pct(current.progress)} read</p>
        <button class="pill" onclick={() => open(current)}>Resume</button>
      </div>
    </section>
  {/if}

  {#if loaded && !books.length}
    <section class="empty">
      <div class="empty-art" aria-hidden="true"><span></span><span></span><span></span></div>
      <h2>Your library is empty</h2>
      <p>Drop an <strong>.epub</strong> anywhere on this page, or use <em>Add books</em>.<br />
        pubre opens DRM-free books — try <a href="https://standardebooks.org" target="_blank" rel="noopener">Standard Ebooks</a>
        or <a href="https://www.gutenberg.org" target="_blank" rel="noopener">Project Gutenberg</a>.</p>
    </section>
  {:else}
    <ul class="grid">
      {#each books as b, i (b.id)}
        <li style:--i={i}>
          <button class="cover-btn" onclick={() => open(b)} aria-label="Open {b.title}"
            style:view-transition-name={morphId === b.id && b !== current ? 'cover' : undefined}>
            <Cover book={b} />
          </button>
          <div class="meta">
            <div class="text">
              <span class="title">{b.title}</span>
              <span class="status" class:new={!b.progress}>{pct(b.progress)}</span>
            </div>
            <button class="icon-btn more" aria-label="Remove {b.title}" onclick={() => remove(b)}>
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>

{#if dragging}
  <div class="drop" aria-hidden="true"><div>Drop to add to your library</div></div>
{/if}

<style>
  .library {
    max-width: 1180px; margin: 0 auto;
    padding: max(28px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) 64px max(20px, env(safe-area-inset-left));
  }
  header { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin: 12px 0 28px; }
  h1 { font: 700 clamp(2rem, 5vw, 2.6rem)/1.05 var(--serif); letter-spacing: -.02em; margin: 0; }
  .sub { color: var(--muted); margin: 6px 0 0; font-size: .92rem; }
  .error { background: color-mix(in srgb, var(--base08) 14%, transparent); color: var(--base08); padding: 10px 14px; border-radius: 10px; }

  .hero {
    display: grid; grid-template-columns: minmax(120px, 190px) 1fr; gap: clamp(20px, 4vw, 44px); align-items: center;
    padding: clamp(20px, 3vw, 32px); margin-bottom: 40px; border-radius: 24px;
    background: linear-gradient(135deg, var(--surface), color-mix(in srgb, var(--accent) 7%, var(--surface)));
    animation: rise .6s var(--ease) both;
  }
  .hero-cover { all: unset; cursor: pointer; display: block; width: 100%; transition: transform .35s var(--ease); }
  .hero-cover:hover { transform: translateY(-4px) rotate(-.6deg); }
  .eyebrow { text-transform: uppercase; letter-spacing: .12em; font-size: .72rem; font-weight: 700; color: var(--accent); margin: 0 0 8px; }
  .hero h2 { font: 600 clamp(1.4rem, 3.4vw, 2rem)/1.15 var(--serif); margin: 0; }
  .author { color: var(--muted); margin: 6px 0 18px; }
  .bar { height: 4px; border-radius: 4px; background: var(--line); overflow: hidden; max-width: 320px; }
  .bar span { display: block; height: 100%; background: var(--accent); border-radius: 4px; }
  .hero .pill { margin-top: 16px; }

  .grid {
    list-style: none; padding: 0; margin: 0;
    display: grid; gap: 36px clamp(16px, 3vw, 32px);
    grid-template-columns: repeat(auto-fill, minmax(clamp(132px, 22vw, 170px), 1fr));
  }
  .grid li { animation: rise .5s var(--ease) both; animation-delay: calc(min(var(--i), 12) * 35ms); }
  .cover-btn { all: unset; cursor: pointer; display: block; width: 100%; border-radius: 4px; transition: transform .35s var(--ease); }
  .cover-btn:hover { transform: translateY(-6px); }
  .cover-btn:active { transform: scale(.97); }
  .cover-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
  .meta { display: flex; align-items: start; gap: 4px; margin-top: 10px; }
  .text { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .title { font-size: .9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status { font-size: .78rem; color: var(--muted); }
  .status.new { color: var(--accent); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; font-size: .68rem; }
  .more { width: 30px; height: 30px; color: var(--muted); flex: none; }
  .more svg { width: 18px; height: 18px; }

  .empty { text-align: center; padding: 10vh 16px; animation: rise .6s var(--ease) both; }
  .empty h2 { font: 600 1.6rem var(--serif); margin: 28px 0 10px; }
  .empty p { color: var(--muted); line-height: 1.6; }
  .empty a { color: var(--accent); }
  .empty-art { display: inline-flex; gap: 8px; align-items: end; height: 120px; }
  .empty-art span { width: 52px; border-radius: 4px 8px 8px 4px; box-shadow: var(--shadow-cover); animation: float 4s ease-in-out infinite; }
  .empty-art span:nth-child(1) { height: 92px; background: var(--base0D); }
  .empty-art span:nth-child(2) { height: 116px; background: var(--base09); animation-delay: -1.3s; }
  .empty-art span:nth-child(3) { height: 100px; background: var(--base0B); animation-delay: -2.6s; }

  .drop {
    position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; pointer-events: none;
    background: color-mix(in srgb, var(--bg) 70%, transparent); backdrop-filter: blur(10px);
    animation: fade .2s ease-out;
  }
  .drop div { padding: 28px 40px; border: 2px dashed var(--accent); border-radius: 24px; font: 600 1.2rem var(--serif); color: var(--accent); }

  @media (max-width: 560px) {
    .hero { grid-template-columns: 110px 1fr; }
    .hero .pill { display: none; }
  }
  @keyframes rise { from { opacity: 0; transform: translateY(14px); } }
  @keyframes fade { from { opacity: 0; } }
  @keyframes float { 50% { transform: translateY(-8px); } }
</style>
