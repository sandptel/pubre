// Printer's punctuation (T1): curly quotes, em dashes and ellipses, set in place without changing the
// text's length (saved places, highlights and CFIs count characters). A replacement that is shorter than
// what it replaces is padded with word joiners (U+2060): invisible, and no line break lands inside.
// Plus the marks for hanging opening quotes (T3), set as attributes so no node is added.

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

/** Mark paragraphs that start flush at the edge with an opening quote, so CSS can hang it in the margin
 *  (indented paragraphs and drop-cap openers are left alone: their quote isn't at the edge). */
export function markHangingQuotes(doc: Document) {
  const win = doc.defaultView
  for (const p of Array.from(doc.querySelectorAll('p, li'))) {
    const m = /^[\s⁠]*([“‘«])/.exec(p.textContent ?? '')
    if (!m || p.hasAttribute('data-pubre-first')) { p.removeAttribute('data-pubre-hang'); continue }
    if (win && !p.hasAttribute('data-pubre-hang') && parseFloat(win.getComputedStyle(p).textIndent) !== 0) continue
    p.setAttribute('data-pubre-hang', m[1] === '‘' ? 's' : 'd')
  }
}

const GRID_PROPS = ['margin-top', 'margin-bottom', 'line-height'] as const
const OPAQUE = new Set(['img', 'svg', 'figure', 'table', 'hr', 'pre', 'video', 'canvas', 'math'])
const BLOCKISH = /^(block|list-item|table|flex|grid|flow-root)$/

/** Line grid (T4): every block's height becomes a whole number of lines, so every page ends on the same
 *  line. Margins round to lines, headings get line-multiple line heights, and pictures, tables and odd-sized
 *  text are padded below to the next line. Redone on every layout (font size changes the line); returns the
 *  line height used, or 0 when there is no grid (no regular paragraphs to take it from). */
export function snapToGrid(doc: Document, on = true): number {
  const win = doc.defaultView, body = doc.body
  if (!win || !body) return 0
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[data-pubre-grid]'))) {
    const was = JSON.parse(el.dataset.pubreGrid || '{}') as Record<string, string>
    for (const k of GRID_PROPS) { el.style.removeProperty(k); if (was[k]) el.style.setProperty(k, was[k]) }
    el.removeAttribute('data-pubre-grid')
  }
  if (!on) return 0
  // the body text's line: the most common among the first long paragraphs (front matter is often smaller)
  const seen = new Map<number, number>()
  for (const p of Array.from(body.querySelectorAll('p')).filter(p => (p.textContent ?? '').length > 80).slice(0, 60)) {
    const v = Math.round(parseFloat(win.getComputedStyle(p).lineHeight) * 10) / 10
    if (v > 0) seen.set(v, (seen.get(v) ?? 0) + 1)
  }
  const lh = [...seen].sort((a, b) => b[1] - a[1])[0]?.[0] ?? NaN
  if (!(lh > 8)) return 0
  const set = (el: HTMLElement, k: (typeof GRID_PROPS)[number], px: number) => {
    if (!el.hasAttribute('data-pubre-grid')) el.dataset.pubreGrid = JSON.stringify(Object.fromEntries(GRID_PROPS.map(p => [p, el.style.getPropertyValue(p)])))
    el.style.setProperty(k, px + 'px', 'important')
  }
  const round = (m: number) => Math.round(m / lh) * lh
  let skip: Element | null = null // inside an opaque block already padded as a whole
  for (const el of Array.from(body.querySelectorAll<HTMLElement>('*'))) {
    if (skip?.contains(el)) continue
    const cs = win.getComputedStyle(el), tag = el.localName
    if (!BLOCKISH.test(cs.display) || cs.position === 'absolute' || cs.position === 'fixed' || cs.float !== 'none') continue
    const mt = parseFloat(cs.marginTop) || 0, mb = parseFloat(cs.marginBottom) || 0
    if (/^h[1-6]$/.test(tag)) {
      const fs = parseFloat(cs.fontSize), line = Math.max(1, Math.ceil(fs * 1.15 / lh)) * lh
      set(el, 'line-height', line); set(el, 'margin-top', round(mt)); set(el, 'margin-bottom', round(mb))
      continue
    }
    const textLine = parseFloat(cs.lineHeight)
    const odd = OPAQUE.has(tag) || (tag === 'p' && Math.abs(textLine - lh) > 0.5) || (!el.querySelector('p, div, h1, h2, h3, h4, h5, h6') && !!el.querySelector('img, svg') && (el.textContent ?? '').trim().length < 200)
    if (tag === 'p' && !odd) {
      // indented paragraphs run on like a novel's (small gaps go); unindented ones keep at least a line between
      const ind = parseFloat(cs.textIndent) > 0
      const snap = (m: number) => !m ? 0 : ind ? Math.floor(m / lh + 0.3) * lh : Math.max(1, Math.round(m / lh)) * lh
      if (snap(mt) !== mt) set(el, 'margin-top', snap(mt))
      if (snap(mb) !== mb) set(el, 'margin-bottom', snap(mb))
      continue
    }
    if (round(mt) !== mt) set(el, 'margin-top', round(mt))
    if (odd) {
      const h = el.getBoundingClientRect().height, pad = (lh - (h % lh)) % lh
      set(el, 'margin-bottom', round(mb) + (pad > 0.5 ? pad : 0))
      skip = el
    } else if (round(mb) !== mb) set(el, 'margin-bottom', round(mb))
  }
  return lh
}

const BREAK_CLASS = /\b(tb|scene-?break|section-?break|space-?break|thought-?break|ornament|dinkus|asterism|transition)\b/i
const BREAK_TEXT = /^[\s*·•⁂∗~#◆◇♦❦❧✻✽—–-]{1,12}$/
export const breakText = (t: string) => BREAK_TEXT.test(t.trim()) && /[*·•⁂∗~#◆◇♦❦❧✻✽]/.test(t)

/** Scene breaks (P1): an <hr>, a "thought break" class, or a line of only stars/marks between paragraphs.
 *  Marked so CSS draws one ornament in their place. */
export function markSceneBreaks(doc: Document) {
  const body = doc.body
  if (!body) return
  for (const el of Array.from(body.querySelectorAll('hr, p, div'))) {
    if (el.closest('h1, h2, h3, h4, h5, h6, nav, table, header')) continue
    const t = (el.textContent ?? '').trim()
    const isBreak = el.localName === 'hr'
      ? !!el.previousElementSibling && !!el.nextElementSibling && !el.querySelector('*') // not a page's first/last rule
      : !el.querySelector('img, svg, p, div') && (BREAK_CLASS.test(el.getAttribute('class') ?? '') ? t.length < 13 : breakText(t))
    if (isBreak) el.setAttribute('data-pubre-break', '')
  }
}

const SALUTE = /^[“"‘]?\s*(?:my\s+)?(?:dear(?:est)?|honou?red|respected|sir|madam|gentlemen)\b[^.!?]{0,60}[,:—]/i
export const salutation = (line: string) => SALUTE.test(line.trim()) && !/^[“"‘]?\s*dear\s+me\b/i.test(line.trim())
const SIGNOFF = /(?:^|\n)\s*[“"]?\s*(?:yours\b|your\s+(?:affectionate|obedient|humble|loving|devoted|sincere)|i\s+(?:am|remain)\b|believe\s+me|ever\s+yours|affectionately|sincerely|faithfully)/i

/** Letters inside the story (P3): a quoted block that opens with a salutation (after an optional dateline)
 *  and is marked up as a block, or tagged letter/epistle. */
export function markLetters(doc: Document) {
  const body = doc.body
  if (!body) return
  for (const el of Array.from(body.querySelectorAll('blockquote, div, section, aside'))) {
    if (el.closest('[data-pubre-letter]') || el.querySelector('h1, h2, h3, blockquote')) continue
    const type = `${el.getAttribute('epub:type') ?? ''} ${el.getAttribute('class') ?? ''}`
    const ps = Array.from(el.querySelectorAll(':scope > p, :scope > div'))
    if (ps.length < 1) continue
    const head = ps.slice(0, 2).map(p => (p.textContent ?? '').trim()).join('\n')
    const tagged = /\b(letter|epistle|correspondence|note)\b/i.test(type)
    const quoted = el.localName === 'blockquote' || /\bblockquot|quote|extract\b/i.test(type)
    const text = el.textContent ?? ''
    if (!(tagged || (quoted && head.split('\n').some(salutation))) || text.length > 6000) continue
    el.setAttribute('data-pubre-letter', '')
    const last = ps[ps.length - 1], tail = (last.textContent ?? '').trim()
    if (ps.length > 1 && (tail.length < 90 || SIGNOFF.test(tail))) last.setAttribute('data-pubre-sign', '')
  }
}

/** Pictures (P5): an illustration in the flow becomes a framed plate with its caption under it. Run after
 *  images have decoded (sizes are known); drop-cap initials and tiny ornaments are left alone. */
export function markPlates(doc: Document) {
  const body = doc.body
  if (!body || (body.textContent ?? '').trim().length < 40) return // a cover or a full-page picture: shown as is
  for (const img of Array.from(body.querySelectorAll('img'))) {
    if (img.closest('[data-pubre-cap], [data-pubre-plate], a[href]') || img.naturalWidth < 160 || img.naturalHeight < 120) continue
    if (img.closest('h1, h2, h3, h4, h5, h6')) continue // a chapter's heading picture belongs to the opener
    let box: Element | null = img.closest('figure, [role="figure"], [class*="fig" i], [class*="illus" i]')
    if (box && box.querySelectorAll('img').length > 3) box = null
    if (!box) {
      const p = img.parentElement
      const alone = p && p !== body && (p.textContent ?? '').trim().length < 3 && p.querySelectorAll('img').length === 1
      box = alone ? (p.parentElement && p.parentElement !== body && /figure|fig|illus|image|center/i.test(p.parentElement.className) ? p.parentElement : p) : null
    }
    if (!box || box === body) continue
    box.setAttribute('data-pubre-plate', '')
    const cap = box.querySelector('figcaption, [class*="caption" i], [class*="cap" i]:not(img)') ?? (/caption|cap\b/i.test(box.nextElementSibling?.className ?? '') ? box.nextElementSibling : null)
    cap?.setAttribute('data-pubre-caption', '')
  }
}
