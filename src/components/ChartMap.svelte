<script lang="ts">
  // A map that fills in (R9): the places the book names, as an inked chart. Not real geography: each place
  // takes its turn along the route in the order you first meet it, the voyage drawn as a dashed line, and only
  // places you've reached appear (the newest drawn in last, with a ring).
  import type { NameInfo } from '../insights/names.ts'

  let { places, upto, seed = 'pubre', onpick }: { places: NameInfo[]; upto: number; seed?: string; onpick?: (name: string) => void } = $props()

  const W = 320, H = 440
  // a small seeded random, so a book's coasts are the same every time
  const rng = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507), h = Math.imul(h ^ (h >>> 13), 3266489909), (h ^= h >>> 16) >>> 0) / 4294967296) }
  const seen = $derived(places.filter(p => p.kind === 'place' && p.first <= upto && p.count >= 2).sort((a, b) => a.first - b.first || b.count - a.count).slice(0, 14))
  const pts = $derived.by(() => {
    const r = rng(seed), n = Math.max(1, seen.length)
    return seen.map((p, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1)
      return { name: p.name, x: W * (0.28 + 0.44 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2.2 + r() * 0.6))) + (r() - 0.5) * 30, y: 46 + t * (H - 92), big: p.count }
    })
  })
  const route = $derived(pts.length < 2 ? '' : pts.map((p, i) => {
    if (!i) return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`
    const a = pts[i - 1], my = (a.y + p.y) / 2
    return `C${a.x.toFixed(1)} ${my.toFixed(1)} ${p.x.toFixed(1)} ${my.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  }).join(' '))
  // coasts: two wandering lines down the sides
  const coast = (side: number) => { const r = rng(seed + side); let d = '', x = side ? W - 26 : 26; for (let y = 10; y <= H; y += 22) { x += (r() - 0.5) * 22; x = Math.max(side ? W - 60 : 8, Math.min(side ? W - 8 : 60, x)); d += `${y === 10 ? 'M' : 'L'}${x.toFixed(1)} ${y}` } return d }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
</script>

{#if pts.length}
  <svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="The places you've reached, in the order you met them">
    <path class="coast" d={coast(0)} pathLength="1" /><path class="coast" d={coast(1)} pathLength="1" />
    {#if route}<path class="route" class:still={reduce} d={route} />{/if}
    {#each pts as p, i (p.name)}
      {@const last = i === pts.length - 1}
      <g class="pl" style:--d="{0.3 + i * 0.08}s" role="button" tabindex="0" aria-label={p.name} onclick={() => onpick?.(p.name)} onkeydown={e => { if (e.key === 'Enter') onpick?.(p.name) }}>
        {#if last}<circle class="ring" cx={p.x} cy={p.y} r="8" />{/if}
        <circle class="dot" cx={p.x} cy={p.y} r={Math.min(4.5, 2.4 + Math.log10(p.big + 1))} />
        <text x={p.x + (p.x > W / 2 ? -10 : 10)} y={p.y + 3.5} text-anchor={p.x > W / 2 ? 'end' : 'start'}>{p.name.toUpperCase()}</text>
      </g>
    {/each}
  </svg>
{:else}
  <p class="none">No places yet. As the book names them, they appear here along the way you've come.</p>
{/if}

<style>
  .chart { width: 100%; max-width: 360px; display: block; margin: 0 auto; }
  .coast { fill: none; stroke: var(--muted); stroke-width: 1; opacity: .5; stroke-dasharray: 1; stroke-dashoffset: 1; animation: ink 1.6s ease-out forwards; }
  .route { fill: none; stroke: var(--accent); stroke-width: 1.4; stroke-dasharray: 4 4; opacity: .85; }
  .route:not(.still) { animation: route 2.4s ease-out both; }
  @keyframes route { from { stroke-dashoffset: 400; opacity: 0; } 20% { opacity: .85; } }
  @keyframes ink { to { stroke-dashoffset: 0; } }
  .pl { cursor: pointer; animation: pop .5s cubic-bezier(.3,1.4,.5,1) both; animation-delay: var(--d); transform-box: fill-box; transform-origin: center; }
  @keyframes pop { from { opacity: 0; } }
  .dot { fill: var(--accent); }
  .ring { fill: none; stroke: var(--accent); stroke-width: 1.2; opacity: .6; }
  text { font: 600 8.5px var(--mono); letter-spacing: .1em; fill: var(--fg); }
  .pl:focus-visible { outline: none; } .pl:focus-visible text { text-decoration: underline; }
  .none { color: var(--muted); font-size: 14px; }
  @media (prefers-reduced-motion: reduce) { .coast, .pl { animation: none; stroke-dashoffset: 0; } }
</style>
