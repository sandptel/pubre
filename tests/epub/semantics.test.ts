import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, semanticsOf, collectSemantics, epubTypes } from '../../src/epub/semantics.ts'
import { xhtml, parseXml } from './helpers.ts'

const doc = xhtml(`<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
<section epub:type="bodymatter chapter" id="c1">
  <p>Text<a epub:type="noteref" href="#n1">1</a> and <a role="doc-noteref" href="notes.xhtml#n2">2</a></p>
  <span epub:type="pagebreak" id="p7" title="7"/>
  <div role="doc-pagebreak" aria-label="viii"/>
  <blockquote epub:type="epigraph">Quote</blockquote>
  <aside epub:type="footnote" id="n1">Note</aside>
  <aside epub:type="rearnote" id="n3">Legacy</aside>
  <aside role="doc-endnote" id="n4">End</aside>
  <dl epub:type="glossary"/>
  <p epub:type="z3998:poem">x</p>
</section></body></html>`)

const byId = (id: string) => doc.getElementById(id)!

test('classify normalizes epub:type and DPUB-ARIA roles, most specific wins', () => {
  assert.equal(classify(byId('c1')), 'chapter')
  assert.deepEqual(semanticsOf(byId('c1')), ['bodymatter', 'chapter'])
  assert.equal(classify(byId('n1')), 'footnote')
  assert.equal(classify(byId('n3')), 'endnote')
  assert.equal(classify(byId('n4')), 'endnote')
  assert.deepEqual(epubTypes(byId('p7')), ['pagebreak'])
})

test('collectSemantics: noterefs, notes, page breaks, sections', () => {
  const s = collectSemantics(doc)
  assert.deepEqual(s.noterefs.map(n => n.target), ['n1', 'n2'])
  assert.deepEqual(s.notes.map(n => [n.id, n.kind]), [['n1', 'footnote'], ['n3', 'endnote'], ['n4', 'endnote']])
  assert.deepEqual(s.pagebreaks.map(p => p.label), ['7', 'viii'])
  assert.deepEqual(s.sections.map(x => x.kind), ['chapter', 'epigraph', 'glossary'])
})

test('epub:type in HTML-parsed documents (plain "epub:type" attribute, no namespace)', () => {
  const html = parseXml('<html><body><aside id="f">x</aside></body></html>', 'text/html')!
  const aside = html.getElementsByTagName('aside')[0]
  aside.setAttribute('epub:type', 'footnote') // what the HTML parser produces
  assert.equal(classify(aside), 'footnote')
})
