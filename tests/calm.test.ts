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

test('since: calm relative times', async () => {
  const { since } = await import('../src/lib/calm.ts')
  const now = 1_000_000_000_000, min = 60000, h = 60 * min, d = 24 * h
  assert.equal(since(now - 30_000, now), 'just now')
  assert.equal(since(now - 12 * min, now), '12 min ago')
  assert.equal(since(now - 1 * h, now), '1 hour ago')
  assert.equal(since(now - 5 * h, now), '5 hours ago')
  assert.equal(since(now - 26 * h, now), 'yesterday')
  assert.equal(since(now - 4 * d, now), '4 days ago')
  assert.equal(since(now - 21 * d, now), '3 weeks ago')
})
