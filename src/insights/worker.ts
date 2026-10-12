// Book insights off the main thread: strips markup from every chapter and finds the cast.
import { findNames } from './names.ts'
import { plainText } from './text.ts'
import { chapters } from './chapters.ts'
import { castLinks, hapax, punctuation } from './cast.ts'

self.onmessage = (e: MessageEvent<{ texts: string[]; exclude?: string[] }>) => {
  const texts = e.data.texts.map(plainText)
  const words = texts.map(t => (t.match(/[A-Za-z’'-]+/g) || []).length)
  const names = findNames(texts, { exclude: e.data.exclude })
  self.postMessage({ names, words, chapters: e.data.texts.flatMap((html, i) => chapters(i, html)),
    links: castLinks(e.data.texts, names.filter(n => n.kind === 'person').slice(0, 24)), hapax: hapax(e.data.texts), punct: punctuation(e.data.texts) })
}
