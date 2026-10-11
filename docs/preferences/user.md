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

## Added 2026-10-11 (planning workflow + reading guide)

- **Plans are finalised together on a visual artifact.** The user comments one item at a time on the published page and then says so in chat. I read all threads (`ArtifactComments read`), address everything in one pass, republish to the **same URL**, and reply to and resolve the threads sent to Claude. Don't implement planned features until the user signs off.
- **Reading guide vision** (user's words): a visual cursor that replaces a finger, moving over one word at a time, with a light tint on the sentence or paragraph being read. The user controls it: press Space (or a UI button) to move forward, double-press to go back to the sentence start, arrow keys / vim / editor-like word motions. Auto-advancing pacers are rejected because getting back and adjusting speed are a pain.
- The user loved the word highlighting for names and hard words. They want more in that direction: selective highlighting with colours **and typography** (bold, italic) and custom hover tooltips.
- **Peeks must never block reading** (2026-10-11 comment): definition and note cards appear only after the cursor rests on a word for about 600 ms, vanish on the next move, never appear mid-glide, and sit above the current line.
- **Plan v3 feedback (2026-10-11):**
  - The pointer should come in types; whole-word highlight is the default (underline, dot and outline are optional). The user dislikes the moving underline and likes the springy bounce.
  - "Dim what's read" should be on by default.
  - Use contrast levels for focus: sentence, then paragraph, then page.
  - Names, hard words and especially speech separation ("genius") are liked. Add more writing patterns, but **richness must never look cluttered**; the implementation must control intensity across edge cases.
- **Voices (2026-10-11):** the speech lens is named **Voices**. Colouring the whole quote in the speaker's ink (style **Ink**, the default) "looks authentic" and is preferred over tinting only the quote marks. Styles offered: Ink / Underline (speaker-colour hairline) / Marks / Off. On dense dialogue (more than 60%), Ink softens instead of collapsing. Hover shows who is speaking.
- **2026-10-11:** never dim *upcoming* text ("looks bad"). Only what you've read fades.
- **2026-10-11:** the names lens should look like the plan demo: a soft tint in the character's hue with an underline, text in normal ink. Pauses should differ smartly by punctuation and sentence position. Keep the latest iteration hosted (push after each chunk).
- **2026-10-11 · Stage over pointer.** The moving word pointer distracts from comprehension ("I just keep looking at the pointer"). Wants a monkeytype-style Stage: Space lifts the paragraph toward the reader, bigger; sentences come up from below and keep moving until the paragraph ends; then a longer pause before the next paragraph/section. The lift animation and the sentence-rise animation are "the crux". Pauses at sentence/paragraph/section ends are what make it feel authentic.
- **2026-10-11 · Guide v3 asks.** One click starts the guide in whichever style. Stage should also offer word-by-word and the pointer types. The next paragraph should simply be there and scroll up into focus. Richer highlighting in Stage for the word types we chose. Pin the buttons with a quick toggle. Much better on phones (the user reads on Android Chrome). The lift "barely exists on the phone" (make it visible); "every time I stop holding it should go back"; hold and slide left/right to slow down / go back; be creative with the hold. Quick speed configuration. Holding on the page must open the reader, not the definition card.
- **2026-10-11 · Visual direction.** References: warm cream surfaces, serif display titles, a "pick up where you left off" hero with a dark Continue pill, Recent covers row, floating dark bottom bar with +, a minimal reader top bar (back / Aa / contents / bookmark), "CHAPTER n" eyebrow over a large serif title, a mono progress line, an iOS Control-Center settings grid with vertical sliders and font tiles, and a strict token system (pixel styleguide).
- **2026-10-11 · Sheets.** Settings panels: a good mono font (Geist Mono), opaque (not see-through), aesthetically coloured. Sheet page changes must be fast (no slow spring/overlap). The pointer must land on every word.
- **2026-10-12 · Pointers & contrast.** Ring is the default pointer (changed from Line on 2026-10-12). Wants many pointer types, each shown in action (live tiles), a live preview of every reading aid as it's chosen, a quick pointer toggle inside the Stage, and control over the three contrast levels (read / being read / to read), with a wide spread by default.
- **2026-10-12 · Book page, type, people.** Tapping a book shows a landing page first (cover full-bleed across the top, a visual of what's read and where you continue); pencil / e-ink style animation. The interface (not the book text) in a mono typeface like the references; mono offered as a book font too. Characters get hand-drawn ink-stamp portraits (features from the name), not letter avatars.
