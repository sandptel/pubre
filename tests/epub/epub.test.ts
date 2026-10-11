import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { resolveObjectURL } from 'node:buffer'
import { Epub, EpubError } from '../../src/epub/index.ts'
import { Book } from '../../src/lib/epub.ts'
import { resolveCfi } from '../../src/epub/cfi.ts'
import { dom, epub, rawZip, xhtml } from './helpers.ts'
import { OPF2, OPF3, NCX, NAV } from './fixtures.ts'

const CONTAINER = (path = 'OEBPS/content.opf') => `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="${path}" media-type="application/oebps-package+xml"/></rootfiles>
</container>`

const page = (body: string, head = '') => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>t</title>${head}</head><body>${body}</body></html>`

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const read = (url: string) => resolveObjectURL(url)!.text()
const open = (bytes: Uint8Array) => Epub.open(bytes, dom)
const rejects = (p: Promise<unknown>, code: string, detail?: string) =>
  assert.rejects(p, (e: EpubError) => e instanceof EpubError && e.code === code && (detail === undefined || e.detail === detail))

test('EPUB 2-only book: NCX toc/page list, meta cover, calibre series', async () => {
  const book = await open(epub({
    'META-INF/container.xml': CONTAINER(),
    'OEBPS/content.opf': OPF2,
    'OEBPS/toc.ncx': NCX,
    'OEBPS/cover.png': PNG,
    'OEBPS/c1.html': page('<p id="s1">Hello</p>'),
  }))
  assert.equal(book.package.version, '2.0')
  assert.equal(book.metadata.title, 'Old Book')
  assert.equal(book.metadata.creator, 'Jane Austen')
  assert.equal(book.metadata.identifier, '0-306-40615-2')
  assert.deepEqual(book.series, { name: 'Novels', position: 3, positionRaw: '3' })
  assert.deepEqual(book.toc.map(t => t.label), ['Chapter 1', 'Chapter 2'])
  assert.equal(book.toc[0].children[0].href, 'OEBPS/c1.html#s1')
  assert.deepEqual(book.pageList.map(p => p.label), ['i', '2'])
  assert.equal(book.ncx?.title, 'Old Book')
  assert.equal(book.cover, 'OEBPS/cover.png')
  const blob = (await book.coverBlob())!
  assert.equal(blob.type, 'image/png')
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), PNG)
  assert.deepEqual(book.spine.map(s => [s.href, s.linear, s.size > 1]), [['OEBPS/c1.html', true, true]])
  assert.deepEqual(book.warnings, [])
})

function epub3Files(): Record<string, string | Uint8Array> {
  return {
    'META-INF/container.xml': CONTAINER(),
    'OEBPS/content.opf': OPF3,
    'OEBPS/nav.xhtml': NAV,
    'OEBPS/images/Cover Art.jpg': PNG,
    'OEBPS/text/ch1.xhtml': page('<p id="w1">One <a epub:type="noteref" href="#n1">1</a></p><p id="w2">Two</p><img src="../images/Cover%20Art.jpg" alt=""/><script>alert(1)</script><aside epub:type="footnote" id="n1">Note</aside>', '<link rel="stylesheet" href="../style.css"/>'),
    'OEBPS/style.css': 'body { background: url("images/Cover Art.jpg") }',
    'OEBPS/smil/ch1.smil': '<smil xmlns="http://www.w3.org/ns/SMIL" version="3.0"><body><par id="p1"><text src="../text/ch1.xhtml#w1"/><audio src="../audio/a.mp3" clipBegin="0s" clipEnd="1.5s"/></par><par><text src="../text/ch1.xhtml#w2"/><audio src="../audio/a.mp3" clipBegin="1.5s" clipEnd="3s"/></par></body></smil>',
    'OEBPS/text/ch2.xhtml': page('<p>Two</p>'),
    'OEBPS/extra/doc.pdf': '%PDF',
    'OEBPS/extra/doc.xhtml': page('<p>PDF fallback</p>'),
  }
}

test('EPUB 3 book: nav, page list, landmarks, cover-image, rendition, overlays, accessibility', async () => {
  const book = await open(epub(epub3Files()))
  assert.equal(book.opfPath, 'OEBPS/content.opf')
  assert.equal(book.metadata.title, 'The Main Title')
  assert.deepEqual(book.toc.map(t => t.label), ['Chapter One', 'Part II', 'Pictured Chapter', 'Titled'])
  assert.deepEqual(book.pageList.map(p => p.href), ['OEBPS/text/ch1.xhtml#p1', 'OEBPS/text/ch1.xhtml#pii'])
  assert.deepEqual(book.landmarks.map(l => l.type), [['cover'], ['bodymatter']])
  assert.deepEqual(book.navLists.map(l => l.types[0]), ['toc', 'page-list', 'landmarks', 'loi', 'lot'])
  assert.equal(book.cover, 'OEBPS/images/Cover Art.jpg')
  assert.equal(book.rtl, true)
  assert.equal(book.fixedLayout, true)
  assert.equal(book.spine[0].rendition.layout, 'reflowable')
  assert.equal(book.spine.length, 3)
  assert.equal(book.spine[2].href, 'OEBPS/extra/doc.xhtml')
  assert.deepEqual(book.accessibility.features, ['structuralNavigation', 'alternativeText'])
  assert.equal(book.series?.name, 'The Great Saga')
  assert.deepEqual(book.overlays, [{ index: 0, href: 'OEBPS/text/ch1.xhtml', smil: 'OEBPS/smil/ch1.smil', duration: 890.5 }])
  const overlay = (await book.mediaOverlay(0))!
  assert.deepEqual(overlay.timelines.get('OEBPS/text/ch1.xhtml')!.map(e => [e.fragment, e.start, e.end]), [['w1', 0, 1.5], ['w2', 1.5, 3]])
  assert.equal(book.mediaOverlay(1), undefined)
  assert.ok(book.warnings.some(w => /missing/.test(w)))
  book.destroy()
})

test('chapter loading through the aggregate: sanitized, rewritten, case-insensitive', async () => {
  const book = await open(epub(epub3Files()))
  const out = await read(await book.chapterUrl(0))
  assert.ok(!out.includes('<script'))
  assert.match(out, /Content-Security-Policy/)
  const css = await read(/<link rel="stylesheet" href="(blob:[^"]+)"/.exec(out)![1])
  assert.match(css, /url\("blob:/)
  assert.equal(book.resolveHref('OEBPS/text/ch1.xhtml', '../TEXT/CH2.XHTML#x'), 'OEBPS/text/ch2.xhtml#x')
  assert.equal(book.spineIndex('OEBPS/text/ch2.xhtml#x'), 1)
  assert.equal(book.spineIndex('oebps/text/CH2.xhtml'), 1)
  assert.equal(book.spineIndex('nope.xhtml'), -1)
  assert.equal(book.mediaType('OEBPS/style.css'), 'text/css')
  assert.equal(await book.text('OEBPS/extra/doc.pdf'), '%PDF')
  book.destroy()
})

test('CFI through the aggregate: generate for a spine item, find the item again, resolve', async () => {
  const book = await open(epub(epub3Files()))
  const doc = xhtml(await book.text(book.spine[0].href))
  const w2 = doc.getElementById('w2')!.firstChild!
  const cfi = book.cfi(0, { startContainer: w2, startOffset: 1, endContainer: w2, endOffset: 3 })
  assert.equal(cfi, 'epubcfi(/6/2[ch1ref]!/4/4[w2]/1,:1,:3)')
  assert.equal(book.cfiAt(1, doc.getElementById('w1')!, 0), 'epubcfi(/6/6!/4/2[w1]/1:0)', 'itemref step counts the skipped itemref')
  assert.equal(book.cfiSpineIndex(cfi), 0)
  assert.equal(book.cfiSpineIndex('epubcfi(/6/6!/4/2/1:0)'), 1)
  assert.equal(book.cfiSpineIndex('epubcfi(/6/99[ch1ref]!/4)'), 0, 'id assertion wins')
  const b = resolveCfi(doc, cfi)
  assert.equal(b.startContainer.nodeValue!.slice(b.startOffset, b.endOffset), 'wo')
})

test('obfuscated fonts round-trip (IDPF and Adobe)', async () => {
  const uid = 'urn:uuid:00112233-4455-6677-8899-aabbccddeeff'
  const font = new Uint8Array(4096).map((_, i) => (i * 31 + 7) & 0xff)
  const idpfKey = createHash('sha1').update(uid).digest()
  const adobeKey = Buffer.from('00112233445566778899aabbccddeeff', 'hex')
  const xor = (key: Uint8Array, n: number) => font.map((b, i) => (i < n ? b ^ key[i % key.length] : b))
  const opf = `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">  ${uid} </dc:identifier><dc:title>F</dc:title></metadata>
    <manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/><item id="f1" href="fonts/a.otf" media-type="font/otf"/><item id="f2" href="fonts/b.ttf" media-type="font/ttf"/></manifest>
    <spine><itemref idref="c"/></spine></package>`
  const enc = `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
    <enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><enc:CipherData><enc:CipherReference URI="OEBPS/fonts/a.otf"/></enc:CipherData></enc:EncryptedData>
    <enc:EncryptedData><enc:EncryptionMethod Algorithm="http://ns.adobe.com/pdf/enc#RC"/><enc:CipherData><enc:CipherReference URI="OEBPS/fonts/b.ttf"/></enc:CipherData></enc:EncryptedData>
  </encryption>`
  const book = await open(epub({
    'META-INF/container.xml': CONTAINER(),
    'META-INF/encryption.xml': enc,
    'OEBPS/content.opf': opf,
    'OEBPS/c.xhtml': page('<p>x</p>'),
    'OEBPS/fonts/a.otf': xor(idpfKey, 1040),
    'OEBPS/fonts/b.ttf': xor(adobeKey, 1024),
  }))
  assert.deepEqual(await book.bytes('OEBPS/fonts/a.otf'), font)
  assert.deepEqual(await book.bytes('OEBPS/fonts/b.ttf'), font)
  assert.notDeepEqual(await book.zip.bytes('OEBPS/fonts/a.otf'), font)
})

const minimal = (extra: Record<string, string | Uint8Array> = {}): Record<string, string | Uint8Array> => ({
  'META-INF/container.xml': CONTAINER(),
  'OEBPS/content.opf': `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>M</dc:title></metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>`,
  'OEBPS/c.xhtml': page('<p>x</p>'),
  ...extra,
})

test('DRM detection raises typed errors', async () => {
  await rejects(open(epub(minimal({ 'META-INF/rights.xml': '<rights xmlns="http://ns.adobe.com/adept"/>' }))), 'DRM', 'adobe-adept')
  await rejects(open(epub(minimal({ 'META-INF/license.lcpl': '{}' }))), 'DRM', 'lcp')
  await rejects(open(epub(minimal({ 'META-INF/sinf.xml': '<sinf/>' }))), 'DRM', 'apple-fairplay')
  await rejects(open(epub(minimal({
    'META-INF/encryption.xml': '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><enc:CipherData><enc:CipherReference URI="OEBPS/c.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>',
  }))), 'DRM', 'unknown')
})

test('structural errors are typed', async () => {
  await rejects(open(new TextEncoder().encode('not a zip at all, sorry')), 'NOT_ZIP')
  await rejects(open(epub({ 'OEBPS/c.xhtml': 'x' })), 'NO_CONTAINER')
  await rejects(open(epub({ 'META-INF/container.xml': CONTAINER('nope.opf') })), 'NO_OPF')
  await rejects(open(epub({ 'META-INF/container.xml': CONTAINER(), 'OEBPS/content.opf': '<<<not xml' })), 'BAD_OPF')
  await rejects(open(epub(minimal({ 'OEBPS/content.opf': '<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest/><spine/></package>' }))), 'EMPTY_SPINE')
  await rejects(open(epub(minimal())).then(b => b.bytes('missing.png')), 'MISSING_RESOURCE')
})

test('real-world damage: no container, no mimetype, wrong case, malformed chapter, missing TOC', async () => {
  const files = minimal({
    'OEBPS/content.opf': `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>Broken &amp; Fine</dc:title></metadata>
      <manifest><item id="c" href="Text/C.XHTML" media-type="application/xhtml+xml"/><item id="i" href="img.png" media-type="image/png"/></manifest><spine><itemref idref="c"/></spine></package>`,
    'OEBPS/text/c.xhtml': '<html><head></head><body><p>one<br>two<img src="../IMG.png"></p></body></html>',
    'OEBPS/img.png': PNG,
  })
  delete files['OEBPS/c.xhtml']
  delete files['META-INF/container.xml']
  const book = await open(epub(files, { mimetype: null }))
  assert.equal(book.metadata.title, 'Broken & Fine')
  assert.equal(book.spine[0].href, 'OEBPS/text/c.xhtml')
  assert.deepEqual(book.toc, [{ label: 'Section 1', href: 'OEBPS/text/c.xhtml', children: [] }])
  assert.ok(book.warnings.includes('mimetype file missing'))
  assert.ok(book.warnings.some(w => /container\.xml missing/.test(w)))
  const out = await read(await book.chapterUrl(0))
  assert.ok(out.startsWith('<!DOCTYPE html>'), 'served as HTML after XHTML parse failure')
  assert.match(out, /<img src="blob:/)
})

test('ZIP64 container end to end', async () => {
  const files = Object.entries(minimal()).map(([name, data]) => ({ name, data }))
  const book = await open(rawZip([{ name: 'mimetype', data: 'application/epub+zip' }, ...files], { zip64: true }))
  assert.equal(book.metadata.title, 'M')
  assert.deepEqual(book.warnings, ['No table of contents; using the spine'])
})

test('app adapter: Book is the Epub aggregate; no DOM → typed error', async () => {
  assert.equal(Book, Epub)
  const bytes = epub(minimal())
  await rejects(Book.open(bytes), 'NO_DOM')
  const book = await Book.open(bytes, dom)
  assert.equal(book.metadata.title, 'M')
  assert.equal(await book.zip.text('OEBPS/c.xhtml'), page('<p>x</p>'))
})
