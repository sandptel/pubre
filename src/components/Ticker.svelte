<script lang="ts">
  // A value that rolls when it changes: the new one rises in as the old one leaves (numbers roll
  // up when they grow, down when they shrink). Used for "where am I": the section and the page.
  import { untrack } from 'svelte'
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'

  let { value }: { value: string | number } = $props()
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  let dir = $state(1), prev: string | number = untrack(() => value)
  $effect.pre(() => {
    const v = value
    untrack(() => { if (typeof v === 'number' && typeof prev === 'number') dir = v >= prev ? 1 : -1; prev = v })
  })
</script>

<span class="ticker">{#key value}<span class="t" in:fly={{ y: reduce ? 0 : 9 * dir, duration: 460, easing: cubicOut }} out:fly={{ y: reduce ? 0 : -9 * dir, duration: 260 }}>{value}</span>{/key}</span>

<style>
  .ticker { display: inline-grid; max-width: 100%; vertical-align: bottom; overflow: hidden; }
  .t { grid-area: 1 / 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
