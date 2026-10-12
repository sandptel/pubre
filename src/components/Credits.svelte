<script lang="ts">
  // Who made pubre, and a friendly ask: a star, a bug, an idea. Drawn in pubre's own grammar — the maker
  // gets a cast portrait, and the reading ring steps across the ask the way it steps across a book.
  import { onMount } from 'svelte'
  import { portraitUrl } from '../lib/portrait.ts'

  const REPO = 'https://github.com/sandptel/pubre'
  const ASK = ['Star it', 'Share it', 'Shape it']
  let k = $state(0), els = $state<HTMLSpanElement[]>([]), ring = $state<[number, number]>([0, 0])
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  $effect(() => { const e = els[k]; if (e) ring = [e.offsetLeft - 6, e.offsetWidth + 12] })
  onMount(() => { if (reduce) return; const t = setInterval(() => (k = (k + 1) % ASK.length), 1400); return () => clearInterval(t) })
</script>

<section class="credits" aria-label="About pubre">
  <a class="maker" href="https://github.com/sandptel" target="_blank" rel="noopener">
    <img src={portraitUrl('Sandeep', '#e8a87c')} alt="" width="44" height="44" />
    <span><small>Made with care by</small><b>Sandeep Patel</b><em>@sandptel</em></span>
  </a>

  <a class="star" href={REPO} target="_blank" rel="noopener">
    <span class="ask" aria-label="Star it, share it, shape it">
      <i class="ring" style:transform="translateX({ring[0]}px)" style:width="{ring[1]}px"></i>
      {#each ASK as w, i}<span bind:this={els[i]} class:on={i === k}>{w}</span>{#if i < ASK.length - 1}<span class="dot">·</span>{/if}{/each}
    </span>
    <span class="cta">
      <svg class="gh" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
      <span>If pubre made a book better, a star helps the next reader find it.</span>
      <svg class="st" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6l2.9 6 6.5.9-4.8 4.5 1.2 6.4L12 17.3l-5.8 3.1 1.2-6.4L2.6 9.5l6.5-.9z" /></svg>
    </span>
  </a>

  <nav class="help" aria-label="Help the project">
    <a href="{REPO}/issues/new?labels=bug" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="6" width="8" height="13" rx="4"/><path d="M12 10v9M8 12H4M20 12h-4M8 16H5M19 16h-3M9 6.5 7 4M15 6.5 17 4"/></svg>Report a bug</a>
    <a href="{REPO}/issues/new?labels=enhancement" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>Suggest an idea</a>
    <a href="{REPO}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v10M18 17V9a3 3 0 0 0-3-3h-4M13 4l-2 2 2 2"/></svg>Contribute</a>
  </nav>

  <p class="fine">Open source · MIT licence · v{__APP_VERSION__}</p>
</section>

<style>
  .credits { display: grid; gap: var(--s3); margin-top: var(--s5); }
  a { color: inherit; text-decoration: none; }
  .maker { display: flex; align-items: center; gap: var(--s3); padding: 4px 2px; }
  .maker img { width: 44px; height: 44px; border-radius: 14px; box-shadow: 0 0 0 1px var(--hairline); transition: transform .4s var(--spring); }
  .maker:hover img { transform: rotate(-6deg) scale(1.06); }
  .maker span { display: grid; line-height: 1.25; }
  .maker small { font: 600 10px var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .maker b { font: 500 17px var(--serif); }
  .maker em { font: 12px var(--mono); font-style: normal; color: var(--accent); }

  .star { position: relative; display: grid; gap: 10px; padding: var(--s4); border-radius: var(--r3); overflow: hidden; isolation: isolate;
    background: color-mix(in srgb, var(--ink) 92%, var(--accent)); color: var(--on-ink); transition: transform .35s var(--spring); }
  .star::before { content: ''; position: absolute; inset: -40%; z-index: -1; background: conic-gradient(from 0deg, transparent 0 70%, color-mix(in srgb, var(--accent) 55%, transparent) 80%, transparent 90%); animation: sweep 6s linear infinite; }
  .star::after { content: ''; position: absolute; inset: 1.5px; z-index: -1; border-radius: calc(var(--r3) - 1.5px); background: color-mix(in srgb, var(--ink) 94%, var(--accent)); }
  .star:active { transform: scale(.98); }
  .ask { position: relative; display: flex; align-items: baseline; gap: 8px; font: 500 22px var(--serif); letter-spacing: -.01em; }
  .ask > span { color: color-mix(in srgb, var(--on-ink) 45%, transparent); transition: color .3s; }
  .ask > span.on { color: var(--on-ink); }
  .ask .dot { color: color-mix(in srgb, var(--on-ink) 30%, transparent); }
  .ring { position: absolute; left: 0; top: -2px; bottom: -4px; border-radius: 9px; box-shadow: inset 0 0 0 2px var(--accent); transition: transform .45s cubic-bezier(.22,1,.36,1), width .4s cubic-bezier(.25,.8,.25,1); }
  .cta { display: flex; align-items: center; gap: 10px; font: 12.5px/1.45 var(--mono); color: color-mix(in srgb, var(--on-ink) 75%, transparent); }
  .gh { width: 22px; height: 22px; flex: none; color: var(--on-ink); }
  .st { width: 20px; height: 20px; flex: none; color: var(--accent); animation: twinkle 2.8s ease-in-out infinite; }
  .star:hover .st { animation-duration: .9s; }

  .help { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .help a { display: grid; justify-items: center; gap: 4px; padding: 12px 6px; border-radius: var(--r2); background: color-mix(in srgb, var(--fg) 5%, transparent); box-shadow: inset 0 0 0 1px var(--hairline); font: 600 11px var(--mono); letter-spacing: .04em; text-align: center; transition: background .2s, transform .3s var(--spring); }
  .help a:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .help a:active { transform: scale(.96); }
  .help svg { width: 20px; height: 20px; color: var(--accent); }
  .fine { margin: 0; font: 11px var(--mono); color: var(--muted); text-align: center; letter-spacing: .06em; }

  @keyframes sweep { to { transform: rotate(360deg); } }
  @keyframes twinkle { 0%, 100% { transform: scale(1) rotate(0deg); opacity: .85; } 50% { transform: scale(1.25) rotate(18deg); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .star::before, .st { animation: none; } }
</style>
