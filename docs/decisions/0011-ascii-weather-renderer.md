# 0011. Passage weather: our own margin glyph renderer, rules before models

Date: 2026-10-16. Status: accepted.

## Context
The user wanted each page's weather (rain, snow, fog, night, sun, sea, wind) as a small touch in the background, styled like an ASCII game they shared (glyph fields: `/ | \` grass, `~ - =` water, `( ) o` ripples, twinkling `* .`), never hurting legibility.

## Decision
- **Classifier:** rules per page window (`src/insights/scene.ts`): weighted keywords per scene, figurative and negated uses removed, hysteresis (`SceneTrack`: two pages to enter or one strong page, two pages to leave), falling back to the chapter's weather. The research (`research/speaker-models.md`) found no fiction-weather dataset; an embedding model (bge-small / MiniLM) is a later option.
- **Renderer:** a small canvas (`src/lib/asciiweather.ts`), not a library. asciiground, tte.js, cmatrix and rain-char are full-screen Matrix-style effects. None keeps a text box clear, splashes at the page foot, takes theme colours, or stops for reduced motion.
- **Placement:** margins and the bands above and below the text only, fading 6px before the text; the running head and page number keep a clear patch. Default style is Margins; Tint (paper colour only, no motion) and Off are alternatives.
- **Motion:** ~24 fps, glyphs change in place or drift slowly; nothing flashes (no lightning). Calm motion or reduced motion draws one still frame.

## Consequences
Phone margins are narrow (~25px), so on a phone the effect is mostly the bottom band and edges; on tablets and desktops it is fuller. Changing the look means editing one file; no dependency to track.
