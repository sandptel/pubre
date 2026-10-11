import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePackage } from '../../src/epub/package.ts'
import { repairXml, parseLenient } from '../../src/epub/xml.ts'
import { xml, parseXml } from './helpers.ts'
import { OPF2, OPF3 } from './fixtures.ts'


test('EPUB 3 metadata: titles, creators, refines chains', () => {
  const p = parsePackage(xml(OPF3), 'OEBPS/content.opf')
  const m = p.metadata
  assert.equal(p.version, '3.0')
  assert.equal(p.lang, 'en')
  assert.equal(p.dir, 'ltr')
  assert.equal(p.prefixes.calibre, 'https://calibre-ebook.com')
  assert.equal(m.title, 'The Main Title')
  assert.equal(m.subtitle, 'The Subtitle Part')
  assert.deepEqual(m.titles.map(t => t.type), ['main', 'subtitle'])
  assert.equal(m.titles[0].fileAs, 'Main Title, The')
  assert.deepEqual(m.titles[0].alternateScripts, [{ value: '主題', lang: 'ja' }])
  assert.equal(m.creator, 'Jane Doe, John Roe')
  assert.deepEqual(m.creators[0], { name: 'Jane Doe', id: 'c1', lang: 'en', fileAs: 'Doe, Jane', roles: ['aut'], displaySeq: 1, alternateScripts: [{ value: 'ジェーン', lang: 'ja' }] })
  assert.deepEqual(m.creators[1].roles, ['ill'])
  assert.deepEqual(m.contributors.map(c => [c.name, c.roles]), [['Tess Translator', ['trl']]])
  // refines chain: meta-auth refines the role meta, which refines the creator
  const c1 = m.all.find(n => n.id === 'c1')!
  const role = c1.refinements.find(r => r.property === 'role')!
  assert.deepEqual(role.refinements.map(r => [r.property, r.value]), [['meta-auth', 'marc']])
  assert.equal(role.scheme, 'marc:relators')
})

test('EPUB 3 metadata: identifiers, dates, subjects, rights, collections/series', () => {
  const m = parsePackage(xml(OPF3), 'OEBPS/content.opf').metadata
  assert.equal(m.identifier, 'urn:uuid:12345678-1234-1234-1234-1234567890ab')
  assert.deepEqual(m.identifiers[1], { value: '9780316769488', id: 'isbn', scheme: 'onix:codelist5', type: '15' })
  assert.equal(m.isbn, '9780316769488')
  assert.deepEqual(m.languages, ['en', 'fr'])
  assert.equal(m.language, 'en')
  assert.equal(m.published, '2021-05-01')
  assert.equal(m.modified, '2024-01-02T03:04:05Z')
  assert.deepEqual(m.subjects, [{ value: 'Fiction', authority: 'BISAC', term: 'FIC000000' }, { value: 'Adventure', authority: undefined, term: undefined }])
  assert.equal(m.rights, 'All rights reserved')
  assert.deepEqual(m.sources, ['urn:isbn:9780000000001'])
  assert.equal(m.description, 'A story.')
  assert.deepEqual(m.types, ['Text'])
  assert.equal(m.publisher, 'Pub House')
  assert.equal(m.collections.length, 1)
  assert.deepEqual(m.collections[0], {
    name: 'The Great Saga', id: 'col1', type: 'series', position: '2.5', identifier: 'urn:saga', fileAs: undefined,
    collections: [{ name: 'Saga Universe', id: 'col2', type: 'set', position: undefined, identifier: undefined, fileAs: undefined, collections: [] }],
  })
  assert.deepEqual(m.series, { name: 'The Great Saga', position: 2.5, positionRaw: '2.5' })
})

test('EPUB 3 metadata: accessibility, media overlays, links', () => {
  const m = parsePackage(xml(OPF3), 'OEBPS/content.opf').metadata
  assert.deepEqual(m.accessibility.accessModes, ['textual', 'visual'])
  assert.deepEqual(m.accessibility.accessModesSufficient, [['textual'], ['textual', 'visual']])
  assert.deepEqual(m.accessibility.features, ['structuralNavigation', 'alternativeText'])
  assert.deepEqual(m.accessibility.hazards, ['none'])
  assert.equal(m.accessibility.summary, 'Fully accessible.')
  assert.deepEqual(m.accessibility.conformsTo, ['EPUB Accessibility 1.1 - WCAG 2.1 Level AA'])
  assert.equal(m.accessibility.certifiedBy, 'Cert Org')
  assert.equal(m.accessibility.certifierReport, 'OEBPS/report.html')
  assert.deepEqual(m.media, { duration: 1949, narrators: ['Nora Narrator'], activeClass: '-epub-media-overlay-active', playbackActiveClass: 'playing' })
  assert.deepEqual(m.links.find(l => l.rel.includes('record'))?.href, 'OEBPS/meta/record.xml')
})

test('EPUB 3 manifest, spine, rendition overrides, guide', () => {
  const p = parsePackage(xml(OPF3), 'OEBPS/content.opf')
  assert.deepEqual(p.rendition, { layout: 'pre-paginated', orientation: 'landscape', spread: 'both', flow: 'paginated', viewport: { width: 1200, height: 1600 } })
  const cover = p.manifest.get('cover')!
  assert.equal(cover.href, 'OEBPS/images/Cover Art.jpg')
  assert.equal(cover.rawHref, 'images/Cover%20Art.jpg')
  assert.ok(cover.properties.has('cover-image'))
  assert.equal(p.manifest.get('ch1_audio')!.duration, 890.5)
  assert.equal(p.manifest.get('ch2')!.href, 'OEBPS/text/ch2.xhtml', 'duplicate id ignored')
  assert.ok(p.warnings.some(w => /Duplicate/.test(w)))
  assert.ok(p.warnings.some(w => /missing/.test(w)))
  assert.equal(p.pageProgressionDirection, 'rtl')
  assert.equal(p.tocId, 'ncx')
  assert.equal(p.spineCfiStep, 6)
  assert.equal(p.spine.length, 3)
  const [s1, s2, s3] = p.spine
  assert.equal(s1.id, 'ch1ref')
  assert.equal(s1.cfiStep, 2)
  assert.equal(s1.pageSpread, 'right')
  assert.equal(s1.rendition.layout, 'reflowable')
  assert.equal(s1.rendition.flow, 'scrolled-doc')
  assert.equal(s1.rendition.orientation, 'landscape', 'inherits global')
  assert.equal(s1.mediaOverlay, 'OEBPS/smil/ch1.smil')
  assert.equal(s2.cfiStep, 6, 'counts the skipped itemref')
  assert.equal(s2.linear, false)
  assert.equal(s2.pageSpread, 'center')
  assert.equal(s2.rendition.spread, 'none')
  assert.equal(s2.rendition.orientation, 'portrait')
  assert.equal(s2.alignXCenter, true)
  assert.equal(s3.item.id, 'pdf')
  assert.equal(s3.href, 'OEBPS/extra/doc.xhtml', 'non-content spine item renders its fallback')
  assert.equal(s3.mediaType, 'application/xhtml+xml')
  assert.equal(s3.pageSpread, 'left')
  assert.deepEqual(p.guide, [{ type: 'cover', title: 'Cover', href: 'OEBPS/text/ch1.xhtml#top' }])
})


test('EPUB 2: opf:role / opf:file-as / opf:scheme / opf:event, calibre series, meta name/content', () => {
  const p = parsePackage(xml(OPF2), 'content.opf')
  const m = p.metadata
  assert.equal(p.version, '2.0')
  assert.deepEqual(m.creators[0], { name: 'Jane Austen', id: undefined, lang: undefined, fileAs: 'Austen, Jane', roles: ['aut'], displaySeq: undefined, alternateScripts: [] })
  assert.deepEqual(m.contributors[0].roles, ['edt'])
  assert.deepEqual(m.identifiers[0], { value: '0-306-40615-2', id: 'BookId', scheme: 'ISBN', type: undefined })
  assert.equal(m.isbn, '0306406152')
  assert.equal(m.published, '1813')
  assert.equal(m.modified, '2010-01-01')
  assert.deepEqual(m.series, { name: 'Novels', position: 3, positionRaw: '3' })
  assert.deepEqual(m.accessibility.accessModes, ['textual'])
  assert.equal(m.all.find(n => n.property === 'cover')?.value, 'cover-img')
  assert.deepEqual(p.rendition, { layout: 'reflowable', orientation: 'auto', spread: 'auto', flow: 'auto' })
  assert.equal(p.pageProgressionDirection, 'default')
})

test('malformed OPF: BOM/whitespace before the declaration, bare ampersands, HTML entities', () => {
  const opf = '\uFEFF\n  <?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Tom &amp; Jerry & Friends &eacute;t&eacute;&nbsp;&bogus;</dc:title><dc:identifier id="id">x</dc:identifier></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>'
  assert.equal(repairXml('&amp; & &eacute; &#233; &#xe9; &bogus; &lt;'), '&amp; &amp; &#233; &#233; &#xe9; &amp;bogus; &lt;')
  const doc = parseLenient(parseXml, opf)!
  const p = parsePackage(doc, 'x.opf')
  assert.equal(p.metadata.title, 'Tom & Jerry & Friends été &bogus;')
  assert.equal(p.spine[0].href, 'a.xhtml')
})
