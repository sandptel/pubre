<script lang="ts">
  // The book in one line: a tick per chapter (from the words in each part), filled to where you are,
  // with a dot at your place. Shape only, so it never spoils anything.
  let { words = [], progress = 0 }: { words?: number[]; progress?: number } = $props()
  const segs = $derived.by(() => {
    const w = words.filter(n => n > 0)
    if (w.length <= 40) return w
    const per = Math.ceil(w.length / 40), out: number[] = []
    for (let i = 0; i < w.length; i += per) out.push(w.slice(i, i + per).reduce((a, n) => a + n, 0))
    return out
  })
</script>

<span class="mini" aria-hidden="true">
  {#if segs.length > 1}{#each segs as g}<i style:flex-grow={g}></i>{/each}{:else}<i style:flex-grow={1}></i>{/if}
  <span class="fill" style:width="{progress * 100}%"></span>
  <b style:left="{progress * 100}%"></b>
</span>

<style>
  .mini { position: relative; display: flex; gap: 1px; height: 4px; width: 100%; }
  .mini i { flex-basis: 0; min-width: 0; height: 100%; border-radius: 1px; background: color-mix(in srgb, var(--fg) 12%, transparent); }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: color-mix(in srgb, var(--accent) 75%, transparent); mix-blend-mode: normal; }
  b { position: absolute; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--bg); }
</style>
