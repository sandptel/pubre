import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveObjectURL } from 'node:buffer'
import {
  resolvePath, resolveHref, relativeHref, splitHref, isExternal, parseSrcset, decodeText, guessMediaType,
  fallbackChain, isCoreMediaType, ResourceLoader, CSP, type ResourceHost,
} from '../../src/epub/resources.ts'
import { dom } from './helpers.ts'

test('resolvePath: relative, absolute, dot segments, percent-decoding, fragments, queries', () => {
  assert.equal(resolvePath('OEBPS/content.opf', 'Text/ch1.xhtml'), 'OEBPS/Text/ch1.xhtml')
  assert.equal(resolvePath('OEBPS/Text/ch1.xhtml', '../Images/a%20b.png'), 'OEBPS/Images/a b.png')
  assert.equal(resolvePath('OEBPS/Text/ch1.xhtml', '/cover.jpg'), 'cover.jpg')
  assert.equal(resolvePath('OEBPS/Text/ch1.xhtml', './ch2.xhtml#p3'), 'OEBPS/Text/ch2.xhtml')
  assert.equal(resolvePath('OEBPS/Text/ch1.xhtml', 'ch2.xhtml?x=1#y'), 'OEBPS/Text/ch2.xhtml')
  assert.equal(resolvePath('a/b.xhtml', '100%.xhtml'), 'a/100%.xhtml') // invalid escape kept literally
  assert.equal(resolvePath('a/b.xhtml', '../../../x.css'), 'x.css')
  assert.equal(resolvePath('a/b.xhtml', '#frag'), 'a/b.xhtml')
  assert.equal(resolvePath('a/b.xhtml', 'caf%C3%A9.xhtml'), 'a/café.xhtml')
  assert.equal(resolvePath('a/b.xhtml', 'img\\x.png'), 'a/img/x.png')
})

test('resolveHref keeps fragments; relativeHref inverts it', () => {
  assert.equal(resolveHref('OEBPS/ch1.xhtml', 'ch2.xhtml#n1'), 'OEBPS/ch2.xhtml#n1')
  assert.equal(resolveHref('OEBPS/ch1.xhtml', '#n1'), 'OEBPS/ch1.xhtml#n1')
  assert.deepEqual(splitHref('a.xhtml#b#c'), { path: 'a.xhtml', fragment: 'b#c' })
  assert.equal(relativeHref('OEBPS/Text/ch1.xhtml', 'OEBPS/Images/a b.png'), '../Images/a%20b.png')
  assert.equal(relativeHref('OEBPS/Text/ch1.xhtml', 'OEBPS/Text/ch2.xhtml'), 'ch2.xhtml')
})

test('isExternal', () => {
  for (const h of ['http://x.org/a', 'https://x', 'mailto:a@b', 'data:image/png;base64,xx', '#frag', '//cdn/x.css', 'javascript:alert(1)']) assert.ok(isExternal(h), h)
  for (const h of ['a.png', '../b/c.css', '/root.css']) assert.ok(!isExternal(h), h)
})

test('parseSrcset', () => {
  assert.deepEqual(parseSrcset('a.png 1x, b.png 2x'), [['a.png', '1x'], ['b.png', '2x']])
  assert.deepEqual(parseSrcset('a.png, b.png 2x'), [['a.png', ''], ['b.png', '2x']])
  assert.deepEqual(parseSrcset('a.png,b.png 2x'), [['a.png,b.png', '2x']]) // per HTML: commas inside a URL are part of it
  assert.deepEqual(parseSrcset(' a.png 100w , b%20c.png 200w '), [['a.png', '100w'], ['b%20c.png', '200w']])
  assert.deepEqual(parseSrcset('data:image/png;base64,AAA= 1x'), [['data:image/png;base64,AAA=', '1x']])
})

test('decodeText: BOMs, XML declaration, meta charset', () => {
  const utf16le = new Uint8Array([0xff, 0xfe, 0x3c, 0, 0x61, 0, 0x3e, 0])
  assert.equal(decodeText(utf16le), '<a>')
  const utf16be = new Uint8Array([0xfe, 0xff, 0, 0x3c, 0, 0x61, 0, 0x3e])
  assert.equal(decodeText(utf16be), '<a>')
  const latin1 = new Uint8Array([...new TextEncoder().encode('<?xml version="1.0" encoding="ISO-8859-1"?><a>'), 0xe9, ...new TextEncoder().encode('</a>')])
  assert.equal(decodeText(latin1), '<?xml version="1.0" encoding="ISO-8859-1"?><a>é</a>')
  const meta = new Uint8Array([...new TextEncoder().encode('<meta charset="windows-1252"><p>'), 0x93, 0x94])
  assert.ok(decodeText(meta).endsWith('“”'))
  assert.equal(decodeText(new TextEncoder().encode('﻿hé')), 'hé')
})

test('media types and fallback chains', () => {
  assert.equal(guessMediaType('a/B.XHTML'), 'application/xhtml+xml')
  assert.equal(guessMediaType('x.woff2'), 'font/woff2')
  assert.equal(guessMediaType('x.unknown'), 'application/octet-stream')
  assert.ok(isCoreMediaType('image/webp'))
  assert.ok(!isCoreMediaType('image/tiff'))
  type I = { id: string; fallback?: string }
  const a: I = { id: 'a', fallback: 'b' }
  const b: I = { id: 'b', fallback: 'c' }
  const c: I = { id: 'c', fallback: 'a' } // cycle
  const byId = new Map([['a', a], ['b', b], ['c', c]])
  assert.deepEqual(fallbackChain(a, byId).map(i => i.id), ['a', 'b', 'c'])
})

const read = async (url: string) => resolveObjectURL(url)!.text()

function host(files: Record<string, string>, types: Record<string, string> = {}): ResourceHost {
  const enc = new TextEncoder()
  return {
    resolve: p => (p in files ? p : Object.keys(files).find(k => k.toLowerCase() === p.toLowerCase())),
    bytes: async p => enc.encode(files[p]),
    mediaType: p => types[p] ?? guessMediaType(p),
    fallback: p => (p === 'b/pic.tiff' ? 'b/pic.png' : undefined),
    ...dom,
  }
}

test('chapter loader: scripts stripped, handlers removed, CSP injected, resources rewritten (incl. srcset, CSS)', async () => {
  const loader = new ResourceLoader(host({
    'b/ch.xhtml': `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink"><head><link rel="stylesheet" href="s.css"/><script>alert(1)</script></head>
<body onload="evil()"><p onclick="x()" style="background:url(i.png)">t</p><img src="i.png" srcset="i.png 1x, I.PNG 2x, http://x/y.png 3x"/>
<img src="pic.tiff"/><svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="i.png"/><script>bad()</script></svg><a href="other.xhtml#x">l</a><img src="missing.png"/></body></html>`,
    'b/s.css': '@import "t.css"; body { background: url(\'i.png\') } .x { background: url(http://x/y.png) }',
    'b/t.css': 'p{}',
    'b/i.png': 'PNG',
    'b/pic.png': 'PNG2',
    'b/pic.tiff': 'TIFF',
  }))
  const out = await read(await loader.chapterUrl('b/ch.xhtml'))
  assert.ok(!/<script/i.test(out))
  assert.ok(!/onload|onclick/.test(out))
  assert.match(out, /<head><meta http-equiv="Content-Security-Policy" content="([^"]+)"/)
  assert.equal(/content="([^"]+)"/.exec(out)![1].replace(/&apos;/g, "'"), CSP)
  assert.match(out, /<img src="blob:[^"]+" srcset="blob:[^ ]+ 1x, blob:[^ ]+ 2x, http:\/\/x\/y.png 3x"/)
  assert.match(out, /xlink:href="blob:/)
  assert.match(out, /style="background:url\(&quot;blob:|style="background:url\(\\?"blob:/)
  assert.match(out, /href="other.xhtml#x"/) // links are left for the reader to resolve
  assert.match(out, /src="missing.png"/)
  const pic = /<img src="(blob:[^"]+)"\/?>\s*<svg/.exec(out)
  assert.ok(pic && await read(pic[1]) === 'PNG2', 'non-core image replaced by its manifest fallback')
  const css = await read(/<link rel="stylesheet" href="(blob:[^"]+)"/.exec(out)![1])
  assert.match(css, /@import "blob:/)
  assert.match(css, /url\("blob:/)
  assert.match(css, /url\(http:\/\/x\/y.png\)/)
  loader.destroy()
})

test('chapter loader: malformed XHTML falls back to the HTML parser', async () => {
  const loader = new ResourceLoader(host({ 'ch.xhtml': '<html><head></head><body><p>one<br>two<img src="i.png"></p><script>x()</script></body></html>', 'i.png': 'P' }))
  const out = await read(await loader.chapterUrl('ch.xhtml'))
  assert.ok(out.startsWith('<!DOCTYPE html>'))
  assert.ok(!out.includes('<script'))
  assert.match(out, /src="blob:/)
  assert.match(out, /Content-Security-Policy/)
})
