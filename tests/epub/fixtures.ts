// Shared package documents for the OPF and end-to-end tests.

export const OPF3 = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en" dir="ltr"
  prefix="a11y: http://www.idpf.org/epub/vocab/package/a11y/#  calibre: https://calibre-ebook.com">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:12345678-1234-1234-1234-1234567890ab</dc:identifier>
    <dc:identifier id="isbn">9780316769488</dc:identifier>
    <meta refines="#isbn" property="identifier-type" scheme="onix:codelist5">15</meta>
    <dc:title id="t1">The Subtitle Part</dc:title>
    <meta refines="#t1" property="title-type">subtitle</meta>
    <meta refines="#t1" property="display-seq">2</meta>
    <dc:title id="t2">The Main Title</dc:title>
    <meta refines="#t2" property="title-type">main</meta>
    <meta refines="#t2" property="display-seq">1</meta>
    <meta refines="#t2" property="file-as">Main Title, The</meta>
    <meta refines="#t2" property="alternate-script" xml:lang="ja">主題</meta>
    <dc:creator id="c2">John Roe</dc:creator>
    <meta refines="#c2" property="display-seq">2</meta>
    <meta refines="#c2" property="role" scheme="marc:relators">ill</meta>
    <dc:creator id="c1">Jane Doe</dc:creator>
    <meta refines="#c1" property="role" scheme="marc:relators" id="r1">aut</meta>
    <meta refines="#c1" property="file-as">Doe, Jane</meta>
    <meta refines="#c1" property="display-seq">1</meta>
    <meta refines="#c1" property="alternate-script" xml:lang="ja">ジェーン</meta>
    <meta refines="#r1" property="meta-auth">marc</meta>
    <dc:contributor id="trl">Tess Translator</dc:contributor>
    <meta refines="#trl" property="role" scheme="marc:relators">trl</meta>
    <dc:language>en</dc:language>
    <dc:language>fr</dc:language>
    <dc:publisher>Pub House</dc:publisher>
    <dc:date>2021-05-01</dc:date>
    <meta property="dcterms:modified">2024-01-02T03:04:05Z</meta>
    <dc:subject id="s1">Fiction</dc:subject>
    <meta refines="#s1" property="authority">BISAC</meta>
    <meta refines="#s1" property="term">FIC000000</meta>
    <dc:subject>Adventure</dc:subject>
    <dc:rights>All rights reserved</dc:rights>
    <dc:source>urn:isbn:9780000000001</dc:source>
    <dc:description>  A   story. </dc:description>
    <dc:type>Text</dc:type>
    <meta property="belongs-to-collection" id="col1">The Great Saga</meta>
    <meta refines="#col1" property="collection-type">series</meta>
    <meta refines="#col1" property="group-position">2.5</meta>
    <meta refines="#col1" property="dcterms:identifier">urn:saga</meta>
    <meta property="belongs-to-collection" id="col2" refines="#col1">Saga Universe</meta>
    <meta refines="#col2" property="collection-type">set</meta>
    <meta property="schema:accessMode">textual</meta>
    <meta property="schema:accessMode">visual</meta>
    <meta property="schema:accessModeSufficient">textual</meta>
    <meta property="schema:accessModeSufficient">textual,visual</meta>
    <meta property="schema:accessibilityFeature">structuralNavigation</meta>
    <meta property="schema:accessibilityFeature">alternativeText</meta>
    <meta property="schema:accessibilityHazard">none</meta>
    <meta property="schema:accessibilitySummary">Fully accessible.</meta>
    <meta property="dcterms:conformsTo">EPUB Accessibility 1.1 - WCAG 2.1 Level AA</meta>
    <meta property="a11y:certifiedBy">Cert Org</meta>
    <link rel="a11y:certifierReport" href="report.html"/>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:orientation">landscape</meta>
    <meta property="rendition:spread">portrait</meta>
    <meta property="rendition:flow">paginated</meta>
    <meta property="rendition:viewport">width=1200, height=1600</meta>
    <meta property="media:duration">0:32:29</meta>
    <meta property="media:duration" refines="#ch1_audio">0:14:50.5</meta>
    <meta property="media:narrator">Nora Narrator</meta>
    <meta property="media:active-class">-epub-media-overlay-active</meta>
    <meta property="media:playback-active-class">playing</meta>
    <link rel="record" href="meta/record.xml" media-type="application/marc"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover" href="images/Cover%20Art.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml" media-overlay="ch1_audio" properties="scripted svg"/>
    <item id="ch1_audio" href="smil/ch1.smil" media-type="application/smil+xml"/>
    <item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="pdf" href="extra/doc.pdf" media-type="application/pdf" fallback="pdfalt"/>
    <item id="pdfalt" href="extra/doc.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="dup.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine page-progression-direction="rtl" toc="ncx">
    <itemref idref="ch1" id="ch1ref" properties="page-spread-right rendition:layout-reflowable rendition:flow-scrolled-doc"/>
    <itemref idref="missing"/>
    <itemref idref="ch2" linear="no" properties="rendition:page-spread-center rendition:spread-none rendition:orientation-portrait rendition:align-x-center"/>
    <itemref idref="pdf" properties="page-spread-left"/>
  </spine>
  <guide><reference type="cover" title="Cover" href="text/ch1.xhtml#top"/></guide>
</package>`

export const OPF2 = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>Old Book</dc:title>
    <dc:creator opf:role="aut" opf:file-as="Austen, Jane">Jane Austen</dc:creator>
    <dc:contributor opf:role="edt">Ed Itor</dc:contributor>
    <dc:identifier id="BookId" opf:scheme="ISBN">0-306-40615-2</dc:identifier>
    <dc:language>en-GB</dc:language>
    <dc:date opf:event="modification">2010-01-01</dc:date>
    <dc:date opf:event="publication">1813</dc:date>
    <meta name="cover" content="cover-img"/>
    <meta name="calibre:series" content="Novels"/>
    <meta name="calibre:series_index" content="3"/>
    <meta name="schema:accessMode" content="textual"/>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover-img" href="cover.png" media-type="image/png"/>
    <item id="c1" href="c1.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="c1"/></spine>
</package>`

export const NCX = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:abc"/><meta name="dtb:depth" content="2"/></head>
  <docTitle><text>Old Book</text></docTitle>
  <docAuthor><text>Jane Austen</text></docAuthor>
  <navMap>
    <navPoint id="np1" playOrder="1" class="chapter">
      <navLabel><text>Chapter 1</text></navLabel><content src="c1.html"/>
      <navPoint id="np2" playOrder="2"><navLabel><text> Section
        1.1 </text></navLabel><content src="c1.html#s1"/></navPoint>
    </navPoint>
    <navPoint id="np3" playOrder="3"><navLabel><text>Chapter 2</text></navLabel><content src="sub/c2.html"/></navPoint>
  </navMap>
  <pageList>
    <navLabel><text>Pages</text></navLabel>
    <pageTarget id="p1" type="front" value="1" playOrder="4"><navLabel><text>i</text></navLabel><content src="c1.html#pi"/></pageTarget>
    <pageTarget id="p2" type="normal" value="2" playOrder="5"><navLabel><text>2</text></navLabel><content src="c1.html#p2"/></pageTarget>
  </pageList>
  <navList class="lot">
    <navLabel><text>Tables</text></navLabel>
    <navTarget id="t1" playOrder="6"><navLabel><text>Table 1</text></navLabel><content src="c1.html#t1"/></navTarget>
  </navList>
</ncx>`
