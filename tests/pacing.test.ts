import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import { indexDocument } from '../src/lib/textindex.ts'
import { beat, breath, pauseAfter, pauseScale, sentenceTime, wordTime } from '../src/lib/pacing.ts'

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
  assert.equal(b('mate').kind, 'chapter', 'an h2 is next: a new chapter')
  assert.equal(b('Next').kind, 'section', 'after a heading')
  assert.equal(b('End').kind, 'end')
})

test('each situation gets its own beat and cue', () => {
  const x = indexDocument(new DOMParser().parseFromString(`<html xmlns="http://www.w3.org/1999/xhtml"><body>
<p>He brought rope, tar, oil, and bread. “Go now,” he said, and we went. “Wait—” Stop! Why? It was long, very long, but done.</p></body></html>`, 'application/xhtml+xml') as unknown as Document)
  const k = (t: string) => x.words.findIndex(w => w.text === t), b = (t: string) => beat(x, k(t))
  assert.equal(b('rope').cue, 'list'); assert.ok(b('rope').ms < b('said').ms, 'a series moves quickly')
  assert.equal(b('now').cue, 'turn')
  assert.equal(b('said').cue, 'comma'); assert.ok(b('said').ms > beat(x, k('long')).ms - 1, 'a comma before "and" turns a clause')
  assert.equal(b('Wait').cue, 'cut'); assert.ok(b('Wait').ms > 200, 'cut-off speech hangs')
  assert.equal(b('Stop').cue, 'bang'); assert.equal(b('Why').cue, 'ask')
  assert.equal(b('done').cue, 'stop'); assert.equal(b('done').end, 'para')
  assert.equal(b('He').cue, null)
})

test('pauses stretch at a slow pace, tighten at a fast one', () => {
  assert.ok(pauseScale(150) > 1 && pauseScale(350) < 1)
  const w = at('you'), slow = wordTime(ix, w, 150) - wordTime(ix, at('Is'), 150), fast = wordTime(ix, w, 350) - wordTime(ix, at('Is'), 350)
  assert.ok(slow > fast)
})

test('one ladder: a paragraph end always rests longer than a sentence end, which beats any comma', () => {
  const x = indexDocument(new DOMParser().parseFromString(`<html xmlns="http://www.w3.org/1999/xhtml"><body>
<p>It was a long road, and we walked it slowly through the night; nobody spoke. We stopped.</p><p>Then we went on.</p></body></html>`, 'application/xhtml+xml') as unknown as Document)
  const b = (t: string) => beat(x, x.words.findIndex(w => w.text === t)).ms
  assert.ok(b('road') < b('night') && b('night') < b('spoke') && b('spoke') < b('stopped'), 'comma < semicolon < sentence < paragraph')
  assert.ok(b('spoke') >= 500, 'a full stop is a real rest')
})

test('the pause length setting stretches every pause', () => {
  const k = at('you')
  assert.ok(wordTime(ix, k, 260, 2) - wordTime(ix, k, 260, 1) > 300)
  assert.equal(wordTime(ix, at('me'), 260, 2), wordTime(ix, at('me'), 260, 1), 'no punctuation, no change')
})
