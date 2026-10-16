import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tocLabel } from '../src/lib/epub.ts'

test('contents labels: captions move after the chapter, shouting calms down, the rest is kept', () => {
  assert.equal(tocLabel('I hope Mr. Bingley will like it. CHAPTER II.'), 'Chapter II · I hope Mr. Bingley will like it')
  assert.equal(tocLabel('CHAPTER IV.'), 'Chapter IV')
  assert.equal(tocLabel('Chapter I.'), 'Chapter I')
  assert.equal(tocLabel('CHAPTER 1. Loomings.'), 'CHAPTER 1. Loomings.')
  assert.equal(tocLabel('PRIDE. and PREJUDICE'), 'PRIDE. and PREJUDICE')
  assert.equal(tocLabel('The Book of Life'), 'The Book of Life')
})
