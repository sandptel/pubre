# Backlog (prioritized; the user picks what's next)

1. **Footnote popovers**: `epub:type=noteref`, plus a heuristic for superscript `#id` links. Animate from the reference.
2. **Content → UI features**: see the proposal artifact and `research/content-to-ui.md`. The user picks which.
3. **CFI locations**: robust positions, plus highlights and notes (base16 highlight palette), plus a quote-share link.
2b. **Use the protocol module's new data in the UI**: CFI for positions and highlights (replaces `{index, fraction}`), page-list → print page numbers, landmarks → open at `bodymatter`, series shelves, a11y badges, SMIL read-along.
2c. Protocol gaps (see `src/epub/README.md`): OPF `<collection>`, per-item `rendition:viewport`, CFI filter for injected highlight nodes, CFI indirection into iframes.
4. **Section Presenters v1**: chapter opener, epigraph, verse, and image presenters (see `features.md` §2).
5. **Open at `bodymatter`** via landmarks/guide instead of the cover.
6. **Full-text search** (worker).
7. **Reading stats**: time left in chapter/book based on reading pace.
8. **Page-curl / alternative page-turn animations**, plus a scroll mode.
9. **Service worker**: offline app shell, PWA install prompt.
10. **Custom base16/base24 import** (paste YAML).
11. **RTL + vertical-rl + fixed-layout** layout paths.
12. **Media Overlays read-along**, and TTS with highlight.
13. **Capacitor mobile wrap.**
