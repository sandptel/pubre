import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseContainer, checkMimetype } from '../../src/epub/container.ts'
import { xml } from './helpers.ts'

test('multiple renditions: default is the first OPF rootfile; selection attributes kept', () => {
  const c = parseContainer(xml(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:rendition="http://www.idpf.org/2013/rendition">
  <rootfiles>
    <rootfile full-path="other/thing.pdf" media-type="application/pdf"/>
    <rootfile full-path="EPUB/fixed%20layout.opf" media-type="application/oebps-package+xml" rendition:layout="pre-paginated" rendition:label="Fixed"/>
    <rootfile full-path="EPUB/reflow.opf" media-type="application/oebps-package+xml" rendition:media="(min-width: 600px)" rendition:accessMode="textual"/>
  </rootfiles>
  <links><link href="EPUB/mapping.xhtml" rel="mapping" media-type="application/xhtml+xml"/></links>
</container>`))
  assert.equal(c.rootfiles.length, 3)
  assert.equal(c.rootfile?.fullPath, 'EPUB/fixed layout.opf')
  assert.deepEqual(c.rootfiles[1].selection, { layout: 'pre-paginated', label: 'Fixed' })
  assert.deepEqual(c.rootfiles[2].selection, { media: '(min-width: 600px)', accessMode: 'textual' })
  assert.deepEqual(c.links, [{ href: 'EPUB/mapping.xhtml', rel: 'mapping', mediaType: 'application/xhtml+xml' }])
})

test('rootfile without media-type still found; empty container yields none', () => {
  assert.equal(parseContainer(xml('<container><rootfiles><rootfile full-path="/a/b.opf"/></rootfiles></container>')).rootfile?.fullPath, 'a/b.opf')
  assert.equal(parseContainer(xml('<container/>')).rootfile, undefined)
})

test('mimetype checks warn, never fail', () => {
  assert.deepEqual(checkMimetype({ name: 'mimetype', method: 0, offset: 0 }, 'application/epub+zip'), [])
  assert.equal(checkMimetype(undefined, undefined).length, 1)
  assert.equal(checkMimetype({ name: 'mimetype', method: 8, offset: 120 }, 'application/epub+zip\n').length, 3)
  assert.match(checkMimetype({ name: 'mimetype', method: 0, offset: 0 }, 'application/zip')[0], /expected/)
})
