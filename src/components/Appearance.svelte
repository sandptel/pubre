<script lang="ts">
  import { flushSync } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { slide } from 'svelte/transition'
  import { fonts, modes, palettes, resolveTheme, type Settings } from '../lib/settings.ts'

  let { settings = $bindable() }: { settings: Settings } = $props()

  let open = $state<'' | 'font' | 'custom' | 'guide'>('')
  const toggle = (k: 'font' | 'custom' | 'guide') => (open = open === k ? '' : k)
  const size = (d: number) => (settings.fontScale = Math.min(200, Math.max(70, settings.fontScale + d)))

  // Color changes crossfade the whole screen (including the page) instead of snapping.
  function recolor(update: () => void) {
    if (!document.startViewTransition) return update()
    document.startViewTransition(() => { update(); flushSync() })
  }
</script>

<div class="size" role="group" aria-label="Text size">
  <button aria-label="Smaller text" onclick={() => size(-10)}><span class="a sm">A</span></button>
  <span class="val">{settings.fontScale}%</span>
  <button aria-label="Larger text" onclick={() => size(10)}><span class="a lg">A</span></button>
</div>

<div class="modes" role="radiogroup" aria-label="Mode">
  {#each Object.entries(modes) as [id, m]}
    {@const t = resolveTheme(settings.palette, id)}
    <button role="radio" aria-checked={settings.mode === id} class="mode" class:on={settings.mode === id}
      onclick={() => recolor(() => (settings.mode = id))}>
      <span class="swatch" style:background={t.base[0]} style:color={t.base[5]}>Aa</span>
      <span class="label">{m.name}</span>
    </button>
  {/each}
</div>

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

<div class="group">
  <button class="row" aria-expanded={open === 'font'} onclick={() => toggle('font')}>
    <span>Font</span>
    <span class="value" style:font-family={fonts[settings.font]?.stack || 'inherit'}>{fonts[settings.font]?.name}</span>
    <svg class="chev" class:open={open === 'font'} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
  </button>
  {#if open === 'font'}
    <div class="sub" transition:slide={{ duration: 320, easing: cubicOut }}>
      {#each Object.entries(fonts) as [id, f]}
        <button class="opt" style:font-family={f.stack || 'inherit'} onclick={() => (settings.font = id)}>
          {f.name === 'Original' ? 'Publisher’s font' : f.name}
          {#if settings.font === id}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{/if}
        </button>
      {/each}
    </div>
  {/if}

  <button class="row" aria-expanded={open === 'custom'} onclick={() => toggle('custom')}>
    <span>Customize</span>
    <span class="value">Spacing, margins, layout</span>
    <svg class="chev" class:open={open === 'custom'} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
  </button>
  {#if open === 'custom'}
    <div class="sub" transition:slide={{ duration: 320, easing: cubicOut }}>
      <label class="line">
        <span>Line spacing</span>
        <input type="range" min="1.1" max="2.2" step="0.05" bind:value={settings.lineHeight} />
      </label>
      <div class="line">
        <span>Margins</span>
        <div class="segmented" role="radiogroup" aria-label="Margins">
          {#each ['Narrow', 'Normal', 'Wide'] as label, i}
            <button role="radio" aria-checked={settings.margin === i} class:on={settings.margin === i} onclick={() => (settings.margin = i)}>{label}</button>
          {/each}
        </div>
      </div>
      <label class="line"><span>Justify</span><input type="checkbox" role="switch" bind:checked={settings.justify} /></label>
      <label class="line"><span>Bold text</span><input type="checkbox" role="switch" bind:checked={settings.bold} /></label>
      <label class="line">
        <span>Two pages when wide</span>
        <input type="checkbox" role="switch" checked={settings.spread === 'auto'}
          onchange={e => (settings.spread = e.currentTarget.checked ? 'auto' : 'single')} />
      </label>
    </div>
  {/if}
</div>

<style>
  /* Text size: one segmented capsule, value in the middle. */
  .size {
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
    height: 44px; border-radius: 12px; background: var(--hover);
  }
  .size button { height: 100%; border: 0; background: none; border-radius: 12px; transition: background-color .2s, transform .3s var(--spring); }
  .size button:hover { background: var(--hover); }
  .size button:active { transform: scale(.94); }
  .a { font-family: var(--serif); }
  .sm { font-size: 14px; }
  .lg { font-size: 22px; }
  .val { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; min-width: 40px; text-align: center; }

  /* Modes: one row of swatches, previewed in the current palette. */
  .modes { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--s1); margin-top: var(--s4); }
  .mode { border: 0; background: none; padding: 0; display: grid; justify-items: center; gap: 6px; }
  .swatch {
    width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
    font: 600 15px var(--serif); box-shadow: inset 0 0 0 .5px rgb(128 128 128 / .5);
    transition: transform .4s var(--spring), box-shadow .2s;
  }
  .mode:active .swatch { transform: scale(.9); }
  .mode.on .swatch { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent); }
  .label { font-size: 11px; color: var(--muted); }
  .mode.on .label { color: var(--fg); font-weight: 600; }

  /* Palettes: a single scrolling strip. */
  .palettes {
    display: flex; gap: var(--s2); overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none;
    margin: var(--s4) calc(-1 * var(--s5)) 0; padding: 4px var(--s5);
  }
  .palette {
    flex: none; scroll-snap-align: start; border: 0; border-radius: 12px; padding: 10px 12px; display: grid; gap: 6px;
    min-width: 92px; text-align: left; box-shadow: inset 0 0 0 .5px rgb(128 128 128 / .45);
    transition: transform .4s var(--spring), box-shadow .2s;
  }
  .palette:active { transform: scale(.95); }
  .palette.on { box-shadow: inset 0 0 0 2px var(--ring); }
  .dots { display: flex; gap: 3px; }
  .dots i { width: 8px; height: 8px; border-radius: 50%; }
  .name { font-size: 12px; font-weight: 600; white-space: nowrap; }

  /* Disclosure rows, grouped like iOS settings. */
  .group { margin-top: var(--s4); border-radius: 12px; background: var(--hover); overflow: hidden; }
  .row {
    display: flex; align-items: center; gap: var(--s3); width: 100%; min-height: 48px; padding: 0 var(--s4);
    border: 0; background: none; text-align: left; font-size: 15px;
  }
  .row + .sub, .sub + .row, .row + .row { border-top: .5px solid var(--hairline); }
  .row > span:first-child { flex: 1; }
  .value { color: var(--muted); font-size: 14px; }
  .chev { width: 16px; height: 16px; color: var(--muted); transition: transform .35s var(--spring); }
  .chev.open { transform: rotate(90deg); }
  .sub { padding: 0 var(--s4) var(--s2); }
  .opt {
    display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 44px;
    border: 0; background: none; padding: 0; font-size: 17px; text-align: left;
  }
  .opt + .opt { border-top: .5px solid var(--hairline); }
  .opt svg { width: 18px; height: 18px; color: var(--accent); }
  .line { display: flex; align-items: center; gap: var(--s3); min-height: 44px; font-size: 15px; }
  .line + .line { border-top: .5px solid var(--hairline); }
  .line > span:first-child { flex: 1; }
  .line input[type=range] { flex: 1; accent-color: var(--accent); }

  .segmented { display: flex; background: var(--hover); border-radius: 9px; padding: 2px; }
  .segmented button { border: 0; background: transparent; border-radius: 7px; padding: 5px 10px; font-size: 13px; transition: background-color .25s var(--ease); }
  .segmented .on { background: var(--bg); box-shadow: 0 1px 3px rgb(0 0 0 / .15); font-weight: 600; }

  input[role=switch] {
    appearance: none; flex: none; width: 50px; height: 30px; border-radius: 15px; margin: 0; position: relative; cursor: pointer;
    background: color-mix(in srgb, var(--fg) 18%, transparent); transition: background-color .25s;
  }
  input[role=switch]::before {
    content: ''; position: absolute; top: 2px; left: 2px; width: 26px; height: 26px; border-radius: 50%;
    background: white; box-shadow: 0 2px 5px rgb(0 0 0 / .25); transition: transform .4s var(--spring);
  }
  input[role=switch]:checked { background: var(--accent); }
  input[role=switch]:checked::before { transform: translateX(20px); }
</style>
