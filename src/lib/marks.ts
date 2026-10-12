// Names: a soft tint in the character's hue + a faint hue underline, text in normal ink (user preference);
// your highlights stay a stronger, flat wash with no underline, so the two never read alike.
// The visual grammar's marks inside a book document, via the CSS Custom Highlight API.
// Stacking = registration order (later paints on top); every highlight is registered once, in
// ORDER, and only its ranges change. Highlight.priority is never used: it crashes WebKit when
// highlights overlap (see docs findings).
import { mix, type Theme } from './settings.ts'

export const WHO_SLOTS = 8
const WHO_HUES = [0x08, 0x0d, 0x0a, 0x0b, 0x0e, 0x0c, 0x0f, 0x09] // character colour slots (base16)
const VOICES = Array.from({ length: WHO_SLOTS }, (_, k) => String(k)) // unattributed quotes stay plain ink
export const MEANINGS = [['0A', 'Key', 'yellow'], ['0B', 'Beautiful', 'green'], ['0D', 'Idea', 'blue'], ['08', 'Feeling', 'pink'], ['09', 'Question', 'orange'], ['0E', 'Revisit', 'purple']] as const

export const ORDER = [
  'aside', 'c-page', 'c-para', 'c-read', 'c-readpara', 'c-readfocus', 'c-focus', // read-dimming wins over asides
  ...VOICES.flatMap(k => [`v-soft-${k}`, `v-ink-${k}`, `v-under-${k}`, `v-marks-${k}`]),
  'hard', 'spark', 'foreign', ...Array.from({ length: WHO_SLOTS }, (_, k) => `who-${k}`),
  'r-read', 'r-here', // your place: what you read in its paragraph, and the word you stopped on
  ...MEANINGS.map(([c]) => `u-${c}`), 'u-bold', 'bloom', 'breathe',
]

type Registry = { get(n: string): { clear(): void; add(r: AbstractRange): void } | undefined; set(n: string, h: unknown): void }

export class Marks {
  private reg?: Registry
  constructor(doc: Document) {
    const w = doc.defaultView as (Window & { CSS?: { highlights?: Registry }; Highlight?: new () => unknown }) | null
    if (!w?.CSS?.highlights || !w.Highlight) return
    this.reg = w.CSS.highlights
    for (const n of ORDER) this.reg.set(n, new w.Highlight())
  }
  get supported() { return !!this.reg }
  set(name: string, ranges?: AbstractRange[] | null) {
    const h = this.reg?.get(name); if (!h) return
    h.clear(); for (const r of ranges ?? []) h.add(r)
  }
  clear(prefix = '') { for (const n of ORDER) if (n.startsWith(prefix)) this.reg?.get(n)?.clear() }
}

// ---------------------------------------------------------------- colours

const lum = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

/** Text colour at `k` (0..1) of the way from background to foreground, never below `floor`:1 contrast. */
export function level(t: Theme, k: number, floor = 3) {
  const bg = t.base[0], fg = t.base[5]
  let c = mix(bg, fg, k)
  while (contrast(c, bg) < floor && k < 1) { k = Math.min(1, k + 0.04); c = mix(bg, fg, k) }
  return c
}
/** A character's hue, eased toward body text until it reads (≥ 4.5:1) without outshining the text around it. */
export function whoHue(t: Theme, slot: number) {
  const bg = t.base[0], fg = t.base[5], hue = t.base[WHO_HUES[slot % WHO_SLOTS]], body = contrast(fg, bg)
  let c = hue
  for (let i = 1; i <= 20 && (contrast(c, bg) < Math.min(4.5, body) || contrast(c, bg) > body); i++) c = mix(hue, fg, i / 20)
  return c
}
const alpha = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, '0')

/** Grammar styles for a book document (inline CSS, so they follow the theme without app CSS vars). */
export function marksCss(t: Theme, inkRead = 10): string {
  const rd = Math.min(0.95, 0.3 + inkRead / 100) // your 'already read' level, on the page
  const fg = t.base[5], accent = t.base[t.accent], muted = t.base[4]
  const voice = (k: string) => whoHue(t, +k)
  return openersCss(t) + `
@property --bloom { syntax: '<length>'; inherits: true; initial-value: 0px }
@property --place { syntax: '<number>'; inherits: true; initial-value: 1 }
::highlight(r-read) { background-color: color-mix(in srgb, ${accent} calc(var(--place) * ${t.dark ? 13 : 9}%), transparent) }
::highlight(r-here) { background-color: color-mix(in srgb, ${accent} calc(var(--place) * ${t.dark ? 34 : 28}%), transparent); text-decoration: underline 2px ${accent}; text-underline-offset: 5px }
@property --breathe { syntax: '<number>'; inherits: true; initial-value: 0 }
::highlight(c-page) { color: ${level(t, 0.72, 3.4)} }
::highlight(c-para) { color: ${level(t, 0.8, 4)} }
::highlight(c-read) { color: ${level(t, rd, 2.2)} }
::highlight(c-readpara) { color: ${level(t, Math.min(0.95, rd + 0.07), 2.4)} }
::highlight(aside) { color: ${level(t, 0.72, 3.4)} }
::highlight(c-readfocus) { color: ${level(t, 0.68, 3.4)} }
::highlight(c-focus) { color: ${fg} }
${VOICES.map(k => `::highlight(v-ink-${k}) { color: ${mix(fg, voice(k), 0.55)} }
::highlight(v-soft-${k}) { color: ${mix(fg, voice(k), 0.42)} }
::highlight(v-under-${k}) { text-decoration: underline 1.5px ${alpha(voice(k), 0.5)}; text-underline-offset: 6px }
::highlight(v-marks-${k}) { color: ${voice(k)} }`).join('\n')}
::highlight(spark) { text-decoration: underline wavy 1.5px ${alpha(accent, 0.85)}; text-underline-offset: 5px; text-shadow: 0 0 10px ${alpha(accent, 0.55)} }
::highlight(hard) { text-decoration: underline dotted 2px ${alpha(accent, 0.8)}; text-underline-offset: 5px }
::highlight(foreign) { text-decoration: underline dashed 1.5px ${alpha(muted, 0.8)}; text-underline-offset: 5px }
${Array.from({ length: WHO_SLOTS }, (_, k) => `::highlight(who-${k}) { background-color: ${alpha(whoHue(t, k), t.dark ? 0.22 : 0.16)}; text-decoration: underline 1px ${alpha(whoHue(t, k), 0.35)}; text-underline-offset: 3px }`).join('\n')}
${MEANINGS.map(([c]) => `::highlight(u-${c}) { background-color: ${alpha(t.base[parseInt(c, 16)], t.dark ? 0.34 : 0.3)} }`).join('\n')}
::highlight(u-bold) { -webkit-text-stroke-width: .035em; -webkit-text-stroke-color: currentColor; text-shadow: .02em 0 currentColor }
::highlight(bloom) { text-shadow: 0 0 var(--bloom) currentColor }
::highlight(breathe) { background-color: color-mix(in srgb, ${fg} calc(var(--breathe) * 1%), transparent) }
`
}

/** Chapter openers: the room each chapter opens into (set on headings by the Reader, from chapter profiles). */
export function openersCss(t: Theme): string {
  const accent = t.base[t.accent], muted = t.base[4], line = t.base[2], gold = t.base[0x0a], bg = t.base[0]
  const a = (hex: string, alpha: number) => hex + Math.round(alpha * 255).toString(16).padStart(2, '0')
  return `
[data-pubre="eyebrow"] { display: block; font: 600 .46em/1.7 ui-sans-serif, system-ui, -apple-system, sans-serif !important; letter-spacing: .22em; text-transform: uppercase; color: ${muted}; margin-bottom: .55em; font-style: normal !important; }
[data-pubre-titled] { font-weight: 400 !important; letter-spacing: -.01em; line-height: 1.15 !important; }
[data-pubre-titled]::after { content: ''; display: block; width: 2.4em; height: 1px; margin: .7em auto 0; background: ${line}; }
[data-pubre-first="classic"] { text-indent: 0 !important; }
[data-pubre-first="classic"]::first-letter { float: left; font-size: 3.1em; line-height: .82; margin: .06em .09em 0 0; font-weight: 600; color: ${accent}; }
[data-pubre-opener="daylight"] { color: ${gold} !important; background: radial-gradient(closest-side, ${a(gold, .16)}, ${a(gold, 0)}); letter-spacing: .01em; }
[data-pubre-first="daylight"]::first-line { font-variant: small-caps; letter-spacing: .04em; }
[data-pubre-opener="nocturne"] { font-variant: small-caps; letter-spacing: .12em; font-weight: 500 !important; color: ${muted} !important; background: linear-gradient(${a(muted, .14)}, ${a(bg, 0)}); padding: .6em 0 .4em; border-radius: 6px; }
[data-pubre-first="nocturne"]::first-line { font-style: italic; }
[data-pubre-opener="stage"] { text-transform: uppercase; letter-spacing: .16em; font-size: .92em !important; text-align: center !important; border-top: 1px solid ${line}; border-bottom: 1px solid ${line}; padding: .55em 0 !important; }
[data-pubre-opener="swell"] { font-style: italic; font-weight: 400 !important; text-decoration: underline wavy ${a(accent, .45)} 1px; text-underline-offset: .4em; text-decoration-skip-ink: none; }
[data-pubre-first="swell"]::first-line { font-style: italic; }
`
}
