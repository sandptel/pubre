# User preferences & working agreements

Collected 2026-10-11. Add new entries with dates.

## Product

- The goal is an EPUB reader that is **feature rich and engaging**, making the literature more interesting and novel. The user's complaint about current readers is that they under-use the control EPUB gives over presentation.
- They want **maximum creative freedom over what and how each section is shown.**
- Aesthetics: **clean, animated, Apple Books–inspired** typography and features.
- Theme colors are **base16-aligned**, with the main popular base16 themes available (ADR 0004).
- Ship as a website on GitHub Pages now; a mobile version is wanted later. WASM and on-device processing are welcome where they speed things up or enable heavy animation.
- The name is **pubre**.

## Process

- **Commit at every step**: each feature implementation and each bug fix.
- **Keep Claude's name out of all commits** (no Co-Authored-By or Claude-Session lines).
- CI re-renders GitHub Pages when a **batch** of commits is pushed. Push only when asked.
- Document everything (context, findings, todos done and left out, instructions, decisions, preferences, research) in organized `docs/` subdirectories on the **`docs` branch, never `main`**. CLAUDE.md lives there too.
- The user decides which features come next. Present options; don't run ahead on large features unasked.

## Added 2026-10-11 (v0.1 review)

- **Think like a product manager in every iteration.** Find the most visually minimal and intuitive design. Avoid redundant space, and controls whose size or placement feels forced. Keep rich animations. Encoded in `instructions/product-design.md`.
- Example of the PM thinking the user expects: modes should be variants applied over base16 palettes, not separate light and dark entries (ADR 0007).
- Progress should be a floating capsule showing the current page, with the track split into chapter wedges carrying more information.
- The user wants **creative, surprising** uses of the book's own content in the UI. The research is in `research/content-to-ui.md`.
- The EPUB protocol should live in its own robust, UI-free module ("a struct with methods doing one thing"). Project parts go in dedicated submodules.
- "Surprise me" is welcome: propose bold ideas, ranked by impact, with visualizations.
