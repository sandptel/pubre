<script lang="ts">
  // The cast as a sky: everyone you've met so far is a star (brighter the more they're around), and
  // every paragraph two of them share draws a thread. Nobody you haven't met yet exists here.
  import type { NameInfo } from '../insights/names.ts'
  let { people, links = {}, upto, hue, onpick }: {
    people: NameInfo[]; links?: Record<string, Record<string, number[]>>; upto: number
    hue: (slot: number) => string; onpick?: (name: string) => void
  } = $props()
  const met = $derived(people.filter(p => p.kind === 'person' && p.first <= upto).map(p => ({ ...p, n: p.perSpine.slice(0, upto + 1).reduce((a, x) => a + x, 0) })).filter(p => p.n > 0).slice(0, 18))
  // a calm, stable layout: golden-angle spiral by importance, so the sky only grows outward
  const pos = $derived(met.map((p, i) => { const a = i * 2.39996, r = 8 + 34 * Math.sqrt(i / Math.max(1, met.length - 1)); return { ...p, x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r * 0.8, s: 1.2 + Math.min(3.2, Math.sqrt(p.n) / 3) } }))
  const threads = $derived.by(() => {
    const out: { a: (typeof pos)[number]; b: (typeof pos)[number]; w: number }[] = []
    for (const a of pos) for (const b of pos) if (a.name < b.name) {
      const w = (links[a.name]?.[b.name] ?? []).filter(i => i <= upto).length
      if (w) out.push({ a, b, w })
    }
    return out
  })
</script>

{#if met.length}
  <svg class="sky" viewBox="0 0 100 100" role="img" aria-label="The cast so far">
    {#each threads as t}<line x1={t.a.x} y1={t.a.y} x2={t.b.x} y2={t.b.y} stroke-width={Math.min(0.9, 0.15 + t.w * 0.06)} />{/each}
    {#each pos as p, i (p.name)}
      <g class="star" style:animation-delay="{i * 60}ms" role="button" tabindex="0" aria-label={p.name} onclick={() => onpick?.(p.name)} onkeydown={e => { if (e.key === 'Enter') onpick?.(p.name) }}>
        <circle cx={p.x} cy={p.y} r={p.s * 2.4} fill={p.slot >= 0 ? hue(p.slot) : 'currentColor'} opacity=".16" />
        <circle cx={p.x} cy={p.y} r={p.s} fill={p.slot >= 0 ? hue(p.slot) : 'currentColor'} />
        <text x={p.x} y={p.y + p.s + 4.2} text-anchor="middle">{p.name}</text>
      </g>
    {/each}
  </svg>
{:else}
  <p class="none">Nobody yet — the cast appears as you meet them.</p>
{/if}

<style>
  .sky { width: 100%; aspect-ratio: 1 / .9; border-radius: var(--r4); background: radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--accent) 8%, var(--card)), var(--card)); box-shadow: var(--e1); color: var(--fg); }
  line { stroke: color-mix(in srgb, var(--fg) 35%, transparent); stroke-linecap: round; }
  .star { cursor: pointer; animation: twinkle .6s cubic-bezier(.34,1.56,.64,1) both; transform-box: fill-box; transform-origin: center; }
  text { font: 3px var(--mono); fill: currentColor; opacity: .8; }
  .none { color: var(--muted); font-size: 13px; }
  @keyframes twinkle { from { opacity: 0; transform: scale(.3); } }
</style>
