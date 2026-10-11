import { test } from 'node:test'
import assert from 'node:assert/strict'
import { featuresOf, genderOf, portraitSvg } from '../src/lib/portrait.ts'

test('gender guess from names and titles', () => {
  assert.equal(genderOf('Elizabeth'), 'f')
  assert.equal(genderOf('Mrs. Bennet'), 'f')
  assert.equal(genderOf('Mr. Darcy'), 'm')
  assert.equal(genderOf('Ahab'), 'm')
  assert.equal(genderOf('Captain Peleg'), 'm')
  assert.equal(genderOf('Lydia'), 'f')
})

test('the same name always draws the same face; women get no beard', () => {
  assert.deepEqual(featuresOf('Queequeg'), featuresOf('Queequeg'))
  assert.equal(portraitSvg('Ahab', '#c33'), portraitSvg('Ahab', '#c33'))
  for (const n of ['Elizabeth', 'Jane', 'Lydia', 'Mrs. Bennet', 'Charlotte']) assert.equal(featuresOf(n).beard, 0)
  assert.ok(portraitSvg('Starbuck', '#3a3').startsWith('<svg'))
})

test('every portrait is valid XML (it is used as an image)', async () => {
  const { DOMParser } = await import('@xmldom/xmldom')
  for (const n of ['Ahab', 'Elizabeth', 'Mr. Darcy', 'Queequeg', 'Lydia', 'Stubb', 'Peleg', 'Alice', 'Pip', 'Jane']) {
    const errs: string[] = []
    new DOMParser({ onError: (_l: string, m: string) => errs.push(m) } as never).parseFromString(portraitSvg(n, '#abcdef'), 'image/svg+xml')
    assert.deepEqual(errs, [], n)
  }
})
