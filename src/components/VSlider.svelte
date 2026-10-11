<script lang="ts">
  // A tall pill you slide your thumb up and down (Control Center style). The fill is the value.
  let { value = $bindable(), min, max, step = 1, label, children }: {
    value: number; min: number; max: number; step?: number; label: string; children?: import('svelte').Snippet
  } = $props()
  let el: HTMLDivElement
  const frac = $derived((value - min) / (max - min))
  function set(e: PointerEvent) {
    const r = el.getBoundingClientRect(), f = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    value = Math.round((min + f * (max - min)) / step) * step
  }
  function key(e: KeyboardEvent) {
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? step : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -step : 0
    if (d) { e.preventDefault(); value = Math.min(max, Math.max(min, +(value + d).toFixed(4))) }
  }
</script>

<div class="vs" bind:this={el} role="slider" tabindex="0" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
  onpointerdown={e => { el.setPointerCapture(e.pointerId); set(e) }} onpointermove={e => { if (el.hasPointerCapture(e.pointerId)) set(e) }} onkeydown={key}>
  <span class="fill" style:height="{frac * 100}%"></span>
  <span class="icon">{@render children?.()}</span>
</div>

<style>
  .vs { position: relative; width: 100%; height: 100%; min-height: 120px; border-radius: 22px; overflow: hidden; background: var(--card); box-shadow: var(--e1); touch-action: none; cursor: ns-resize; }
  .fill { position: absolute; left: 0; right: 0; bottom: 0; background: color-mix(in srgb, var(--fg) 14%, var(--card)); transition: height .12s ease-out; }
  .icon { position: absolute; left: 0; right: 0; bottom: 14px; display: grid; place-items: center; color: var(--fg); pointer-events: none; }
  .vs:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
