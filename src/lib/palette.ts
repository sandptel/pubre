// Ambient palette drift: a chapter whose prose is dominated by one colour word ("white" 72 times in
// "The Whiteness of the Whale") lends the reader's accent a little of that colour. Only colourful
// chapters count: at least 6 mentions, and that colour at least 40% of all colour words.

const COLOURS: [string, RegExp, string, string][] = [ // name, words, hue on light themes, hue on dark themes
  ['white', /\b(white|whiteness|whites|snowy|milky|ivory|pallid|pale)\b/gi, '#7f97ae', '#eef2f6'],
  ['black', /\b(black|blackness|sable|ebony|jet|pitchy|inky)\b/gi, '#3b3f46', '#8e95a3'],
  ['red', /\b(red|redness|scarlet|crimson|blood|bloody|ruddy|vermilion)\b/gi, '#b8433a', '#ff7b70'],
  ['green', /\b(green|greenness|verdant|emerald)\b/gi, '#3f7d3a', '#8fd48a'],
  ['blue', /\b(blue|blueness|azure|sapphire|indigo|cerulean)\b/gi, '#2f62b0', '#8fb5ff'],
  ['gold', /\b(gold|golden|yellow|amber|gilded|gilt)\b/gi, '#a87b12', '#f2cc71'],
  ['grey', /\b(gr[ae]y|greyness|ashen|leaden|slate)\b/gi, '#6b7078', '#b4b9c0'],
  ['purple', /\b(purple|violet|lavender|mauve)\b/gi, '#7d529e', '#d0a8f0'],
  ['brown', /\b(brown|tawny|russet|chestnut)\b/gi, '#8a5a3c', '#d39a70'],
  ['silver', /\b(silver|silvery)\b/gi, '#7d8893', '#c9d1d9'],
]

export interface Tint { name: string; hex: string; count: number }

/** The colour a stretch of prose leans toward, or null when no colour dominates. */
export function colourOf(text: string, dark: boolean): Tint | null {
  let total = 0, best: Tint | null = null
  for (const [name, re, light, night] of COLOURS) {
    const n = text.match(re)?.length ?? 0
    total += n
    if (n && (!best || n > best.count)) best = { name, hex: dark ? night : light, count: n }
  }
  return best && best.count >= 6 && best.count / total >= 0.4 ? best : null
}
