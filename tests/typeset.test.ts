import { test } from 'node:test'
import assert from 'node:assert/strict'
import { smartText } from '../src/lib/typeset.ts'

const vis = (s: string) => s.replace(/⁠/g, '')

test('quotes curl the right way, apostrophes and elisions included', () => {
  assert.equal(smartText(`"Well," said 'the Captain', "I don't know."`), `“Well,” said ‘the Captain’, “I don’t know.”`)
  assert.equal(smartText(`the dogs' bowls`), `the dogs’ bowls`)
  assert.equal(smartText(`'Tis the season, 'twas said, in the '90s.`), `’Tis the season, ’twas said, in the ’90s.`)
  assert.equal(smartText(`(“quoted”)`), `(“quoted”)`)
  assert.equal(smartText(`"`, 'd'), `”`, 'a quote after a word in the previous node closes')
})

test('dashes and ellipses, length kept exactly', () => {
  for (const s of [`Well--I don't know...`, `and so---`, `wait... no`, `a----rule`]) assert.equal(smartText(s).length, s.length, s)
  assert.equal(vis(smartText(`Well--I don't know...`)), `Well—I don’t know…`)
  assert.equal(vis(smartText(`and so---`)), `and so—`)
  assert.equal(smartText(`a----rule`), `a----rule`)
  assert.equal(smartText(`plain text, nothing to do`), `plain text, nothing to do`)
})

import { breakText, salutation } from '../src/lib/typeset.ts'

test('scene-break lines and letter salutations', () => {
  for (const t of ['* * *', '***', '⁂', '#', '•  •  •']) assert.ok(breakText(t), t)
  for (const t of ['One.', '— and so on', '', '--']) assert.ok(!breakText(t), t)
  for (const t of ['“Dear Sir,', 'My dearest Lizzy,', 'Madam:']) assert.ok(salutation(t), t)
  for (const t of ['Dear me, how late it is.', 'The dear old man smiled.']) assert.ok(!salutation(t), t)
})
