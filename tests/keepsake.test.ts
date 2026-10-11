import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keepsakeSvg } from '../src/insights/keepsake.ts'

test('keepsake: one glyph per mark, one arc per chapter mood, title escaped', () => {
  const svg = keepsakeSvg('.,;:!?—“', ['#123456', '#abcdef', '#000000'], 'Moby <Dick>')
  assert.ok(svg.startsWith('<svg'))
  assert.equal((svg.match(/stroke-width="10"/g) ?? []).length, 3)
  assert.ok(svg.includes('Moby Dick') && !svg.includes('<Dick>'))
  assert.ok(svg.includes('8 MARKS'))
})
