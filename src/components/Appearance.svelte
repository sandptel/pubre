<script lang="ts">
  // Themes & text, Control Center style: a live preview, the light you read in, a Text tile,
  // tall sliders for size and brightness, and quiet toggles. "Text" opens fonts and typography.
  import { flushSync } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { fly } from 'svelte/transition'
  import { fonts, modes, palettes, resolveTheme, type Settings } from '../lib/settings.ts'
  import VSlider from './VSlider.svelte'
  import ReadingAids from './ReadingAids.svelte'

  let { settings = $bindable() }: { settings: Settings } = $props()
  let page = $state<'main' | 'text'>('main')
  const stack = (id: string) => fonts[id]?.stack || 'var(--serif)'
  const theme = $derived(resolveTheme(settings.palette, settings.mode))
  const bump = (k: 'fontScale' | 'lineHeight', d: number, lo: number, hi: number) => (settings[k] = +Math.min(hi, Math.max(lo, settings[k] + d)).toFixed(2))

  // Color changes crossfade the whole screen (including the page) instead of snapping.
  function recolor(update: () => void) {
    if (!document.startViewTransition) return update()
    document.startViewTransition(() => { update(); flushSync() })
  }
</script>

<!-- Preview: your page, in your font, at your size -->
<div class="preview" style:font-family={stack(settings.font)} style:background={theme.base[0]} style:color={theme.base[5]}>
  <span class="eyebrow">Preview</span>
  <p style:font-size="{16 * settings.fontScale / 100}px" style:line-height={settings.lineHeight} style:text-align={settings.justify ? 'justify' : 'start'} style:font-weight={settings.bold ? 600 : 400}>
    So we beat on, boats against the current, borne back ceaselessly into the past.
  </p>
</div>

{#if page === 'main'}
  <div class="cc" in:fly={{ x: -14, duration: 200, easing: cubicOut }}>
    <div class="tile modes" role="radiogroup" aria-label="Mode">
      {#each Object.entries(modes) as [id, m]}
        {@const t = resolveTheme(settings.palette, id)}
        <button role="radio" aria-checked={settings.mode === id} aria-label={m.name} title={m.name} class:on={settings.mode === id}
          style:background={t.base[0]} style:--ring={t.base[t.accent]} onclick={() => recolor(() => (settings.mode = id))}></button>
      {/each}
    </div>

    <button class="tile text" onclick={() => (page = 'text')}>
      <span class="aa" style:font-family={stack(settings.font)}>Aa</span>
      <span class="t-l"><b>Text</b><small>{fonts[settings.font]?.name ?? ''} · Customize</small></span>
    </button>

    <div class="v v1"><VSlider bind:value={settings.fontScale} min={70} max={200} step={5} label="Text size">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18L9 6l5 12M5.8 14h6.4M15 18l3-7 3 7M15.9 16h4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </VSlider><span class="cap">Size</span></div>
    <div class="v v2"><VSlider bind:value={settings.brightness} min={40} max={100} step={5} label="Brightness">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.7" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
    </VSlider><span class="cap">Light</span></div>

    <button class="tile small s1" class:on={settings.justify} aria-pressed={settings.justify} onclick={() => (settings.justify = !settings.justify)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h16M4 14h16M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg><span>Justify</span></button>
    <button class="tile small s2" class:on={settings.bold} aria-pressed={settings.bold} onclick={() => (settings.bold = !settings.bold)}>
      <span class="bold-b">B</span><span>Bold</span></button>
    <button class="tile small s3" class:on={settings.spread === 'auto'} aria-pressed={settings.spread === 'auto'} onclick={() => (settings.spread = settings.spread === 'auto' ? 'single' : 'auto')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h7a2 2 0 012 2v12a2 2 0 00-2-2H3zM21 5h-7a2 2 0 00-2 2v12a2 2 0 012-2h7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /></svg><span>Two pages</span></button>
  </div>

  <span class="label">Palette</span>
  <div class="palettes" role="radiogroup" aria-label="Palette">
    {#each Object.entries(palettes) as [id, p]}
      {@const t = resolveTheme(id, settings.mode)}
      <button role="radio" aria-checked={settings.palette === id} class="palette" class:on={settings.palette === id}
        style:background={t.base[0]} style:color={t.base[5]} style:--ring={t.base[t.accent]}
        onclick={() => recolor(() => (settings.palette = id))}>
        <span class="dots">{#each [8, 9, 10, 11, 13, 14] as i}<i style:background={t.base[i]}></i>{/each}</span>
        <span class="name">{p.name}</span>
      </button>
    {/each}
  </div>
  <ReadingAids bind:value={settings} part="look" />
{:else}
  <div in:fly={{ x: 14, duration: 200, easing: cubicOut }}>
    <button class="back" onclick={() => (page = 'main')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>Back</button>
    <span class="label">Font</span>
    <div class="fonts" role="radiogroup" aria-label="Font">
      {#each Object.entries(fonts) as [id, f]}
        <button role="radio" aria-checked={settings.font === id} class:on={settings.font === id} onclick={() => (settings.font = id)}>
          <span class="aa" style:font-family={f.stack || 'inherit'}>Aa</span>
          <small>{f.name === 'Original' ? 'Publisher' : f.name}</small>
        </button>
      {/each}
    </div>
    <span class="label">Typography</span>
    <div class="rows">
      <div class="r"><span>Font size</span><span class="step"><button aria-label="Smaller" onclick={() => bump('fontScale', -5, 70, 200)}>−</button><b>{settings.fontScale}%</b><button aria-label="Larger" onclick={() => bump('fontScale', 5, 70, 200)}>+</button></span></div>
      <div class="r"><span>Line spacing</span><span class="step"><button aria-label="Tighter" onclick={() => bump('lineHeight', -0.05, 1.1, 2.2)}>−</button><b>{settings.lineHeight.toFixed(2)}</b><button aria-label="Looser" onclick={() => bump('lineHeight', 0.05, 1.1, 2.2)}>+</button></span></div>
      <div class="r"><span>Margins</span>
        <span class="seg" role="radiogroup" aria-label="Margins">{#each ['Narrow', 'Normal', 'Wide'] as l, i}<button role="radio" aria-checked={settings.margin === i} class:on={settings.margin === i} onclick={() => (settings.margin = i)}>{l}</button>{/each}</span></div>
    </div>
    <span class="label">Alignment</span>
    <div class="align">
      <button class:on={!settings.justify} onclick={() => (settings.justify = false)}><b>Default</b><small>Lines end where the words do; even spacing.</small></button>
      <button class:on={settings.justify} onclick={() => (settings.justify = true)}><b>Justify</b><small>Both edges straight, like print, when the page is wide enough; narrow phone pages stay even-spaced.</small></button>
    </div>
  </div>
{/if}

<style>
  .eyebrow, .label { display: block; font: 600 10.5px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .label { margin: var(--s5) 0 var(--s2); }
  .preview { padding: var(--s3) var(--s4) var(--s4); border-radius: var(--r4); box-shadow: var(--e1), inset 0 0 0 .5px var(--hairline); margin-bottom: var(--s4); }
  .preview p { margin: 6px 0 0; transition: font-size .2s, line-height .2s; }
  .preview .eyebrow { color: inherit; opacity: .55; }

  /* The grid: a mode capsule and a Text tile on the left, two tall sliders on the right, toggles below */
  .cc { display: grid; grid-template-columns: 1fr 1fr 64px 64px; grid-template-rows: 56px 60px 60px 60px; gap: var(--s2); }
  .tile { border: 0; border-radius: var(--r4); background: var(--card); color: var(--fg); box-shadow: var(--e1); }
  .modes { grid-column: 1 / 3; grid-row: 1; display: flex; align-items: center; justify-content: space-between; padding: 0 var(--s3); border-radius: 999px; }
  .modes button { width: 30px; height: 30px; border-radius: 50%; border: 0; padding: 0; box-shadow: inset 0 0 0 1px rgb(128 128 128 / .45); transition: transform .35s var(--spring), box-shadow .2s; }
  .modes button.on { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--ring); }
  .modes button:active { transform: scale(.88); }
  .text { grid-column: 1 / 3; grid-row: 2 / 4; display: grid; align-content: space-between; justify-items: start; padding: var(--s4); text-align: left; transition: transform .35s var(--spring); }
  .text:active { transform: scale(.97); }
  .aa { font-size: 26px; line-height: 1; }
  .t-l { display: grid; gap: 2px; }
  .t-l b { font-size: 15px; }
  .t-l small { font-size: 12px; color: var(--muted); }
  .v { grid-row: 1 / 4; display: grid; grid-template-rows: 1fr auto; gap: 4px; justify-items: center; }
  .v1 { grid-column: 3; } .v2 { grid-column: 4; }
  .cap { font-size: 11px; color: var(--muted); }
  .small { grid-row: 4; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; font-weight: 600; transition: background-color .25s, color .25s, transform .35s var(--spring); }
  .s1 { grid-column: 1; } .s2 { grid-column: 2; } .s3 { grid-column: 3 / 5; }
  .small svg { width: 18px; height: 18px; flex: none; }
  .small.on { background: var(--ink); color: var(--on-ink); }
  .small:active { transform: scale(.95); }
  .bold-b { font: 700 17px var(--serif); }

  .palettes { display: flex; gap: var(--s2); overflow-x: auto; padding: 4px 2px 6px; scrollbar-width: none; }
  .palettes::-webkit-scrollbar { display: none; }
  .palette { flex: none; border: 0; border-radius: var(--r3); padding: 10px 12px; display: grid; gap: 6px; min-width: 96px; text-align: left; box-shadow: inset 0 0 0 .5px rgb(128 128 128 / .4); transition: transform .35s var(--spring), box-shadow .2s; }
  .palette.on { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--ring); }
  .dots { display: flex; gap: 3px; }
  .dots i { width: 9px; height: 9px; border-radius: 50%; }
  .name { font-size: 12px; font-weight: 600; }

  .back { display: inline-flex; align-items: center; gap: 4px; border: 0; background: var(--card); box-shadow: var(--e1); border-radius: 999px; padding: 8px 14px 8px 8px; font-size: 13px; font-weight: 600; color: var(--fg); }
  .back svg { width: 18px; height: 18px; }
  .fonts { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: var(--s2); }
  .fonts button { border: 0; border-radius: var(--r3); background: var(--card); box-shadow: var(--e1); display: grid; justify-items: center; gap: 4px; padding: 12px 4px; color: var(--fg); transition: box-shadow .2s, transform .35s var(--spring); }
  .fonts button.on { box-shadow: 0 0 0 2px var(--accent); }
  .fonts button:active { transform: scale(.95); }
  .fonts small { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .rows { border-radius: var(--r3); background: var(--card); box-shadow: var(--e1); padding: 0 var(--s4); }
  .r { display: flex; align-items: center; justify-content: space-between; gap: var(--s3); min-height: 52px; font-size: 15px; }
  .r + .r { border-top: .5px solid var(--hairline); }
  .step { display: flex; align-items: center; gap: 6px; }
  .step b { min-width: 52px; text-align: center; font: 600 13px var(--mono); }
  .step button { width: 40px; height: 40px; border: 0; border-radius: 50%; background: var(--hover); color: var(--fg); font: 500 18px/1 system-ui; }
  .seg { display: flex; background: var(--hover); border-radius: 10px; padding: 2px; }
  .seg button { border: 0; background: none; border-radius: 8px; padding: 6px 10px; min-height: 36px; font-size: 13px; color: var(--fg); }
  .seg button.on { background: var(--bg); box-shadow: 0 1px 3px rgb(0 0 0 / .15); font-weight: 600; }
  .align { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s2); }
  .align button { border: 0; border-radius: var(--r3); background: var(--card); box-shadow: var(--e1); padding: 12px; text-align: left; display: grid; gap: 4px; color: var(--fg); }
  .align button.on { box-shadow: 0 0 0 2px var(--accent); }
  .align small { font-size: 11.5px; color: var(--muted); line-height: 1.35; }
</style>
