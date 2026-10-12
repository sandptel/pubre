<script lang="ts">
  import type { Snippet } from 'svelte'

  // One floating panel for a stack of views: bottom sheet on phones, popover above its trigger on
  // tablets, and a full-height drawer from the left on desktops (room for settings to breathe, the page
  // stays visible beside it). Grows from `origin`; its height animates as views or disclosures change.
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

  /* Opaque and softly coloured (the theme's accent folded into its surface); set in mono, like an instrument panel */
  .sheet {
    border-radius: 28px; overflow: hidden; font-family: var(--mono); letter-spacing: -.01em;
    background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 14%, var(--surface)), color-mix(in srgb, var(--accent) 7%, var(--surface)) 60%);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 22%, var(--hairline)), var(--e2);
  }
  header { display: flex; align-items: center; gap: var(--s2); padding: var(--s3) var(--s3) var(--s1) var(--s5); }
  header:has(.nav:first-child) { padding-left: var(--s2); }
  /* No title: the close button floats over the content's top-right corner. */
  header.bare { position: absolute; top: 0; right: 0; z-index: 1; padding: var(--s3); }
  .sheet { position: relative; }
  h2 { flex: 1; margin: 0; font: 600 13px/1.2 var(--mono); letter-spacing: .12em; text-transform: uppercase; }
  .nav {
    display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%;
    background: transparent; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 22%, transparent); color: var(--fg); transition: transform .3s var(--spring);
  }
  .nav:active { transform: scale(.88); }
  .nav svg { width: 15px; height: 15px; }
  .body {
    max-height: min(72dvh, 620px); overflow: auto; overscroll-behavior: contain;
    transition: height .24s cubic-bezier(.2,.8,.2,1); /* quick and settled: no spring on a page change */
  }
  .inner { padding: var(--s3) var(--s5) var(--s5); }
  header.bare + .body .inner { padding-top: var(--s5); }

  @media (min-width: 720px) {
    dialog { inset: auto var(--s4) calc(var(--s4) + 56px) auto; width: 380px; }
  }
  @media (min-width: 1000px) { /* docked to the left edge, full height, sliding in like a side panel */
    dialog { inset: 0 auto 0 0; width: min(460px, 36vw); height: 100dvh; transform-origin: left center; }
    dialog:not([open]) { transform: translateX(-100%); opacity: 1; }
    @starting-style { dialog[open] { transform: translateX(-100%); opacity: 1; } }
    .sheet { height: 100%; display: flex; flex-direction: column; border-radius: 0 28px 28px 0; box-shadow: 1px 0 0 color-mix(in srgb, var(--accent) 22%, var(--hairline)), var(--e2); }
    .body { flex: 1; height: auto !important; max-height: none; } /* fills the panel; no height animation needed */
    .inner { padding: var(--s3) var(--s6) var(--s6); }
    header { padding: max(var(--s5), env(safe-area-inset-top)) var(--s4) var(--s2) var(--s6); }
    header:has(.nav:first-child) { padding-left: var(--s4); }
    dialog[open]::backdrop { background: rgb(0 0 0 / .12); }
  }
</style>
