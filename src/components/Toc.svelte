<script lang="ts">
  import type { TocItem } from '../lib/epub.ts'

  let { toc, isCurrent, onpick, glyph }: { toc: TocItem[]; isCurrent: (t: TocItem) => boolean; onpick: (href: string) => void; glyph?: (label: string, href: string) => string } = $props()

  let root: HTMLElement
  $effect(() => { root.querySelector('.current')?.scrollIntoView({ block: 'center' }) })
</script>

{#snippet list(items: TocItem[], depth: number)}
  <ul>
    {#each items as item}
      <li>
        <button class:current={isCurrent(item)} style:--depth={depth} disabled={!item.href}
          onclick={() => onpick(item.href)}><span class="l">{item.label}</span>{#if glyph && item.href}{@const d = glyph(item.label, item.href)}{#if d}<svg class="fp" viewBox="0 0 22 22" aria-hidden="true"><path {d} /></svg>{/if}{/if}</button>
        {#if item.children.length}{@render list(item.children, depth + 1)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

<nav bind:this={root} aria-label="Table of contents">{@render list(toc, 0)}</nav>

<style>
  ul { list-style: none; margin: 0; padding: 0; }
  button {
    all: unset; box-sizing: border-box; cursor: pointer; display: block; width: 100%;
    padding: 11px 12px 11px calc(12px + var(--depth) * 18px); border-radius: 10px; display: flex; align-items: center; gap: 10px;
    font: 400 1rem/1.35 var(--serif); transition: background-color .2s;
  }
  button:hover { background: color-mix(in srgb, var(--fg) 6%, transparent); }
  button:focus-visible { outline: 2px solid var(--accent); }
  button:disabled { cursor: default; color: var(--muted); }
  .l { flex: 1; min-width: 0; }
  /* The chapter's fingerprint (Posavec's sentence drawing): structure only, safe for unread chapters. */
  .fp { width: 22px; height: 22px; flex: none; fill: none; stroke: currentColor; stroke-width: .9; stroke-linejoin: round; opacity: .45; }
  .current .fp { opacity: .9; }
  .current { color: var(--accent); font-weight: 600; background: color-mix(in srgb, var(--accent) 10%, transparent); }
</style>
