// The book's on-device profile (cast, words per part, chapter profiles, cast links, rare words,
// punctuation), computed once in a worker and kept on the record. Shared by the reader and the
// book's landing page: one job per book, whoever asks first; others join it and hear its progress.
import type { Book } from './epub.ts'
import type { BookRecord } from './store.svelte.ts'
import type { NameInfo } from '../insights/names.ts'

export const PROFILE_V = 6 // 6: the cast finder v2 (evidence, titles, aliases)

export type Profile = NonNullable<BookRecord['profile']>
/** While it works: `p` how far (0..1), `partial` a first cast from the chapters up to your place. */
export interface ProfileEvent { p?: number; partial?: NameInfo[] }
interface Job { done: Promise<Profile>; listeners: Set<(e: ProfileEvent) => void>; p: number; partial?: NameInfo[] }
const jobs = new Map<string, Job>()

export function computeProfile(b: Book, opts: { key: string; upto?: number; on?: (e: ProfileEvent) => void }): Promise<Profile> {
  let job = jobs.get(opts.key)
  if (!job) {
    const listeners = new Set<(e: ProfileEvent) => void>()
    const j: Job = { listeners, p: 0, done: (async () => {
      const texts = await Promise.all(b.spine.map(s => b.zip.text(s.href).catch(() => '')))
      const worker = new Worker(new URL('../insights/worker.ts', import.meta.url), { type: 'module' })
      return new Promise<Profile>(resolve => {
        worker.onmessage = e => {
          if (e.data.partial) { j.partial = e.data.partial; for (const l of listeners) l({ partial: e.data.partial }) }
          if (e.data.p !== undefined) { j.p = e.data.p; for (const l of listeners) l({ p: e.data.p }) }
          if (!e.data.done) return
          worker.terminate(); jobs.delete(opts.key)
          resolve({ v: PROFILE_V, names: e.data.names, words: e.data.words, chapters: e.data.chapters, links: e.data.links, hapax: e.data.hapax, punct: e.data.punct })
        }
        worker.postMessage({ texts, upto: opts.upto, exclude: [b.metadata.creator, ...b.metadata.creators.map(c => c.name)].filter(Boolean) })
      })
    })() }
    jobs.set(opts.key, (job = j))
  }
  if (opts.on) { job.listeners.add(opts.on); if (job.p) opts.on({ p: job.p }); if (job.partial) opts.on({ partial: job.partial }) }
  return job.done.finally(() => { if (opts.on) job!.listeners.delete(opts.on) })
}
