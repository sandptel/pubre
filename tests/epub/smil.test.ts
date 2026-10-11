import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseClock, parseSmil } from '../../src/epub/smil.ts'
import { xml } from './helpers.ts'

test('SMIL clock values (full, partial, timecount)', () => {
  const cases: [string, number | undefined][] = [
    ['02:30:03', 9003], ['50:00:10.25', 180010.25], ['02:33', 153], ['00:10.5', 10.5], ['0:05', 5],
    ['3.2h', 11520], ['45min', 2700], ['30s', 30], ['5ms', 0.005], ['12.467', 12.467], ['.5s', 0.5], ['npt=1.5s', 1.5],
    [' 7s ', 7], ['', undefined], ['abc', undefined], ['1:2:3:4', undefined],
  ]
  for (const [v, want] of cases) assert.equal(parseClock(v), want, v)
  assert.equal(parseClock(undefined), undefined)
})

test('SMIL → flat per-document timeline', () => {
  const o = parseSmil(xml(`<smil xmlns="http://www.w3.org/ns/SMIL" xmlns:epub="http://www.idpf.org/2007/ops" version="3.0">
  <body epub:textref="../text/ch1.xhtml">
    <seq epub:textref="../text/ch1.xhtml#s1" epub:type="chapter">
      <par id="p1"><text src="../text/ch1.xhtml#w1"/><audio src="../audio/ch1.mp3" clipBegin="0:00:00.000" clipEnd="0:00:02.500"/></par>
      <par id="p2"><text src="../text/ch1.xhtml#w2"/><audio src="../audio/ch1.mp3" clipBegin="2.5s" clipEnd="4500ms"/></par>
      <seq epub:type="table"><par id="p3" epub:type="table-cell"><text src="../text/ch1.xhtml#c1"/><audio src="../audio/ch1.mp3" clipBegin="00:04.5" clipEnd="00:06"/></par></seq>
    </seq>
    <par id="p4"><text src="../text/ch2.xhtml#x"/><audio src="../audio/ch2.mp3" clipBegin="10s" clipEnd="11.25s"/></par>
    <par id="p5"><text src="../text/ch2.xhtml#y"/></par>
  </body>
</smil>`), 'OEBPS/smil/ch1.smil')
  assert.equal(o.pars.length, 5)
  assert.deepEqual(o.pars[0], {
    id: 'p1', text: 'OEBPS/text/ch1.xhtml#w1', path: 'OEBPS/text/ch1.xhtml', fragment: 'w1', types: ['chapter'],
    audio: { src: 'OEBPS/audio/ch1.mp3', clipBegin: 0, clipEnd: 2.5 },
  })
  assert.deepEqual(o.pars[2].types, ['table-cell', 'table', 'chapter'])
  const ch1 = o.timelines.get('OEBPS/text/ch1.xhtml')!
  assert.deepEqual(ch1.map(e => [e.fragment, e.start, e.end]), [['w1', 0, 2.5], ['w2', 2.5, 4.5], ['c1', 4.5, 6]])
  const ch2 = o.timelines.get('OEBPS/text/ch2.xhtml')!
  assert.deepEqual(ch2.map(e => [e.fragment, e.start, e.end]), [['x', 0, 1.25], ['y', 1.25, 1.25]])
  assert.equal(o.duration, 7.25)
})

test('clip without clipEnd makes later positions unknown', () => {
  const o = parseSmil(xml(`<smil><body><par><text src="a.xhtml#1"/><audio src="a.mp3" clipBegin="1s"/></par><par><text src="a.xhtml#2"/><audio src="a.mp3" clipBegin="5s" clipEnd="6s"/></par></body></smil>`), 's.smil')
  const t = o.timelines.get('a.xhtml')!
  assert.equal(t[0].start, 0)
  assert.equal(t[0].end, undefined)
  assert.equal(t[1].start, undefined)
  assert.equal(o.duration, undefined)
})
