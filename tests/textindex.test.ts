import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import { indexDocument, wordAt } from '../src/lib/textindex.ts'

const doc = (body: string) => new DOMParser().parseFromString(`<html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`, 'application/xhtml+xml') as unknown as Document

test('words, sentences and blocks, with pauses', () => {
  const ix = indexDocument(doc('<h2>Loomings</h2><p>Call me Ishmael. Some years ago—never mind how long—having little money.</p><p>Next.</p>'))
  assert.deepEqual(ix.words.map(w => w.text).slice(0, 4), ['Loomings', 'Call', 'me', 'Ishmael'])
  assert.equal(ix.blocks.length, 3)
  assert.equal(ix.blocks[0].kind, 'heading')
  assert.equal(ix.sentences.length, 4) // heading, two sentences, "Next."
  const ishmael = ix.words.find(w => w.text === 'Ishmael')!, ago = ix.words.find(w => w.text === 'ago')!
  assert.equal(ishmael.pause, 2)
  assert.equal(ago.pause, 1)
  assert.equal(ix.words.at(-1)!.pause, 3)
})

test('abbreviations do not split sentences', () => {
  const ix = indexDocument(doc('<p>Mr. Starbuck met Dr. Bunger in St. Paul. Then he left.</p>'))
  assert.equal(ix.sentences.length, 2)
})

test('words straddling inline elements map to both text nodes', () => {
  const d = doc('<p>A <i>wo</i>rd here.</p>')
  const ix = indexDocument(d)
  const w = ix.words.find(w => w.text === 'word')!
  assert.notEqual(w.sn, w.en)
  assert.equal(w.sn.data.slice(w.so), 'wo')
  assert.equal(w.en.data.slice(0, w.eo), 'rd')
  assert.equal(wordAt(ix, w.en, 1), ix.words.indexOf(w))
})

test('code and tables are indexed as skip blocks', () => {
  const ix = indexDocument(doc('<p>Text.</p><pre>let x = 1</pre>'))
  assert.equal(ix.blocks[1].kind, 'skip')
})

test('source line breaks inside a paragraph do not end sentences', () => {
  const ix = indexDocument(doc('<p>“The Whale-ship Globe, on board of which vessel occurred the horrid\n        transactions we are about to relate.” Next one.</p>'))
  assert.equal(ix.sentences.length, 2)
  assert.equal(ix.words.find(w => w.text === 'horrid')!.pause, 0)
})

test('speech tags, elisions and headings keep sentences whole', () => {
  const ix = indexDocument(doc('<h2>CHAPTER 36. The Quarter-Deck.</h2><p>“Stern all!” exclaimed the mate. It pecks the shell. ’Twill soon be out.</p>'))
  const sent = (w: string) => ix.words.find(x => x.text === w)!.s
  assert.equal(sent('CHAPTER'), sent('Deck'), 'heading is one sentence')
  assert.equal(sent('Stern'), sent('exclaimed'), 'speech tag continues the sentence')
  assert.notEqual(sent('mate'), sent('pecks'))
  const tw = ix.words.find(x => x.text.endsWith('Twill'))!, sh = ix.words.find(x => x.text === 'shell')!
  assert.notEqual(tw.s, sh.s)
  assert.equal(ix.sentences[tw.s].a, ix.words.indexOf(tw), '’Twill opens its sentence')
})
