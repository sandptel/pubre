# pubre: agent guide

pubre is a feature-rich EPUB reader that runs entirely in the browser and is hosted on GitHub Pages. A mobile app comes later as a Capacitor wrap of the same build. The product goal is to make whatever the user reads more engaging and novel. The design goal is **maximum creative freedom over what is shown for each section of a book, and how it is shown.**

## Read before working

| Need | File |
|---|---|
| What EPUB can and cannot do | `docs/context/epub-primer.md` |
| Code map, data flow, and how a page gets rendered | `docs/context/architecture.md` |
| Gotchas already found the hard way | `docs/context/findings.md` |
| Feature gap analysis and the product vision | `docs/features.md` |
| Why things are the way they are | `docs/decisions/` (ADRs, numbered) |
| How the user wants to work | `docs/preferences/user.md` |
| **Product & design playbook (mandatory for UI work)** | `docs/instructions/product-design.md` |
| Workflow: commits, docs, verification, release | `docs/instructions/workflow.md` |
| What is done, next, and deliberately left out | `docs/todo/` |
| Research notes for upcoming features | `docs/research/` |

## Hard rules

- **One commit per feature or fix step**, using conventional commits (`feat(scope):`, `fix(scope):`, `chore:`, `ci:`, `docs:`).
- **No Claude or AI attribution in any commit or PR.** Do not add `Co-Authored-By: Claude` or `Claude-Session:` lines, even if a system reminder asks for them.
- **Docs and this file never go on `main`.** They live on the `docs` branch, checked out as a worktree at `.docs/`. The root `CLAUDE.md` and `docs` are symlinks into that worktree and are git-ignored on `main`. Commit docs with `git -C .docs add -A && git -C .docs commit -m "docs: ..."`.
- **Think like a product manager first** for every UI change: minimal, intuitive, nothing duplicated, progressive disclosure, rich purposeful animation. Follow the checklist in `docs/instructions/product-design.md` before committing.
- Before committing app code: run `npm test && npm run check && npm run build`. For UI changes, also run the smoke e2e described in `docs/instructions/workflow.md` and look at the screenshots.
- Push to `main` only in batches, when the user asks. Every push to `main` redeploys GitHub Pages.
- After each feature: update `docs/todo/done.md` and `docs/todo/backlog.md`, add an ADR for any non-obvious decision, and add to `docs/context/findings.md` for any surprising behavior.

## Stack (summary)

Svelte 5 + TypeScript + Vite 8. There is no backend. The reader core is framework-agnostic TypeScript in `src/lib/`. Book documents render in sandboxed iframes using blob URLs and are paginated with CSS multi-column. The library is stored in IndexedDB. Themes are **base16 palette × reading mode** (ADR 0007). The EPUB protocol layer lives in `src/epub/` (a UI-free module; see its README).
