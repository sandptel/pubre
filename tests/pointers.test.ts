import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POINTERS, pointerBox } from '../src/lib/pointers.ts'

test('every pointer type has a box; line sits under the word, caret before it', () => {
  for (const [p] of POINTERS) { const b = pointerBox(p, 100, 50, 40, 20); assert.equal(b.length, 4); assert.ok(b[2] > 0 && b[3] > 0) }
  const [, y] = pointerBox('underline', 100, 50, 40, 20); assert.ok(y >= 50 + 20 - 2)
  const [x] = pointerBox('caret', 100, 50, 40, 20); assert.ok(x < 100)
  assert.equal(POINTERS[0][0], 'outline', 'Ring is first (the default)')
})
