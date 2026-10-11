<script lang="ts">
  import type { BookRecord } from '../lib/store.svelte.ts'

  let { book }: { book: BookRecord } = $props()

  const url = $derived(book.cover ? URL.createObjectURL(new Blob([book.cover], { type: book.coverType })) : '')
  $effect(() => () => { if (url) URL.revokeObjectURL(url) })

  // Generated covers pick a base16 accent (base08–0E) from the title, so they follow the theme.
  const hue = $derived(['08', '09', '0A', '0B', '0C', '0D', '0E'][[...book.title].reduce((a, c) => a + c.charCodeAt(0), 0) % 7])
</script>

<div class="cover" class:generated={!url} style:--c="var(--base{hue})">
  {#if url}
    <img src={url} alt="" draggable="false" />
  {:else}
    <span class="t">{book.title}</span>
    <span class="a">{book.creator}</span>
  {/if}
</div>

<style>
  .cover {
    position: relative; aspect-ratio: 2 / 3; border-radius: 3px 6px 6px 3px; overflow: hidden;
    box-shadow: var(--shadow-cover); background: var(--surface);
  }
  /* Spine highlight, like a real book edge. */
  .cover::after {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(90deg, rgb(0 0 0 / .14), rgb(255 255 255 / .12) 2.5%, transparent 6%, transparent 94%, rgb(0 0 0 / .06));
  }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .generated {
    display: flex; flex-direction: column; justify-content: space-between; padding: 14% 12%;
    background: linear-gradient(160deg, color-mix(in srgb, var(--c) 82%, white), var(--c) 55%, color-mix(in srgb, var(--c) 70%, black));
    color: white; text-shadow: 0 1px 2px rgb(0 0 0 / .25);
  }
  .t { font: 600 clamp(.9rem, 2.2vw, 1.25rem)/1.15 var(--serif); display: -webkit-box; -webkit-line-clamp: 5; line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  .a { font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; opacity: .85; }
</style>
