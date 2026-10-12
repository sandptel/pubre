// The names eval: the engine against hand-made cast lists (tests/fixtures/names-gold.json) for six books.
// Prints a scorecard; fails if a book drops below its floor. Books live in ../pubre-samples (skipped in CI).
// Run alone for the table: node tests/names.eval.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { findNames, type NameInfo } from '../src/insights/names.ts'
import { plainText } from '../src/insights/text.ts'

interface Gold { dir: string; creator: string; cast: string[][]; minor: string[]; not: string[] }
const gold: { books: Gold[] } = JSON.parse(readFileSync(new URL('./fixtures/names-gold.json', import.meta.url), 'utf8'))
const root = new URL('../../pubre-samples/insights/', import.meta.url).pathname

/** The book's chapters in reading (spine) order, as plain text. */
function chaptersOf(dir: string): string[] | null {
  const base = join(root, dir)
  if (!existsSync(base)) return null
  const find = (d: string): string | null => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) { const r = find(p); if (r) return r } else if (f.name.endsWith('.opf')) return p } return null }
  const opf = find(base)
  if (!opf) return null
  const x = readFileSync(opf, 'utf8'), items = new Map<string, string>()
  for (const m of x.matchAll(/<item\b[^>]*>/g)) { const id = /\bid="([^"]+)"/.exec(m[0])?.[1], href = /\bhref="([^"]+)"/.exec(m[0])?.[1]; if (id && href) items.set(id, decodeURIComponent(href)) }
  return [...x.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map(m => items.get(m[1])).filter(Boolean).map(h => plainText(readFileSync(join(dirname(opf), h!), 'utf8')))
}

const norm = (s: string) => s.replace(/[’']/g, "'").replace(/\b(Mr|Mrs|Dr|St)\.?(?=\s)/g, '$1.').replace(/^the\s+/i, '').trim()
const formsOf = (n: NameInfo) => [n.name, ...((n as NameInfo & { aliases?: string[] }).aliases ?? [])].map(norm)

export function score(b: Gold, names: NameInfo[]) {
  const people = names.filter(n => n.kind === 'person')
  const top20 = people.slice(0, 20), top30 = people.slice(0, 30)
  const castSets = b.cast.map(c => new Set(c.map(norm))), ok = new Set([...b.cast.flat(), ...b.minor].map(norm)), bad = new Set(b.not.map(norm))
  const good = (n: NameInfo) => formsOf(n).some(f => ok.has(f))
  const found = castSets.map(set => top30.filter(n => formsOf(n).some(f => set.has(f))))
  return {
    precision: top20.filter(good).length / Math.max(1, top20.length),
    recall: found.filter(f => f.length).length / castSets.length,
    split: found.filter(f => f.length > 1).length, // one character listed twice
    leaks: people.slice(0, 30).filter(n => formsOf(n).some(f => bad.has(f))).map(n => n.name),
    wrong: top20.filter(n => !good(n)).map(n => n.name),
    missed: b.cast.filter((_, i) => !found[i].length).map(c => c[0]),
  }
}

// Floors only ever go up: raise them when the engine improves.
const FLOOR = { precision: 0, recall: 0 }

test('names eval: cast precision and recall on six books', () => {
  const rows: string[] = []
  let ran = 0, p = 0, r = 0
  for (const b of gold.books) {
    const texts = chaptersOf(b.dir)
    if (!texts) continue
    ran++
    const s = score(b, findNames(texts, { exclude: [b.creator] } as never))
    p += s.precision; r += s.recall
    rows.push(`${b.dir.padEnd(13)} P@20 ${(s.precision * 100).toFixed(0).padStart(3)}%  R@30 ${(s.recall * 100).toFixed(0).padStart(3)}%  split ${s.split}  leaks ${s.leaks.length}`
      + `\n    wrong: ${s.wrong.join(', ') || '—'}\n    missed: ${s.missed.join(', ') || '—'}`)
    assert.ok(s.precision >= FLOOR.precision && s.recall >= FLOOR.recall, `${b.dir} below floor`)
  }
  if (!ran) return
  console.log(rows.join('\n') + `\n${'mean'.padEnd(13)} P@20 ${(p / ran * 100).toFixed(0)}%  R@30 ${(r / ran * 100).toFixed(0)}%`)
})
