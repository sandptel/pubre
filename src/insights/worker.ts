// Book insights off the main thread: strips markup from every chapter and finds the cast.
import { findNames } from './names.ts'

self.onmessage = (e: MessageEvent<{ texts: string[] }>) => {
  const texts = e.data.texts.map(t => t
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8220;|&ldquo;/g, '“').replace(/&#8221;|&rdquo;/g, '”').replace(/&[a-z#0-9]+;/gi, ' '))
  const words = texts.map(t => (t.match(/[A-Za-z’'-]+/g) || []).length)
  self.postMessage({ names: findNames(texts), words })
}
