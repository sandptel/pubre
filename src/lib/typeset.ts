// Printer's punctuation (T1): curly quotes, em dashes and ellipses, set in place without changing the
// text's length (saved places, highlights and CFIs count characters). A replacement that is shorter than
// what it replaces is padded with word joiners (U+2060): invisible, and no line break lands inside.

const WJ = '⁠'
const OPENS_AFTER = /^$|[\s([{—–/⁠-]/
const LETTER = /[\p{L}\p{N}]/u
// 'tis, 'twas, 'em, '90s: a leading apostrophe that elides, not an opening quote
const ELISION = /^(?:tis|twas|twere|twill|twould|em|n|cause|til|bout|neath|ere|e'en|o'|\d\d)/i

/** Typeset one run of text. `prev` is the character just before it (from the previous text node). */
export function smartText(s: string, prev = ''): string {
  if (!/["'.-]/.test(s)) return s
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i], before = out ? out[out.length - 1] : prev, after = s[i + 1] ?? ''
    if (c === '-' && after === '-') {
      let j = i; while (s[j] === '-') j++
      if (j - i <= 3) { out += '—' + WJ.repeat(j - i - 1); i = j - 1; continue }
      out += s.slice(i, j); i = j - 1; continue // a rule of hyphens: leave it
    }
    if (c === '.' && s.startsWith('...', i) && s[i + 3] !== '.' && before !== '.') { out += '…' + WJ + WJ; i += 2; continue }
    if (c === '"') { out += OPENS_AFTER.test(before) && after && !/\s/.test(after) ? '“' : '”'; continue }
    if (c === "'") {
      if (LETTER.test(before) || /[.,!?”’]/.test(before)) out += '’' // don't, dogs', closing
      else if (OPENS_AFTER.test(before) && ELISION.test(s.slice(i + 1))) out += '’' // ’tis
      else if (OPENS_AFTER.test(before) && after && !/\s/.test(after)) out += '‘'
      else out += '’'
      continue
    }
    out += c
  }
  return out
}

const SKIP = new Set(['code', 'pre', 'kbd', 'samp', 'tt', 'script', 'style', 'textarea', 'math', 'svg'])

/** Typeset a chapter document in place (call before it is indexed). */
export function typesetDocument(doc: Document) {
  const body = doc.body ?? doc.documentElement
  const tw = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => { for (let e = n.parentElement; e && e !== body; e = e.parentElement) if (SKIP.has(e.localName)) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT },
  })
  let prev = ''
  for (let n = tw.nextNode() as Text | null; n; n = tw.nextNode() as Text | null) {
    const t = smartText(n.data, prev)
    if (t !== n.data) n.data = t
    if (t) prev = t[t.length - 1]
  }
}
