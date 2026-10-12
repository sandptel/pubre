import { test } from 'node:test'
import assert from 'node:assert/strict'
import { castLinks, companions, hapax, punctuation } from '../src/insights/cast.ts'

const htmls = [
  '<p>Ishmael met Queequeg.</p><p>Queequeg slept.</p>',
  '<p>Ahab stared at Starbuck. Ishmael watched Ahab.</p>',
  '<p>Ahab and Starbuck again.</p><p>Queequeg and Ishmael.</p>',
]

test('castLinks: people named in the same paragraph, by spine item', () => {
  const l = castLinks(htmls, ['Ishmael', 'Queequeg', 'Ahab', 'Starbuck'].map(name => ({ name })))
  assert.deepEqual(l.Ishmael.Queequeg, [0, 2])
  assert.deepEqual(l.Ahab.Starbuck, [1, 2])
  assert.equal(l.Queequeg.Ahab, undefined)
})

test('companions are spoiler-safe: only what you have read', () => {
  const l = castLinks(htmls, ['Ishmael', 'Queequeg', 'Ahab', 'Starbuck'].map(name => ({ name })))
  assert.deepEqual(companions(l, 'Ishmael', 0), ['Queequeg'])
  assert.deepEqual(companions(l, 'Ahab', 0), [])
  assert.deepEqual(companions(l, 'Ahab', 2), ['Starbuck', 'Ishmael'])
})

test('hapax: words used once in the whole book, with where', () => {
  const h = hapax(['<p>The whale, the whale, the leviathan.</p>', '<p>A cetology of the whale.</p>'])
  assert.equal(h.leviathan, 0)
  assert.equal(h.cetology, 1)
  assert.equal(h.whale, undefined)
})

test('punctuation of the first substantial chapter', () => {
  const long = '<p>' + 'word, '.repeat(1300) + 'end.</p>'
  const p = punctuation(['<p>Short.</p>', long])
  assert.ok(p.startsWith(',,,'))
  assert.ok(p.endsWith('.'))
})

test('castLinks: any form of a name counts as its character', () => {
  const l = castLinks(['<p>Lizzy walked with Mr. Darcy.</p>'], [{ name: 'Elizabeth', aliases: ['Lizzy'] }, { name: 'Darcy', aliases: ['Mr. Darcy'] }])
  assert.deepEqual(l.Elizabeth?.Darcy, [0])
})
