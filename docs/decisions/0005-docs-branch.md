# 0005 · Docs and CLAUDE.md live on a separate `docs` branch

- Date: 2026-10-11 · Status: accepted (user request)

## Decision

- Create an orphan `docs` branch, checked out as a git worktree at `.docs/`.
- At the root of `main`, `CLAUDE.md` and `docs` are symlinks into `.docs/`. `.docs/`, `docs` and `CLAUDE.md` are all git-ignored on `main`.
- Set up a fresh clone with the commands in `README.md` on `main`.

## Consequences

`main` stays app-only, and the deployed site never contains internal notes. Docs are committed separately, with `git -C .docs ...`.
