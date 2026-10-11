<script lang="ts">
  import type { Snippet } from 'svelte'

  // One floating panel for a stack of views: bottom sheet on phones, popover above its trigger on
  // wide screens. Grows from `origin`; its height animates as views or disclosures change.
  // `seeThrough` keeps the page visible behind it for live previews.
  let { open = $bindable(false), title, back, seeThrough = false, children }:
    { open: boolean; title: string; back?: () => void; seeThrough?: boolean; children: Snippet } = $props()

  let dialog: HTMLDialogElement
  let inner: HTMLDivElement
  let height = $state(0)

  $effect(() => {
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.focus() // focus the panel itself, not its first button (no stray focus ring)
    }
    else if (!open && dialog.open) dialog.close()
  })
  $effect(() => {
    const ro = new ResizeObserver(() => (height = inner.offsetHeight))
    ro.observe(inner)
    return () => ro.disconnect()
  })
</script>

<dialog bind:this={dialog} tabindex="-1" class:see-through={seeThrough} aria-label={title}
  onclose={() => (open = false)} onclick={e => { if (e.target === dialog) open = false }}>
  <div class="sheet glass">
    <header class:bare={!title && !back}>
      {#if back}
        <button class="nav" aria-label="Back" onclick={back}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
      {/if}
      {#if title}<h2>{title}</h2>{/if}
      <button class="nav close" aria-label="Close" onclick={() => (open = false)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>
      </button>
    </header>
    <div class="body" style:height={height ? height + 'px' : 'auto'}>
      <div class="inner" bind:this={inner}>{@render children()}</div>
    </div>
  </div>
</dialog>

<style>
  dialog {
    margin: 0; padding: 0; border: 0; color: var(--fg); background: transparent; overflow: visible;
    position: fixed; inset: auto var(--s2) calc(var(--s2) + env(safe-area-inset-bottom)) var(--s2);
    width: auto; max-width: none; max-height: none;
    transform-origin: bottom right;
    transition: transform .55s var(--spring), opacity .25s, overlay .55s allow-discrete, display .55s allow-discrete;
  }
  dialog:not([open]) { transform: translateY(24px) scale(.6); opacity: 0; }
  @starting-style { dialog[open] { transform: translateY(24px) scale(.6); opacity: 0; } }
  dialog:focus-visible { outline: none; }
  dialog::backdrop {
    background: rgb(0 0 0 / 0);
    transition: background .35s, overlay .55s allow-discrete, display .55s allow-discrete;
  }
  dialog[open]::backdrop { background: rgb(0 0 0 / .2); }
  dialog.see-through[open]::backdrop { background: rgb(0 0 0 / 0); }
  @starting-style { dialog[open]::backdrop { background: rgb(0 0 0 / 0); } }

  .sheet { border-radius: 28px; overflow: hidden; background: var(--glass-solid); }
  header { display: flex; align-items: center; gap: var(--s2); padding: var(--s3) var(--s3) var(--s1) var(--s5); }
  header:has(.nav:first-child) { padding-left: var(--s2); }
  /* No title: the close button floats over the content's top-right corner. */
  header.bare { position: absolute; top: 0; right: 0; z-index: 1; padding: var(--s3); }
  .sheet { position: relative; }
  h2 { flex: 1; margin: 0; font: 700 17px/1.2 var(--serif); }
  .nav {
    display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%;
    background: var(--hover); color: var(--fg); transition: transform .3s var(--spring);
  }
  .nav:active { transform: scale(.88); }
  .nav svg { width: 15px; height: 15px; }
  .body {
    max-height: min(72dvh, 620px); overflow: auto; overscroll-behavior: contain;
    transition: height .45s var(--spring);
  }
  .inner { padding: var(--s3) var(--s5) var(--s5); }
  header.bare + .body .inner { padding-top: var(--s5); }

  @media (min-width: 720px) {
    dialog { inset: auto var(--s4) calc(var(--s4) + 56px) auto; width: 380px; }
  }
</style>
