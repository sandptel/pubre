import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { findNames } from '../src/insights/names.ts'

test('finds people, joins a title to its name, drops sentence-initial words, separates places', () => {
  const t = [
    'Captain Ahab stood. Then Starbuck spoke to Ahab, and Stubb laughed. The ship sailed from Nantucket.',
    'Ahab turned. “Starbuck,” said Ahab. Stubb nodded; Stubb was merry. They left Nantucket at dawn.',
    'Later Ahab and Starbuck argued in Nantucket while Stubb slept, and then Stubb and Starbuck ate. At dusk Captain Ahab frowned. “Go,” said Peter Coffin, and Peter Coffin smiled. Then Peter Coffin left.',
  ]
  const names = findNames(t)
  const by = Object.fromEntries(names.map(n => [n.name, n]))
  assert.equal(by.Ahab.kind, 'person'); assert.ok(by.Ahab.count >= 4)
  assert.equal(by.Nantucket.kind, 'place'); assert.equal(by.Nantucket.slot, -1)
  assert.ok(by['Peter Coffin'], 'two-word name kept')
  assert.ok(by.Ahab.aliases?.includes('Captain Ahab'), 'a title and its name are one person')
  assert.ok(!by.Captain && !by.Then && !by.The, 'titles and sentence-initial words dropped')
  assert.equal(by.Ahab.slot, 0)
  assert.deepEqual(by.Stubb.perSpine.length, 3)
})

test('on Moby-Dick the main cast surfaces', () => {
  const dir = new URL('../../pubre-samples/insights/moby/OEBPS/', import.meta.url)
  let texts: string[]
  try { texts = [0, 1, 2, 3, 4, 5].map(i => readFileSync(new URL(`1286170553238890831_2701-h-${i}.htm.xhtml`, dir), 'utf8').replace(/<[^>]+>/g, ' ')) }
  catch { return } // sample book not present (CI)
  const people = findNames(texts).filter(n => n.kind === 'person').slice(0, 10).map(n => n.name)
  for (const who of ['Ahab', 'Queequeg', 'Starbuck', 'Stubb']) assert.ok(people.includes(who), `${who} in ${people}`)
})

test('Mr. and Mrs. keep a shared surname apart; nicknames join; "Mr." is no sentence end', () => {
  const t = ['“Come,” said Mrs. Bennet. Mr. Bennet smiled. Mrs. Bennet sighed and Mr. Bennet laughed. Elizabeth smiled at Lizzy. “No,” said Elizabeth. Elizabeth turned.',
    'Mr. Bennet looked up. “Well,” said Mrs. Bennet, and Lizzy laughed. Elizabeth smiled. “Yes,” said Lizzy.']
  const by = Object.fromEntries(findNames(t, { min: 2 }).map(n => [n.name, n]))
  assert.ok(by['Mr. Bennet'] && by['Mrs. Bennet'], 'two people')
  assert.ok(by.Elizabeth.aliases?.includes('Lizzy'), 'Lizzy is Elizabeth')
})
