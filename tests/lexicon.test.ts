import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lemmas, isHard } from '../src/lib/lexicon.ts'

test('lemmas cover common inflections', () => {
  assert.ok(lemmas('walked').includes('walk'))
  assert.ok(lemmas('harpooneers').includes('harpooneer'))
  assert.ok(lemmas('hurried').includes('hurry'))
  assert.ok(lemmas('making').includes('make'))
  assert.ok(lemmas('stopped').includes('stop'))
  assert.ok(lemmas('Ahab’s').includes('ahab'))
})

test('hard = no common lemma', () => {
  const common = new Set(['walk', 'make', 'ship', 'whale'])
  assert.equal(isHard('walked', common), false)
  assert.equal(isHard('whales', common), false)
  assert.equal(isHard('binnacle', common), true)
  assert.equal(isHard('ship', new Set()), false) // no list loaded: never flag
  assert.equal(isHard('ship-walk', common), false)
  assert.equal(isHard('binnacle-ship', common), true)
  assert.equal(isHard('walk’d', common), false)
})
