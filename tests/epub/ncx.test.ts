import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNcx } from '../../src/epub/ncx.ts'
import { xml } from './helpers.ts'
import { NCX } from './fixtures.ts'

test('NCX: navMap with playOrder and nesting, pageList, navList, head', () => {
  const n = parseNcx(xml(NCX), 'OEBPS/toc.ncx')
  assert.equal(n.title, 'Old Book')
  assert.deepEqual(n.authors, ['Jane Austen'])
  assert.equal(n.uid, 'urn:uuid:abc')
  assert.deepEqual(n.toc.map(t => [t.label, t.href, t.playOrder, t.kind]), [
    ['Chapter 1', 'OEBPS/c1.html', 1, 'chapter'],
    ['Chapter 2', 'OEBPS/sub/c2.html', 3, undefined],
  ])
  assert.deepEqual(n.toc[0].children.map(t => [t.label, t.href, t.id]), [['Section 1.1', 'OEBPS/c1.html#s1', 'np2']])
  assert.deepEqual(n.pageList.map(p => [p.label, p.href, p.kind, p.value, p.playOrder]), [
    ['i', 'OEBPS/c1.html#pi', 'front', '1', 4],
    ['2', 'OEBPS/c1.html#p2', 'normal', '2', 5],
  ])
  assert.deepEqual(n.navLists.map(l => [l.label, l.items.map(i => i.label)]), [['Tables', ['Table 1']]])
})

test('NCX without navMap', () => {
  const n = parseNcx(xml('<ncx><docTitle><text/></docTitle></ncx>'), 'toc.ncx')
  assert.deepEqual([n.toc, n.pageList, n.navLists, n.title], [[], [], [], undefined])
})
