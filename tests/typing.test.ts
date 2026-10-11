import { test } from 'node:test'
import assert from 'node:assert/strict'
import { edgesOnFirstLine, typeFrames } from '../src/lib/typing.ts'

const R = (left: number, top: number, w: number, h = 20) => ({ left, top, width: w, height: h, right: left + w, bottom: top + h }) as DOMRect

test('edges: letters on the first line, relative to the first', () => {
  const e = edgesOnFirstLine([R(10, 100, 8), R(18, 100, 6), R(24, 101, 9), R(5, 130, 8)])!
  assert.deepEqual(e.edges, [8, 14, 23])
  assert.equal(e.left, 10)
  assert.equal(edgesOnFirstLine([]), null)
})

test('typeFrames: one stepped keyframe per letter, first at 0, last at 1', () => {
  const f = typeFrames([8, 14, 23])
  assert.deepEqual(f.map(k => k.offset), [0, 0.5, 1])
  assert.deepEqual(f.map(k => k.width), ['10px', '16px', '25px'])
  assert.ok(f.every(k => k.easing === 'steps(1, end)'))
})
