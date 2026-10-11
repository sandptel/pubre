// Reader appearance settings (Apple Books–inspired) and the CSS injected into book documents.

// Themes = a base16 *palette* (color personality) × a reading *mode* (light environment).
// Palettes are tinted-theming base16 schemes (https://github.com/tinted-theming/home), kept as their
// light and/or dark variants. Modes (Apple Books–style Original/Paper/Calm/Quiet/Focus/Night) set the
// neutral ramp base00–07; the palette tints that ramp and supplies the accents base08–0F.
// Slot meaning: base00 background, base01 raised surface, base02 lines/selection, base04 muted text,
// base05 body text, base08–0F accents.
export interface Theme { name: string; dark: boolean; base: string[]; accent: number }

interface Mode { name: string; dark: boolean; ramp: string[]; accents: string[]; tint: number }
const mode = (name: string, dark: boolean, ramp: string, accents: string, tint: number): Mode =>
  ({ name, dark, ramp: hexes(ramp), accents: hexes(accents), tint })
function hexes(s: string) { return s.split(' ').map(h => '#' + h) }

export const modes: Record<string, Mode> = {
  original: mode('Original', false, 'ffffff f5f5f7 e5e5ea aeaeb2 8a8a8e 1b1b1d 0e0e10 000000', 'd6453d e8622c c99a06 3a9a4b 2a9d9b 2f6fd6 8e5cc8 a0522d', 1),
  paper: mode('Paper', false, 'f3f1ec eae7e0 dcd8cf b3ada2 8f8a80 24221f 171614 0b0a09', 'b8433a c4572a a87b12 4f7d3a 3b7f7a 3a65a8 7d529e 8a5a3c', 0.4),
  calm: mode('Calm', false, 'f4e8d2 ecdfc5 e0d0b2 bba585 9c8664 43341f 2f2414 1d160b', 'a8402f b5562a 9a7413 5f7a2f 4b7a6a 3f6390 7f4f86 8a5a3c', 0.3),
  quiet: mode('Quiet', true, '4a4a4f 545459 5f5f65 7d7d84 9a9aa0 d4d4d8 e4e4e7 f4f4f5', 'ff8a80 ff9f6b f2cc71 a8d38e 8fd1c9 8fb8ff d0a8f0 d39a70', 0.45),
  focus: mode('Focus', true, '1d1b18 26231f 332f29 5c564c 8a8274 e6dccb f0e8da faf5ec', 'e8806f f0a066 e6c170 a9c27d 86c0b0 8fb0d8 c8a0d0 c08a60', 0.5),
  night: mode('Night', true, '000000 111113 1f1f22 48484c 7c7c80 c9c9cc e2e2e4 f5f5f7', 'ff6b60 ff8a4c ffd166 7bd88f 6fd3cf 6aa6ff c387ff d08a5c', 0.2),
}

interface Palette { name: string; light?: string[]; dark?: string[]; accent: number }
const pal = (name: string, light: string | null, dark: string | null, accent = 0x0d): Palette =>
  ({ name, light: light ? hexes(light) : undefined, dark: dark ? hexes(dark) : undefined, accent })

export const palettes: Record<string, Palette> = {
  pubre: pal('pubre', null, null, 0x09), // the modes' own colors
  solarized: pal('Solarized', 'fdf6e3 eee8d5 93a1a1 839496 657b83 586e75 073642 002b36 dc322f cb4b16 b58900 859900 2aa198 268bd2 6c71c4 d33682',
    '002b36 073642 586e75 657b83 839496 93a1a1 eee8d5 fdf6e3 dc322f cb4b16 b58900 859900 2aa198 268bd2 6c71c4 d33682'),
  gruvbox: pal('Gruvbox', 'fbf1c7 ebdbb2 d5c4a1 bdae93 665c54 504945 3c3836 282828 9d0006 af3a03 b57614 79740e 427b58 076678 8f3f71 d65d0e',
    '282828 3c3836 504945 665c54 bdae93 d5c4a1 ebdbb2 fbf1c7 fb4934 fe8019 fabd2f b8bb26 8ec07c 83a598 d3869b d65d0e'),
  catppuccin: pal('Catppuccin', 'eff1f5 e6e9ef ccd0da bcc0cc acb0be 4c4f69 dc8a78 7287fd d20f39 fe640b df8e1d 40a02b 179299 1e66f5 8839ef dd7878',
    '1e1e2e 181825 313244 45475a 585b70 cdd6f4 f5e0dc b4befe f38ba8 fab387 f9e2af a6e3a1 94e2d5 89b4fa cba6f7 f2cdcd'),
  rosepine: pal('Rosé Pine', 'faf4ed fffaf3 f2e9de 9893a5 797593 575279 575279 cecacd b4637a ea9d34 d7827e 286983 56949f 907aa9 ea9d34 cecacd',
    '191724 1f1d2e 26233a 6e6a86 908caa e0def4 e0def4 524f67 eb6f92 f6c177 ebbcba 31748f 9ccfd8 c4a7e7 f6c177 524f67'),
  tomorrow: pal('Tomorrow', 'ffffff e0e0e0 c5c8c6 b4b7b4 969896 373b41 282a2e 1d1f21 c82829 f5871f eab700 718c00 3e999f 4271ae 8959a8 a3685a',
    '1d1f21 282a2e 373b41 969896 b4b7b4 c5c8c6 e0e0e0 ffffff cc6666 de935f f0c674 b5bd68 8abeb7 81a2be b294bb a3685a'),
  one: pal('One', 'fafafa f0f0f1 e5e5e6 a0a1a7 696c77 383a42 202227 090a0b ca1243 d75f00 c18401 50a14f 0184bc 4078f2 a626a4 986801',
    '282c34 353b45 3e4451 545862 565c64 abb2bf b6bdca c8ccd4 e06c75 d19a66 e5c07b 98c379 56b6c2 61afef c678dd be5046'),
  ayu: pal('Ayu', 'f8f9fa edeff1 d2d4d8 a0a6ac 8a9199 5c6166 4e5257 404447 f07171 fa8d3e f2ae49 6cbf49 4cbf99 399ee6 a37acc e6ba7e',
    '0b0e14 131721 202229 3e4b59 bfbdb6 e6e1cf ece8db f2f0e7 f07178 ff8f40 ffb454 aad94c 95e6cb 59c2ff d2a6ff e6b450'),
  tokyonight: pal('Tokyo Night', 'd5d6db cbccd1 dfe0e5 9699a3 4c505e 343b59 1a1b26 1a1b26 343b58 965027 166775 485e30 3e6968 34548a 5a4a78 8c4351',
    '1a1b26 16161e 2f3549 444b6a 787c99 a9b1d6 cbccd1 d5d6db c0caf5 a9b1d6 0db9d7 9ece6a b4f9f8 2ac3de bb9af7 f7768e'),
  github: pal('GitHub', 'ffffff f6f8fa d1d9e0 818b98 59636e 454c54 25292e 1f2328 cf222e 953800 9a6700 116329 1b7c83 0969da 8250df a40e26', null),
  nord: pal('Nord', null, '2e3440 3b4252 434c5e 4c566a d8dee9 e5e9f0 eceff4 8fbcbb bf616a d08770 ebcb8b a3be8c 88c0d0 81a1c1 b48ead 5e81ac'),
  dracula: pal('Dracula', null, '282a36 21222c 44475a 6272a4 9ea8c7 f8f8f2 f8f8f2 ffffff ff5555 ffb86c f1fa8c 50fa7b 8be9fd bd93f9 ff79c6 993333'),
  kanagawa: pal('Kanagawa', null, '1f1f28 16161d 223249 54546d 727169 dcd7ba c8c093 717c7c c34043 ffa066 c0a36e 76946a 6a9589 7e9cd8 957fb8 d27e99'),
  everforest: pal('Everforest', null, '2d353b 343f44 475258 859289 9da9a0 d3c6aa e6e2cc fdf6e3 e67e80 e69875 dbbc7f a7c080 83c092 7fbbb3 d699b6 9da9a0'),
}

/** Linear sRGB-space mix of two #rrggbb colors; t = weight of b. */
export function mix(a: string, b: string, t: number) {
  const n = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map(i => Math.round(n(a, i) * (1 - t) + n(b, i) * t).toString(16).padStart(2, '0')).join('')
}

/** Resolve palette × mode into a concrete 16-color theme.
 *  "Original" means the palette exactly as its author made it (light variant if it has one). */
export function resolveTheme(paletteId: string, modeId: string): Theme {
  const m = modes[modeId] ?? modes.paper
  const p = palettes[paletteId] ?? palettes.pubre
  if (!p.light && !p.dark) return { name: m.name, dark: m.dark, base: [...m.ramp, ...m.accents], accent: p.accent }
  if (modeId === 'original') {
    const own = p.light ?? p.dark!
    return { name: `${p.name}`, dark: !p.light, base: own, accent: p.accent }
  }
  const own = m.dark ? p.dark : p.light
  const other = (m.dark ? p.light : p.dark)!
  // Missing variant: flip the other ramp and pull its accents toward legible contrast.
  const ramp = own ? own.slice(0, 8) : other.slice(0, 8).reverse()
  const accents = own ? own.slice(8) : other.slice(8).map(c => mix(c, m.dark ? '#ffffff' : '#000000', m.dark ? 0.3 : 0.35))
  return { name: `${p.name} ${m.name}`, dark: m.dark, base: [...m.ramp.map((c, i) => mix(c, ramp[i], m.tint)), ...accents], accent: p.accent }
}

/** CSS custom properties (--base00..--base0F + semantic aliases) for app chrome. */
export function themeVars(t: Theme) {
  const hex = (i: number) => i.toString(16).toUpperCase().padStart(2, '0')
  return t.base.map((c, i) => `--base${hex(i)}:${c}`).join(';')
    + `;--bg:${t.base[0]};--surface:${t.base[1]};--line:${t.base[2]};--muted:${t.dark ? t.base[4] : mix(t.base[4], t.base[5], 0.4)};--fg:${t.base[5]};--accent:${t.base[t.accent]}` // light themes: muted labels at ≥ 4.5:1
    + `;--card:${t.dark ? mix(t.base[0], t.base[2], 0.45) : mix(t.base[0], '#ffffff', 0.62)};--ink:${t.base[5]};--on-ink:${t.base[0]}` // cards lift off the page; ink = the dark pill
    + `;color-scheme:${t.dark ? 'dark' : 'light'}`
}

export const fonts: Record<string, { name: string; stack: string }> = {
  original: { name: 'Original', stack: '' },
  newyork: { name: 'New York', stack: 'ui-serif, "New York", "Iowan Old Style", Georgia, serif' },
  literata: { name: 'Literata', stack: 'Literata, Georgia, serif' },
  charter: { name: 'Charter', stack: 'Charter, "Bitstream Charter", "Charis SIL", Georgia, serif' },
  iowan: { name: 'Iowan', stack: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif' },
  palatino: { name: 'Palatino', stack: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  georgia: { name: 'Georgia', stack: 'Georgia, serif' },
  sf: { name: 'San Francisco', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  seravek: { name: 'Seravek', stack: 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", sans-serif' },
}

export type Pointer = import('./pointers.ts').PointerType
export type Focus = 'sentence' | 'line' | 'paragraph'
export type Intensity = 'quiet' | 'guided' | 'rich'
export type VoicesStyle = 'ink' | 'underline' | 'marks' | 'off'

export interface Settings {
  // Appearance
  palette: string
  mode: string
  font: string
  fontScale: number // percent
  lineHeight: number // 0 = publisher's
  margin: number // 0 narrow .. 2 wide
  justify: boolean
  bold: boolean
  spread: 'auto' | 'single'
  letterSpacing: number // em; accessibility (0–0.12)
  measure: 'normal' | 'short' // short ≈ 40 characters per line (helps some dyslexic readers)
  // Reading guide
  guide: boolean // guide available (dock button, G key, Space)
  guideStyle: 'stage' | 'pointer' // stage: the paragraph lifts toward you, a sentence at a time; pointer: a marker on the page
  paraEnd: 'breathe' | 'wait' // stage: at a paragraph's end, breathe then go on, or wait for Space
  stageStep: 'sentence' | 'phrase' | 'word' // stage: how far each beat moves
  stagePointer: 'ink' | Pointer // stage (phrase/word): words ink in as you go; optionally a marker too
  stageLenses: boolean // stage: names, voices, rare words… in the lifted text
  holdToRead: boolean // press-and-hold on the page starts reading there (off: holding selects text)
  pinControls: boolean // keep the reader's buttons on screen (the book makes room for them)
  chapterColour: boolean // a colourful chapter lends the accent its colour (ambient palette drift)
  openers: boolean // each chapter opens into its own room (classic, daylight, nocturne, stage, long swell)
  weather: boolean // a chapter's weather (storm, fog, snow, night) as a faint trace on the page
  inkRead: number // how bright text you've already read is (0–100)
  inkNow: number // how bright the words being read are
  inkAhead: number // how bright the words still to read are
  v?: number // settings version (migrations)
  brightness: number // 40–100: below 100 a gentle dimmer lies over the page
  pointer: Pointer
  focus: Focus
  step: 'word' | 'phrase'
  dimRead: boolean
  wpm: number // learned from your taps
  // Lenses (the visual grammar's "who" and "tell me more")
  intensity: Intensity
  names: boolean
  hardWords: boolean
  hardStyle: 'shown' | 'story' // story: nothing until you rest on a word
  voices: VoicesStyle
  asides: boolean
  foreign: boolean
  motion: 'full' | 'calm' // calm = no bloom/spark/breathe; the OS reduced-motion setting always wins
  onlineDefinitions: boolean // off: definitions only from the offline dictionary
  chapterPrompts: boolean // optional "three words" + open questions at chapter ends
}

export const defaults: Settings = {
  palette: 'pubre', mode: 'paper', font: 'newyork', fontScale: 110, lineHeight: 1.5, margin: 1, justify: true, bold: false, spread: 'auto', letterSpacing: 0, measure: 'normal',
  guide: true, guideStyle: 'stage', paraEnd: 'breathe', stageStep: 'sentence', stagePointer: 'underline', stageLenses: true, holdToRead: true, pinControls: false, chapterColour: true, openers: true, v: 2, brightness: 100, inkRead: 22, inkNow: 100, inkAhead: 46, weather: true, pointer: 'underline', focus: 'sentence', step: 'word', dimRead: true, wpm: 260,
  intensity: 'guided', names: true, hardWords: true, hardStyle: 'shown', voices: 'ink', asides: true, foreign: true, motion: 'full', onlineDefinitions: false, chapterPrompts: true,
}

/** Global settings with a book's own overrides layered on top. */
export const effective = (global: Settings, book?: Partial<Settings>): Settings => ({ ...global, ...(book ?? {}) })

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem('pubre:settings') ?? '{}')
    // v2: Line became the default pointer (move everyone to it once; later choices are kept)
    if ((saved.v ?? 1) < 2) { saved.pointer = 'underline'; if (saved.stagePointer && saved.stagePointer !== 'ink') saved.stagePointer = 'underline'; saved.v = 2 }
    return { ...defaults, ...saved }
  } catch {
    return { ...defaults }
  }
}

export function storeSettings(s: Settings) {
  try { localStorage.setItem('pubre:settings', JSON.stringify(s)) } catch { /* private mode */ }
}

/** User overrides layered over publisher CSS (appended last, so equal specificity wins). */
export function bookCss(s: Settings, pageHeight: number) {
  const t = resolveTheme(s.palette, s.mode)
  const fg = t.base[5], accent = t.base[t.accent]
  const font = fonts[s.font]?.stack
  const notCode = ':not(code):not(pre):not(kbd):not(samp):not(tt)'
  return `
html { color-scheme: ${t.dark ? 'dark' : 'light'}; font-size: ${s.fontScale}% !important;
  -webkit-text-size-adjust: none; text-size-adjust: none; }
html, body { background: transparent !important; color: ${fg} !important; }
body { margin: 0 !important; padding: 0 !important; overflow-wrap: break-word;
  ${s.bold ? 'text-shadow: 0 0 .45px currentColor;' : ''} }
body *:not(a) { color: inherit !important; background-color: transparent !important; }
a { color: ${accent} !important; text-decoration-thickness: .06em; text-underline-offset: .15em; }
${font ? `body, body *${notCode} { font-family: ${font} !important; }` : ''}
${s.lineHeight ? `body, p, li, blockquote, dd, div { line-height: ${s.lineHeight} !important; }` : ''}
${s.justify && s.measure !== 'short' ? 'p { text-align: justify; hyphens: auto; -webkit-hyphens: auto; }' : ''}
${s.letterSpacing ? `body, body *${notCode} { letter-spacing: ${s.letterSpacing}em !important; word-spacing: ${s.letterSpacing * 1.5}em !important; }` : ''}
p { widows: 2; orphans: 2; }
img, svg, video, canvas { max-width: 100% !important; max-height: ${pageHeight}px !important;
  height: auto; object-fit: contain; break-inside: avoid; }
${t.dark ? 'img { filter: brightness(.88); }' : ''}
table, figure, pre { break-inside: avoid; }
::selection { background: color-mix(in srgb, ${accent} 30%, transparent); }
`
}
