// The book's on-device profile (cast, words per part, chapter profiles, cast links, rare words,
// punctuation), computed once in a worker and kept on the record. Shared by the reader and the
// book's landing page.
import type { Book } from './epub.ts'
import type { BookRecord } from './store.svelte.ts'

export const PROFILE_V = 5

export async function computeProfile(b: Book): Promise<NonNullable<BookRecord['profile']>> {
  const texts = await Promise.all(b.spine.map(s => b.zip.text(s.href).catch(() => '')))
  const worker = new Worker(new URL('../insights/worker.ts', import.meta.url), { type: 'module' })
  return new Promise(resolve => {
    worker.onmessage = e => {
      worker.terminate()
      resolve({ v: PROFILE_V, names: e.data.names, words: e.data.words, chapters: e.data.chapters, links: e.data.links, hapax: e.data.hapax, punct: e.data.punct })
    }
    worker.postMessage({ texts, exclude: [b.metadata.creator, ...b.metadata.creators.map(c => c.name)].filter(Boolean) })
  })
}
