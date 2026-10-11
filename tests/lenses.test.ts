import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attribute } from '../src/lib/lenses.ts'

const who = (blocks: string[], names: string[]) => attribute(blocks, names).map(qs => qs.map(q => q.speaker))

test('voices: explicit tags only, honorifics allowed', () => {
  assert.deepEqual(who(['“Which do you mean?” said Mr. Darcy, turning round.'], ['Darcy', 'Bingley']), [['Darcy']])
  assert.deepEqual(who(['“Oh! she is the most beautiful creature I ever beheld!” Bingley replied.'], ['Darcy', 'Bingley']), [['Bingley']])
  assert.deepEqual(who(['Ahab cried, “Death to Moby Dick!”'], ['Ahab', 'Starbuck']), [['Ahab']])
})

test('voices: no guessing from narration or alternation', () => {
  const blocks = ['Starbuck looked at Ahab.', '“Whosoever of ye raises me a white-headed whale…”', '“Huzza! huzza!” cried the seamen.']
  assert.deepEqual(who(blocks, ['Ahab', 'Starbuck']), [[], [], [null]]) // a lone untagged quote paragraph is not coloured at all
})

test('voices: unclosed quote carries only from a tagged speaker', () => {
  assert.deepEqual(who(['“I will go,” said Ahab, “and then', '“we shall see.”'], ['Ahab']), [['Ahab', 'Ahab'], ['Ahab']])
  assert.deepEqual(who(['“I will go,” she began, “and then', '“we shall see.”'], ['Ahab']), [[null, null], []])
})

test('titles and epigraphs are not speech', () => {
  assert.deepEqual(who(['She read “The Night Before Christmas” aloud.'], ['Ahab']), [[]])
  assert.deepEqual(who(['“Stern all! the White Whale spouts thick blood!”'], ['Ahab']), [[]])
})
