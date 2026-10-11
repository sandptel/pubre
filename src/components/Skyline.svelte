<script lang="ts">
  // The story's shape: one bar per chapter, as wide as the chapter, as tall as it is bright (its mood).
  // Only chapters you've reached show their shape; the rest are a low, even line (no spoilers).
  // The chapters you read since you opened the book grow in when you come back (the arc reveal).
  import type { ChapterInfo } from '../insights/chapters.ts'
  let { chapters = [], progress = 0, from = progress }: { chapters?: ChapterInfo[]; progress?: number; from?: number } = $props()
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const bars = $derived.by(() => {
    const cs = chapters.filter(c => c.title && c.words > 50)
    const total = cs.reduce((a, c) => a + c.words, 0) || 1
    let at = 0
    return cs.map(c => { const start = at / total; at += c.words; return { w: c.words / total, start, h: 0.25 + 0.75 * (c.mood + 1) / 2 } })
  })
</script>

{#if bars.length > 2}
  <span class="sky" aria-hidden="true">
    {#each bars as b, i}
      {@const read = b.start < progress}
      {@const fresh = read && b.start >= from - 1e-6}
      <i class:read class:fresh style:flex-grow={b.w} style:height="{read ? b.h * 100 : 14}%"
        style:animation-delay="{fresh && !reduce ? 250 + Math.min(i, 40) * 40 : 0}ms"></i>
    {/each}
  </span>
{/if}

<style>
  .sky { display: flex; align-items: end; gap: 1px; height: 26px; width: 100%; }
  i { flex-basis: 0; min-width: 1px; border-radius: 1px 1px 0 0; background: color-mix(in srgb, var(--fg) 12%, transparent); }
  i.read { background: color-mix(in srgb, var(--accent) 55%, transparent); }
  i.fresh { background: var(--accent); transform-origin: bottom; animation: grow .7s cubic-bezier(.34,1.56,.64,1) both; }
  @keyframes grow { from { transform: scaleY(0); } }
</style>
