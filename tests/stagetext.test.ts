import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import { indexDocument } from '../src/lib/textindex.ts'
import { phrases, prevUnit, segments, unitAt } from '../src/lib/stagetext.ts'

const ix = indexDocument(new DOMParser().parseFromString(`<html xmlns="http://www.w3.org/1999/xhtml"><body>
<p>Call me <i>Ishmael</i>. “Some years ago, never mind how long, I sailed.”</p></body></html>`, 'application/xhtml+xml') as unknown as Document)
const at = (t: string) => ix.words.findIndex(w => w.text === t)

test('segments cover the block text exactly, words are core', () => {
  const segs = segments(ix, 0), text = ix.blocks[0].text
  assert.equal(segs.map(s => text.slice(s.a, s.b)).join(''), text)
  const ish = segs.find(s => text.slice(s.a, s.b) === 'Ishmael')!
  assert.ok(ish.core)
  assert.equal(ish.w, at('Ishmael'))
})

test('a gap belongs to the word before; an opening quote to the word after', () => {
  const segs = segments(ix, 0), text = ix.blocks[0].text
  const period = segs.find(s => text.slice(s.a, s.b).startsWith('.'))!
  assert.equal(period.w, at('Ishmael'))
  const quote = segs.find(s => text.slice(s.a, s.b) === '“')!
  assert.equal(quote.w, at('Some'))
  assert.equal(quote.s, ix.words[at('Some')].s)
})

test('decorations split segments and carry their classes', () => {
  const text = ix.blocks[0].text, a = text.indexOf('years'), b = a + 'years ago'.length
  const segs = segments(ix, 0, [{ a, b, cls: 'lx-hard', css: '--x:1' }])
  const marked = segs.filter(s => s.cls.includes('lx-hard')).map(s => text.slice(s.a, s.b)).join('')
  assert.equal(marked, 'years ago')
  assert.ok(segs.filter(s => s.cls).every(s => s.css === '--x:1'))
})

test('units: phrases end at pauses and hold at most 3 words', () => {
  const s1 = ix.words[at('Some')].s
  const ps = phrases(ix, s1).map(([a, b]) => ix.words.slice(a, b + 1).map(w => w.text).join(' '))
  assert.deepEqual(ps, ['Some years ago', 'never mind how', 'long', 'I sailed'])
  assert.deepEqual(unitAt(ix, at('years'), 'phrase'), [at('years'), at('ago')])
  assert.deepEqual(unitAt(ix, at('me'), 'sentence'), [at('Call'), at('Ishmael')])
  assert.equal(prevUnit(ix, at('long'), 'phrase'), at('never'))
  assert.equal(prevUnit(ix, at('Some'), 'sentence'), at('Call'))
  assert.equal(prevUnit(ix, at('me'), 'word'), at('Call'))
  assert.equal(prevUnit(ix, 0, 'word'), -1)
})
