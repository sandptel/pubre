// App-facing adapter over the protocol layer in src/epub/. `Book` is the `Epub` aggregate.
export { Epub as Book, EpubError } from '../epub/index.ts'
export type { NavItem as TocItem, SpineItem, ManifestItem, Metadata } from '../epub/index.ts'
