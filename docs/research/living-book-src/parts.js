(() => {
const $ = id => document.getElementById(id)
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const HL = window.CSS && CSS.highlights
const setHL = (name, ranges) => { if (!HL) return; ranges && ranges.length ? HL.set(name, new Highlight(...ranges)) : HL.delete(name) }
const caretAt = (x, y) => {
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, offset: p.offset } }
  const r = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, offset: r.startOffset }
}
const textNodes = root => { const out = [], tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); while (tw.nextNode()) out.push(tw.currentNode); return out }

// ======================= PART I · READING GUIDE =======================
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
const range = (a, b) => { const r = document.createRange(); r.setStart(W[a].node, W[a].a); r.setEnd(W[b].node, W[b].b); return r }
let i = 0, active = false, gliding = false, wpm = 260, unit = 'word', focus = 'sent', timer = 0, lastTap = 0, beforeTap = 0, prevTop = null, spaceDown = 0, holdT = 0
const HARD = new Set(Object.keys(LENS.words))
const factor = w => (0.7 + 0.3 * Math.min(w.len, 14) / 5) * [1, 1.5, 2, 2.5][w.pause] * (HARD.has(w.node.data.slice(w.a, w.b).toLowerCase()) ? 1.3 : 1) / 1.25
const wordMs = w => 60000 / wpm * factor(w)

function render(dur = 280, glide = false) {
  if (!active) return
  const w = W[i], j = unit === 'phrase' ? Math.min(W.length - 1, nextUnit(i) - 1) : i, r = range(i, j), rect = range(i, i).getClientRects()[0], box = gText.getBoundingClientRect()
  if (!rect) return
  const newLine = prevTop !== null && Math.abs(rect.top - prevTop) > 4
  prevTop = rect.top
  cur.classList.toggle('glide', glide)
  if (newLine || reduce) { cur.style.transition = 'none'; void cur.offsetWidth }
  else cur.style.transitionDuration = `${dur}ms`
  cur.style.transform = `translate(${rect.left - box.left}px, ${rect.bottom - box.top + 2}px)`
  const end = range(j, j).getClientRects()[0]
  cur.style.width = (end && Math.abs(end.top - rect.top) < 4 ? end.right - rect.left : rect.width) + 'px'
  if (newLine || reduce) requestAnimationFrame(() => (cur.style.transition = ''))
  const s = S[w.s], p = P[w.p]
  setHL('g-sent', focus === 'sent' ? [range(s.a, s.b)] : null)
  setHL('g-para', focus === 'para' ? [range(p.a, p.b)] : null)
  if (focus === 'line') { const [a, b] = lineSpan(i); const all = document.createRange(); const pre = document.createRange(), post = document.createRange()
    pre.setStart(W[0].node, 0); pre.setEnd(W[a].node, W[a].a); post.setStart(W[b].node, W[b].b); const last = W[W.length - 1]; post.setEnd(last.node, last.node.length); setHL('g-dim', [pre, post]) } else setHL('g-dim')
  setHL('g-read', $('gRead').checked && i > 0 ? [(() => { const x = document.createRange(); x.setStart(W[0].node, W[0].a); x.setEnd(w.node, w.a); return x })()] : null)
  setHL('g-word', [r])
  if (i !== render.last) { render.last = i; window.PUBRE_ARRIVE?.(i) }
}
// Phrase = up to 3 words, ending early at punctuation.
function nextUnit(from) { if (unit === 'word') return from + 1; let k = from; for (let c = 1; c < 3 && !W[k].pause && W[k + 1]; c++) k++; return k + 1 }
function go(n, glide = false) {
  if (n > W.length - 1) { stopGlide(); toast('End of page. In pubre the page turns and the cursor carries on.'); return }
  i = Math.max(0, n)
  render(glide ? wordMs(W[i]) * (unit === 'phrase' ? 2.4 : 0.92) : 280, glide)
}
function startGlide() {
  if (gliding) return
  activate(); gliding = true; $('gHold').classList.add('held'); tick()
}
function tick() { if (!gliding) return; const n = nextUnit(i); let ms = 0; for (let k = i; k < Math.min(n, W.length); k++) ms += wordMs(W[k]); timer = setTimeout(() => { if (!gliding) return; go(n, true); tick() }, ms) }
function stopGlide() { gliding = false; clearTimeout(timer); $('gHold').classList.remove('held'); cur.classList.remove('glide') }
function sentStart() { const s = S[W[i].s]; go(i > s.a ? s.a : W[i].s > 0 ? S[W[i].s - 1].a : 0) }
function nextSent() { if (W[i].s < S.length - 1) go(S[W[i].s + 1].a) }
function prevPara() { const p = P[W[i].p]; go(i > p.a ? p.a : W[i].p > 0 ? P[W[i].p - 1].a : 0) }
function nextPara() { if (W[i].p < P.length - 1) go(P[W[i].p + 1].a) }
const topOf = k => range(k, k).getClientRects()[0]?.top ?? 0
function lineSpan(k) { const t = topOf(k); let a = k, b = k; while (W[a - 1] && Math.abs(topOf(a - 1) - t) < 4) a--; while (W[b + 1] && Math.abs(topOf(b + 1) - t) < 4) b++; return [a, b] }
function line(dir) { const [a, b] = lineSpan(i); const k = dir > 0 ? b + 1 : a - 1; if (!W[k]) return; go(lineSpan(k)[0]) }
function lineEdge(dir) { const t = topOf(i); let k = i; while (W[k + dir] && Math.abs(topOf(k + dir) - t) < 4) k += dir; go(k) }
function speed(f) { wpm = Math.round(Math.max(120, Math.min(450, wpm * f))); showSpeed() }
function showSpeed(learning) {
  const el = $('gSpeed'); el.textContent = `${wpm} wpm`; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash')
  $('gLearn').hidden = !learning
}
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
  ;['g-sent', 'g-para', 'g-read', 'g-word', 'g-dim'].forEach(n => setHL(n))
}
$('gStart').addEventListener('click', () => (active ? deactivate() : activate()))
g.addEventListener('keydown', e => {
  if (e.target.closest('input')) return
  if (e.key === ' ' && e.shiftKey) { e.preventDefault(); activate(); stopGlide(); go(i - 1); return }
  if ((e.key === 'g' || e.key === 'G') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); active ? deactivate() : activate(); return }
  if (e.key === ' ') {
    e.preventDefault(); activate()
    if (e.repeat || spaceDown) return
    spaceDown = performance.now(); holdT = setTimeout(startGlide, 220); return
  }
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
$('gRead').addEventListener('change', () => render(0))
function seg(id, set) { $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) set(b.dataset.v) }) }
function mark(id, v) { $(id).querySelectorAll('button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on) }) }
function setUnit(v) { unit = v; mark('gUnit', v); render(0); toast(v === 'word' ? 'Stepping by word' : 'Stepping by phrase') }
seg('gFocus', v => { focus = v; mark('gFocus', v); activate(); render(0) })
seg('gUnit', v => { activate(); setUnit(v) })
// Dead-man's switch: anything that takes attention away stops the glide.
addEventListener('blur', stopGlide); document.addEventListener('visibilitychange', () => document.hidden && stopGlide())
addEventListener('resize', () => { prevTop = null; render(0) })

// ======================= PART II · LENSES & HIGHLIGHTS =======================
const ld = $('ld'), lText = $('lText'), tip = $('tip'), bar = $('hlBar')
document.body.append(tip); tip.style.position = 'fixed'
$('ldCh').textContent = 'Chapter ' + LENS.chapter
LENS.lens.forEach(t => { const p = document.createElement('p'); p.textContent = t; lText.append(p) })
const NAMES = { Ahab: '--b08', Stubb: '--b0A', Flask: '--b0C', Starbuck: '--b0D', Ishmael: '--b0E' }
LENS.names.Ishmael = { first: '1 · Loomings', before: 0, chapters: 0 }
const hardRe = new RegExp(`\\b(${Object.keys(LENS.words).join('|')})\\b`, 'gi')
let tokens = []
function scan() {
  tokens = []
  for (const root of [lText, gText]) for (const node of textNodes(root)) {
    const s = node.data, add = (re, kind, key) => { for (const m of s.matchAll(re)) tokens.push({ node, a: m.index, b: m.index + m[0].length, kind, key: key ? key(m[0]) : m[0] }) }
    add(/\b(Ahab|Stubb|Flask|Starbuck|Ishmael)\b/g, 'name')
    add(hardRe, 'hard', w => w.toLowerCase())
    if (root === lText) add(/“[^”]*”?/g, 'speech')
  }
  paintLenses()
}
const tokRange = t => { const r = document.createRange(); r.setStart(t.node, t.a); r.setEnd(t.node, t.b); return r }
function paintLenses() {
  for (const n in NAMES) setHL('n-' + n, $('lnNames').checked ? tokens.filter(t => t.kind === 'name' && t.key === n).map(tokRange) : null)
  setHL('hard', $('lnHard').checked ? tokens.filter(t => t.kind === 'hard').map(tokRange) : null)
  setHL('speech', $('lnSpeech').checked ? tokens.filter(t => t.kind === 'speech').map(tokRange) : null)
}
;['lnNames', 'lnHard', 'lnSpeech'].forEach(id => $(id).addEventListener('change', paintLenses))

// user highlights
const COLORS = ['08', '09', '0A', '0B', '0D', '0E']
const hls = []; let editing = null
const MEANING = Object.fromEntries((window.PUBRE_MEANINGS || []).map(([c, n]) => [c, n]))
bar.querySelector('.hl-colors').innerHTML = COLORS.map(c => `<button data-color="${c}" aria-label="${MEANING[c] || 'Highlight'}" title="${MEANING[c] || ''}"><i style="background:var(--b${c})"></i></button>`).join('')
function paintHls() {
  for (const c of COLORS) setHL('u-' + c, hls.filter(h => h.color === c).map(h => h.range))
  setHL('s-u', hls.filter(h => h.styles.has('u')).map(h => h.range))
  setHL('s-w', hls.filter(h => h.styles.has('w')).map(h => h.range))
  setHL('s-b', hls.filter(h => h.styles.has('b')).map(h => h.range))
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
function wrap(h, style) {
  const span = document.createElement('span'); span.className = style === 'b' ? 'hb' : 'hi'; span.dataset.pubre = 'mark' // CFI generation skips data-pubre nodes
  span.append(h.range.extractContents()); h.range.insertNode(span); h.range.selectNodeContents(span)
  ;(h.spans[style] = span)
}
function unwrap(span) { if (!span || !span.parentNode) return; const parent = span.parentNode; while (span.firstChild) parent.insertBefore(span.firstChild, span); span.remove(); parent.normalize() }
function ensure() {
  if (editing) return editing
  const sel = getSelection(); if (!sel || sel.isCollapsed) return null
  const h = { range: sel.getRangeAt(0).cloneRange(), color: '0A', styles: new Set(), note: '', spans: {} }
  hls.push(h); sel.removeAllRanges(); editing = h; return h
}
bar.addEventListener('pointerdown', e => { if (!e.target.closest('input')) e.preventDefault() }) // keep selection
bar.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return
  const h = ensure(); if (!h) return
  if (b.dataset.color) h.color = b.dataset.color
  else if (b.dataset.style) {
    const s = b.dataset.style
    if (h.styles.has(s)) { h.styles.delete(s); if (s === 'i') { const sp = h.spans[s]; const r = document.createRange(); r.setStartBefore(sp); r.setEndAfter(sp); unwrap(sp); h.range = r; delete h.spans[s] } }
    else { h.styles.add(s); if (s === 'i') wrap(h, s) }
    scan()
  } else if (b.dataset.act === 'note') { const n = $('hlNote'); n.hidden = false; n.value = h.note; n.focus(); placeBar(h.range) }
  else if (b.dataset.act === 'del') { Object.values(h.spans).forEach(unwrap); hls.splice(hls.indexOf(h), 1); closeBar(); scan(); return }
  paintHls(); placeBar(h.range)
})
$('hlNote').addEventListener('keydown', e => { if (e.key === 'Enter' && editing) { editing.note = e.target.value.trim(); closeBar() } if (e.key === 'Escape') closeBar() })
document.addEventListener('pointerdown', e => { if (!bar.hidden && !bar.contains(e.target) && !lText.contains(e.target)) closeBar() })

// tooltips
function showTip(html, rect) {
  tip.innerHTML = html; tip.hidden = false
  const w = tip.offsetWidth, h = tip.offsetHeight
  tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)) + 'px'
  tip.style.top = (rect.top - h - 10 < 8 ? rect.bottom + 10 : rect.top - h - 10) + 'px'
}
let tipKey = ''
function hover(e) {
  const c = caretAt(e.clientX, e.clientY); if (!c) return hideTip()
  const t = tokens.find(t => t.node === c.node && c.offset >= t.a && c.offset < t.b && ((t.kind === 'name' && $('lnNames').checked) || (t.kind === 'hard' && $('lnHard').checked)))
  const h = !t && hlAt(c.node, c.offset)
  const key = t ? t.kind + t.key : h ? 'hl' + hls.indexOf(h) : ''
  if (key === tipKey) return
  tipKey = key
  if (t && t.kind === 'name') {
    const n = LENS.names[t.key]
    showTip(`<span class="av" style="background:var(${NAMES[t.key]})">${t.key[0]}</span><b class="w">${t.key}</b><div class="def">${n.before ? `First seen in <b>${n.first}</b>. Mentioned ${n.before} times across ${n.chapters} chapters so far.` : 'You’re meeting them now: this is their first appearance.'}</div><div class="meta2">Spoiler-safe: counts stop at your page</div>`, tokRange(t).getBoundingClientRect())
  } else if (t) {
    const d = LENS.words[t.key]
    showTip(`<b class="w">${t.key}</b><div class="def">${d.def}</div><div class="meta2">Used ${d.count}× in Moby-Dick · sample definition</div>`, tokRange(t).getBoundingClientRect())
  } else if (h) {
    showTip(`<div class="meta2" style="margin:0 0 4px">${MEANING[h.color] || 'Highlight'}</div><div class="def">${h.note ? h.note.replace(/</g, '&lt;') : '<span style="color:var(--muted)">No note. Click to edit.</span>'}</div>`, h.range.getBoundingClientRect())
  } else hideTip()
}
function hideTip() { tip.hidden = true; tipKey = '' }
;[lText, gText].forEach(el => { el.addEventListener('mousemove', hover); el.addEventListener('mouseleave', hideTip) })
lText.addEventListener('click', e => { if (matchMedia('(hover: none)').matches) hover(e) })
addEventListener('scroll', hideTip, { passive: true })
scan()
// A seeded "Key" highlight with a note in the guide passage, so the guide can show "breathe".
const gp0 = gText.querySelector('p').firstChild, gs = gp0.data.indexOf('It is a way'), ge = gp0.data.indexOf('circulation.') + 12
const seed = { range: (() => { const r = document.createRange(); r.setStart(gp0, gs); r.setEnd(gp0, ge); return r })(), color: '0A', styles: new Set(), note: 'Ishmael’s cure for gloom: go to sea.', spans: {} }
hls.push(seed); paintHls()
const mdot = document.createElement('i'); mdot.className = 'mdot'; mdot.title = 'Note'; gText.append(mdot)
function placeDot() { const r = seed.range.getClientRects()[0], box = gText.getBoundingClientRect(); if (r) { mdot.style.left = (box.width + 6) + 'px'; mdot.style.top = (r.top - box.top + r.height / 2 - 3) + 'px' } }
placeDot(); addEventListener('resize', placeDot); document.fonts?.ready.then(placeDot); setTimeout(placeDot, 1500)

// Arrival verbs: what the cursor does when it reaches a word, per the visual grammar.
const met = new Set()
let peekT = 0, lastSent = -1
const root = document.documentElement
function peek(html, rect) { showTip(html, rect); tip.classList.add('peek'); clearTimeout(peekT); peekT = setTimeout(() => { tip.classList.remove('peek'); hideTip() }, 1700) }
window.PUBRE_ARRIVE = k => {
  const w = W[k], rect = (() => { const r = document.createRange(); r.setStart(w.node, w.a); r.setEnd(w.node, w.b); return r.getBoundingClientRect() })()
  if (w.s !== lastSent) { lastSent = w.s; if (!reduce) root.animate([{ '--sentA': '0%' }, { '--sentA': '7%' }], { duration: 420, easing: 'ease-out' }) }
  const t = tokens.find(t => t.node === w.node && t.a <= w.a && t.b >= w.b)
  if (t && t.kind === 'name' && $('lnNames').checked) {
    setHL('g-bloom', [tokRange(t)]); if (!reduce) root.animate([{ '--bloom': '0px' }, { '--bloom': '10px' }, { '--bloom': '0px' }], { duration: 750, easing: 'ease-out' })
    if (!met.has(t.key)) { met.add(t.key); const chip = document.createElement('span'); chip.className = 'av'; chip.style.background = `var(${NAMES[t.key]})`; chip.textContent = t.key[0]; chip.title = t.key; chip.style.opacity = 0; $('gCast').append(chip)
      ;(window.PUBRE_SPARK ? window.PUBRE_SPARK(rect, chip.getBoundingClientRect(), getComputedStyle(chip).backgroundColor) : Promise.resolve()).then(() => { chip.style.opacity = 1; chip.animate([{ transform: 'scale(1.8)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.3,1.6,.5,1)' }) })
      toast(`New character: ${t.key}`) }
  } else setHL('g-bloom')
  if (t && t.kind === 'hard' && $('lnHard').checked) { const d = LENS.words[t.key]; peek(`<b>${t.key}</b>: ${d.def}`, rect) }
  const h = hls.find(h => { try { return h.range.isPointInRange(w.node, w.a) } catch { return false } })
  if (h && h !== window.__lastHl) { setHL('g-breathe', [h.range]); if (!reduce) root.animate([{ '--breathe': '0%' }, { '--breathe': '12%' }, { '--breathe': '0%' }], { duration: 800, easing: 'ease-in-out' }); if (h.note) peek(`<span class="meta2">${MEANING[h.color]}</span> ${h.note}`, rect) }
  window.__lastHl = h
}

// ======================= PART III · FLOW =======================
const PH = [
  { n: '0', t: 'Foundation', eff: '≈ 4 days', ship: ['Visual grammar as tokens: one channel = one meaning, one motion verb each', 'Insights engine in a worker: word, sentence & paragraph index', 'Per-chapter signals: names, rare words, mood, dialogue', 'Exact reading position as CFI (resume to the word)', 'Annotation store (Web Annotation JSON in IndexedDB)'], you: 'Little to see yet beyond resuming at the exact word. Everything after builds on it.', deps: [] },
  { side: true, n: '+', t: 'Protocol data, surfaced', eff: 'small · slot in anywhere', ship: ['Open at the first chapter, not the cover', 'Print page numbers', 'Series shelves', 'Accessibility badges'], you: 'Uses data the new EPUB module already parses.', deps: [] },
  { n: '1', now: true, t: 'Reading guide', eff: '≈ 4 days', ship: ['Cursor + sentence / paragraph tint + dim-what’s-read', 'Hold · tap · double-tap Space, arrows, vim motions', 'Pace learned from your taps', 'Page turns under the cursor; touch hold button'], you: 'Sit back, hold Space, and read at a steady pace without losing your place.', deps: ['0 · word index', '0 · CFI'] },
  { n: '2', t: 'Lenses & tooltips', eff: '≈ 4 days', ship: ['Tooltip system (hover, tap, glass card)', 'Names lens + spoiler-safe mini card', 'Hard-word lens + offline definitions', 'Speech lens'], you: 'Hard words and names explain themselves without leaving the page.', deps: ['0 · names, rare words'] },
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
