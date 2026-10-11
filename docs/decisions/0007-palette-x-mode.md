# 0007 · Themes = base16 palette × reading mode

- Date: 2026-10-11 · Status: accepted (user feedback; refines ADR 0004)

## Context

v0.1 listed 6 pubre themes plus 21 base16 schemes, with light and dark variants as separate entries (for example "Gruvbox Light" and "Gruvbox Dark"). The user's feedback: think like a PM. The modes (Original, Paper, Calm, Quiet, Focus, Night) should be variants applied *over* any base16 palette.

## Decision

Two orthogonal settings: `palette` and `mode`.

- **Palette:** the base16 scheme family. Stored with its light and/or dark variants verbatim from tinted-theming. `pubre` is the palette made of the modes' own colors.
- **Mode:** sets `dark` and a neutral ramp (`base00`–`07`), plus a `tint` weight for how much the palette colors that ramp.
- **Resolution (`resolveTheme`):**
  - *Original* means the palette exactly as authored (its light variant if it has one).
  - Other modes mix the mode ramp with the palette's matching ramp by `tint`, and take accents (`base08`–`0F`) from the matching variant.
  - A missing variant is synthesized by reversing the other ramp and pulling its accents toward legible contrast.
- The UI previews every mode in the current palette, and every palette in the current mode.

## Consequences

14 palettes × 6 modes = 84 looks from 20 controls. Imported base16/base24 schemes (backlog) slot in as palettes. Tested in `tests/settings.test.ts`.
