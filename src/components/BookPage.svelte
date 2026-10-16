<script lang="ts">
  // A book's landing page: its cover on its own colour, what it is, and your journey through it so far —
  // what you've read, who you've met, what you marked, and exactly where you'll continue. Spoiler-safe:
  // chapters ahead show only their titles and length.
  import { onMount, untrack } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { fly } from 'svelte/transition'
  import { Book, tocLabel } from '../lib/epub.ts'
  import { aboutOf, getFile, listAnnotations, saveBook, type BookRecord } from '../lib/store.svelte.ts'
  import { tintOf } from '../lib/tint.ts'
  import { computeProfile, PROFILE_V } from '../lib/profile.ts'
  import { bookMinutesLeft, calmRange, since } from '../lib/calm.ts'
  import { chapterFor, fingerprint } from '../insights/chapters.ts'
  import { resolveTheme, mix, type Settings } from '../lib/settings.ts'
  import { whoHue, WHO_SLOTS, MEANINGS } from '../lib/marks.ts'
  import type { Annotation } from '../lib/annotations.ts'
  import Cover from './Cover.svelte'
  import { portraitUrl } from '../lib/portrait.ts'

  let { book, settings, onread, onback }: { book: BookRecord; settings: Settings; onread: () => void; onback: () => void } = $props()
  const rec = $state(untrack(() => ({ ...book })))
  let tint = $state(untrack(() => book.tint ?? ''))
  let anns = $state<Annotation[]>([])
  let showAll = $state(false)
  let castP = $state<number | null>(null) // reading the book for its cast

  onMount(() => {
    tintOf(rec).then(t => (tint = t))
    listAnnotations(rec.id).then(l => (anns = l.sort((a, b) => b.created - a.created)))
    if (!rec.about || rec.profile?.v !== PROFILE_V) getFile(rec.id).then(async data => { // details and the book's shape, once
      if (!data) return
      const b = await Book.open(new Uint8Array(data))
      if (!rec.about) rec.about = book.about = aboutOf(b.metadata)
      if (rec.profile?.v !== PROFILE_V) rec.profile = book.profile = await computeProfile(b, { key: rec.id, on: e => { if (e.p !== undefined) castP = e.p } }).finally(() => (castP = null))
      b.destroy(); saveBook(book)
    })
  })

  const theme = $derived(resolveTheme(settings.palette, settings.mode))
  const started = $derived(rec.progress > 0)
  const done = $derived(rec.progress >= 0.995)
  const total = $derived(rec.profile?.words?.reduce((a, n) => a + n, 0) ?? 0)
  const left = $derived(calmRange(bookMinutesLeft(rec.profile?.words, rec.location?.index ?? 0, rec.location?.fraction ?? 0, settings.wpm)))
  const chapters = $derived((rec.profile?.chapters ?? []).filter(c => c.title && c.words > 40))
  const here = $derived.by(() => {
    if (!chapters.length || !rec.chapter) return started ? -1 : 0
    const c = chapterFor(chapters, rec.chapter)
    return c ? chapters.indexOf(c) : -1
  })
  const met = $derived((rec.profile?.names ?? []).filter(n => n.kind === 'person' && n.slot >= 0 && started && n.first <= (rec.location?.index ?? -1)).slice(0, 8))
  const mood = (m: number) => mix('#5d6d8f', '#d6a248', Math.max(0, Math.min(1, (m + 1) / 2)))
  const lang = $derived.by(() => { const l = rec.about?.language; if (!l) return ''; try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(l) ?? l } catch { return l } })
  const minutes = (w: number) => Math.max(1, Math.round(w / Math.max(120, settings.wpm)))
  const rows = $derived.by(() => {
    if (showAll || here < 0) return chapters.map((c, i) => ({ c, i }))
    const a = Math.max(0, here - 2), b = Math.min(chapters.length, here + 5)
    return chapters.slice(a, b).map((c, j) => ({ c, i: a + j }))
  })
  // the cover, full bleed, as the top of the page
  const coverUrl = $derived(rec.cover ? URL.createObjectURL(new Blob([rec.cover], { type: rec.coverType })) : '')
  $effect(() => () => { if (coverUrl) URL.revokeObjectURL(coverUrl) })
  const bg = $derived(tint ? mix(theme.base[0], tint, theme.dark ? 0.35 : 0.5) : 'var(--card)')
</script>

<main class="bp" style:--tint={bg}>
  <!-- desktop: the whole cover, uncropped, held on the left while the page scrolls beside it -->
  <aside class="side" aria-hidden="true">{#if coverUrl}<img src={coverUrl} alt="" />{:else}<div class="side-cover"><Cover book={rec} /></div>{/if}</aside>
  <div class="col">
  <section class="top" class:has-cover={!!coverUrl}>
    {#if coverUrl}<div class="art" style:view-transition-name="cover" style:background-image="url({coverUrl})"></div>{/if}
    <header>
      <button class="nav" aria-label="Back to library" onclick={onback}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
      <span class="tag">{done ? 'Finished' : started ? `${Math.round(rec.progress * 100)}% read` : 'New'}</span>
    </header>
    {#if !coverUrl}<div class="cover" style:view-transition-name="cover"><Cover book={rec} /></div>{/if}
    <h1>{rec.title}</h1>
    <!-- a pencil line draws itself under the title -->
    <svg class="scribble" viewBox="0 0 200 12" aria-hidden="true"><path pathLength="1" d="M4 7c22-4 40 3 62-1s38-4 60 0 42 3 70-2" /></svg>
    <p class="by">{rec.creator}</p>
    <dl class="stats">
      <div><dt>Read</dt><dd>{Math.round(rec.progress * 100)}%</dd></div>
      {#if chapters.length}<div><dt>Chapters</dt><dd>{chapters.length}</dd></div>{/if}
      {#if total}<div><dt>Pages</dt><dd>~{Math.round(total / 275)}</dd></div>{/if}
      {#if left}<div><dt>Left</dt><dd>{left}</dd></div>{:else if lang}<div><dt>Language</dt><dd>{lang}</dd></div>{/if}
    </dl>
    {#if castP !== null}<p class="finding" role="status"><i style:--p={castP}></i>Getting to know the cast · {Math.round(castP * 100)}%</p>{/if}
  </section>

  <div class="actions">
    <button class="go" onclick={onread}>{done ? 'Read again' : started ? 'Continue reading' : 'Start reading'}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
  </div>

  {#if started}
    <section class="card" in:fly={{ y: 14, duration: 450, easing: cubicOut }}>
      <h2>Where you are</h2>
      {#if chapters.length > 2}
        <!-- the path: chapters as the book's shape, filled to here, a pin where you'll continue -->
        <div class="path">
          {#each chapters as c, i}
            <i class:read={i < here} class:here={i === here} style:flex-grow={c.words} style:height="{i <= here ? 30 + (c.mood + 1) * 35 : 14}%" style:--m={i <= here ? mood(c.mood) : null}></i>
          {/each}
          {#if here >= 0}<span class="pin" style:left="{(chapters.slice(0, here).reduce((a, c) => a + c.words, 0) + chapters[here].words / 2) / Math.max(1, chapters.reduce((a, c) => a + c.words, 0)) * 100}%"><b>You are here</b></span>{/if}
        </div>
        <div class="path-l"><span>{here > 0 ? `${here} read` : 'Just begun'}</span><span>{chapters.length - here - 1} ahead</span></div>
      {/if}
      <div class="where">
        <span class="eyebrow">{rec.readAt ? `Last read ${since(rec.readAt)}` : 'Continue at'}</span>
        <b>{rec.chapter ?? ''}</b>
        {#if rec.lastLine}<blockquote>“{rec.lastLine}”</blockquote>{/if}
      </div>
    </section>

    {#if met.length || anns.length || Object.keys(rec.words ?? {}).length}
      <section class="card" in:fly={{ y: 14, duration: 450, delay: 80, easing: cubicOut }}>
        <h2>So far</h2>
        {#if met.length}
          <span class="eyebrow">Who you've met</span>
          <div class="cast">{#each met as p}<span class="who" style:--c={whoHue(theme, p.slot % WHO_SLOTS)}><img alt="" src={portraitUrl(p.name, mix(whoHue(theme, p.slot % WHO_SLOTS), theme.base[0], 0.55), theme.dark ? theme.base[0] : '#1d1b19', theme.dark ? theme.base[5] : '#fbf8f2')} />{p.name}</span>{/each}</div>
        {/if}
        {#if anns.length}
          <span class="eyebrow">Your marks · {anns.length}</span>
          {#each anns.slice(0, 2) as a}<p class="mark" style:--c="var(--base{a.color})">“{a.exact.slice(0, 160)}{a.exact.length > 160 ? '…' : ''}”<small>{MEANINGS.find(m => m[0] === a.color)?.[1]}{a.chapter ? ` · ${a.chapter}` : ''}</small></p>{/each}
        {/if}
        {#if Object.keys(rec.words ?? {}).length}
          <span class="eyebrow">Your words</span>
          <div class="words">{#each Object.entries(rec.words ?? {}).slice(-4) as [ch, w]}<span><b>{w}</b><small>{ch}</small></span>{/each}</div>
        {/if}
      </section>
    {/if}
  {/if}

  {#if rec.about?.description}
    <section class="card"><h2>About</h2><p class="desc">{rec.about.description}</p>
      {#if rec.about.subjects.length}<div class="subjects">{#each rec.about.subjects as s}<span>#{s.split(/\s*--\s*/)[0]}</span>{/each}</div>{/if}
    </section>
  {/if}

  {#if chapters.length}
    <section class="card">
      <h2>Chapters</h2>
      <ol class="toc">
        {#each rows as { c, i } (i)}
          <li class:read={i < here} class:here={i === here}>
            <svg viewBox="0 0 22 22" aria-hidden="true" style:--n={i - (rows[0]?.i ?? 0)}><path pathLength="1" d={fingerprint(c.lens, 22)} /></svg>
            <span class="t">{tocLabel(c.title)}</span>
            <span class="m">{i < here ? '✓' : i === here ? 'Here' : `${minutes(c.words)} min`}</span>
          </li>
        {/each}
      </ol>
      {#if !showAll && chapters.length > rows.length}<button class="more" onclick={() => (showAll = true)}>All {chapters.length} chapters</button>{/if}
    </section>
  {/if}
  </div>
</main>

<style>
  .bp { min-height: 100dvh; padding: 0 0 calc(var(--s7) + env(safe-area-inset-bottom)); background: var(--bg); }
  .top { position: relative; overflow: hidden; isolation: isolate; padding: calc(env(safe-area-inset-top) + var(--s3)) var(--s5) var(--s5); text-align: center; background: linear-gradient(180deg, var(--tint), color-mix(in srgb, var(--tint) 60%, var(--bg))); border-radius: 0 0 var(--r5) var(--r5); }
  /* the cover fills the whole top; the page rises into it from below, where the title sits */
  .top.has-cover { min-height: min(92vw, 560px); display: flex; flex-direction: column; justify-content: end; }
  .top.has-cover header { position: absolute; top: calc(env(safe-area-inset-top) + var(--s3)); left: var(--s5); right: var(--s5); }
  .art { position: absolute; inset: 0; z-index: -1; background-size: cover; background-position: center 30%; animation: eink 1.1s steps(1, end) both; }
  .art::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 30%, color-mix(in srgb, var(--bg) 70%, transparent) 62%, var(--bg) 96%); }
  .has-cover h1, .has-cover .by { text-shadow: 0 1px 12px color-mix(in srgb, var(--bg) 80%, transparent); }
  .scribble { display: block; width: 120px; height: 12px; margin: 4px auto 0; }
  .scribble path { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1s .5s cubic-bezier(.6,.1,.3,1) forwards; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--s4); }
  .nav { width: 44px; height: 44px; border: 0; border-radius: 50%; background: var(--bg); box-shadow: var(--e1); color: var(--fg); display: grid; place-items: center; }
  .nav svg { width: 22px; height: 22px; }
  .tag { padding: 6px 10px; border-radius: 6px; background: var(--bg); box-shadow: var(--e1); color: var(--accent); font: 600 11px var(--mono); letter-spacing: .08em; text-transform: uppercase; }
  .cover { width: min(46vw, 200px); margin: 0 auto var(--s5); filter: drop-shadow(0 18px 30px rgb(0 0 0 / .28)); }
  h1 { margin: 0; font: 500 26px/1.2 var(--serif); letter-spacing: -.01em; text-wrap: balance; }
  .by { margin: 6px 0 var(--s5); color: color-mix(in srgb, var(--fg) 70%, transparent); font-size: 14px; }
  .stats { display: flex; justify-content: center; gap: 0; margin: 0; }
  .stats div { flex: 1; max-width: 110px; display: grid; gap: 4px; padding: 0 6px; }
  .stats div + div { border-left: 1px solid color-mix(in srgb, var(--fg) 14%, transparent); }
  dt { order: 2; font: 600 10px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: color-mix(in srgb, var(--fg) 60%, transparent); }
  dd { margin: 0; font: 600 16px var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .actions { padding: var(--s4) var(--s5) 0; max-width: 620px; margin: 0 auto; }
  .go { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 54px; padding: 0 var(--s4) 0 var(--s5); border: 0; border-radius: var(--r3); background: var(--ink); color: var(--on-ink); font: 600 13px var(--mono); letter-spacing: .1em; text-transform: uppercase; transition: transform .35s var(--spring); }
  .go svg { width: 20px; height: 20px; }
  .go:active { transform: scale(.98); }
  /* e-ink: each card arrives with a brief refresh flash, like an e-paper panel redrawing */
  .card { animation: eink .9s steps(1, end) both; }
  .card:nth-of-type(2) { animation-delay: .12s; } .card:nth-of-type(3) { animation-delay: .24s; } .card:nth-of-type(4) { animation-delay: .36s; }
  .card { max-width: 620px; margin: var(--s4) auto 0; margin-inline: max(var(--s4), calc((100% - 620px) / 2)); padding: var(--s4); border-radius: var(--r4); background: var(--card); box-shadow: var(--e1); display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  h2 { margin: 0 0 2px; font: 600 12px var(--mono); letter-spacing: .14em; text-transform: uppercase; }
  .eyebrow { font: 600 10px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin-top: 4px; }
  .path { position: relative; display: flex; align-items: end; gap: 1px; height: 64px; margin-top: 18px; }
  .path i { flex-basis: 0; min-width: 1px; border-radius: 2px 2px 0 0; background: color-mix(in srgb, var(--fg) 12%, transparent); transform-origin: bottom; animation: grow .8s cubic-bezier(.34,1.56,.64,1) both; }
  /* read chapters are pencil-hatched in their mood */
  .path i.read { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--m) 80%, var(--accent)) 0 1.5px, color-mix(in srgb, var(--m) 35%, transparent) 1.5px 3.5px) !important; }
  .path i.read { background: color-mix(in srgb, var(--m) 70%, var(--accent)); }
  .path i.here { background: var(--accent); }
  .pin { position: absolute; top: -18px; translate: -50% 0; display: grid; justify-items: center; pointer-events: none; }
  .pin b { padding: 2px 6px; border-radius: 4px; background: var(--ink); color: var(--on-ink); font: 600 9px var(--mono); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; animation: pop .5s .4s cubic-bezier(.34,1.56,.64,1) both; }
  .path-l { display: flex; justify-content: space-between; font: 11px var(--mono); color: var(--muted); }
  .where { display: grid; gap: 4px; padding-top: 6px; border-top: 1px solid var(--hairline); }
  .where b { font: 500 17px var(--serif); }
  blockquote { margin: 4px 0 0; padding-left: 12px; border-left: 3px solid var(--accent); font: italic 15px/1.5 var(--serif); color: color-mix(in srgb, var(--fg) 82%, transparent); }
  .cast { display: flex; flex-wrap: wrap; gap: 6px; }
  .who { display: inline-flex; align-items: center; gap: 8px; padding: 3px 12px 3px 3px; border-radius: 13px !important; border-radius: 999px; background: color-mix(in srgb, var(--c) 14%, transparent); font-size: 13px; }
  .who img { width: 34px; height: 34px; border-radius: 10px; }
  .mark { margin: 0; padding: 8px 12px; border-radius: 10px; background: color-mix(in srgb, var(--c) 14%, transparent); font: 14px/1.5 var(--serif); display: grid; gap: 4px; }
  .mark small { font: 10.5px var(--mono); color: var(--muted); }
  .words { display: flex; flex-wrap: wrap; gap: 8px; }
  .words span { display: grid; padding: 6px 10px; border-radius: 10px; box-shadow: inset 0 0 0 1px var(--hairline); }
  .words b { font: italic 15px var(--serif); }
  .words small { font: 10px var(--mono); color: var(--muted); }
  .desc { margin: 0; font: 15px/1.6 var(--serif); color: color-mix(in srgb, var(--fg) 86%, transparent); }
  .subjects { display: flex; flex-wrap: wrap; gap: 6px; }
  .subjects span { padding: 4px 10px; border-radius: 6px; background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font: 600 11px var(--mono); }
  .toc { list-style: none; margin: 0; padding: 0; }
  .toc li { display: flex; align-items: center; gap: 10px; min-height: 44px; border-top: 1px solid var(--hairline); font-size: 14px; }
  .toc li:first-child { border-top: 0; }
  .toc svg { width: 22px; height: 22px; flex: none; fill: none; stroke: currentColor; stroke-width: .9; opacity: .55; }
  /* pencil: each chapter's fingerprint draws itself, one after another */
  .toc svg path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1.1s cubic-bezier(.6,.1,.3,1) forwards; animation-delay: calc(.4s + var(--n) * 90ms); }
  .toc .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--serif); }
  .toc .m { font: 11px var(--mono); color: var(--muted); }
  .toc li.read { color: var(--muted); }
  .toc li.here { color: var(--accent); font-weight: 600; }
  .toc li.here .m { color: var(--accent); }
  .more { justify-self: start; border: 0; background: none; padding: 8px 0; color: var(--accent); font: 600 11px var(--mono); letter-spacing: .08em; text-transform: uppercase; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @keyframes eink { 0% { opacity: 0; } 8% { opacity: 1; filter: invert(1) grayscale(1) contrast(1.6); } 16% { filter: grayscale(1) contrast(2.2) brightness(1.15); } 26% { filter: none; } }
  @media (prefers-reduced-motion: reduce) { .art, .card { animation: none; } .scribble path, .toc svg path { animation: none; stroke-dashoffset: 0; } }
  @keyframes grow { from { transform: scaleY(0); } }
  .finding { display: inline-flex; align-items: center; gap: 8px; margin: var(--s3) 0 0; font: 11px var(--mono); color: var(--muted); letter-spacing: .04em; }
  .finding i { width: 12px; height: 12px; border-radius: 50%; background: conic-gradient(var(--accent) calc(var(--p) * 360deg), color-mix(in srgb, var(--fg) 14%, transparent) 0); }
  .side { display: none; }
  @media (min-width: 1000px) {
    .bp { display: grid; grid-template-columns: minmax(360px, 42%) minmax(0, 1fr); padding-bottom: 0; }
    .side { display: grid; place-items: center; position: sticky; top: 0; height: 100dvh; padding: 84px 64px 64px; box-sizing: border-box; background: linear-gradient(160deg, var(--tint), color-mix(in srgb, var(--tint) 55%, var(--bg))); }
    .side img, .side-cover { max-width: 100%; max-height: 100%; width: auto; border-radius: 6px 12px 12px 6px; box-shadow: 0 30px 60px -24px rgb(0 0 0 / .45), 0 2px 8px rgb(0 0 0 / .12); animation: eink 1.1s steps(1, end) both; view-transition-name: cover; }
    .side-cover { width: min(360px, 80%); }
    .col { padding: 84px var(--s7) calc(var(--s7) + 88px); max-width: 720px; box-sizing: border-box; }
    .top, .top.has-cover { min-height: 0; display: block; padding: 0; background: none; border-radius: 0; text-align: left; overflow: visible; }
    .top.has-cover header, header { position: fixed; top: var(--s4); left: var(--s4); right: var(--s4); z-index: 2; pointer-events: none; }
    header > * { pointer-events: auto; }
    .art, .cover { display: none; }
    h1 { font-size: 40px; line-height: 1.12; }
    .has-cover h1, .has-cover .by { text-shadow: none; }
    .scribble { margin: 8px 0 0; }
    .by { font-size: 16px; margin-bottom: var(--s5); }
    .stats { justify-content: flex-start; }
    .stats div:first-child { padding-left: 0; }
    .actions { padding: var(--s5) 0 0; margin: 0; max-width: none; }
    .card { margin-inline: 0; max-width: none; }
  }
  @keyframes pop { from { opacity: 0; transform: translateY(6px) scale(.8); } }
</style>
