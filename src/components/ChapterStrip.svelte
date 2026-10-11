<script lang="ts" module>
  export interface StripChapter { weight: number; tint?: string }
</script>

<script lang="ts">
  // Where you are in the whole book: every chapter a wedge (as long as the chapter, tinted by its
  // mood, dark → bright), the one you're in magnified so you can see your way through it — it fills
  // as you read, with a tick per paragraph. Crossing into the next chapter, the magnified segment
  // glides over to it and springs.
  let { chapters, cur, fill = 0, ticks = [] }: { chapters: StripChapter[]; cur: number; fill?: number; ticks?: number[] } = $props()
  const total = $derived(chapters.reduce((a, c) => a + c.weight, 0) || 1)
  /** The chapter you're in takes 38% of the strip (or its own share, if bigger). */
  const grow = (i: number) => {
    const w = chapters[i].weight
    if (i !== cur || chapters.length < 3) return w
    const rest = total - w
    return Math.max(w, rest * 0.38 / 0.62)
  }
</script>

<span class="strip" class:dense={chapters.length > 40} aria-hidden="true">
  {#each chapters as c, i}
    <i class:done={i < cur} class:cur={i === cur} style:flex-grow={grow(i)} style:--tint={c.tint ?? null}>
      {#if i === cur}
        <span class="fill" style:transform="scaleX({fill})"></span>
        {#each ticks as t}<b style:left="{t * 100}%"></b>{/each}
        {#key cur}<em></em>{/key}
      {/if}
    </i>
  {/each}
</span>

<style>
  .strip { display: flex; gap: 2px; align-items: center; width: 100%; height: 10px; }
  .strip.dense { gap: 1px; }
  i {
    position: relative; flex-basis: 0; min-width: 1px; height: 3px; border-radius: 2px; overflow: hidden;
    background: color-mix(in srgb, var(--tint, var(--fg)) 22%, transparent);
    transition: flex-grow .9s cubic-bezier(.22,1,.36,1), height .4s cubic-bezier(.34,1.56,.64,1), background-color .5s ease;
  }
  i.done { background: color-mix(in srgb, var(--accent) 38%, transparent); }
  i.cur { height: 7px; overflow: visible; background: color-mix(in srgb, var(--tint, var(--fg)) 16%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent); animation: spring .7s cubic-bezier(.34,1.56,.64,1); }
  .fill { position: absolute; inset: 0; border-radius: inherit; background: var(--accent); transform-origin: left; transition: transform .8s cubic-bezier(.22,1,.36,1); }
  b { position: absolute; top: 1px; bottom: 1px; width: 1px; background: color-mix(in srgb, var(--bg) 70%, transparent); }
  /* crossing into a chapter: a soft light runs through it */
  em { position: absolute; inset: -2px 0; border-radius: 4px; pointer-events: none; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 60%, transparent), transparent); background-size: 50% 100%; background-repeat: no-repeat; animation: sweep 1.1s cubic-bezier(.4,0,.2,1) both; }
  @keyframes spring { 0% { transform: scaleY(.5); } 45% { transform: scaleY(1.6); } 100% { transform: scaleY(1); } }
  @keyframes sweep { from { background-position: -80% 0; opacity: 1; } to { background-position: 180% 0; opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { i { transition: none; } i.cur, em { animation: none; } }
</style>
