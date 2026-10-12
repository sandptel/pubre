// The welcome book: every page is well-formed XHTML, the package lists what is there, and the lenses have
// something to show (two speaking characters).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { DOMParser } from '@xmldom/xmldom'
import { findNames } from '../src/insights/names.ts'
import { plainText } from '../src/insights/text.ts'

const dir = new URL('../guide/OEBPS/', import.meta.url)
const opf = readFileSync(new URL('content.opf', dir), 'utf8')
const hrefs = [...opf.matchAll(/href="([^"]+)"/g)].map(m => m[1])
const spine = [...opf.matchAll(/idref="([^"]+)"/g)].map(m => new RegExp(`id="${m[1]}" href="([^"]+)"`).exec(opf)![1])

test('guide: every manifest file exists and every page is well-formed', () => {
  for (const h of hrefs) {
    assert.ok(existsSync(new URL(h, dir)), h)
    if (!/\.(xhtml|svg|opf)$/.test(h)) continue
    const errs: string[] = []
    new DOMParser({ onError: (_l: string, m: string) => errs.push(m) } as never).parseFromString(readFileSync(new URL(h, dir), 'utf8'), 'application/xhtml+xml')
    assert.deepEqual(errs, [], h)
  }
})

test('guide: the lenses have a cast to show', () => {
  const names = findNames(spine.map(h => plainText(readFileSync(new URL(h, dir), 'utf8'))), { exclude: ['pubre'] })
  const people = names.filter(n => n.kind === 'person').map(n => n.name)
  assert.ok(people.includes('Wren'), people.join(', '))
  assert.ok(people.some(p => /Quill/.test(p)), people.join(', '))
})
