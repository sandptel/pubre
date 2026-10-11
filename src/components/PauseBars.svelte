<script lang="ts">
  // The pause ladder at your length — one bar per mark, so the slider's effect shows before you read.
  // `row`: a compact chart of upright bars (the Stage's quick panel).
  import { LADDER } from '../lib/pacing.ts'

  let { pauses = 1, row = false }: { pauses?: number; row?: boolean } = $props()
  const MAX = LADDER[LADDER.length - 1][1] * 3
</script>

<div class="pb" class:row aria-hidden="true">
  {#each LADDER as [m, ms]}
    <span class="c"><span class="m">{m}</span><i style:--f={ms * pauses / MAX}></i>{#if !row}<small>{(ms * pauses / 1000).toFixed(1)}s</small>{/if}</span>
  {/each}
</div>

<style>
  .pb { display: grid; grid-template-columns: 1.2em 1fr 3em; align-items: center; gap: 4px 10px; font: 600 11px var(--mono); color: var(--muted); }
  .c { display: contents; }
  .m { font: 600 16px/1 var(--serif); color: var(--fg); text-align: center; }
  i { height: 6px; width: calc(var(--f) * 100%); min-width: 3px; border-radius: 3px; background: var(--accent); transition: width .3s cubic-bezier(.22,1,.36,1), height .3s cubic-bezier(.22,1,.36,1); }
  small { text-align: right; font: inherit; }
  .row { display: flex; align-items: flex-end; gap: 6px; }
  .row .c { display: flex; flex-direction: column-reverse; align-items: center; gap: 3px; }
  .row .m { font-size: 12px; }
  .row i { width: 6px; min-width: 0; height: calc(4px + var(--f) * 30px); }
  @media (prefers-reduced-motion: reduce) { i { transition: none; } }
</style>
