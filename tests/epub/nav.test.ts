import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNav } from '../../src/epub/nav.ts'
import { xhtml, parseXml } from './helpers.ts'

const NAV = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Nav</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
      <li><a href="text/ch1.xhtml">Chapter
        <em>One</em></a></li>
      <li><span>Part II</span>
        <ol>
          <li><a href="text/ch2.xhtml#s1">Section 2.1</a></li>
          <li hidden=""><a href="text/ch2.xhtml#s2">Hidden 2.2</a></li>
        </ol>
      </li>
      <li><a href="text/ch3.xhtml"><img src="x.png" alt="Pictured Chapter"/></a></li>
      <li><a href="text/ch4.xhtml" title="Titled"> </a></li>
    </ol>
  </nav>
  <nav epub:type="page-list" hidden="">
    <ol><li><a href="text/ch1.xhtml#p1">1</a></li><li><a href="text/ch1.xhtml#pii">ii</a></li></ol>
  </nav>
  <nav epub:type="landmarks">
    <h2>Guide</h2>
    <ol>
      <li><a epub:type="cover" href="cover.xhtml">Cover</a></li>
      <li><a epub:type="bodymatter" href="text/ch1.xhtml">Start</a></li>
    </ol>
  </nav>
  <nav epub:type="loi"><ol><li><a href="text/ch1.xhtml#fig1">Figure 1</a></li></ol></nav>
  <nav role="doc-toc" aria-label="lot" epub:type="lot"><div><ul><li><a href="text/ch2.xhtml#t1">Table 1</a></li></ul></div></nav>
</body></html>`

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
