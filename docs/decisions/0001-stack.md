# 0001 · Stack: Svelte 5 + TypeScript + Vite, PWA first, Capacitor later

- Date: 2026-10-11 · Status: accepted

## Context

EPUB content is HTML and CSS, so every serious reader renders it in a web engine (Apple Books, Readium mobile, Kobo). The site must be hosted statically on GitHub Pages, a mobile version is wanted, and WASM or on-device processing should be available for heavy work.

## Decision

- Use Svelte 5 + TypeScript + Vite for the UI shell. The reader core is framework-agnostic TypeScript in `src/lib/`.
- Ship a PWA on GitHub Pages first; it is installable on phones immediately. Later, wrap the same build with Capacitor for iOS and Android stores.
- Use Rust→WASM only for measured hot paths (search index, NLP), in workers. Never for layout.
- Rejected Flutter, because of its poor rendering of arbitrary HTML. Rejected React Native, because it would still need a WebView for the book. Tauri 2 mobile remains a fallback option.

## Consequences

The whole product is one codebase. Rendering fidelity matches the browser's own. Mobile-native hooks (open-in, share sheet, haptics) wait for Capacitor.
