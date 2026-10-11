import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import { cfiFromPoint, cfiFromRange, resolveCfi } from '../../src/epub/cfi.ts'

const doc = () => new DOMParser().parseFromString('<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Call me Ishmael. Some years ago.</p><p id="b">Never <em>mind</em> how long.</p></body></html>', 'application/xhtml+xml') as unknown as Document

test('pubre spans (data-pubre) are transparent to CFIs', () => {
  const d = doc()
  const p1 = d.getElementsByTagName('p')[0], t = p1.firstChild as Text
  const before = cfiFromPoint(t, 23) // inside "years" (y=22)
  const range = { startContainer: t, startOffset: 17, endContainer: t, endOffset: 27 } // "Some years"
  const rangeBefore = cfiFromRange(range)
  // Wrap "Some years" in an italic span, as pubre does for an italic highlight.
  const mid = t.splitText(17), rest = mid.splitText(10)
  const span = d.createElement('span'); span.setAttribute('data-pubre', 'mark')
  p1.insertBefore(span, mid); span.appendChild(mid)
  assert.equal(cfiFromPoint(mid, 6), before, 'point inside the span has the same CFI')
  assert.equal(cfiFromRange({ startContainer: mid, startOffset: 0, endContainer: mid, endOffset: 10 }), rangeBefore)
  const r = resolveCfi(d, before)
  assert.equal((r.startContainer as Text).data.slice(r.startOffset, r.startOffset + 3), 'ear')
  assert.equal(cfiFromPoint(rest, 2), cfiFromPoint(rest, 2)) // after the span still resolvable
  const em = d.getElementsByTagName('em')[0]
  assert.match(cfiFromPoint(em.firstChild!, 0), /\/4\[b\]\/2\/1:0/, 'real elements still count')
})
