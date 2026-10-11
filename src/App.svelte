<script lang="ts">
  import { tick } from 'svelte'
  import Library from './components/Library.svelte'
  import Reader from './components/Reader.svelte'
  import BookPage from './components/BookPage.svelte'
  import { loadSettings, resolveTheme, storeSettings, themeVars } from './lib/settings.ts'
  import type { BookRecord } from './lib/store.svelte.ts'

  let settings = $state(loadSettings())
  let open = $state<BookRecord | null>(null)
  let view = $state<BookRecord | null>(null) // the book's landing page
  let lastId = $state('')

  $effect(() => {
    const t = resolveTheme(settings.palette, settings.mode)
    storeSettings($state.snapshot(settings))
    document.documentElement.style.cssText = themeVars(t)
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.base[0])
  })

  // Cover-to-page morph; falls back to an instant swap where unsupported.
  function swap(update: () => void) {
    if (!document.startViewTransition) return update()
    document.startViewTransition(async () => { update(); await tick() })
  }
</script>

{#if open}
  <Reader record={open} bind:settings onclose={() => swap(() => { lastId = open!.id; open = null })} />
{:else if view}
  <BookPage book={view} {settings} onread={() => swap(() => { open = view; view = null })} onback={() => swap(() => { lastId = view!.id; view = null })} />
{:else}
  <Library {lastId} bind:settings onopen={r => swap(() => { open = r })} onview={r => swap(() => { view = r; scrollTo(0, 0) })} />
{/if}
