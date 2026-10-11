(() => {
const $ = id => document.getElementById(id)
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const HL = window.CSS && CSS.highlights
// Stacking = registration order (later paints on top). Every highlight is registered once, in the
// visual grammar's order, and only its ranges change. (Highlight.priority crashes WebKit when
// highlights overlap, so it is never used; contrast levels are disjoint ranges.)
const PR = {}
const ORDER = ['f-page', 'f-para', 'f-read', 'f-readpara', 'aside', 'f-readfocus', 'f-focus',
  ...['Ahab', 'Stubb', 'Flask', 'Starbuck', 'Ishmael', 'Queequeg', 'voice'].flatMap(n => ['sps-' + n, 'sp-' + n, 'spu-' + n, 'q-' + n]),
  'hard', 'foreign', ...['Ahab', 'Stubb', 'Flask', 'Starbuck', 'Ishmael', 'Queequeg'].map(n => 'n-' + n),
  ...['0A', '0B', '0D', '08', '09', '0E'].map(c => 'u-' + c), 's-b', 'bloom', 'breathe']
if (HL) for (const n of ORDER) HL.set(n, new Highlight())
const setHL = (name, ranges) => { if (!HL) return; let h = HL.get(name); if (!h) { h = new Highlight(); HL.set(name, h) } h.clear(); (ranges || []).forEach(r => h.add(r)) }
const caretAt = (x, y) => {
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, offset: p.offset } }
  const r = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, offset: r.startOffset }
}
const textNodes = root => { const out = [], tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); while (tw.nextNode()) out.push(tw.currentNode); return out }
const rng = (n, a, nb, b) => { const r = document.createRange(); r.setStart(n, a); r.setEnd(nb, b); return r }
const MEANING = Object.fromEntries((window.PUBRE_MEANINGS || []).map(([c, n]) => [c, n]))
let intensity = 'guided'

// ======================= PART II · READING GUIDE =======================
const g = $('g'), gText = $('gText'), cur = $('gCursor')
LENS.guide.forEach(t => { const p = document.createElement('p'); p.textContent = t; gText.append(p) })
const W = [], S = [], P = []
const wseg = new Intl.Segmenter('en', { granularity: 'word' }), sseg = new Intl.Segmenter('en', { granularity: 'sentence' })
gText.querySelectorAll('p').forEach((p, pi) => {
  const node = p.firstChild, str = node.data, pa = W.length
  for (const s of sseg.segment(str)) {
    const sa = W.length
    for (const w of wseg.segment(s.segment)) {
      if (!w.isWordLike) continue
      const a = s.index + w.index, b = a + w.segment.length, nxt = str.slice(b, b + 2)
      W.push({ node, a, b, p: pi, s: S.length, len: w.segment.length, pause: /^[”’"]?[.!?]/.test(nxt) ? 2 : /^[”’"]?[,;:—–)]/.test(nxt) ? 1 : 0 })
    }
    if (W.length > sa) S.push({ a: sa, b: W.length - 1 })
  }
  if (W.length > pa) { W[W.length - 1].pause = 3; P.push({ a: pa, b: W.length - 1 }) }
})
const range = (a, b) => rng(W[a].node, W[a].a, W[b].node, W[b].b)
let i = 0, active = false, gliding = false, wpm = 260, unit = 'word', focus = 'sent', pointer = 'word', dimRead = true
let timer = 0, lastTap = 0, beforeTap = 0, prevTop = null, spaceDown = 0, holdT = 0
const HARD = w => (LENS.zipf[w] ?? 9) < 3
const factor = w => (0.7 + 0.3 * Math.min(w.len, 14) / 5) * [1, 1.5, 2, 2.5][w.pause] * (HARD(w.node.data.slice(w.a, w.b).toLowerCase()) ? 1.3 : 1) / 1.25
const wordMs = w => 60000 / wpm * factor(w)
function nextUnit(from) { if (unit === 'word') return from + 1; let k = from; for (let c = 1; c < 3 && !W[k].pause && W[k + 1]; c++) k++; return k + 1 }
const topOf = k => range(k, k).getClientRects()[0]?.top ?? 0
function lineSpan(k) { const t = topOf(k); let a = k, b = k; while (W[a - 1] && Math.abs(topOf(a - 1) - t) < 4) a--; while (W[b + 1] && Math.abs(topOf(b + 1) - t) < 4) b++; return [a, b] }
// Focus unit. Very long sentences (40+ words, common in Melville) narrow to the clause, so contrast keeps meaning.
function focusSpan(k) {
  if (focus === 'line') return lineSpan(k)
  if (focus === 'para') return [P[W[k].p].a, P[W[k].p].b]
  const s = S[W[k].s]
  if (s.b - s.a < 40) return [s.a, s.b]
  let a = k, b = k
  while (a > s.a && !W[a - 1].pause) a--
  while (b < s.b && !W[b].pause) b++
  while (b - a < 6 && (a > s.a || b < s.b)) { if (a > s.a) { a--; while (a > s.a && !W[a - 1].pause) a-- } if (b - a < 6 && b < s.b) { b++; while (b < s.b && !W[b].pause) b++ } }
  return [a, b]
}

function placePointer(rect, box, dur) {
  const x = rect.left - box.left, y = rect.top - box.top, w = rect.width, h = rect.height
  const geo = {
    word: [x - 3, y - 1, w + 6, h + 2], outline: [x - 3, y - 1, w + 6, h + 2],
    underline: [x, y + h + 1, w, 3], dot: [x + w / 2 - 3, y + h + 2, 6, 6],
  }[pointer]
  // Calm motion for reading: position glides with a barely-there settle; size eases monotonically
  // (never over/undershoots, so the block doesn't pulse longer/shorter). Glides use plain ease-in-out.
  const move = gliding ? 'cubic-bezier(.45,0,.25,1)' : 'cubic-bezier(.22,1.12,.36,1)'
  const size = 'cubic-bezier(.25,.8,.25,1)'
  cur.style.transition = dur ? `transform ${dur}ms ${move}, width ${Math.round(dur * .85)}ms ${size}, height ${Math.round(dur * .85)}ms ${size}, opacity .2s` : 'none'
  cur.style.transform = `translate(${geo[0]}px, ${geo[1]}px)`
  cur.style.width = geo[2] + 'px'; cur.style.height = geo[3] + 'px'
}
function render(dur = 380) {
  if (!active) return
  const w = W[i], j = unit === 'phrase' ? Math.min(W.length - 1, nextUnit(i) - 1) : i
  const rect = range(i, i).getClientRects()[0], end = range(j, j).getClientRects()[0], box = gText.getBoundingClientRect()
  if (!rect) return
  const r = end && Math.abs(end.top - rect.top) < 4 ? new DOMRect(rect.left, rect.top, end.right - rect.left, rect.height) : rect
  const newLine = prevTop !== null && Math.abs(rect.top - prevTop) > 4
  prevTop = rect.top
  if (reduce) dur = 0
  else if (newLine) { // hop to the new line: quick fade-through instead of a diagonal swipe
    cur.animate([{ opacity: 1 }, { opacity: 0, offset: .4 }, { opacity: 1 }], { duration: Math.min(260, dur) })
  }
  placePointer(r, box, newLine ? 0 : dur)
  paintFocus()
  paintLenses()
  if (i !== render.last) { render.last = i; window.PUBRE_ARRIVE?.(i) }
}
// Contrast levels as disjoint ranges: page (unread) 38% · paragraph (unread) 66% · focus 100%;
// with "dim what's read": read before this paragraph 28% · read in this paragraph 40% · read in focus 52%.
function paintFocus() {
  if (!active) { ['f-page', 'f-para', 'f-read', 'f-readpara', 'f-focus', 'f-readfocus'].forEach(n => setHL(n)); return }
  const w = W[i], [fa, fb] = focusSpan(i), pa = P[w.p].a, pb = P[w.p].b, last = W[W.length - 1]
  const before = pa > 0 ? rng(W[0].node, 0, W[pa].node, W[pa].a) : null
  const paraBefore = fa > pa ? rng(W[pa].node, W[pa].a, W[fa].node, W[fa].a) : null
  const focusRead = i > fa ? rng(W[fa].node, W[fa].a, w.node, w.a) : null
  const paraAfter = fb < pb ? rng(W[fb].node, W[fb].b, W[pb].node, W[pb].b) : null
  const after = rng(W[pb].node, W[pb].b, last.node, last.node.length)
  const ok = r => !!r
  setHL('f-page', [after, dimRead ? null : before].filter(ok))
  setHL('f-para', [paraAfter, dimRead ? null : paraBefore].filter(ok))
  setHL('f-read', [dimRead ? before : null].filter(ok))
  setHL('f-readpara', [dimRead ? paraBefore : null].filter(ok))
  setHL('f-readfocus', [dimRead ? focusRead : null].filter(ok))
  setHL('f-focus', [rng((dimRead ? w : W[fa]).node, (dimRead ? w : W[fa]).a, W[fb].node, W[fb].b)])
}
function go(n, glide = false) {
  if (n > W.length - 1) { stopGlide(); toast('End of page. In pubre the page turns and the cursor carries on.'); return }
  i = Math.max(0, n)
  render(glide ? Math.min(480, wordMs(W[i]) * (unit === 'phrase' ? 1.6 : 0.8)) : 300)
}
function startGlide() { if (gliding) return; activate(); gliding = true; $('gHold').classList.add('held'); tick() }
function tick() { if (!gliding) return; const n = nextUnit(i); let ms = 0; for (let k = i; k < Math.min(n, W.length); k++) ms += wordMs(W[k]); timer = setTimeout(() => { if (!gliding) return; go(n, true); tick() }, ms) }
function stopGlide() { gliding = false; clearTimeout(timer); $('gHold').classList.remove('held') }
function sentStart() { const s = S[W[i].s]; go(i > s.a ? s.a : W[i].s > 0 ? S[W[i].s - 1].a : 0) }
function nextSent() { if (W[i].s < S.length - 1) go(S[W[i].s + 1].a) }
function prevPara() { const p = P[W[i].p]; go(i > p.a ? p.a : W[i].p > 0 ? P[W[i].p - 1].a : 0) }
function nextPara() { if (W[i].p < P.length - 1) go(P[W[i].p + 1].a) }
function lineEdge(dir) { const [a, b] = lineSpan(i); go(dir < 0 ? a : b) }
function line(dir) { const [a, b] = lineSpan(i); const k = dir > 0 ? b + 1 : a - 1; if (W[k]) go(lineSpan(k)[0]) }
function speed(f) { wpm = Math.round(Math.max(120, Math.min(450, wpm * f))); showSpeed() }
function showSpeed(learning) { const el = $('gSpeed'); el.textContent = `${wpm} wpm`; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); $('gLearn').hidden = !learning }
function tap(t) {
  if (t - lastTap < 260) { lastTap = 0; go(S[W[beforeTap].s].a); toast('Back to the start of the sentence'); return } // double-tap
  if (lastTap && t - lastTap < 3000) { // longer gaps are pauses, not pace
    const sample = 60000 * factor(W[i]) / (t - lastTap)
    if (sample > 90 && sample < 900) { wpm = Math.round(Math.max(120, Math.min(450, wpm * 0.8 + sample * 0.2))); showSpeed(true) }
  }
  beforeTap = i; lastTap = t; go(nextUnit(i))
}
let toastT = 0
function toast(msg) { const el = $('gToast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200) }
function activate() {
  if (active) return
  active = true; cur.classList.add('on'); $('gStart').setAttribute('aria-pressed', 'true'); $('gStartL').textContent = 'Guide on'
  if (!g.contains(document.activeElement)) gText.focus({ preventScroll: true })
  prevTop = null; render(0)
}
function deactivate() {
  stopGlide(); active = false; cur.classList.remove('on'); $('gStart').setAttribute('aria-pressed', 'false'); $('gStartL').textContent = 'Start guide'
  paintFocus(); paintLenses(); setHL('bloom')
}
$('gStart').addEventListener('click', () => (active ? deactivate() : activate()))
g.addEventListener('keydown', e => {
  if (e.target.closest('input')) return
  if (e.key === ' ' && e.shiftKey) { e.preventDefault(); activate(); stopGlide(); go(i - 1); return }
  if ((e.key === 'g' || e.key === 'G') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); active ? deactivate() : activate(); return }
  if (e.key === ' ') { e.preventDefault(); activate(); if (e.repeat || spaceDown) return; spaceDown = performance.now(); holdT = setTimeout(startGlide, 220); return }
  if (!active) return
  const k = e.key, act = {
    ArrowRight: () => (e.altKey ? speed(1.1) : go(nextUnit(i))), w: () => go(nextUnit(i)), l: () => go(i + 1), e: () => go(i + 1),
    ArrowLeft: () => (e.altKey ? speed(1 / 1.1) : go(i - 1)), b: () => go(i - 1), h: () => go(i - 1),
    ArrowDown: () => (e.ctrlKey || e.shiftKey ? nextPara() : line(1)), j: () => line(1), ')': nextSent,
    ArrowUp: () => (e.ctrlKey || e.shiftKey ? prevPara() : line(-1)), k: () => line(-1), '(': sentStart,
    p: () => setUnit(unit === 'word' ? 'phrase' : 'word'),
    '}': nextPara, '{': prevPara, '0': () => lineEdge(-1), Home: () => lineEdge(-1), '$': () => lineEdge(1), End: () => lineEdge(1),
    '[': () => speed(1 / 1.1), ']': () => speed(1.1), Escape: deactivate,
  }[k]
  if (act) { e.preventDefault(); if (!['[', ']'].includes(k) && !e.altKey) stopGlide(); act() }
})
g.addEventListener('keyup', e => {
  if (e.key !== ' ' || !spaceDown) return
  e.preventDefault(); clearTimeout(holdT); spaceDown = 0
  if (gliding) { stopGlide(); lastTap = 0; return }
  tap(performance.now())
})
gText.addEventListener('pointerdown', e => {
  const c = caretAt(e.clientX, e.clientY); if (!c) return
  const k = W.findIndex(w => w.node === c.node && c.offset >= w.a && c.offset <= w.b)
  activate(); if (k >= 0) { stopGlide(); go(k) }
})
const hold = $('gHold')
hold.addEventListener('pointerdown', e => { e.preventDefault(); hold.setPointerCapture(e.pointerId); startGlide() })
;['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => hold.addEventListener(t, stopGlide))
hold.addEventListener('contextmenu', e => e.preventDefault())
$('gBackS').addEventListener('click', () => { activate(); sentStart() })
$('gPrevW').addEventListener('click', () => { activate(); go(i - 1) })
$('gNextW').addEventListener('click', () => { activate(); go(i + 1) })
$('gNextS').addEventListener('click', () => { activate(); nextSent() })
function seg(id, set) { $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) set(b.dataset.v) }) }
function mark(id, v) { $(id).querySelectorAll('button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on) }) }
function setUnit(v) { unit = v; mark('gUnit', v); render(0); toast(v === 'word' ? 'Stepping by word' : 'Stepping by phrase') }
seg('gFocus', v => { focus = v; mark('gFocus', v); activate(); render(0) })
seg('gUnit', v => { activate(); setUnit(v) })
seg('gPointer', v => { pointer = v; mark('gPointer', v); cur.className = `g-cursor on p-${v}`; activate(); prevTop = null; render(0) })
cur.className = 'g-cursor p-word'
$('gRead').checked = true
$('gRead').addEventListener('change', e => { dimRead = e.target.checked; render(0) })
// Dead-man's switch: anything that takes attention away stops the glide.
addEventListener('blur', stopGlide); document.addEventListener('visibilitychange', () => document.hidden && stopGlide())
addEventListener('resize', () => { prevTop = null; render(0) })

// ======================= PART III · LENSES, PATTERNS & BUDGET =======================
const ld = $('ld'), lText = $('lText'), tip = $('tip'), bar = $('hlBar')
document.body.append(tip); tip.style.position = 'fixed'
const NAMES = { Ahab: '--b08', Stubb: '--b0A', Flask: '--b0C', Starbuck: '--b0D', Ishmael: '--b0E', Queequeg: '--b0B' }
LENS.names.Ishmael = { first: '1 · Loomings', before: 0, chapters: 0 }
const NAME_RE = new RegExp(`\\b(${Object.keys(NAMES).join('|')})\\b`, 'g')
const SAY = 'said|whispered|cried|repeated|muttered|asked|shouted|rejoined|replied|answered'
const isForeign = w => (LENS.zipf[w] ?? 9) === 0 && /(em|am|is|que|um|us|ae|tem|ege)$/.test(w) // demo heuristic; pubre uses lang attributes / foreign italics
const on = id => $(id).checked
let passage = 'calm', tokens = [], counts = { shown: 0, held: 0 }, voices = 'ink' // Voices: ink | underline | marks | off

function loadPassage(key) {
  passage = key
  lText.innerHTML = ''
  LENS.passages[key].ps.forEach(t => { const p = document.createElement('p'); p.textContent = t; lText.append(p) })
  $('ldCh').textContent = key === 'calm' ? 'Chapter ' + LENS.chapter : LENS.passages[key].label
  hls.splice(0, hls.length, ...hls.filter(h => gText.contains(h.range.startContainer)))
  scan()
}

// Tokenise both demo passages into lens candidates.
// Speaker attribution (heuristic, per passage), in order: explicit "said X" / "X whispered";
// an unclosed quote means the same speaker continues; addressing a name ("…, Flask?") means the
// other party speaks; otherwise speakers alternate between the last two named in narration.
const NAMES_ALT = Object.keys(NAMES).join('|')
function scan() {
  tokens = []
  for (const root of [gText, lText]) {
    let pair = [], turn = 0, carry = null
    for (const p of root.querySelectorAll('p')) {
      const nodes = textNodes(p), text = nodes.map(n => n.data).join(''), words = (text.match(/[A-Za-z’']+/g) || []).length
      const quotes = text.match(/“[^”]*”?/g) || [], qChars = quotes.join('').length
      const para = { el: p, words, speechShare: qChars / Math.max(1, text.length), root }
      const quoteOnly = qChars > 0 && text.trim().startsWith('“')
      let speaker = null
      if (qChars === 0) { const ns = [...new Set(text.match(NAME_RE) || [])]; if (ns.length) { pair = ns.slice(0, 2); turn = 0 } }
      else {
        const said = text.match(new RegExp(`”[\\s,;—]*(?:\\w+\\s+){0,2}?(?:${SAY})\\s+(${NAMES_ALT})`)) || text.match(new RegExp(`”[\\s,;—]*(${NAMES_ALT})\\s+(?:${SAY})`))
        const vocative = (quotes[0] || '').match(new RegExp(`,\\s*(${NAMES_ALT})\\b[?!.,]`))
        if (said) speaker = said[1]
        else if (quoteOnly && pair.length === 2 && vocative && (!carry || carry === vocative[1])) speaker = pair.find(n => n !== vocative[1]) // nobody addresses themselves
        else if (carry) speaker = carry
        else if (quoteOnly && pair.length) speaker = pair[turn++ % pair.length]
        if (speaker && pair.length === 2) turn = pair.indexOf(speaker) + 1
        carry = quotes.length && !quotes[quotes.length - 1].endsWith('”') ? speaker : null
      }
      for (const node of nodes) {
        const s = node.data, add = (a, b, kind, key, extra) => tokens.push({ node, a, b, kind, key, para, ...extra })
        for (const m of s.matchAll(NAME_RE)) add(m.index, m.index + m[0].length, 'name', m[0])
        for (const m of s.matchAll(/[A-Za-z]+/g)) {
          const w = m[0].toLowerCase()
          if (NAMES[m[0]] || w.length < 4) continue
          if (isForeign(w)) add(m.index, m.index + m[0].length, 'foreign', w)
          else if (HARD(w)) add(m.index, m.index + m[0].length, 'hard', w, { zipf: LENS.zipf[w] })
        }
        for (const m of s.matchAll(/“[^”]*”?/g)) add(m.index, m.index + m[0].length, 'speech', quoteOnly || speaker ? speaker : null)
        for (const m of s.matchAll(/\([^)]{2,160}\)|—[^—.!?“”]{3,120}—/g)) add(m.index, m.index + m[0].length, 'aside', m[0])
      }
    }
  }
  paintLenses()
}
const tokRange = t => rng(t.node, t.a, t.node, t.b)
const inFocusPara = t => active && t.para.root === gText && t.para.el === gText.querySelectorAll('p')[W[i].p]

// The attention budget: marks per 100 words by intensity. Highest-value marks win; the rest are
// "held": invisible until the cursor's paragraph reaches them or you hover them.
const RATE = { quiet: 0, guided: 2.5, rich: 5 }
function budgetFor(para, focused) {
  if (intensity === 'quiet') return 0
  const b = Math.max(1, Math.round(para.words / 100 * RATE[intensity]))
  return focused ? b * 2 : b
}
function paintLenses() {
  counts = { shown: 0, held: 0 }
  const count = (t, k) => { if (t.para.root === lText) counts[k]++ }
  const shown = { name: {}, hard: [], foreign: [], speech: {}, soft: {}, under: {}, marks: {}, aside: [] }
  const byPara = new Map()
  for (const t of tokens) { if (!byPara.has(t.para.el)) byPara.set(t.para.el, []); byPara.get(t.para.el).push(t) }
  for (const [el, list] of byPara) {
    const para = list[0].para
    // Guide on: only the focus paragraph is rich; the rest of the guide passage stays calm (it's dimmed anyway).
    if (para.root === gText && active && !inFocusPara(list[0])) continue
    const focused = para.root === gText && active
    const firstNames = new Set(), cands = []
    for (const t of list) {
      if (t.kind === 'name' && on('lnNames')) { if (!firstNames.has(t.key) || focused) { firstNames.add(t.key); cands.push({ t, v: 3 }) } else count(t, 'held') }
      if (t.kind === 'hard' && on('lnHard')) cands.push({ t, v: 2 + (3 - t.zipf) / 10 })
      if (t.kind === 'foreign' && on('lnForeign')) cands.push({ t, v: 1.5 })
    }
    cands.sort((a, b) => b.v - a.v)
    const budget = budgetFor(para, focused)
    let foreignUsed = 0
    cands.forEach(({ t }, k) => {
      const keep = k < budget && !(t.kind === 'foreign' && foreignUsed++ >= (intensity === 'rich' ? 3 : 1))
      if (!keep) { count(t, 'held'); return }
      count(t, 'shown')
      if (t.kind === 'name') (shown.name[t.key] ||= []).push(tokRange(t))
      else shown[t.kind].push(tokRange(t))
    })
    // Speech: the whole quote takes the speaker's ink (it reads as authentic voice). On dialogue-heavy
    // paragraphs (>60% speech) the ink is softer, so a page of dialogue never turns into a colour wash.
    // Voices styles: ink = whole quote in the speaker's colour; underline = speaker-colour hairline;
    // marks = only the quote marks. Hover any of them to see who is speaking.
    if (voices !== 'off' && intensity !== 'quiet') for (const t of list.filter(t => t.kind === 'speech')) {
      const key = t.key && NAMES[t.key] ? t.key : 'voice'
      if (voices === 'ink') (t.para.speechShare > 0.6 ? (shown.soft[key] ||= []) : (shown.speech[key] ||= [])).push(tokRange(t))
      else if (voices === 'underline') (shown.under[key] ||= []).push(tokRange(t))
      else { const q = shown.marks[key] ||= []; q.push(rng(t.node, t.a, t.node, t.a + 1)); if (t.node.data[t.b - 1] === '”') q.push(rng(t.node, t.b - 1, t.node, t.b)) }
      count(t, 'shown')
    }
    if (on('lnAsides') && intensity !== 'quiet') for (const t of list.filter(t => t.kind === 'aside')) { shown.aside.push(tokRange(t)); count(t, 'shown') }
  }
  for (const n of Object.keys(NAMES)) setHL('n-' + n, shown.name[n], PR.name)
  for (const k of [...Object.keys(NAMES), 'voice']) { setHL('sp-' + k, shown.speech[k]); setHL('sps-' + k, shown.soft[k]); setHL('spu-' + k, shown.under[k]); setHL('q-' + k, shown.marks[k]) }
  setHL('hard', shown.hard, PR.hard); setHL('foreign', shown.foreign, PR.foreign); setHL('aside', shown.aside, PR.aside)
  $('ldCount').textContent = `${counts.shown} marks shown · ${counts.held} held back`
}
;['lnNames', 'lnHard', 'lnAsides', 'lnForeign'].forEach(id => $(id).addEventListener('change', paintLenses))
seg('ldVoices', v => { voices = v; mark('ldVoices', v); paintLenses() })
seg('ldPass', v => { mark('ldPass', v); loadPassage(v) })
seg('ldInt', v => { intensity = v; mark('ldInt', v); paintLenses() })

// ---------- user highlights (yours: coloured wash + your own bold/italic + note) ----------
const COLORS = ['0A', '0B', '0D', '08', '09', '0E']
const hls = []; let editing = null
bar.querySelector('.hl-colors').innerHTML = COLORS.map(c => `<button data-color="${c}" aria-label="${MEANING[c] || 'Highlight'}" title="${MEANING[c] || ''}"><i style="background:var(--b${c})"></i></button>`).join('')
function paintHls() {
  for (const c of COLORS) setHL('u-' + c, hls.filter(h => h.color === c).map(h => h.range), PR.wash)
  setHL('s-b', hls.filter(h => h.styles.has('b')).map(h => h.range), PR.wash)
  bar.querySelectorAll('[data-style]').forEach(b => b.classList.toggle('on', !!editing && editing.styles.has(b.dataset.style)))
}
function placeBar(r) {
  bar.hidden = false
  const rect = r.getBoundingClientRect(), box = ld.getBoundingClientRect(), bw = bar.offsetWidth, bh = bar.offsetHeight
  const left = Math.max(8, Math.min(box.width - bw - 8, rect.left - box.left + rect.width / 2 - bw / 2))
  let top = rect.top - box.top - bh - 10; if (top < 8) top = rect.bottom - box.top + 10
  bar.style.left = left + 'px'; bar.style.top = top + 'px'
}
function closeBar() { bar.hidden = true; $('hlNote').hidden = true; editing = null; paintHls() }
const hlAt = (node, off) => hls.find(h => { try { return h.range.isPointInRange(node, off) } catch { return false } })
lText.addEventListener('pointerup', () => setTimeout(() => {
  const sel = getSelection()
  if (sel && !sel.isCollapsed && lText.contains(sel.anchorNode) && lText.contains(sel.focusNode)) { editing = null; placeBar(sel.getRangeAt(0)); paintHls() }
}, 0))
lText.addEventListener('click', e => {
  const sel = getSelection(); if (sel && !sel.isCollapsed) return
  const c = caretAt(e.clientX, e.clientY), h = c && hlAt(c.node, c.offset)
  if (h) { editing = h; placeBar(h.range); paintHls() }
})
function wrap(h) {
  const span = document.createElement('span'); span.className = 'hi'; span.dataset.pubre = 'mark' // CFI generation skips data-pubre nodes
  span.append(h.range.extractContents()); h.range.insertNode(span); h.range.selectNodeContents(span); h.spans.i = span
}
function unwrap(span) { if (!span || !span.parentNode) return; const parent = span.parentNode; while (span.firstChild) parent.insertBefore(span.firstChild, span); span.remove(); parent.normalize() }
function ensure() {
  if (editing) return editing
  const sel = getSelection(); if (!sel || sel.isCollapsed) return null
  const h = { range: sel.getRangeAt(0).cloneRange(), color: '0A', styles: new Set(), note: '', spans: {} }
  hls.push(h); sel.removeAllRanges(); editing = h; return h
}
bar.addEventListener('pointerdown', e => { if (!e.target.closest('input')) e.preventDefault() })
bar.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return
  const h = ensure(); if (!h) return
  if (b.dataset.color) h.color = b.dataset.color
  else if (b.dataset.style) {
    const s = b.dataset.style
    if (h.styles.has(s)) { h.styles.delete(s); if (s === 'i') { const sp = h.spans.i; const r = document.createRange(); r.setStartBefore(sp); r.setEndAfter(sp); unwrap(sp); h.range = r; delete h.spans.i } }
    else { h.styles.add(s); if (s === 'i') wrap(h) }
    scan()
  } else if (b.dataset.act === 'note') { const n = $('hlNote'); n.hidden = false; n.value = h.note; n.focus(); placeBar(h.range) }
  else if (b.dataset.act === 'del') { Object.values(h.spans).forEach(unwrap); hls.splice(hls.indexOf(h), 1); closeBar(); scan(); return }
  paintHls(); placeBar(h.range)
})
$('hlNote').addEventListener('keydown', e => { if (e.key === 'Enter' && editing) { editing.note = e.target.value.trim(); closeBar() } if (e.key === 'Escape') closeBar() })
document.addEventListener('pointerdown', e => { if (!bar.hidden && !bar.contains(e.target) && !lText.contains(e.target)) closeBar() })

// ---------- tooltips: hover anything (held marks reveal on hover); while guiding, only after a dwell ----------
function showTip(html, rect) {
  tip.innerHTML = html; tip.hidden = false
  const w = tip.offsetWidth, h = tip.offsetHeight
  tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)) + 'px'
  tip.style.top = (rect.top - h - 10 < 8 ? rect.bottom + 10 : rect.top - h - 10) + 'px'
}
function hideTip() { tip.hidden = true; tipKey = '' }
const tipFor = t => {
  if (t.kind === 'name') { const n = LENS.names[t.key] || {}; return `<span class="av" style="background:var(${NAMES[t.key]})">${t.key[0]}</span><b class="w">${t.key}</b><div class="def">${n.before ? `First seen in <b>${n.first}</b>. Mentioned ${n.before} times across ${n.chapters} chapters so far.` : n.first ? 'You’re meeting them now: this is their first appearance.' : 'A character in this passage.'}</div><div class="meta2">Spoiler-safe: counts stop at your page</div>` }
  if (t.kind === 'hard') { const d = LENS.words[t.key]; return `<b class="w">${t.key}</b><div class="def">${d ? d.def : 'In pubre, the definition comes from Open English WordNet, offline.'}</div><div class="meta2">Zipf ${t.zipf} · ${t.zipf < 2 ? 'very rare' : 'rare'} in English${d ? ' · sample definition' : ''}</div>` }
  if (t.kind === 'speech') return t.key && NAMES[t.key] ? `<span class="av" style="background:var(${NAMES[t.key]})">${t.key[0]}</span><b class="w">${t.key}</b><div class="def">is speaking. Voices colours each speaker’s words in their own ink.</div><div class="meta2">Attribution is a best guess from “said …”, who’s addressed, and turn-taking</div>` : `<b class="w">A voice</b><div class="def">Quoted words with no speaker named nearby.</div>`
  if (t.kind === 'foreign') return `<b class="w">${t.key}</b><div class="def">Latin. pubre offers a translation for foreign phrases (marked by the book’s language tags).</div>`
  return ''
}
let tipKey = ''
function hover(e) {
  const c = caretAt(e.clientX, e.clientY); if (!c) return hideTip()
  const at = t => t.node === c.node && c.offset >= t.a && c.offset < t.b
  const t = tokens.find(t => at(t) && ['name', 'hard', 'foreign'].includes(t.kind)) || (voices !== 'off' && intensity !== 'quiet' ? tokens.find(t => at(t) && t.kind === 'speech') : null)
  const h = !t && hlAt(c.node, c.offset)
  const key = t ? t.kind + t.key : h ? 'hl' + hls.indexOf(h) : ''
  if (key === tipKey) return
  tipKey = key
  if (t) showTip(tipFor(t), tokRange(t).getBoundingClientRect())
  else if (h) showTip(`<div class="meta2" style="margin:0 0 4px">${MEANING[h.color] || 'Highlight'}</div><div class="def">${h.note ? h.note.replace(/</g, '&lt;') : '<span style="color:var(--muted)">No note. Click to edit.</span>'}</div>`, h.range.getBoundingClientRect())
  else hideTip()
}
;[lText, gText].forEach(el => { el.addEventListener('mousemove', hover); el.addEventListener('mouseleave', hideTip) })
lText.addEventListener('click', e => { if (matchMedia('(hover: none)').matches) hover(e) })
addEventListener('scroll', hideTip, { passive: true })
loadPassage('calm')

// A seeded "Key" highlight with a note in the guide passage, so the guide can show "breathe".
const gp0 = gText.querySelector('p').firstChild, gs = gp0.data.indexOf('It is a way'), ge = gp0.data.indexOf('circulation.') + 12
const seed = { range: rng(gp0, gs, gp0, ge), color: '0A', styles: new Set(), note: 'Ishmael’s cure for gloom: go to sea.', spans: {} }
hls.push(seed); paintHls()
const mdot = document.createElement('i'); mdot.className = 'mdot'; mdot.title = 'Note'; gText.append(mdot)
function placeDot() { const r = seed.range.getClientRects()[0], box = gText.getBoundingClientRect(); if (r) { mdot.style.left = (box.width + 6) + 'px'; mdot.style.top = (r.top - box.top + r.height / 2 - 3) + 'px' } }
placeDot(); addEventListener('resize', placeDot); document.fonts?.ready.then(placeDot); setTimeout(placeDot, 1500)

// ---------- arrival verbs: what happens when the cursor reaches a word ----------
const met = new Set(), root = document.documentElement
let peekT = 0, dwellT = 0, lastSent = -1, lastHl = null
// Peeks never interrupt reading: they wait for a ~600 ms rest and vanish on the next move.
function settlePeek() { clearTimeout(dwellT); clearTimeout(peekT); if (tip.classList.contains('peek')) { tip.classList.remove('peek'); hideTip() } }
function peek(html, rect) { dwellT = setTimeout(() => { if (gliding) return; showTip(html, rect); tip.classList.add('peek'); peekT = setTimeout(settlePeek, 4000) }, 600) }
window.PUBRE_ARRIVE = k => {
  settlePeek()
  const w = W[k], rect = rng(w.node, w.a, w.node, w.b).getBoundingClientRect()
  if (w.s !== lastSent) { lastSent = w.s; if (!reduce) root.animate([{ '--fk': '62%' }, { '--fk': '100%' }], { duration: 380, easing: 'ease-out' }) } // settle
  const t = tokens.find(t => t.node === w.node && t.a <= w.a && t.b >= w.b && t.kind !== 'speech' && t.kind !== 'aside')
  if (t && t.kind === 'name' && on('lnNames') && intensity !== 'quiet') {
    setHL('bloom', [tokRange(t)], PR.bloom); if (!reduce) root.animate([{ '--bloom': '0px' }, { '--bloom': '10px' }, { '--bloom': '0px' }], { duration: 750, easing: 'ease-out' })
    if (!met.has(t.key)) {
      met.add(t.key); const chip = document.createElement('span'); chip.className = 'av'; chip.style.background = `var(${NAMES[t.key]})`; chip.textContent = t.key[0]; chip.title = t.key; chip.style.opacity = 0; $('gCast').append(chip)
      ;(window.PUBRE_SPARK ? window.PUBRE_SPARK(rect, chip.getBoundingClientRect(), getComputedStyle(chip).backgroundColor) : Promise.resolve()).then(() => { chip.style.opacity = 1; chip.animate([{ transform: 'scale(1.8)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.3,1.6,.5,1)' }) })
      toast(`New character: ${t.key}`)
    }
  } else setHL('bloom')
  if (t && (t.kind === 'hard' || t.kind === 'foreign')) peek(tipFor(t), rect)
  const h = hls.find(h => { try { return h.range.isPointInRange(w.node, w.a) } catch { return false } })
  if (h && h !== lastHl) { setHL('breathe', [h.range], PR.breathe); if (!reduce) root.animate([{ '--breathe': '0%' }, { '--breathe': '12%' }, { '--breathe': '0%' }], { duration: 800, easing: 'ease-in-out' }); if (h.note) peek(`<span class="meta2">${MEANING[h.color]}</span> ${h.note}`, rect) }
  lastHl = h
}

// ======================= PART III · FLOW =======================
const PH = [
  { n: '0', t: 'Foundation', eff: '≈ 4 days', ship: ['Visual grammar as tokens: one channel = one meaning, one motion verb each', 'Insights engine in a worker: word, sentence & paragraph index', 'Per-chapter signals: names, rare words, mood, dialogue', 'Exact reading position as CFI (resume to the word)', 'Annotation store (Web Annotation JSON in IndexedDB)'], you: 'Little to see yet beyond resuming at the exact word. Everything after builds on it.', deps: [] },
  { side: true, n: '+', t: 'Protocol data, surfaced', eff: 'small · slot in anywhere', ship: ['Open at the first chapter, not the cover', 'Print page numbers', 'Series shelves', 'Accessibility badges'], you: 'Uses data the new EPUB module already parses.', deps: [] },
  { n: '1', now: true, t: 'Reading guide', eff: '≈ 4 days', ship: ['Pointer types: whole word (default), underline, dot, outline, with a spring hop', 'Contrast focus levels + dim what’s read (default on); clause focus for long sentences', 'Hold · tap · double-tap Space, arrows, vim motions', 'Pace learned from your taps; page turns under the pointer'], you: 'Sit back, hold Space, and read at a steady pace without losing your place.', deps: ['0 · word index', '0 · CFI'] },
  { n: '2', t: 'Lenses & tooltips', eff: '≈ 4 days', ship: ['Attention budget + focus scoping + graceful collapse', 'Names + spoiler-safe card; hard words (Zipf < 3) + offline definitions', 'Speech in the speaker’s colour (collapses to quote marks when dense), asides, foreign phrases', 'Dwell-only peeks; Quiet / Guided / Rich'], you: 'Hard words and names explain themselves without leaving the page.', deps: ['0 · names, rare words'] },
  { n: '3', t: 'Highlights & notes', eff: '≈ 4 days', ship: ['Selection toolbar with 6 base16 colours', 'Bold, italic, underline, wavy', 'Notes shown as hover tooltips', 'Highlights as dots on the capsule; Markdown export'], you: 'Mark up the book like a paper copy, and find every mark again.', deps: ['0 · annotation store', '2 · tooltips'] },
  { n: '4', t: 'The living capsule', eff: '≈ 3 days', ship: ['Mood-tinted wedges', 'Story-shape skyline', 'Time left at your pace', 'Chapter fingerprints', 'Dialogue texture', 'Crossing pulse'], you: 'The progress bar becomes a map of the book.', deps: ['0 · signals', '1 · your pace'] },
  { n: '5', t: 'Chapter stages', eff: '≈ 3 days', ship: ['Semantic chapter openers', 'First-line & epigraph staging', 'Ink-bleed titles'], you: 'Every chapter opens in its own register.', deps: ['0 · signals'] },
  { n: '6', t: 'Meet the cast', eff: '≈ 1 week', ship: ['Character strips + who’s here', 'Full character cards', 'Constellation', '“Previously…” card'], you: 'Keep track of who’s who, and come back after a week without rereading.', deps: ['0 · names', '1 · sentence index', '2 · tooltips'] },
  { n: '7', t: 'Atmosphere & keepsakes', eff: '≈ 1–2 weeks', ship: ['Palette drift', 'Weather & time of day', 'Rare-word sparks', 'Finish keepsake', 'Tasting card', 'Optional on-device ML'], you: 'The book’s weather reaches the page, and finishing leaves a keepsake.', deps: ['0 · signals'] },
]
$('flow2').innerHTML = PH.map(p => `<li class="${p.now ? 'now' : ''} ${p.side ? 'side' : ''}"><span class="n">${p.n}</span><div class="box">
  <div class="top"><h3>${p.t}</h3><span class="eff">${p.eff}${p.now ? ' · start here' : ''}</span></div>
  <p class="you">${p.you}</p>
  <div class="ship">${p.ship.map(s => `<span>${s}</span>`).join('')}</div>
  ${p.deps.length ? `<div class="deps">Builds on ${p.deps.map(d => `<i>${d}</i>`).join('')}</div>` : ''}</div></li>`).join('')
})()
