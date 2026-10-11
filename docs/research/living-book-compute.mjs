// Computes per-chapter content signals for Moby-Dick to drive the proposal prototypes.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
const dir = 'moby/OEBPS/'
const files = readdirSync(dir).filter(f => /-h-\d+\.htm\.xhtml$/.test(f)).sort((a, b) => +a.match(/-h-(\d+)/)[1] - +b.match(/-h-(\d+)/)[1])
const html = files.map(f => readFileSync(dir + f, 'utf8')).join('\n')
const ent = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#\d+;/g, ' ')
// Split on h2 headings that are chapters / Etymology / Extracts / Epilogue
const parts = html.split(/<h2[^>]*>/).slice(1).map(p => {
  const [head, ...rest] = p.split('</h2>')
  return { title: ent(head.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()), body: ent(rest.join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) }
}).filter(p => /^(CHAPTER \d+|ETYMOLOGY|EXTRACTS|Epilogue)/i.test(p.title))
const pos = 'love joy happy glad delight sweet bright fair beauty beautiful gentle peace peaceful calm smile laugh warm kind hope hopeful merry pleasant good great glory glorious wonder wonderful noble grand cheerful jolly friend friendly comfort safe soft blessed bliss heaven heavenly charm lovely mild tender rich splendid serene triumph free'.split(' ')
const neg = 'death dead die dying kill killed murder blood bloody dark darkness fear afraid terror terrible horror horrible grief sorrow sad mad madness hate hatred rage wrath doom dread evil devil hell damn damned curse cursed pain cruel savage wild storm grim gloom gloomy ghost grave woe wretched lost black fiend fierce mortal agony sin wicked monster monstrous ruin wreck sink sunk drown drowned'.split(' ')
const P = new Set(pos), N = new Set(neg)
const people = { Ahab: /\bAhab\b/g, Ishmael: /\bIshmael\b/g, Queequeg: /\bQueequeg\b/g, Starbuck: /\bStarbuck\b/g, Stubb: /\bStubb\b/g, Flask: /\bFlask\b/g, 'Moby Dick': /\bMoby Dick\b|\bwhite whale\b/gi, Pip: /\bPip\b/g, Fedallah: /\bFedallah\b/g, Peleg: /\bPeleg\b/g, Bildad: /\bBildad\b/g, Tashtego: /\bTashtego\b/g, Daggoo: /\bDaggoo\b/g, Mapple: /\bMapple\b/g }
const colors = { white: /\bwhite(ness)?\b/gi, black: /\bblack(ness)?\b/gi, red: /\b(red|crimson|scarlet|blood)\b/gi, green: /\bgreen\b/gi, blue: /\b(blue|azure)\b/gi, gold: /\b(gold|golden|yellow)\b/gi, grey: /\b(grey|gray)\b/gi }
const weather = { storm: /\b(storm|gale|tempest|squall|typhoon|thunder|lightning)s?\b/gi, calm: /\b(calm|still|placid|serene)\b/gi, fog: /\b(fog|mist|haze)\b/gi, night: /\b(night|midnight|moon|stars?)\b/gi, sun: /\b(sun|dawn|sunrise|noon|morning)\b/gi }
const allWords = parts.flatMap(p => p.body.toLowerCase().match(/[a-z’']+/g) ?? [])
const freq = new Map(); for (const w of allWords) freq.set(w, (freq.get(w) ?? 0) + 1)
const count = (s, re) => (s.match(re) ?? []).length
const chapters = parts.map((p, i) => {
  const words = p.body.toLowerCase().match(/[a-z’']+/g) ?? []
  const sentences = p.body.split(/(?<=[.!?])\s+(?=[“"A-Z])/).map(s => (s.match(/\S+/g) ?? []).length).filter(n => n > 0)
  const quoted = (p.body.match(/“[^”]*”/g) ?? []).join('').length
  let ps = 0, ng = 0
  for (const w of words) { if (P.has(w)) ps++; if (N.has(w)) ng++ }
  const hapax = [...new Set(words.filter(w => freq.get(w) === 1 && w.length > 6 && !/’|'/.test(w)))].sort((a, b) => b.length - a.length).slice(0, 5)
  const firstSentence = p.body.split(/(?<=[.!?])\s+/)[0].slice(0, 220)
  return {
    n: i, title: p.title.replace(/^CHAPTER (\d+)\.\s*/, (m, d) => d + ' · ').replace(/\.$/, ''), words: words.length,
    mood: +(((ps - ng) / Math.max(1, words.length)) * 1000).toFixed(1), dialogue: +(quoted / Math.max(1, p.body.length)).toFixed(3),
    avgSentence: +(sentences.reduce((a, b) => a + b, 0) / Math.max(1, sentences.length)).toFixed(1),
    sentences: sentences.slice(0, 160),
    people: Object.fromEntries(Object.entries(people).map(([k, re]) => [k, count(p.body, re)]).filter(([, v]) => v)),
    colors: Object.fromEntries(Object.entries(colors).map(([k, re]) => [k, count(p.body, re)]).filter(([, v]) => v)),
    weather: Object.fromEntries(Object.entries(weather).map(([k, re]) => [k, count(p.body, re)]).filter(([, v]) => v)),
    hapax, first: firstSentence,
  }
})
const ch1 = parts.find(p => /^CHAPTER 1\./.test(p.title)).body.replace(/[A-Za-z0-9\s’']/g, '')
writeFileSync('moby.json', JSON.stringify({ title: 'Moby-Dick; or, The Whale', author: 'Herman Melville', totalWords: allWords.length, chapters, punct: ch1.slice(0, 1400) }))
console.log(chapters.length, 'chapters', allWords.length, 'words', (JSON.stringify(chapters).length / 1024).toFixed(0) + 'KB')
const top = (k) => [...chapters].sort((a, b) => b[k] - a[k]).slice(0, 3).map(c => c.title + ' ' + c[k])
console.log('most positive', top('mood')); console.log('most dialogue', top('dialogue'))
console.log('whitest', [...chapters].sort((a, b) => (b.colors.white ?? 0) - (a.colors.white ?? 0)).slice(0, 3).map(c => c.title + ' ' + c.colors.white))
console.log('darkest', [...chapters].sort((a, b) => a.mood - b.mood).slice(0, 3).map(c => c.title + ' ' + c.mood))
