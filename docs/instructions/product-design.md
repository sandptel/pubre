# Product & design playbook

This playbook is mandatory for every UI change. Work through it as the product manager first and the engineer second.
Origin: the user's review of v0.1 on 2026-10-11 found redundant space, and option buttons whose placement and size felt forced. The ask: in every iteration, find the most visually minimal, intuitive design, and keep rich animation.

## 1. Before designing: answer these in writing (in the commit body or `research/`)

1. **Who is acting, and in what moment?** For example: "a reader mid-chapter, phone in one hand".
2. **What is the one primary action on this surface?** Everything else is secondary or hidden.
3. **How often is each action used?** Rank them: frequent actions get direct gestures, occasional ones go one tap deep, rare ones go two taps deep behind a disclosure.
4. **What can be removed?** Delete before adding. Every element must earn its pixels.
5. **What does the user see first, second and third?** That order must match the importance order.

## 2. Principles

- **Content is the interface.** In the reader the book fills the screen. Chrome appears only on request (a center tap) and floats; there are no full-width bars.
- **One entry point per concern.** Reading tools sit behind a single menu button, and the exit is a single close button. No icon rows.
- **Progressive disclosure.** Show the 20% of controls that matter 80% of the time, and fold the rest under "More themes" or "Customize".
- **Never duplicate information** on one screen. A title shows in one place, and progress in one place.
- **Direct manipulation over buttons**: swipe to turn, drag to scrub, long-press or right-click for item actions. No per-item "⋯" buttons cluttering grids.
- **No blocking dialogs.** Destructive actions happen immediately and offer **Undo** (a toast). Never use `confirm()`/`alert()`.
- **Thumb reach.** On phones, primary controls sit in the bottom third. Close/back sits top-left (platform convention).
- **Platform-faithful.** Follow Apple HIG idioms (sheets, segmented controls, switches, glass materials, SF/New York type) unless there is a reason not to.

## 3. Spacing, size, type (tokens live in `app.css`)

- Use a 4px grid: `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24, `--s6` 32, `--s7` 48. No arbitrary values.
- Touch targets are at least 44×44 (visual icon 20–22px inside). Floating round controls are 44px.
- Radii: controls 12, cards and sheets 22–28, covers 3/6 (spine side smaller).
- Type: large title 34/serif/700, section label 12/uppercase/0.08em/muted, body 15–17, caption 12–13 muted. At most 3 sizes per surface.
- Text measure in the reader is roughly 60–75 characters per column. Never let lines run edge to edge on wide screens.
- Space is either **grouping** (tight) or **separation** (generous), never in between. If a gap has no meaning, remove it.

## 4. Motion

- Animation explains change: where something came from and where it went. Nothing animates just to animate.
- Curves: `--ease` (iOS ease-out) for moves and fades; `--spring` (`linear()` with slight overshoot) for things that pop (menus, sheets, toasts, toggles).
- Durations: micro 120–200ms, UI 250–400ms, page turns 380–450ms, view morphs 450–600ms.
- Origins: popovers grow from the control that opened them (transform-origin), list items stagger by 30–40ms (capped), and removed items collapse with FLIP (`animate:flip`).
- Interactive motion follows the finger 1:1, with rubber-banding at the edges.
- Every animation must respect `prefers-reduced-motion` (handled globally) and run at 60fps: only animate `transform`, `opacity` and `filter`, never layout properties (the one exception is a deliberate height animation inside a sheet).

## 5. Visual QA before every UI commit

Run the smoke e2e and look at screenshots at **390×844 (WebKit, touch)**, **1440×900** and **2000×1160 (Chrome)**, in one light and one dark theme. Check each item:

- [ ] Is there redundant empty space, or a gap with no grouping meaning?
- [ ] Does any control look bolted on (odd size, odd placement, misaligned baseline)?
- [ ] Is any piece of information shown twice?
- [ ] Is the primary action obvious within one second?
- [ ] Do the text measure and margins look like a well-set book?
- [ ] Do sections start where the book intends (forced breaks honored)?
- [ ] Do all colors come from base16 vars, and does it work in light and dark?
- [ ] Is every new interaction animated, with a clear origin?

If any box fails, fix it before committing.

## 6. Anti-patterns already rejected

- A full-width top bar with title, author and an icon row (v0.1). Replaced by a floating close button and a menu button.
- A big "Continue reading" hero that is mostly empty space.
- A per-card "⋯" button, and `confirm()` for removal.
- Large font tiles for every font. Use a compact list behind a disclosure instead.
- A gutter twice the outer margin with unbounded line length on wide screens.
