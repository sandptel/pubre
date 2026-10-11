# pubre

A feature-rich, engaging EPUB reader for the web (and, later, mobile). Runs entirely in the
browser: books never leave your device.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # node --test (TypeScript via native type stripping)
npm run check    # svelte-check
npm run build    # static site in dist/
```

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Project docs and agent context

Docs, decisions, research and `CLAUDE.md` live on the separate `docs` branch, not on `main`.
Check it out as a worktree and link it into place (both links are git-ignored on `main`):

```sh
git fetch origin docs
git worktree add .docs docs
ln -s .docs/CLAUDE.md CLAUDE.md
ln -s .docs/docs docs
```

Commit doc changes from inside `.docs/` (they go to the `docs` branch).
