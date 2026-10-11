<script lang="ts">
  import { fonts, pubreThemes, themes, type Settings } from '../lib/settings.ts'

  let { settings = $bindable() }: { settings: Settings } = $props()

  const base16 = Object.keys(themes).filter(k => !pubreThemes.includes(k))
  const size = (d: number) => (settings.fontScale = Math.min(200, Math.max(70, settings.fontScale + d)))
</script>

<div class="row size">
  <button class="seg small" aria-label="Smaller text" onclick={() => size(-10)}>A</button>
  <span class="val">{settings.fontScale}%</span>
  <button class="seg big" aria-label="Larger text" onclick={() => size(10)}>A</button>
</div>

<h3>Themes</h3>
<div class="themes">
  {#each pubreThemes as id}
    {@const t = themes[id]}
    <button class="theme" class:on={settings.theme === id} onclick={() => (settings.theme = id)}
      style:background={t.base[0]} style:color={t.base[5]} style:--ring={t.base[t.accent]}>
      <span class="aa">Aa</span><span class="nm">{t.name}</span>
    </button>
  {/each}
</div>

<h3>Base16</h3>
<div class="scroller">
  {#each base16 as id}
    {@const t = themes[id]}
    <button class="b16" class:on={settings.theme === id} onclick={() => (settings.theme = id)}
      style:background={t.base[0]} style:color={t.base[5]} title={t.name}>
      <span class="dots">{#each t.base.slice(8, 14) as c}<i style:background={c}></i>{/each}</span>
      <span class="nm">{t.name}</span>
    </button>
  {/each}
</div>

<h3>Font</h3>
<div class="fonts">
  {#each Object.entries(fonts) as [id, f]}
    <button class="font" class:on={settings.font === id} style:font-family={f.stack || 'var(--serif)'}
      onclick={() => (settings.font = id)}>
      <span class="aa">Ag</span>{f.name}
    </button>
  {/each}
</div>

<h3>Layout</h3>
<label class="row">
  <span>Line spacing</span>
  <input type="range" min="1.1" max="2.2" step="0.05" bind:value={settings.lineHeight} />
  <span class="val">{settings.lineHeight.toFixed(2)}</span>
</label>
<div class="row">
  <span>Margins</span>
  <div class="segmented" role="radiogroup" aria-label="Margins">
    {#each ['Narrow', 'Normal', 'Wide'] as label, i}
      <button role="radio" aria-checked={settings.margin === i} class:on={settings.margin === i} onclick={() => (settings.margin = i)}>{label}</button>
    {/each}
  </div>
</div>
<label class="row"><span>Justify text</span><input type="checkbox" role="switch" bind:checked={settings.justify} /></label>
<label class="row"><span>Bold text</span><input type="checkbox" role="switch" bind:checked={settings.bold} /></label>
<label class="row">
  <span>Two pages on wide screens</span>
  <input type="checkbox" role="switch" checked={settings.spread === 'auto'}
    onchange={e => (settings.spread = e.currentTarget.checked ? 'auto' : 'single')} />
</label>

<style>
  h3 { font-size: .74rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin: 22px 0 10px; }
  .row { display: flex; align-items: center; gap: 12px; min-height: 46px; }
  .row > span:first-child { flex: 1; }
  .row input[type=range] { flex: 1.3; accent-color: var(--accent); }
  .val { font-variant-numeric: tabular-nums; color: var(--muted); min-width: 3.2em; text-align: center; }

  .size { background: color-mix(in srgb, var(--fg) 6%, transparent); border-radius: 14px; padding: 4px; margin-top: 4px; }
  .seg { flex: 1; height: 44px; border: 0; border-radius: 10px; background: transparent; font-family: var(--serif); transition: background-color .2s, transform .15s; }
  .seg:hover { background: color-mix(in srgb, var(--fg) 7%, transparent); }
  .seg:active { transform: scale(.95); }
  .small { font-size: .95rem; }
  .big { font-size: 1.5rem; }

  .themes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .theme {
    border: 0; border-radius: 14px; padding: 12px 8px 10px; display: grid; gap: 2px; justify-items: center;
    box-shadow: inset 0 0 0 1px rgb(128 128 128 / .25); transition: transform .25s var(--ease), box-shadow .2s;
  }
  .theme:active, .b16:active, .font:active { transform: scale(.95); }
  .theme.on { box-shadow: inset 0 0 0 2.5px var(--ring); }
  .aa { font: 600 1.35rem var(--serif); }
  .nm { font-size: .74rem; font-weight: 600; }

  .scroller { display: flex; gap: 8px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 6px; margin: 0 -20px; padding-inline: 20px; scrollbar-width: none; }
  .b16 {
    flex: none; scroll-snap-align: start; width: 104px; border: 0; border-radius: 12px; padding: 10px; display: grid; gap: 8px; text-align: left;
    box-shadow: inset 0 0 0 1px rgb(128 128 128 / .25); transition: transform .25s var(--ease);
  }
  .b16.on { box-shadow: inset 0 0 0 2.5px var(--accent); }
  .b16 .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dots { display: flex; gap: 3px; }
  .dots i { width: 11px; height: 11px; border-radius: 50%; }

  .fonts { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
  .font {
    border: 0; border-radius: 12px; padding: 10px 6px; background: color-mix(in srgb, var(--fg) 5%, transparent);
    font-size: .82rem; display: grid; gap: 2px; justify-items: center; transition: transform .25s var(--ease), box-shadow .2s;
  }
  .font .aa { font-family: inherit; font-weight: 400; font-size: 1.5rem; }
  .font.on { box-shadow: inset 0 0 0 2px var(--accent); color: var(--accent); }

  .segmented { display: flex; background: color-mix(in srgb, var(--fg) 7%, transparent); border-radius: 9px; padding: 2px; }
  .segmented button { border: 0; background: transparent; border-radius: 7px; padding: 6px 10px; font-size: .84rem; transition: background-color .25s var(--ease); }
  .segmented .on { background: var(--bg); box-shadow: 0 1px 3px rgb(0 0 0 / .15); font-weight: 600; }

  input[role=switch] {
    appearance: none; flex: none; width: 50px; height: 30px; border-radius: 15px; margin: 0; position: relative; cursor: pointer;
    background: color-mix(in srgb, var(--fg) 18%, transparent); transition: background-color .25s;
  }
  input[role=switch]::before {
    content: ''; position: absolute; top: 2px; left: 2px; width: 26px; height: 26px; border-radius: 50%;
    background: white; box-shadow: 0 2px 5px rgb(0 0 0 / .25); transition: transform .3s var(--ease);
  }
  input[role=switch]:checked { background: var(--accent); }
  input[role=switch]:checked::before { transform: translateX(20px); }
</style>
