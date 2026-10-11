# Contributing to pubre

Thank you for helping. This guide covers how to propose changes.

## Before you start

- For a bug, open an issue with the browser, device and steps to reproduce. Attach the EPUB, or a small one that shows the problem, if you can share it.
- For a feature, open an issue first to discuss it. pubre aims to stay minimal: one clear way to do each thing, with detail revealed only when needed.

## Development

```sh
npm install
npm run dev
```

Before opening a pull request, all three must pass:

```sh
npm test && npm run check && npm run build
```

For UI changes, check the result at phone width (about 412 px) as well as on desktop, and include screenshots in the pull request.

## Guidelines

- **Commits.** One commit per logical change, using [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope):`, `fix(scope):`, `docs:`, `chore:`, `ci:`.
- **Tests.** Add or update a test in `tests/` for any change to logic in `src/lib/`, `src/epub/` or `src/insights/`.
- **Privacy.** Books and reading data stay on the device. Do not add network calls, analytics or third-party services.
- **Dependencies.** Prefer the platform and existing code over new packages.
- **Style.** Match the surrounding code: naming, comment density and idiom.

## Project documentation

Architecture notes, decision records and research live on the `docs` branch rather than on `main`. To work with them locally:

```sh
git fetch origin docs
git worktree add .docs docs
ln -s .docs/docs docs
```

Commit documentation changes from inside `.docs/`.
