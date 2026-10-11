<script lang="ts">
  import type { Snippet } from 'svelte'

  // Native <dialog> sheet: bottom sheet on phones, floating glass panel on wide screens.
  // `see-through` keeps the page visible behind it for live previews (e.g. appearance).
  let { open = $bindable(false), title, seeThrough = false, children }:
    { open: boolean; title: string; seeThrough?: boolean; children: Snippet } = $props()

  let dialog: HTMLDialogElement
  $effect(() => {
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  })
</script>

<dialog bind:this={dialog} class:see-through={seeThrough} aria-label={title}
  onclose={() => (open = false)} onclick={e => { if (e.target === dialog) open = false }}>
  <div class="sheet">
    <div class="grabber" aria-hidden="true"></div>
    <header>
      <h2>{title}</h2>
      <button class="icon-btn close" aria-label="Close" onclick={() => (open = false)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>
      </button>
    </header>
    <div class="body">{@render children()}</div>
  </div>
</dialog>

<style>
  dialog {
    margin: 0; padding: 0; border: 0; color: var(--fg); background: transparent;
    position: fixed; inset: auto 0 0 0; width: 100%; max-width: 100%; max-height: 86dvh;
    transition: transform .5s var(--ease), opacity .3s, overlay .5s allow-discrete, display .5s allow-discrete;
  }
  dialog:not([open]) { transform: translateY(100%); }
  @starting-style { dialog[open] { transform: translateY(100%); } }
  dialog::backdrop {
    background: rgb(0 0 0 / 0);
    transition: background .35s, overlay .5s allow-discrete, display .5s allow-discrete;
  }
  dialog[open]::backdrop { background: rgb(0 0 0 / .28); }
  dialog.see-through[open]::backdrop { background: rgb(0 0 0 / .04); }
  @starting-style { dialog[open]::backdrop { background: rgb(0 0 0 / 0); } }

  .sheet {
    display: flex; flex-direction: column; max-height: 86dvh;
    background: color-mix(in srgb, var(--surface) 95%, transparent);
    backdrop-filter: blur(28px) saturate(1.6); -webkit-backdrop-filter: blur(28px) saturate(1.6);
    border-radius: 22px 22px 0 0;
    box-shadow: 0 -1px 0 color-mix(in srgb, var(--fg) 8%, transparent), 0 -12px 40px rgb(0 0 0 / .18);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .grabber { width: 38px; height: 5px; border-radius: 3px; background: var(--line); margin: 8px auto 0; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px 4px 20px; }
  h2 { font: 700 1.15rem/1.2 var(--serif); margin: 0; }
  .close { width: 32px; height: 32px; background: color-mix(in srgb, var(--fg) 8%, transparent); }
  .close svg { width: 16px; height: 16px; }
  .body { overflow: auto; overscroll-behavior: contain; padding: 4px 20px 22px; }

  @media (min-width: 720px) {
    dialog { inset: 68px 18px auto auto; width: 390px; transform-origin: top right; }
    dialog:not([open]) { transform: scale(.94); opacity: 0; }
    @starting-style { dialog[open] { transform: scale(.94); opacity: 0; } }
    .sheet { border-radius: 20px; max-height: calc(100dvh - 90px); box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg) 8%, transparent), 0 24px 60px -12px rgb(0 0 0 / .35); }
    .grabber { display: none; }
    header { padding-top: 12px; }
  }
</style>
