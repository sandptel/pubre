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
