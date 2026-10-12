// Book insights off the main thread: strips markup from every chapter and finds the cast.
// It talks while it works: progress as it reads the chapters, and (when told where you are) a first cast
// from the chapters up to your place, so there is something to show — spoiler-free — before the whole book is read.
import { findNames } from './names.ts'
import { plainText } from './text.ts'
import { chapters } from './chapters.ts'
import { castLinks, hapax, punctuation } from './cast.ts'

self.onmessage = (e: MessageEvent<{ texts: string[]; exclude?: string[]; upto?: number }>) => {
  const { exclude, upto } = e.data
  const texts = e.data.texts.map(plainText)
  if (upto !== undefined && upto + 2 < texts.length) self.postMessage({ partial: findNames(texts.map((t, i) => (i <= upto + 1 ? t : '')), { exclude }) })
  let last = 0
  const names = findNames(texts, { exclude, onProgress: (d, n) => { const p = d / n * 0.85; if (p - last > 0.04) { last = p; self.postMessage({ p }) } } })
  const words = texts.map(t => (t.match(/[A-Za-z’'-]+/g) || []).length)
  self.postMessage({ done: true, names, words, chapters: e.data.texts.flatMap((html, i) => chapters(i, html)),
    links: castLinks(e.data.texts, names.filter(n => n.kind === 'person').slice(0, 24)), hapax: hapax(e.data.texts), punct: punctuation(e.data.texts) })
}
