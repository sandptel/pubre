import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calmRange, bookMinutesLeft } from '../src/lib/calm.ts'

test('calm ranges, never exact countdowns', () => {
  assert.equal(calmRange(0.5), 'about a minute')
  assert.equal(calmRange(4), '~3–5 min')
  assert.equal(calmRange(12), '~10–15 min')
  assert.equal(calmRange(180), '~2.5–4 h')
  assert.equal(calmRange(840), '~11–18 h')
  assert.equal(calmRange(45), '~35–55 min')
  assert.equal(calmRange(0), '')
})

test('book minutes left from chapter words', () => {
  assert.equal(bookMinutesLeft([1000, 2000, 3000], 1, 0.5, 250), (1000 + 3000) / 250)
})
