# Workflow

## Every change

1. Read the relevant `docs/context/*` and `docs/decisions/*` first. For a new feature, write `docs/research/<feature>.md` first.
2. Implement the smallest version that works.
3. Verify:
   - `npm test && npm run check && npm run build`
   - UI changes also need a visual check. Start `npx vite --port 5179 --strictPort` in the background, then copy `docs/instructions/smoke-e2e.mjs` into `../pubre-samples/` and run it from there (`node smoke-e2e.mjs chromium`, then `node smoke-e2e.mjs webkit mobile`). **Look at the screenshots** in `../pubre-samples/shots/`.
   - WebKit is the iOS proxy. Always check it: several bugs so far were WebKit-only (see findings).
4. Commit on `main`: one commit per feature or fix, conventional message, **no AI attribution**.
5. Update docs on the `docs` branch:
   - `todo/done.md` (add the commit hash)
   - `todo/backlog.md`
   - an ADR for decisions, an entry in `context/findings.md` for surprises, `context/architecture.md` if the structure changed
   - Then `git -C .docs add -A && git -C .docs commit -m "docs: ..."`

## Test assets

Sample EPUBs live **outside the repo** in `../pubre-samples/` (`*.epub` is git-ignored anyway). Public-domain sources:

- Project Gutenberg, e.g. `https://www.gutenberg.org/ebooks/2701.epub3.images` (Moby Dick: big single-file chapters), `1342.epub3.images` (Pride & Prejudice, 24 MB with images), `11.epub.noimages` (Alice).
- Standard Ebooks (best-practice EPUB 3 semantics). Use the download link on each book page.

Playwright lives in `../pubre-samples/node_modules`. Install with `npm i playwright` there. Chromium tests use `channel: 'chrome'` (the installed Chrome); WebKit needs `npx playwright install webkit`.

## Release

Pushing `main` triggers `.github/workflows/pages.yml`: test, check, build (with `BASE=/<repo>/`), then deploy to Pages. Batch commits locally and push only when the user asks.
The `docs` branch is pushed separately (`git push origin docs`) and never deploys.

## Code conventions

- Lib code must be **erasable TypeScript** (no parameter properties or enums), so that `node --test` can import it directly.
- Keep `src/lib/` framework-agnostic. Svelte lives only in `src/components/` and `App.svelte`.
- Colors come only from base16 vars (`--base00..0F`, `--bg`, `--fg`, `--muted`, `--accent`, `--surface`, `--line`). Never hardcode theme colors in components.
- Motion: use `--ease` (the iOS curve), and respect `prefers-reduced-motion` (handled globally in `app.css`).
- Mark deliberate shortcuts with `// ponytail: <ceiling>, <upgrade path>`. They are harvested into `todo/deferred.md`.
