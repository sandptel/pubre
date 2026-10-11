import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import { indexDocument } from '../src/lib/textindex.ts'
import { breath, pauseAfter, sentenceTime, wordTime } from '../src/lib/pacing.ts'

const ix = indexDocument(new DOMParser().parseFromString(`<html xmlns="http://www.w3.org/1999/xhtml"><body>
<p>Call me Ishmael. Is it you? Wait… then, yes; go—now. Mr. Starbuck came.</p>
<p>“Sir!” said the mate.</p><h2>Next</h2><p>End.</p></body></html>`, 'application/xhtml+xml') as unknown as Document)
const at = (word: string) => ix.words.findIndex(w => w.text === word)

test('punctuation is captured per word', () => {
  assert.equal(ix.words[at('Ishmael')].punct, '.')
  assert.equal(ix.words[at('you')].punct, '?')
  assert.equal(ix.words[at('go')].punct, '—')
})

test('pauses scale with punctuation and position', () => {
  const p = (w: string) => pauseAfter(ix, at(w))
  assert.ok(p('you') > p('Ishmael'), 'question > full stop')
  assert.ok(p('Wait') > p('then'), 'ellipsis > comma')
  assert.ok(p('yes') > p('then'), 'semicolon > comma')
  assert.ok(p('go') > p('then') && p('go') < p('yes'), 'dash between comma and semicolon')
  assert.equal(p('Mr'), 0, 'abbreviation is not a sentence end')
  assert.ok(p('came') >= 750, 'paragraph end before a dialogue turn')
  assert.ok(p('mate') >= 1000, 'paragraph end before a heading')
  assert.equal(p('Call'), 0)
})

test('first word of a paragraph lingers a little longer', () => {
  assert.ok(wordTime(ix, at('Call'), 260) > wordTime(ix, at('me'), 260) - 1)
})

test('stage: sentences take their words’ time; blocks breathe before the next one', () => {
  const s0 = ix.words[at('Ishmael')].s, s1 = ix.words[at('you')].s
  assert.ok(sentenceTime(ix, s0, 260) > wordTime(ix, at('Call'), 260) + wordTime(ix, at('Ishmael'), 260))
  assert.ok(sentenceTime(ix, s0, 400) < sentenceTime(ix, s0, 200), 'faster pace, shorter time')
  assert.ok(sentenceTime(ix, s1, 260) > 0)
  const b = (w: string) => breath(ix, ix.words[at(w)].b)
  assert.equal(b('Ishmael').kind, 'paragraph')
  assert.equal(b('mate').kind, 'section', 'a heading is next')
  assert.equal(b('Next').kind, 'section', 'after a heading')
  assert.equal(b('End').kind, 'end')
})
