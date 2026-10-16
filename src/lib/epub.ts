// App-facing adapter over the protocol layer in src/epub/. `Book` is the `Epub` aggregate.
export { Epub as Book, EpubError } from '../epub/index.ts'
export type { NavItem as TocItem, SpineItem, ManifestItem, Metadata } from '../epub/index.ts'

/** A contents label as shown: Gutenberg folds a plate's caption into the name ("I hope Mr. Bingley will
 *  like it. CHAPTER II.") and shouts the rest ("CHAPTER IV."). Display only: matching uses the raw label. */
export function tocLabel(label: string): string {
  const s = label.replace(/\s+/g, ' ').trim()
  const kind = (k: string) => k[0].toUpperCase() + k.slice(1).toLowerCase()
  const tail = /^(.+?)[.\s]+(chapter|book|part|letter|volume|canto)\s+([ivxlcdm]+|\d+)\.?$/i.exec(s)
  if (tail) return `${kind(tail[2])} ${tail[3]} · ${tail[1].replace(/[.\s]+$/, '')}`
  const bare = /^(chapter|book|part|letter|volume|canto)\s+([ivxlcdm]+|\d+)\.?$/i.exec(s)
  if (bare) return `${kind(bare[1])} ${bare[2]}`
  return s
}
