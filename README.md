<div align="center">

# pubre

**An EPUB reader that reads with you.**

### [Open pubre &rarr; sandptel.github.io/pubre](https://sandptel.github.io/pubre/)

No install, no account. Your books never leave your device / browser .

<a href="https://sandptel.github.io/pubre/"><img src=".github/media/showcase.gif" alt="pubre in motion: the reading guide, lenses, the cast, themes and layouts for phone, tablet and desktop" width="100%"></a>

[Video Link](https://github.com/sandptel/pubre/releases/download/v1.0.0/pubre-trailer.mp4) &middot; [Releases](https://github.com/sandptel/pubre/releases) &middot; [Contributing](CONTRIBUTING.md)

</div>

## Features

- **Reading guide.** Tap a paragraph and the page lifts into a focused stage. A pointer moves word by word, by phrase or by sentence at a pace that follows punctuation and rhythm. Nine pointer styles; three contrast levels for read, current and upcoming text.
- **Lenses.** Character names take a colour, quotes take the speaker's voice, rare words get an on-device definition, foreign phrases and asides are set apart. Each lens is optional.
- **The cast.** Every character gets a drawn portrait and a place in a constellation of who meets whom.
- **Pace.** Adjust words per minute from a compact capsule while reading; hold to glide, release to stop.
- **Themes.** base16 palettes crossed with reading modes, from paper to e-ink black. Serif, sans and monospace book fonts.
- **Every screen.** Built phone-first, with two-column layouts on tablet and desktop.
- **Your library.** Covers, a mood profile for each book, highlights and notes, and a precise return to where you left off.
- **Private and offline.** Everything is parsed and stored in the browser (IndexedDB). There is no server.

## Getting started

Requires Node.js 22.18 or later (TypeScript tests run with native type stripping).

```sh
git clone https://github.com/sandptel/pubre.git
cd pubre
npm install
npm run dev        # http://localhost:5173
```

| Command | Purpose |
|---|---|
| `npm test` | Unit tests (`node --test`) |
| `npm run check` | Type and Svelte checks |
| `npm run build` | Static site in `dist/` |

## Tech stack

Svelte 5 and TypeScript, built with Vite. The reader core in `src/lib/` is framework-agnostic; the EPUB layer in `src/epub/` has no UI dependencies (see its README). Book documents render in sandboxed iframes and paginate with CSS multi-column. Pushing to `main` deploys to GitHub Pages.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
