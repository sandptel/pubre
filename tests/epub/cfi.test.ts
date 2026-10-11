import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCfi, stringifyCfi, compareCfi, collapse, cfiFromPoint, cfiFromElement, cfiFromRange, resolveCfi,
  spineSteps, cfiSpineIndex, escapeCfi, type Boundaries,
} from '../../src/epub/cfi.ts'
import { EpubError } from '../../src/epub/errors.ts'
import { xhtml } from './helpers.ts'

// The sample chapter from the EPUB CFI specification.
const CHAPTER = (para05 = '<p id="para05">xxx<em>yyy</em>0123456789</p>', extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body id="body01">
<p>...</p>
<p>...</p>
<p>...</p>
<p>...</p>${extra}
${para05}
<p>...</p>
<p>...</p>
<img id="svgimg" src="foo.svg" alt="an image"/>
<p>...</p>
<p>...</p>
</body>
</html>`

const SPEC = [
  'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/3:10)',
  'epubcfi(/6/4[chap01ref]!/4[body01]/16[svgimg])',
  'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/1:0)',
  'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:0)',
  'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3)',
  'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3[yyy])',
  'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/1:3[xx,y])',
  'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3[,y])',
  'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2[;s=b])',
  'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3[;s=b])',
  'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05],/2/1:1,/3:4)',
  'epubcfi(/6/14[chap05ref]!/4[body01]/10/2/1:3[2^[1^]])',
  'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3[Ф-"spa ce"-99%-aa^[bb^]^^])',
  'epubcfi(/6/4!/4/10/2~23.5@50:30.2)',
  'epubcfi(/6/4!/4/10/2@0:100)',
  'epubcfi(/6/4!/4/10/2~0.5)',
]

test('spec examples parse and stringify back verbatim', () => {
  for (const s of SPEC) assert.equal(stringifyCfi(parseCfi(s)), s)
})

test('parse: structure, assertions, escaping', () => {
  const c = parseCfi(SPEC[0])
  assert.deepEqual(c.parent.segments, [[{ index: 6 }, { index: 4, id: 'chap01ref' }], [{ index: 4, id: 'body01' }, { index: 10, id: 'para05' }, { index: 3 }]])
  assert.deepEqual(c.parent.offset, { char: 10 })
  assert.deepEqual(parseCfi(SPEC[6]).parent.offset, { char: 3, before: 'xx', after: 'y' })
  assert.deepEqual(parseCfi(SPEC[7]).parent.offset, { char: 3, after: 'y' })
  assert.deepEqual(parseCfi(SPEC[9]).parent.offset, { char: 3, side: 'b' })
  assert.deepEqual(parseCfi(SPEC[8]).parent.segments[1][2], { index: 2, params: { s: 'b' } })
  assert.equal(parseCfi(SPEC[11]).parent.offset?.before, '2[1]')
  assert.equal(parseCfi(SPEC[12]).parent.offset?.before, 'Ф-"spa ce"-99%-aa[bb]^')
  assert.deepEqual(parseCfi(SPEC[13]).parent.offset, { temporal: 23.5, spatial: [50, 30.2] })
  const r = parseCfi(SPEC[10])
  assert.deepEqual(r.start, { segments: [[{ index: 2 }, { index: 1 }]], offset: { char: 1 } })
  assert.deepEqual(r.end, { segments: [[{ index: 3 }]], offset: { char: 4 } })
  assert.equal(escapeCfi('a[b]^c,d;e=f(g)'), 'a^[b^]^^c^,d^;e^=f^(g^)')
  // bare and #-prefixed forms
  assert.deepEqual(parseCfi('#epubcfi(/6/4)'), parseCfi('/6/4'))
})

test('parse errors are typed', () => {
  for (const bad of ['epubcfi(/6/4[chap01ref)', 'epubcfi(/a)', 'epubcfi(/6/4', 'epubcfi(/6/4,/2)', 'epubcfi()', 'epubcfi(/6/4x)', 'epubcfi(/6/4@5)']) {
    assert.throws(() => parseCfi(bad), (e: EpubError) => e.code === 'BAD_CFI', bad)
  }
})

const doc = xhtml(CHAPTER())
const para = doc.getElementById('para05')!
const [xxx, em, digits] = Array.from(para.childNodes)
const yyy = em.firstChild!
const BASE = spineSteps(6, 1, 'chap01ref')

test('resolve spec examples against the spec document', () => {
  const at = (cfi: string) => resolveCfi(doc, cfi)
  assert.deepEqual(at(SPEC[0]), { startContainer: digits, startOffset: 10, endContainer: digits, endOffset: 10 })
  const img = at(SPEC[1])
  assert.equal((img.startContainer.childNodes[img.startOffset] as Element).getAttribute('id'), 'svgimg')
  assert.equal(img.endOffset, img.startOffset + 1, 'element CFI selects the element')
  assert.deepEqual(at(SPEC[2]), { startContainer: xxx, startOffset: 0, endContainer: xxx, endOffset: 0 })
  assert.deepEqual(at(SPEC[3]), { startContainer: yyy, startOffset: 0, endContainer: yyy, endOffset: 0 })
  assert.deepEqual(at(SPEC[4]), { startContainer: yyy, startOffset: 3, endContainer: yyy, endOffset: 3 })
  assert.equal(at(SPEC[5]).startOffset, 3)
  assert.deepEqual(at(SPEC[6]), { startContainer: xxx, startOffset: 3, endContainer: xxx, endOffset: 3 }, 'assertion holds across the element boundary')
  assert.deepEqual(at(SPEC[10]), { startContainer: yyy, startOffset: 1, endContainer: digits, endOffset: 4 })
})

test('generate: spec strings from DOM positions, elements and ranges', () => {
  assert.equal(cfiFromPoint(digits, 10, { base: BASE }), SPEC[0])
  assert.equal(cfiFromElement(doc.getElementById('svgimg')!, { base: BASE }), SPEC[1])
  assert.equal(cfiFromPoint(xxx, 0, { base: BASE }), SPEC[2])
  assert.equal(cfiFromPoint(yyy, 0, { base: BASE }), SPEC[3])
  assert.equal(cfiFromPoint(yyy, 3, { base: BASE }), SPEC[4])
  assert.equal(cfiFromPoint(yyy, 3, { base: BASE, side: 'b' }), SPEC[9])
  assert.equal(cfiFromRange({ startContainer: yyy, startOffset: 1, endContainer: digits, endOffset: 4 }, { base: BASE }), SPEC[10])
  // element boundary points land in the adjacent character chunk
  assert.equal(cfiFromPoint(para, 0, { base: BASE }), SPEC[2])
  assert.equal(cfiFromPoint(para, 1, { base: BASE }), 'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/1:3)')
  assert.equal(cfiFromPoint(para, 3, { base: BASE }), SPEC[0])
  // same text node: parent ends at the common chunk; local paths are bare offsets
  assert.equal(cfiFromRange({ startContainer: digits, startOffset: 2, endContainer: digits, endOffset: 8 }), 'epubcfi(/4[body01]/10[para05]/3,:2,:8)')
  // collapsed range = location; text assertion
  assert.equal(cfiFromRange({ startContainer: yyy, startOffset: 3, endContainer: yyy, endOffset: 3 }, { base: BASE, assertText: 2 }), 'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3[yy,01])')
})

test('generate → resolve roundtrips every position in the document', () => {
  const nodes: Node[] = []
  const walk = (n: Node) => { for (let c = n.firstChild; c; c = c.nextSibling) { nodes.push(c); walk(c) } }
  walk(doc.documentElement)
  let checked = 0
  for (const n of nodes) {
    const max = n.nodeType === 3 ? (n as Text).length : n.nodeType === 1 ? n.childNodes.length : -1
    for (let o = 0; o <= max; o++) {
      const cfi = cfiFromPoint(n, o, { base: BASE })
      const b = resolveCfi(doc, cfi)
      assert.equal(cfiFromPoint(b.startContainer, b.startOffset, { base: BASE }), cfi)
      if (n.nodeType === 3) assert.deepEqual([b.startContainer, b.startOffset], [n, o])
      checked++
    }
  }
  assert.ok(checked > 100)
})

test('id assertion corrects a stale path', () => {
  const changed = xhtml(CHAPTER(undefined, '\n<p>inserted</p>'))
  const b = resolveCfi(changed, SPEC[0])
  assert.equal(b.startContainer.nodeValue, '0123456789')
  assert.equal(b.startOffset, 10)
})

test('text location assertion corrects a stale offset', () => {
  const changed = xhtml(CHAPTER('<p id="para05">xxx<em>yyy</em>--0123456789</p>'))
  const b = resolveCfi(changed, 'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/3:4[0123,4567])')
  assert.equal(b.startContainer.nodeValue, '--0123456789')
  assert.equal(b.startOffset, 6)
  // an assertion that holds is left alone; one that matches nowhere is ignored
  assert.equal(resolveCfi(doc, 'epubcfi(/6/4!/4/10/3:4[0123,4567])').startOffset, 4)
  assert.equal(resolveCfi(doc, 'epubcfi(/6/4!/4/10/3:4[nope,zzz])').startOffset, 4)
})

test('virtual first/last element indices and out-of-range offsets', () => {
  assert.deepEqual(resolveCfi(doc, 'epubcfi(/6/4!/4/10/0)').startOffset, 0)
  const last = resolveCfi(doc, 'epubcfi(/6/4!/4/10/4)') // para05 has one element child, so /4 = after the last chunk
  assert.equal(last.startContainer, para)
  assert.equal(last.startOffset, para.childNodes.length)
  assert.deepEqual([resolveCfi(doc, 'epubcfi(/6/4!/4/10/3:99)').startContainer, resolveCfi(doc, 'epubcfi(/6/4!/4/10/3:99)').startOffset], [digits, 10])
  for (const bad of ['epubcfi(/6/4!/4/99)', 'epubcfi(/6/4!/4/98)', 'epubcfi(/6/4!/4/10/6)']) {
    assert.throws(() => resolveCfi(doc, bad), (e: EpubError) => e.code === 'BAD_CFI', bad)
  }
})

test('compare and sort (document order, ranks, temporal/spatial, ranges)', () => {
  const ordered = [
    'epubcfi(/6/2!/4/2/1:0)',
    'epubcfi(/6/4)',
    'epubcfi(/6/4!/4/2)',
    'epubcfi(/6/4!/4/2:0)', // character offset ranks below a child step
    'epubcfi(/6/4!/4/2/1:0)',
    'epubcfi(/6/4!/4/10/1:0)',
    'epubcfi(/6/4!/4/10/1:3)',
    'epubcfi(/6/4!/4/10,/1:3,/2/1:1)',
    'epubcfi(/6/4!/4/10,/1:3,/3:1)',
    'epubcfi(/6/4!/4/10/2/1:0)',
    'epubcfi(/6/4!/4/10/2/1:3[yyy])',
    'epubcfi(/6/4!/4/10/3:10)',
    'epubcfi(/6/4!/4/16)',
    'epubcfi(/6/4!/4/16~1)',
    'epubcfi(/6/4!/4/16~1@90:10)',
    'epubcfi(/6/4!/4/16~1@10:20)', // y outranks x
    'epubcfi(/6/4!/4/16~2)',
    'epubcfi(/6/4!/4/16!/2)', // indirection ranks highest
    'epubcfi(/6/14[chap05ref]!/4[body01]/10/2/1:3[2^[1^]])',
  ]
  const shuffled = ordered.map((c, i) => [c, (i * 7) % ordered.length] as const).sort((a, b) => a[1] - b[1]).map(([c]) => c)
  assert.notDeepEqual(shuffled, ordered)
  assert.deepEqual(shuffled.sort(compareCfi), ordered)
  for (let i = 1; i < ordered.length; i++) assert.equal(compareCfi(ordered[i - 1], ordered[i]), -1, `${ordered[i - 1]} < ${ordered[i]}`)
  assert.equal(compareCfi('epubcfi(/6/4!/4/10/2/1:3[yyy])', 'epubcfi(/6/4[chap01ref]!/4/10/2/1:3)'), 0, 'assertions do not affect order')
  assert.equal(compareCfi(SPEC[10], 'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:1)'), 1, 'range sorts after its start location (by end)')
})

test('collapse and spine index', () => {
  assert.equal(stringifyCfi({ parent: collapse(SPEC[10]) }), 'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:1)')
  assert.equal(stringifyCfi({ parent: collapse(SPEC[10], true) }), 'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/3:4)')
  assert.equal(cfiSpineIndex(SPEC[0]), 1)
  assert.equal(cfiSpineIndex(SPEC[11]), 6)
  assert.equal(cfiSpineIndex('epubcfi(/4/2)'), undefined)
})

test('resolveCfi returns boundaries usable to build a DOM Range', () => {
  const b: Boundaries = resolveCfi(doc, SPEC[10])
  let text = ''
  let on = false
  const walk = (n: Node) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) {
        const v = c.nodeValue!
        const s = c === b.startContainer ? b.startOffset : 0
        if (c === b.startContainer) on = true
        if (on) text += v.slice(s, c === b.endContainer ? b.endOffset : v.length)
        if (c === b.endContainer) on = false
      } else walk(c)
    }
  }
  walk(doc.documentElement)
  assert.equal(text, 'yy0123')
})
