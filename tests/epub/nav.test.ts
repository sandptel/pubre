import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNav } from '../../src/epub/nav.ts'
import { xhtml, parseXml } from './helpers.ts'
import { NAV } from './fixtures.ts'

test('EPUB 3 nav: toc (nested, span headings, hidden, image labels), page-list, landmarks, other navs', () => {
  const nav = parseNav(xhtml(NAV), 'OEBPS/nav.xhtml')
  assert.deepEqual(nav.toc.map(t => t.label), ['Chapter One', 'Part II', 'Pictured Chapter', 'Titled'])
  assert.equal(nav.toc[0].href, 'OEBPS/text/ch1.xhtml')
  assert.equal(nav.toc[1].href, '', 'span heading is unlinked')
  assert.deepEqual(nav.toc[1].children.map(c => [c.label, c.href, c.hidden]), [
    ['Section 2.1', 'OEBPS/text/ch2.xhtml#s1', undefined],
    ['Hidden 2.2', 'OEBPS/text/ch2.xhtml#s2', true],
  ])
  assert.deepEqual(nav.pageList.map(p => [p.label, p.href]), [['1', 'OEBPS/text/ch1.xhtml#p1'], ['ii', 'OEBPS/text/ch1.xhtml#pii']])
  assert.deepEqual(nav.landmarks.map(l => [l.label, l.type]), [['Cover', ['cover']], ['Start', ['bodymatter']]])
  assert.equal(nav.lists.length, 5)
  assert.equal(nav.lists[0].title, 'Contents')
  assert.equal(nav.lists[1].hidden, true)
  assert.deepEqual(nav.lists.map(l => l.types[0]), ['toc', 'page-list', 'landmarks', 'loi', 'lot'])
  assert.deepEqual(nav.lists[4].items.map(i => i.label), ['Table 1'], 'list found inside wrapper div')
})

test('nav without epub:type falls back to the first untyped nav; malformed list nesting tolerated', () => {
  const doc = parseXml(`<html><body><nav><ol>
    <li><a href="a.xhtml">A</a></li>
    <ol><li><a href="a.xhtml#x">A.x</a></li></ol>
    <li><a href="b.xhtml">B</a></li>
  </ol></nav></body></html>`, 'text/html')!
  const nav = parseNav(doc, 'nav.xhtml')
  assert.deepEqual(nav.toc.map(t => [t.label, t.children.map(c => c.label)]), [['A', ['A.x']], ['B', []]])
})
