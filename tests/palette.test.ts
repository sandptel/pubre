import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colourOf } from '../src/lib/palette.ts'

test('a chapter dominated by one colour word leans that way', () => {
  const t = 'The whiteness of the whale. ' + 'White as snow, white bears, the white steed; '.repeat(3) + 'a red flag.'
  assert.equal(colourOf(t, false)?.name, 'white')
  assert.notEqual(colourOf(t, true)?.hex, colourOf(t, false)?.hex, 'dark themes use their own hue')
})

test('a few colour words, or a mix, do not tint', () => {
  assert.equal(colourOf('A red door and a blue sky.', false), null)
  assert.equal(colourOf('red red red green green green blue blue blue', false), null, 'no colour at 40%')
})
