# 0004 · Themes are base16 schemes

- Date: 2026-10-11 · Status: accepted (user request)

## Context

The user asked for theme colors aligned with base16 (they said "base16 / base 32"; base24 is the real extended format, a superset of base16), with the popular themes available.

## Decision

Every theme is a 16-color base16 palette (`base00`–`base0F`).

- pubre ships six reading themes (Original, Paper, Calm, Quiet, Focus, Night) written as base16.
- 21 popular schemes are copied verbatim from tinted-theming/schemes (spec-0.11).
- Semantic mapping: `base00` is the background, `base01` raised surfaces, `base02` lines and selection, `base04` muted text, `base05` body text. The accent is `base0D` by default; pubre themes use `base09`.
- `themeVars()` exposes `--base00..--base0F` plus aliases to the whole app chrome. Generated covers use base08–0E.

## Consequences

Any base16 scheme can be imported later; base24 should be accepted too, by reading only the first 16 slots. The base08–0E hues are ready to serve as the highlight-color palette.
