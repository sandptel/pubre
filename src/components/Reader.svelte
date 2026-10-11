<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { fly } from 'svelte/transition'
  import { Book, type TocItem } from '../lib/epub.ts'
  import { Paginator, type Relocation, type Section } from '../lib/paginator.ts'
  import { effective, type Settings } from '../lib/settings.ts'
  import { Guide, type GuideState } from '../lib/guide.ts'
  import { Lenses, RARE, type Token } from '../lib/lenses.ts'
  import { define, loadCommon, rarity } from '../lib/lexicon.ts'
  import type { Decor } from '../lib/stagetext.ts'
  import { blockOffsets } from '../lib/textindex.ts'
  import { whoHue, WHO_SLOTS } from '../lib/marks.ts'
  import { resolveTheme } from '../lib/settings.ts'
  import type { View as BookView } from '../lib/paginator.ts'
  import { getFile, saveBook, type BookRecord } from '../lib/store.svelte.ts'
  import Appearance from './Appearance.svelte'
  import ReadingAids from './ReadingAids.svelte'
  import { calmRange } from '../lib/calm.ts'
  import { paintAnnotations, quoteOf, resolveAnnotation, toMarkdown, toReadium, unwrapItalic, wrapItalic, type Annotation } from '../lib/annotations.ts'
  import { deleteAnnotation, listAnnotations, saveAnnotation } from '../lib/store.svelte.ts'
  import { MEANINGS } from '../lib/marks.ts'
  import Cover from './Cover.svelte'
  import Progress from './Progress.svelte'
  import Sheet from './Sheet.svelte'
  import Stage, { type StageState } from './Stage.svelte'
  import Toc from './Toc.svelte'

  let { record, settings = $bindable(), onclose }: { record: BookRecord; settings: Settings; onclose: () => void } = $props()

  type View = 'menu' | 'contents' | 'appearance' | 'aids' | 'book' | 'notes'
  const titles: Record<View, string> = { menu: '', contents: 'Contents', appearance: 'Themes & Settings', aids: 'Reading aids', book: 'This book', notes: 'Highlights & notes' }

  const rec: BookRecord = untrack(() => $state.snapshot(record)) // local copy we persist
  let host: HTMLDivElement
  let book = $state.raw<Book>()
  let pag = $state.raw<Paginator>()
  let loc = $state<Relocation>()
  let sections = $state.raw<Section[]>([])
  let chrome = $state(true)
  let panel = $state(false)
  let view = $state<View>('menu')
  let dir = $state(1)
  let error = $state('')
  let saveTimer = 0
  let guide: Guide | undefined
  let stage = $state<ReturnType<typeof Stage>>()
  let staged = $state(false)
  let sstate = $state<StageState>({ open: false, moving: false })
  let paperEl = $state<HTMLDivElement>()
  let lenses: Lenses | undefined
  let card = $state<{ x: number; y: number; below: boolean; html: string } | null>(null)
  let cardKey = '', dwellT = 0, hoverT = 0
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  let gstate = $state<GuideState>({ active: false, gliding: false, wpm: 260 })
  let toastMsg = $state('')
  let toastT = 0
  // This book's overrides (only the differences from your global settings are stored).
  let prefs = $state<Partial<Settings>>(untrack(() => ({ ...(rec.prefs ?? {}) })))
  let custom = $state(untrack(() => !!rec.prefs && Object.keys(rec.prefs).length > 0))
  let bookVal = $state<Settings>(untrack(() => effective(settings, rec.prefs)))
  const eff = $derived(custom ? effective(settings, prefs) : settings)
  $effect(() => {
    if (!custom) { if (Object.keys(prefs).length) { prefs = {}; rec.prefs = undefined; save() } return }
    const b = $state.snapshot(bookVal), g = $state.snapshot(settings), diff: Partial<Settings> = {}
    for (const k of Object.keys(b) as (keyof Settings)[]) if (k !== 'wpm' && JSON.stringify(b[k]) !== JSON.stringify(g[k])) (diff as Record<string, unknown>)[k] = b[k]
    prefs = diff; rec.prefs = diff; clearTimeout(saveTimer); saveTimer = window.setTimeout(save, 500)
  })
  function toast(m: string) { toastMsg = m; clearTimeout(toastT); toastT = window.setTimeout(() => (toastMsg = ''), 1800) }

  // Calm time left in this chapter at your pace, as a range (never a countdown).
  const footText = $derived.by(() => {
    if (!loc) return ''
    const total = rec.profile?.words?.reduce((x, n) => x + n, 0) ?? 0
    const words = total ? (loc.chapterEnd - loc.top) * total : (pag?.current?.ix.words.length ?? 0) * (1 - loc.page / Math.max(1, loc.pages))
    const r = calmRange(words / Math.max(60, eff.wpm))
    return r ? `${r} left in chapter` : loc.page >= loc.pages - 1 ? 'Last page in chapter' : ''
  })

  function save() {
    clearTimeout(saveTimer)
    saveBook(rec)
  }

  onMount(() => {
    let gone = false
    ;(async () => {
      try {
        const data = await getFile(rec.id)
        if (!data) throw new Error('This book’s file is missing from the library.')
        const b = await Book.open(new Uint8Array(data))
        if (gone) return b.destroy()
        book = b
        pag = new Paginator(host, b, $state.snapshot(eff))
        guide = new Guide(pag, $state.snapshot(eff))
        guide.onState = s => { const was = gstate.active; gstate = s; if (s.active !== was) { lastFocusBlock = -1; if (!s.active) paintLenses() } if (s.active) chrome = false; if (s.gliding) hideCard() }
        guide.onPace = wpm => (settings.wpm = wpm)
        guide.onToast = toast
        pag.keyHook = e => !!stage?.key(e) || guide!.key(e)
        pag.tapHook = (v, x, y) => guide!.tapWord(v, x, y) || tapAnnotation(v, x, y)
        lenses = new Lenses($state.snapshot(eff), b.metadata.language)
        lenses.onChange = () => paintLenses()
        pag.onView = v => { stage?.view(v); guide!.view(v); attachHover(v); attachSelection(v); paintAnns(v); paintLenses() }
        listAnnotations(rec.id).then(list => { anns = list; if (pag?.current) paintAnns(pag.current) })
        guide.onArrive = (v, k) => arrive(v, k)
        loadCommon().then(set => { lenses?.setCommon(set); paintLenses() })
        loadProfile(b)
        pag.onSections = s => (sections = s)
        pag.onRelocate = r => {
          chapterTurn(r)
          loc = r
          rec.location = { index: r.index, fraction: r.fraction, cfi: r.cfi }
          rec.progress = r.progress
          rec.chapter = r.chapter
          if (!gstate.active) paintLenses()
          hideCard()
          clearTimeout(saveTimer)
          saveTimer = window.setTimeout(save, 500)
        }
        pag.onTap = zone => { chrome = zone === 'center' ? !chrome : false }
        const away = Date.now() - (rec.opened || Date.now())
        rec.opened = Date.now()
        if (rec.location?.cfi) await pag.openCfi(rec.location.cfi)
        else await pag.open(rec.location?.index ?? 0, rec.location?.fraction ?? 0)
        // "Previously…": after a day or more away, ask first, then recap (retrieval beats rereading).
        if (away > 24 * 3600 * 1000 && rec.progress > 0.002) prepareRecap()
        setTimeout(() => { if (!panel) chrome = false }, 1400)
      } catch (e) {
        error = (e as Error).message
      }
    })()
    return () => {
      gone = true
      save()
      guide?.destroy()
      pag?.destroy()
      book?.destroy()
    }
  })

  // Only appearance changes re-lay out the book; feature settings (guide, lenses, pace) don't.
  const LAYOUT = ['palette', 'mode', 'font', 'fontScale', 'lineHeight', 'margin', 'justify', 'bold', 'spread', 'letterSpacing', 'measure'] as const
  let layoutKey = ''
  $effect(() => {
    const s = $state.snapshot(eff)
    const key = JSON.stringify(LAYOUT.map(k => s[k]))
    if (key !== layoutKey) { layoutKey = key; pag?.setSettings(s) }
    guide?.setSettings(s)
    lenses?.setSettings(s)
    paintLenses()
  })
  $effect(() => { if (!panel) setTimeout(() => (view = 'menu'), 400) }) // reset after the close animation

  function go(v: View) {
    dir = v === 'menu' ? -1 : 1
    view = v
  }
  function jump(href: string) {
    panel = false
    chrome = false
    pag?.goTo(href)
  }

  // ---------- the reading pad (one control for both guide styles) ----------
  // Tap: start, then pause / play (double-tap: back to the sentence start). Hold: read only while held,
  // let go and it goes back. While holding, slide right = faster, left = slower then backwards, up = lock.
  let press = $state<{ hold: boolean; locked: boolean; dx: number; dy: number } | null>(null)
  let pressX = 0, pressY = 0, pressT = 0
  const stageStyle = () => eff.guideStyle === 'stage'
  const padMoving = $derived(eff.guideStyle === 'stage' ? sstate.moving : gstate.gliding)
  /** Shuttle: a dead zone around the press, then right speeds up to 2.5×; left slows to still, then reads backwards. */
  function shuttle(dx: number) {
    if (Math.abs(dx) < 14) return 1
    if (dx > 0) return Math.min(2.5, 1 + (dx - 14) / 90)
    return Math.max(-2, 1 + (dx + 14) / 64)
  }
  const rateLabel = (r: number) => Math.abs(r) < 0.15 ? 'Still' : r < 0 ? `◀ ${(-r).toFixed(1)}×` : Math.abs(r - 1) < 0.05 ? 'Your pace' : `${r.toFixed(1)}×`
  function padPress(e: PointerEvent) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pressX = e.clientX; pressY = e.clientY
    press = { hold: false, locked: false, dx: 0, dy: 0 }
    clearTimeout(pressT)
    pressT = window.setTimeout(holdBegin, 260)
  }
  function holdBegin() {
    if (!press || press.hold) return
    press = { ...press, hold: true }
    chrome = false; hideCard()
    if (stageStyle()) stage?.holdStart(); else guide?.holdStart()
  }
  function padDrag(e: PointerEvent) {
    if (!press) return
    const dx = e.clientX - pressX, dy = e.clientY - pressY
    if (!press.hold) { if (Math.hypot(dx, dy) < 12) return; clearTimeout(pressT); holdBegin() }
    let locked = press.locked
    if (!locked && dy < -64) {
      locked = true
      navigator.vibrate?.(12)
      if (stageStyle()) stage?.lock(); else guide?.lock()
    }
    const r = locked ? 1 : shuttle(dx), was = shuttle(press.dx)
    if (!locked && (Math.sign(r) !== Math.sign(was) || (Math.abs(r) < 0.15) !== (Math.abs(was) < 0.15))) navigator.vibrate?.(6) // a tick into still / backwards
    if (stageStyle()) stage?.setRate(r); else guide?.setRate(r)
    press = { ...press, dx, dy, locked }
  }
  function padRelease() {
    clearTimeout(pressT)
    if (!press) return
    if (!press.hold) padTap()
    else if (stageStyle()) stage?.holdEnd(); else guide?.holdEnd()
    press = null
  }
  function padTap() {
    chrome = false; hideCard()
    if (stageStyle()) stage?.tap(); else guide?.padTap()
  }

  // ---------- the Stage's own visual grammar (one paragraph at a time, so it can be richer than the page) ----------
  const theme = $derived(resolveTheme(eff.palette, eff.mode))
  function decorate(v: BookView, b: number): Decor[] {
    const out: Decor[] = [], blk = v.ix.blocks[b]
    for (const a of anns) { // yours, always
      if (a.spine !== v.index) continue
      const r = resolveAnnotation(v.doc, a), o = r && blockOffsets(blk, r)
      if (o) out.push({ a: o[0], b: o[1], cls: ['lx-yours', a.bold && 'lx-bold', a.italic && 'lx-ital'].filter(Boolean).join(' '), css: `--hl: var(--base${a.color})`, key: a.note ? `note:${a.id}` : undefined })
    }
    if (!eff.stageLenses || eff.intensity === 'quiet' || !lenses) return out
    const rich = eff.intensity === 'rich', seen = new Set<string>(), hardIn = new Set<number>()
    const voiceMix = lenses.shareOf(v, b) > 0.6 ? 42 : 58 // mostly dialogue: a softer tint, so the paragraph isn't one colour
    const hue = (slot: number) => whoHue(theme, slot % WHO_SLOTS)
    const sentAt = (off: number) => { for (let i = blk.a; i <= blk.b; i++) { const w = v.ix.words[i]; if (blk.starts[blk.nodes.indexOf(w.sn)] + w.so >= off) return w.s } return -1 }
    for (const t of lenses.tokensIn(v, b)) {
      const o = lenses.offsets(v, t)
      if (!o) continue
      const [a, e] = o
      if (t.kind === 'name' && eff.names && t.slot >= 0) {
        const first = !seen.has(t.key); seen.add(t.key)
        out.push({ a, b: e, cls: first || rich ? 'lx-name lx-chip' : 'lx-name', css: `--who: ${hue(t.slot)}`, key: `name:${t.key}` })
      } else if (t.kind === 'speech' && eff.voices !== 'off' && t.slot >= 0) {
        const h = hue(t.slot), key = `voice:${t.key}`
        if (eff.voices === 'ink') out.push({ a, b: e, cls: 'lx-voice', css: `--ink: color-mix(in srgb, ${h} ${voiceMix}%, var(--fg))`, key })
        else if (eff.voices === 'underline') out.push({ a, b: e, cls: 'lx-vline', css: `--who: ${h}`, key })
        else {
          if (/[“"]/.test(blk.text[a])) out.push({ a, b: a + 1, cls: 'lx-qmark', css: `--who: ${h}`, key })
          if (/[”"]/.test(blk.text[e - 1])) out.push({ a: e - 1, b: e, cls: 'lx-qmark', css: `--who: ${h}`, key })
        }
      } else if (t.kind === 'hard' && eff.hardWords && eff.hardStyle === 'shown') {
        const z = rarity(t.key), s = sentAt(a)
        if (typeof z !== 'number' || z >= RARE || (!rich && hardIn.has(s))) continue
        hardIn.add(s)
        out.push({ a, b: e, cls: 'lx-hard', key: `hard:${t.key}` })
      } else if (t.kind === 'foreign' && eff.foreign) out.push({ a, b: e, cls: 'lx-foreign', key: `foreign:${t.key}` })
      else if (t.kind === 'aside' && eff.asides) out.push({ a, b: e, cls: 'lx-aside' })
    }
    return out
  }
  async function explain(key: string): Promise<string> {
    const i = key.indexOf(':'), kind = key.slice(0, i), val = key.slice(i + 1)
    if (kind === 'hard') { const d = await define(val); return `<b>${escape(val)}</b>${d ? `<i>${escape(d.pos)}</i>${escape(d.text)}` : 'A rare word.'}` }
    if (kind === 'name' || kind === 'voice') {
      const p = lenses?.person(val), n = p ? p.perSpine.slice(0, (pag?.current?.index ?? 0) + 1).reduce((x, y) => x + y, 0) : 0
      return `<b>${escape(val)}</b>${kind === 'voice' ? 'is speaking.' : n > 1 ? `Mentioned ${n} times so far.` : 'You’re meeting them now.'}`
    }
    if (kind === 'foreign') { let name = val; try { name = new Intl.DisplayNames(['en'], { type: 'language' }).of(val) ?? val } catch { /* unknown code */ } return `A phrase in ${escape(name)}.` }
    if (kind === 'note') { const a = anns.find(x => x.id === val); return a ? `<i>${escape(meaning(a.color))}</i>${escape(a.note)}` : '' }
    return ''
  }

  // ---------- lenses ----------
  let lastFocusBlock = -1
  function paintLenses(focusBlock = -1) {
    const v = pag?.current
    if (!v || !lenses || !pag) return
    if (gstate.active) {
      if (focusBlock < 0) focusBlock = lastFocusBlock
      return lenses.paint(v, focusBlock, focusBlock)
    }
    // Only the spread you're on is painted: one attention budget per screen (and WebKit stays fast).
    const page = pag.currentPage, ws = v.ix.words
    if (!ws.length) return
    const a = pag.firstWordOnPage(v, page), b = page + 1 < v.pages ? pag.firstWordOnPage(v, page + 1) : ws.length - 1
    lenses.paint(v, ws[a].b, ws[b].b)
  }
  async function loadProfile(b: Book) {
    if (rec.profile?.v === 2) { lenses?.setProfile(rec.profile.names); paintLenses(); return }
    const texts = await Promise.all(b.spine.map(s => b.zip.text(s.href).catch(() => '')))
    const worker = new Worker(new URL('../insights/worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = e => {
      rec.profile = { v: 2, names: e.data.names, words: e.data.words }
      lenses?.setProfile(e.data.names); paintLenses(); save(); worker.terminate()
    }
    worker.postMessage({ texts })
  }
  const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  async function cardHtml(v: BookView, t: Token): Promise<string> {
    const theme = resolveTheme(eff.palette, eff.mode)
    if (t.kind === 'name' || (t.kind === 'speech' && t.key)) {
      const p = lenses!.person(t.key)
      const sofar = p ? p.perSpine.slice(0, v.index + 1).reduce((a, n) => a + n, 0) : 0
      const hue = p && p.slot >= 0 ? whoHue(theme, p.slot % WHO_SLOTS) : 'var(--muted)'
      const lead = t.kind === 'speech' ? 'is speaking.' : sofar > 1 ? `Mentioned ${sofar} times so far.` : 'You’re meeting them now.'
      return `<div class="c-who"><span class="c-av" style="background:${hue}">${escape(t.key[0])}</span><b>${escape(t.key)}</b></div><div class="c-def">${lead}</div><div class="c-meta">Counts stop at your page</div>`
    }
    if (t.kind === 'speech') return `<div class="c-def">Quoted words with no speaker named nearby.</div>`
    if (t.kind === 'foreign') return `<b>${escape(lenses!.rangeOf(v, t).toString().slice(0, 60))}</b><div class="c-def">A phrase in another language (${escape(t.key)}).</div>`
    const d = await define(t.key)
    return `<b>${escape(t.key)}</b>${d ? ` <span class="c-meta">${escape(d.pos)}</span><div class="c-def">${escape(d.text)}</div>` : '<div class="c-def">A rare word. No offline definition for this form.</div>'}`
  }
  async function showCard(v: BookView, t: Token) {
    const key = `${v.index}:${t.blk}:${t.a}:${t.kind}`
    if (key === cardKey) return
    cardKey = key
    const html = await cardHtml(v, t)
    if (cardKey !== key) return
    const r = lenses!.rangeOf(v, t).getClientRects()[0], f = v.iframe.getBoundingClientRect()
    if (!r) return
    const x = Math.max(12, Math.min(innerWidth - 292, f.left + r.left + r.width / 2 - 140))
    const below = f.top + r.top < 110 // never cover the line being read: above it, or below when there's no room
    card = { x, y: below ? f.top + r.bottom + 10 : f.top + r.top - 10, below, html }
  }
  function hideCard() { clearTimeout(dwellT); clearTimeout(hoverT); card = null; cardKey = '' }
  const hooked = new WeakSet<Document>()
  function attachHover(v: BookView) {
    if (hooked.has(v.doc)) return
    hooked.add(v.doc)
    v.doc.addEventListener('mousemove', e => {
      clearTimeout(hoverT)
      hoverT = window.setTimeout(() => {
        const d = v.doc as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }
        const pos = d.caretPositionFromPoint?.(e.clientX, e.clientY), cr = pos ? null : d.caretRangeFromPoint?.(e.clientX, e.clientY)
        const node = pos?.offsetNode ?? cr?.startContainer, off = pos?.offset ?? cr?.startOffset ?? 0
        const a = node && annAt(v, node, off)
        if (a) { showNote(v, a); return }
        const t = node && lenses?.tokenAt(v, node, off)
        if (t) showCard(v, t); else hideCard()
      }, 350)
    })
    v.doc.addEventListener('mouseleave', hideCard)
  }
  // ---------- "Previously…" ----------
  // ---------- chapter end: three words + open questions (optional, gentle, non-modal) ----------
  let ending = $state<{ chapter: string; questions: Annotation[] } | null>(null)
  let endWords = $state('')
  let words = $state<Record<string, string>>(untrack(() => rec.words ?? {}))
  let lastLoc: { chapter: string; progress: number } | null = null
  function chapterTurn(r: { chapter: string; progress: number }) {
    const prev = lastLoc
    lastLoc = { chapter: r.chapter, progress: r.progress }
    if (ending) { ending = null; return } // the card leaves on your next page turn
    if (!prev || !prev.chapter || prev.chapter === r.chapter || !eff.chapterPrompts || gstate.gliding) return
    if (r.progress < prev.progress || r.progress - prev.progress > 0.02) return // only when paging forward, not jumping
    if ((rec.promptSkips ?? 0) >= 2 && !anns.some(a => a.color === '09' && a.chapter === prev.chapter && !a.note.startsWith('✓'))) return
    ending = { chapter: prev.chapter, questions: anns.filter(a => a.color === '09' && a.chapter === prev.chapter && !a.note.startsWith('✓')).slice(0, 1) }
    endWords = words[prev.chapter] ?? ''
  }
  function keepWords() {
    if (!ending) return
    const w = endWords.trim().split(/\s+/).slice(0, 3).join(' ')
    if (w) { words = rec.words = { ...words, [ending.chapter]: w }; rec.promptSkips = 0 }
    ending = null; save()
  }
  function skipEnding() { rec.promptSkips = (rec.promptSkips ?? 0) + 1; ending = null; save() }
  async function answered(a: Annotation, yes: boolean) {
    if (yes) { a.note = `✓ ${a.note}`.trim(); await saveAnnotation(a); anns = [...anns] }
    if (ending) ending = { ...ending, questions: [] }
  }

  let recap = $state<{ stage: 'ask' | 'show'; chapter: string; lines: string[]; who: string[]; mine: string[] } | null>(null)
  function prepareRecap() {
    const v = pag?.current
    if (!v || !v.ix.words.length) return
    const k = pag!.firstWordOnPage(v), ix = v.ix, s = ix.words[k]?.s ?? 0
    const lines: string[] = []
    for (let i = Math.max(0, s - 3); i < s; i++) {
      const sp = ix.sentences[i], r = v.doc.createRange()
      r.setStart(ix.words[sp.a].sn, ix.words[sp.a].so); r.setEnd(ix.words[sp.b].en, ix.words[sp.b].eo)
      const t = r.toString().replace(/\s+/g, ' ').trim()
      if (t) lines.push(t.length > 220 ? t.slice(0, 220) + '…' : t)
    }
    // Spoiler-safe: only characters named in the text you read just before your place.
    const b0 = ix.words[k]?.b ?? 0, before = ix.blocks.slice(Math.max(0, b0 - 25), b0 + 1).map(bl => bl.text).join(' ')
    const who = (rec.profile?.names ?? []).filter(n => n.kind === 'person' && n.slot >= 0 && new RegExp(`(?<![A-Za-z])${n.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`).test(before)).slice(0, 4).map(n => n.name)
    recap = { stage: 'ask', chapter: rec.chapter ?? '', lines, who, mine: [] }
    listAnnotations(rec.id).then(list => { if (recap) recap = { ...recap, mine: list.filter(a => a.spine === v.index && ['0A', '09'].includes(a.color)).slice(-2).map(a => a.exact.slice(0, 140)) } })
  }

  // ---------- highlights & notes ----------
  let anns = $state.raw<Annotation[]>([]) // raw: the toolbar edits these objects in place, then reassigns
  let ranges = new Map<string, Range>()
  let bar = $state.raw<{ x: number; y: number; below: boolean; ann?: Annotation; range?: Range; v: BookView; note?: boolean } | null>(null)
  let noteText = $state('')
  const wrapped = new WeakMap<Document, Set<string>>()
  const meaning = (c: string) => MEANINGS.find(m => m[0] === c)?.[1] ?? 'Highlight'
  function paintAnns(v: BookView) {
    // Italic needs real spans (CFI-transparent); apply any missing ones, then re-measure.
    const done = wrapped.get(v.doc) ?? new Set<string>()
    wrapped.set(v.doc, done)
    let changed = false
    for (const a of anns) {
      if (a.spine !== v.index) continue
      if (a.italic && !done.has(a.id)) { const r = resolveAnnotation(v.doc, a); if (r) { wrapItalic(v.doc, r, a.id); done.add(a.id); changed = true } }
      if (!a.italic && done.has(a.id)) { unwrapItalic(v.doc, a.id); done.delete(a.id); changed = true }
    }
    if (changed) { lenses?.invalidate(v); pag?.refresh() }
    ranges = paintAnnotations(v, anns)
  }
  function annAt(v: BookView, node: Node, off: number) {
    for (const [id, r] of ranges) { try { if (r.isPointInRange(node, off)) return anns.find(a => a.id === id) } catch { /* other doc */ } }
    return undefined
  }
  function caretAt(v: BookView, x: number, y: number) {
    const d = v.doc as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }
    const pos = d.caretPositionFromPoint?.(x, y), cr = pos ? null : d.caretRangeFromPoint?.(x, y)
    return { node: pos?.offsetNode ?? cr?.startContainer, off: pos?.offset ?? cr?.startOffset ?? 0 }
  }
  function tapAnnotation(v: BookView, x: number, y: number) {
    const { node, off } = caretAt(v, x, y)
    const a = node && annAt(v, node, off)
    if (!a) { if (bar) { bar = null; return true } return false }
    openBar(v, ranges.get(a.id)!, a)
    return true
  }
  function openBar(v: BookView, r: Range, ann?: Annotation) {
    const rect = r.getBoundingClientRect(), f = v.iframe.getBoundingClientRect()
    const below = f.top + rect.top < 90
    bar = { x: Math.max(12, Math.min(innerWidth - 300, f.left + rect.left + rect.width / 2 - 150)), y: below ? f.top + rect.bottom + 10 : f.top + rect.top - 10, below, ann, range: r, v }
    noteText = ann?.note ?? ''
    hideCard()
  }
  const selHooked = new WeakSet<Document>()
  function attachSelection(v: BookView) {
    if (selHooked.has(v.doc)) return
    selHooked.add(v.doc)
    let t = 0
    v.doc.addEventListener('selectionchange', () => {
      clearTimeout(t)
      t = window.setTimeout(() => {
        const sel = v.doc.getSelection()
        if (sel && !sel.isCollapsed && sel.rangeCount && sel.toString().trim().length > 1) openBar(v, sel.getRangeAt(0))
        else if (bar && !bar.ann) bar = null
      }, 220)
    })
  }
  async function applyColor(c: string) {
    if (!bar || !book) return
    if (bar.ann) { bar.ann.color = c; await saveAnnotation(bar.ann); anns = [...anns]; paintAnns(bar.v); bar = { ...bar }; return }
    const r = bar.range!, v = bar.v
    const a: Annotation = { id: crypto.randomUUID(), book: rec.id, spine: v.index, cfi: book.cfi(v.index, r), ...quoteOf(r), color: c, bold: false, italic: false, note: '', chapter: loc?.chapter ?? '', created: Date.now() }
    anns = [...anns, a]
    await saveAnnotation(a)
    v.doc.getSelection()?.removeAllRanges()
    paintAnns(v)
    bar = { ...bar, ann: a, range: ranges.get(a.id) ?? r }
  }
  async function toggleStyle(k: 'bold' | 'italic') {
    if (!bar) return
    if (!bar.ann) await applyColor('0A') // styling a fresh selection highlights it first
    const a = bar.ann!
    a[k] = !a[k]
    await saveAnnotation(a); anns = [...anns]; paintAnns(bar.v); bar = { ...bar, range: ranges.get(a.id) ?? bar.range }
  }
  async function saveNote() {
    if (!bar) return
    if (!bar.ann) await applyColor('0A')
    bar.ann!.note = noteText.trim(); await saveAnnotation(bar.ann!); anns = [...anns]; bar = null
  }
  async function removeAnn() {
    if (!bar?.ann) return
    const a = bar.ann
    if (a.italic) { unwrapItalic(bar.v.doc, a.id); wrapped.get(bar.v.doc)?.delete(a.id); pag?.refresh() }
    anns = anns.filter(x => x.id !== a.id); await deleteAnnotation(a.id); paintAnns(bar.v); bar = null
  }
  function showNote(v: BookView, a: Annotation) {
    const key = 'ann:' + a.id
    if (cardKey === key) return
    cardKey = key
    const r = ranges.get(a.id)?.getClientRects()[0], f = v.iframe.getBoundingClientRect()
    if (!r) return
    const below = f.top + r.top < 110
    card = { x: Math.max(12, Math.min(innerWidth - 292, f.left + r.left + r.width / 2 - 140)), y: below ? f.top + r.bottom + 10 : f.top + r.top - 10, below,
      html: `<div class="c-meta">${escape(meaning(a.color))}</div>${a.note ? `<div class="c-def">${escape(a.note)}</div>` : '<div class="c-def c-meta">Tap to add a note</div>'}` }
  }
  function download(name: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const el = document.createElement('a'); el.href = url; el.download = name; el.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const slug = () => rec.title.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40)

  /** The guide reached word k: repaint lenses if the block changed, bloom names, and offer a card after a dwell. */
  function arrive(v: BookView, k: number) {
    hideCard()
    const w = v.ix.words[k]
    if (!w) return
    if (w.b !== lastFocusBlock) { lastFocusBlock = w.b; paintLenses(w.b) }
    const t = lenses?.tokenAt(v, w.sn, w.so)
    if (t?.kind === 'name' && eff.names && eff.intensity !== 'quiet' && eff.motion === 'full' && !reduceMotion) {
      v.marks.set('bloom', [lenses!.rangeOf(v, t)])
      v.doc.documentElement.animate([{ '--bloom': '0px' }, { '--bloom': '8px' }, { '--bloom': '0px' }] as Keyframe[], { duration: 700, easing: 'ease-out' })
    } else v.marks.set('bloom', [])
    if (t && t.kind !== 'speech') dwellT = window.setTimeout(() => { if (!gstate.gliding) showCard(v, t) }, 600) // help on request, never mid-sentence
  }

  const isCurrent = (t: TocItem) => !!loc && t.label === loc.chapter
</script>

<svelte:window onkeydown={e => { if (e.key === 'Escape' && !panel && !gstate.active && !staged) chrome = !chrome }} />

<div class="reader" class:chrome>
  <div class="paper" bind:this={paperEl} style:view-transition-name="cover">
    <div class="stage" bind:this={host}></div>
    {#if !loc && !error}<div class="spinner" aria-label="Opening book"></div>{/if}
  </div>

  {#if loc}
    <div class="running head" aria-hidden="true">{loc.chapter || rec.title}</div>
    <div class="running foot" aria-hidden="true">
      {footText}
    </div>
  {/if}

  <button class="fab glass close" aria-label="Close book" onclick={onclose}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>
  </button>

  <div class="dock">
    {#if loc}
      <div class="progress">
        <Progress {sections} {words} progress={loc.progress} chapter={loc.chapter || rec.title} page={loc.page} pages={loc.pages}
          onjump={jump} onscrub={p => pag?.goToProgress(p)} />
      </div>
    {/if}
    <button class="fab glass menu" aria-label="Reading menu" onclick={() => { view = 'menu'; panel = true }} disabled={!book}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h9" /></svg>
    </button>
  </div>

  {#if eff.guide && loc && !error}
    <button class="pad glass" class:up={chrome && !staged} class:moving={padMoving} class:held={press?.hold} class:active={gstate.active || staged}
      aria-label={padMoving ? 'Pause (tap). Hold and slide to change speed.' : 'Read (tap to start; hold to read while held, slide while holding to change speed, slide up to lock)'}
      onpointerdown={padPress} onpointermove={padDrag} onpointerup={padRelease} onpointercancel={padRelease}
      onkeydown={e => { if (e.key === 'Enter') { e.preventDefault(); padTap() } }}
      oncontextmenu={e => e.preventDefault()}>
      <span class="pad-ring"></span>
      {#if padMoving}<svg class="pad-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.6" height="12" rx="1.2" fill="currentColor" /><rect x="13.4" y="6" width="3.6" height="12" rx="1.2" fill="currentColor" /></svg>
      {:else}<svg class="pad-i play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8v12.4a.8.8 0 001.2.7l9.6-6.2a.8.8 0 000-1.4L9.7 5.1a.8.8 0 00-1.2.7z" fill="currentColor" /></svg>{/if}
    </button>
    {#if press?.hold}
      <div class="shuttle glass" role="status" aria-live="polite">
        <div class="sh-lock" class:near={press.dy < -24} class:on={press.locked}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2" fill="currentColor" /><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" fill="none" stroke="currentColor" stroke-width="2" /></svg>
          {press.locked ? 'Locked' : 'Slide up to lock'}
        </div>
        {#if !press.locked}
          <div class="sh-row"><span>slower</span><span class="sh-track"><i style:left="{50 + Math.max(-46, Math.min(46, press.dx / 2.4))}%"></i></span><span>faster</span></div>
          <b class="sh-rate">{rateLabel(shuttle(press.dx))}</b>
        {/if}
      </div>
    {/if}
  {/if}
  <Stage bind:this={stage} {pag} settings={eff} chapter={loc?.chapter || rec.title} pageEl={paperEl} {decorate} {explain}
    onopen={o => { staged = o; if (o) { chrome = false; hideCard(); guide?.deactivate() } else paintLenses() }} onstate={st => (sstate = st)}
    onpace={w => (settings.wpm = w)} ontoast={toast} />
  {#if bar}
    <div class="hl-bar glass" class:below={bar.below} style:left="{bar.x}px" style:top="{bar.y}px" role="toolbar" aria-label="Highlight">
      <div class="hl-row">
        {#each MEANINGS as [c, name]}
          <button class="hl-c" class:on={bar.ann?.color === c} title={name} aria-label={name} onclick={() => applyColor(c)}><i style:background="var(--base{c})"></i></button>
        {/each}
        <span class="hl-sep"></span>
        <button class="hl-b" class:on={bar.ann?.bold} aria-label="Bold" onclick={() => toggleStyle('bold')}><b>B</b></button>
        <button class="hl-b" class:on={bar.ann?.italic} aria-label="Italic" onclick={() => toggleStyle('italic')}><i>I</i></button>
        <button class="hl-b" class:on={bar.note} aria-label="Note" onclick={() => { if (bar) bar = { ...bar, note: !bar.note } }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z" /></svg></button>
        {#if bar.ann}<button class="hl-b" aria-label="Remove highlight" onclick={removeAnn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>{/if}
      </div>
      {#if bar.note}
        <input class="hl-note" placeholder="Note… (Enter to save)" bind:value={noteText} onkeydown={e => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') bar = null }} />
      {/if}
      {#if bar.ann}<span class="hl-m">{meaning(bar.ann.color)}</span>{/if}
    </div>
  {/if}
  {#if ending && !chrome && !staged}
    <div class="ending glass" role="status">
      <span class="r-eyebrow">End of {ending.chapter}</span>
      {#each ending.questions as q (q.id)}
        <p class="e-q">You asked: <i>“{q.exact.slice(0, 120)}{q.exact.length > 120 ? '…' : ''}”</i>. Answered yet?</p>
        <div class="r-actions"><button class="pill ghost" onclick={() => answered(q, true)}>Yes</button><button class="r-skip" onclick={() => answered(q, false)}>Not yet</button></div>
      {/each}
      {#if !ending.questions.length}
        <label class="e-l" for="three">Three words for this chapter?</label>
        <div class="e-row"><input id="three" class="e-in" placeholder="e.g. storm, oath, doubloon" bind:value={endWords} onkeydown={e => { e.stopPropagation(); if (e.key === 'Enter') keepWords(); if (e.key === 'Escape') skipEnding() }} />
          <button class="pill ghost" onclick={keepWords}>Keep</button><button class="r-skip" onclick={skipEnding}>Skip</button></div>
      {/if}
    </div>
  {/if}
  {#if recap}
    <div class="recap glass" role="dialog" aria-label="Previously">
      <span class="r-eyebrow">Welcome back</span>
      <b class="r-title">{rec.title}</b>
      {#if recap.chapter}<span class="r-ch">{recap.chapter}</span>{/if}
      {#if recap.stage === 'ask'}
        <p class="r-q">Before the recap: what happened last? Take a moment to recall it.</p>
        <div class="r-actions"><button class="pill" onclick={() => recap && (recap = { ...recap, stage: 'show' })}>Show recap</button><button class="r-skip" onclick={() => (recap = null)}>Just read</button></div>
      {:else}
        {#if recap.lines.length}<div class="r-lines">{#each recap.lines as l}<p>{l}</p>{/each}</div>{/if}
        {#if recap.mine.length}<span class="r-label">Your marks</span>{#each recap.mine as m}<p class="r-mine">“{m}”</p>{/each}{/if}
        {#if recap.who.length}<span class="r-label">With</span><p class="r-who">{recap.who.join(' · ')}</p>{/if}
        <div class="r-actions"><button class="pill" onclick={() => (recap = null)}>Continue reading</button></div>
      {/if}
    </div>
  {/if}
  {#if card}
    <div class="lens-card glass" class:below={card.below} style:left="{card.x}px" style:top="{card.y}px" role="tooltip">{@html card.html}</div>
  {/if}
  {#if toastMsg}<div class="toast glass" role="status">{toastMsg}</div>{/if}

  {#if error}
    <div class="error" role="alert">
      <h2>Couldn’t open this book</h2>
      <p>{error}</p>
      <button class="pill" onclick={onclose}>Back to library</button>
    </div>
  {/if}
</div>

<Sheet bind:open={panel} title={titles[view]} back={view !== 'menu' ? () => go('menu') : undefined} seeThrough={view === 'appearance'}>
  <div class="views">
    {#key view}
      <div class="view" in:fly={{ x: dir * 40, duration: 380, easing: cubicOut }} out:fly={{ x: -dir * 40, duration: 180 }}>
        {#if view === 'menu'}
          <div class="book">
            <div class="thumb"><Cover book={rec} /></div>
            <div class="info">
              <strong>{rec.title}</strong>
              <span>{rec.creator}</span>
              {#if loc}<span class="where">{Math.round(loc.progress * 100)}%{loc.chapter ? ` · ${loc.chapter}` : ''}</span>{/if}
            </div>
          </div>
          <div class="list">
            <button onclick={() => go('contents')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></svg>
              <span>Contents</span>
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <button onclick={() => go('appearance')}>
              <span class="aa" aria-hidden="true">Aa</span>
              <span>Themes &amp; Settings</span>
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <button onclick={() => go('aids')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="9" width="9" height="6" rx="2" fill="currentColor" opacity=".35" stroke="none" /><path d="M3 18h18M15 12h6" /></svg>
              <span>Reading aids</span>
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <button onclick={() => go('notes')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z" /></svg>
              <span>Highlights &amp; notes{#if anns.length}<small class="badge">{anns.length}</small>{/if}</span>
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <button onclick={() => { bookVal = effective(settings, prefs); go('book') }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3z" /><path d="M5 17a3 3 0 013-3h10" /></svg>
              <span>This book{#if custom}<small class="badge">custom</small>{/if}</span>
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
        {:else if view === 'contents' && book}
          <Toc toc={book.toc} {isCurrent} onpick={jump} />
        {:else if view === 'appearance'}
          <Appearance bind:settings />
        {:else if view === 'aids'}
          <ReadingAids bind:value={settings} />
        {:else if view === 'notes'}
          {#if !anns.length}
            <p class="empty-notes">Select any text to highlight it. Each colour has a meaning: {MEANINGS.map(m => m[1]).join(', ')}.</p>
          {:else}
            <ul class="notes">
              {#each [...anns].sort((x, y) => x.spine - y.spine || x.created - y.created) as a (a.id)}
                <li><button onclick={() => { panel = false; pag?.openCfi(a.cfi) }}>
                  <span class="n-chip" style:background="var(--base{a.color})"></span>
                  <span class="n-body"><span class="n-q" class:b={a.bold} class:i={a.italic}>“{a.exact.length > 160 ? a.exact.slice(0, 160) + '…' : a.exact}”</span>
                    {#if a.note}<span class="n-note">{a.note}</span>{/if}
                    <span class="n-meta">{meaning(a.color)}{a.chapter ? ` · ${a.chapter}` : ''}</span></span>
                </button></li>
              {/each}
            </ul>
            <div class="exports">
              <button class="pill ghost" onclick={() => download(`${slug()}-highlights.md`, toMarkdown(rec.title, rec.creator, anns), 'text/markdown')}>Export Markdown</button>
              <button class="pill ghost" onclick={() => download(`${slug()}.annotation`, JSON.stringify(toReadium(rec.title, book?.metadata.identifier ?? '', anns), null, 2), 'application/rd-annotations+json')}>Export annotations</button>
            </div>
          {/if}
        {:else if view === 'book'}
          <label class="custom"><span>Custom reading aids for this book<small>{custom ? 'Changes here apply only to this book' : 'Uses your defaults'}</small></span>
            <input type="checkbox" role="switch" bind:checked={custom} onchange={() => { if (custom) bookVal = effective(settings, prefs) }} /></label>
          {#if custom}
            <ReadingAids bind:value={bookVal} />
            <button class="reset" onclick={() => { custom = false }}>Use my defaults again</button>
          {/if}
        {/if}
      </div>
    {/key}
  </div>
</Sheet>

<style>
  .reader { position: fixed; inset: 0; overflow: hidden; background: var(--bg); }
  .paper { position: absolute; inset: 0; background: var(--bg); }
  .stage {
    position: absolute; overflow: hidden;
    inset: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  .stage :global(.pubre-view) { will-change: transform; } /* inherits the theme's color-scheme, matching the book's (else an opaque canvas hides what's behind) */

  .running {
    position: absolute; left: 50%; translate: -50% 0; max-width: 60vw; pointer-events: none;
    font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: opacity .3s var(--ease);
  }
  .head { top: calc(env(safe-area-inset-top) + var(--s4)); font-family: var(--serif); font-style: italic; }
  .foot { bottom: calc(env(safe-area-inset-bottom) + var(--s4)); font-variant-numeric: tabular-nums; }
  .chrome .running { opacity: 0; }

  /* Floating chrome springs in from its edge; the dock trails slightly. */
  .close, .dock { position: absolute; z-index: 2; transition: transform .5s var(--spring), opacity .25s var(--ease); }
  .close { top: calc(env(safe-area-inset-top) + var(--s3)); left: calc(env(safe-area-inset-left) + var(--s3)); }
  .dock {
    left: calc(env(safe-area-inset-left) + var(--s3)); right: calc(env(safe-area-inset-right) + var(--s3));
    bottom: calc(env(safe-area-inset-bottom) + var(--s3));
    display: flex; align-items: end; gap: var(--s2); pointer-events: none; transition-delay: .04s;
  }
  .dock > * { pointer-events: auto; }
  .progress { flex: 1; min-width: 0; }
  .dock .menu { flex: none; margin-left: auto; }
  @media (min-width: 720px) {
    /* Centered capsule; menu button pinned to the corner. */
    .progress { position: absolute; left: 50%; bottom: 0; width: min(560px, calc(100% - 140px)); translate: -50% 0; }
  }
  .reader:not(.chrome) .close { transform: translateY(-12px) scale(.6); opacity: 0; pointer-events: none; }
  .reader:not(.chrome) .dock { transform: translateY(16px) scale(.94); opacity: 0; }
  .reader:not(.chrome) .dock > * { pointer-events: none; }

  .views { display: grid; }
  .view { grid-area: 1 / 1; min-width: 0; }
  .book { display: flex; gap: var(--s4); align-items: center; margin-bottom: var(--s4); padding-right: var(--s6); }
  .thumb { width: 52px; flex: none; }
  .info { display: grid; gap: 2px; min-width: 0; }
  .info strong { font: 600 17px/1.25 var(--serif); }
  .info span { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .info .where { color: var(--accent); font-weight: 600; font-size: 12px; margin-top: 2px; }
  .list { border-radius: 12px; background: var(--hover); overflow: hidden; }
  .list button {
    display: flex; align-items: center; gap: var(--s3); width: 100%; min-height: 50px; padding: 0 var(--s4);
    border: 0; background: none; font-size: 16px; text-align: left; transition: background-color .15s;
  }
  .list button:hover { background: var(--hover); }
  .list button + button { border-top: .5px solid var(--hairline); }
  .list button > span:not(.aa) { flex: 1; }
  .list svg { width: 20px; height: 20px; color: var(--accent); }
  .list .chev { width: 16px; height: 16px; color: var(--muted); }
  .badge { margin-left: 8px; padding: 1px 6px; border-radius: 6px; font-size: 11px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); vertical-align: 2px; }
  .custom { display: flex; align-items: center; gap: var(--s3); min-height: 56px; padding: 0 var(--s4); border-radius: 12px; background: var(--hover); font-size: 15px; }
  .custom > span { flex: 1; display: grid; }
  .custom small { font-size: 12px; color: var(--muted); }
  .custom input[role=switch] { appearance: none; flex: none; width: 50px; height: 30px; border-radius: 15px; margin: 0; position: relative; cursor: pointer; background: color-mix(in srgb, var(--fg) 18%, transparent); transition: background-color .25s; }
  .custom input[role=switch]::before { content: ''; position: absolute; top: 2px; left: 2px; width: 26px; height: 26px; border-radius: 50%; background: white; box-shadow: 0 2px 5px rgb(0 0 0 / .25); transition: transform .3s var(--ease); }
  .custom input[role=switch]:checked { background: var(--accent); }
  .custom input[role=switch]:checked::before { transform: translateX(20px); }
  .reset { margin-top: var(--s4); border: 0; background: none; color: var(--accent); font-size: 14px; padding: var(--s2) 0; }
  .aa { width: 20px; font: 600 15px var(--serif); color: var(--accent); text-align: center; }

  .spinner {
    position: absolute; top: 50%; left: 50%; width: 28px; height: 28px; margin: -14px;
    border: 2.5px solid var(--line); border-top-color: var(--accent); border-radius: 50%;
    animation: spin .8s linear infinite;
  }
  /* Reading guide: pointer (in the page strip, behind the transparent book), pad, toast */
  .reader :global(.pubre-pointer) { position: absolute; left: 0; top: 0; z-index: 0; pointer-events: none; opacity: 0; transition: opacity .2s; }
  .reader :global(.pubre-pointer.on) { opacity: 1; }
  .reader :global(.pubre-pointer.p-word) { background: color-mix(in srgb, var(--accent) 22%, transparent); border-radius: 6px; }
  .reader :global(.pubre-pointer.p-outline) { border-radius: 6px; box-shadow: inset 0 0 0 1.5px var(--accent); }
  .reader :global(.pubre-pointer.p-underline) { background: var(--accent); border-radius: 2px; }
  .reader :global(.pubre-pointer.p-dot) { background: var(--accent); border-radius: 50%; }
  /* The reading pad: always in the thumb's corner; above the menu while the controls show; above the Stage too. */
  .pad {
    position: absolute; z-index: 8; right: calc(env(safe-area-inset-right) + var(--s3)); bottom: calc(env(safe-area-inset-bottom) + var(--s3));
    width: 56px; height: 56px; border: 0; border-radius: 50%; display: grid; place-items: center; color: var(--fg);
    touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
    transition: transform .5s var(--spring), opacity .3s, background-color .3s, color .3s; animation: padIn .45s var(--spring);
  }
  .pad.up { transform: translateY(-60px); }
  .pad.active { color: var(--accent); }
  .pad.held { transform: scale(.92); background: color-mix(in srgb, var(--accent) 18%, var(--bg)); }
  .pad-i { width: 22px; height: 22px; transition: transform .3s var(--spring); }
  .pad-i.play { margin-left: 2px; }
  .pad:active .pad-i { transform: scale(.9); }
  .pad-ring { position: absolute; inset: -4px; border-radius: 50%; border: 2px solid var(--accent); opacity: 0; pointer-events: none; }
  .pad.held .pad-ring { opacity: 1; animation: ring 1.4s ease-out infinite; }
  @media (hover: hover) and (pointer: fine) { .pad { width: 48px; height: 48px; opacity: .6; } .pad:hover, .pad.held, .pad.up { opacity: 1; } }
  @keyframes padIn { from { opacity: 0; transform: scale(.7); } }
  @keyframes ring { from { transform: scale(.96); opacity: .9; } to { transform: scale(1.18); opacity: 0; } }
  /* While holding: the shuttle and the lock, just above the thumb */
  .shuttle {
    position: absolute; z-index: 8; right: calc(env(safe-area-inset-right) + var(--s3)); bottom: calc(env(safe-area-inset-bottom) + var(--s3) + 70px);
    width: 216px; padding: 10px 12px; border-radius: 16px; display: grid; gap: 8px; justify-items: center;
    font-size: 11.5px; color: var(--muted); pointer-events: none; animation: cardIn .25s var(--ease);
  }
  .sh-lock { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; transition: background-color .2s, color .2s, transform .3s var(--spring); }
  .sh-lock svg { width: 14px; height: 14px; }
  .sh-lock.near { color: var(--fg); transform: translateY(-2px); }
  .sh-lock.on { background: var(--accent); color: var(--bg); }
  .sh-row { display: flex; align-items: center; gap: 8px; width: 100%; }
  .sh-track { position: relative; flex: 1; height: 4px; border-radius: 2px; background: linear-gradient(90deg, color-mix(in srgb, var(--fg) 12%, transparent), color-mix(in srgb, var(--accent) 45%, transparent)); }
  .sh-track::before { content: ''; position: absolute; left: 50%; top: -3px; width: 1px; height: 10px; background: var(--muted); opacity: .5; }
  .sh-track i { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--accent); box-shadow: 0 1px 4px rgb(0 0 0 / .25); }
  .sh-rate { font: 600 15px system-ui; color: var(--fg); font-variant-numeric: tabular-nums; }
  .ending { position: absolute; z-index: 6; left: 50%; bottom: calc(env(safe-area-inset-bottom) + 64px); translate: -50% 0; width: min(420px, calc(100vw - 32px));
    padding: var(--s3) var(--s4); border-radius: 18px; display: grid; gap: var(--s2); animation: cardIn .35s var(--ease); }
  .e-q { margin: 0; font: 14.5px/1.45 var(--serif); }
  .e-l { font-size: 13px; color: var(--muted); }
  .e-row { display: flex; gap: var(--s2); align-items: center; }
  .e-in { flex: 1; min-width: 0; border: 0; border-radius: 10px; padding: 8px 10px; background: var(--hover); font: 14px system-ui; color: var(--fg); outline: none; }
  .recap { position: absolute; z-index: 7; left: 50%; top: 50%; translate: -50% -50%; width: min(440px, calc(100vw - 32px)); max-height: 80dvh; overflow: auto;
    padding: var(--s5); border-radius: 24px; display: grid; gap: var(--s2); animation: cardIn .35s var(--ease); }
  .r-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); }
  .r-title { font: 600 20px/1.2 var(--serif); }
  .r-ch { font: italic 14px var(--serif); color: var(--muted); }
  .r-q { font: 16px/1.5 var(--serif); margin: var(--s2) 0; }
  .r-lines p, .r-mine { font: 15px/1.55 var(--serif); margin: 0 0 var(--s2); }
  .r-lines { border-left: 2px solid var(--line); padding-left: var(--s3); }
  .r-label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-top: var(--s2); }
  .r-mine { font-style: italic; }
  .r-who { margin: 0; font-size: 14px; }
  .r-actions { display: flex; gap: var(--s3); align-items: center; margin-top: var(--s3); }
  .r-skip { border: 0; background: none; color: var(--muted); font-size: 14px; }
  .hl-bar { position: fixed; z-index: 6; width: 300px; padding: 6px; border-radius: 14px; transform: translateY(-100%); animation: cardIn .2s var(--ease); }
  .hl-bar.below { transform: none; }
  .hl-row { display: flex; align-items: center; gap: 2px; }
  .hl-c, .hl-b { width: 32px; height: 32px; border: 0; border-radius: 9px; background: none; display: grid; place-items: center; font: 16px var(--serif); color: var(--fg); }
  .hl-c:hover, .hl-b:hover, .hl-b.on { background: var(--hover); }
  .hl-c i { width: 18px; height: 18px; border-radius: 50%; display: block; box-shadow: inset 0 0 0 .5px rgb(0 0 0 / .2); transition: transform .25s var(--ease); }
  .hl-c.on i { transform: scale(1.15); box-shadow: 0 0 0 2px var(--bg), 0 0 0 3.5px var(--fg); }
  .hl-b svg { width: 16px; height: 16px; }
  .hl-sep { width: .5px; height: 20px; background: var(--hairline); margin: 0 3px; }
  .hl-note { width: 100%; margin-top: 6px; border: 0; border-radius: 9px; padding: 8px 10px; background: var(--hover); font: 14px system-ui; color: var(--fg); outline: none; }
  .hl-m { display: block; font-size: 11px; color: var(--muted); padding: 4px 8px 0; }
  .empty-notes { color: var(--muted); font-size: 14px; line-height: 1.5; }
  .notes { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .notes button { display: flex; gap: var(--s3); width: 100%; text-align: left; border: 0; background: none; padding: var(--s3) var(--s2); border-radius: 12px; }
  .notes button:hover { background: var(--hover); }
  .n-chip { width: 4px; border-radius: 2px; flex: none; }
  .n-body { display: grid; gap: 4px; min-width: 0; }
  .n-q { font: 15px/1.45 var(--serif); }
  .n-q.b { -webkit-text-stroke: .03em currentColor; } .n-q.i { font-style: italic; }
  .n-note { font-size: 13.5px; }
  .n-meta { font-size: 11.5px; color: var(--muted); }
  .exports { display: flex; gap: var(--s2); flex-wrap: wrap; margin-top: var(--s4); }
  .pill.ghost { background: var(--hover); color: var(--fg); font-weight: 600; font-size: 13px; padding: 8px 14px; }
  .lens-card {
    position: fixed; z-index: 5; width: 280px; padding: 10px 14px; border-radius: 14px; font-size: 13.5px; line-height: 1.45;
    transform: translateY(-100%); pointer-events: none; animation: cardIn .2s var(--ease);
  }
  .lens-card.below { transform: none; }
  .lens-card :global(b) { font: 600 16px var(--serif); }
  .lens-card :global(.c-def) { margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .lens-card :global(.c-meta) { font-size: 11.5px; color: var(--muted); }
  .lens-card :global(.c-who) { display: flex; align-items: center; gap: 8px; }
  .lens-card :global(.c-av) { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; color: #fff; font: 600 12px var(--serif); }
  @keyframes cardIn { from { opacity: 0; } }
  .toast { position: absolute; z-index: 4; left: 50%; top: calc(env(safe-area-inset-top) + var(--s5)); translate: -50% 0; padding: 8px 14px; border-radius: 999px; font-size: 13px; animation: toastIn .35s var(--ease); pointer-events: none; }
  @keyframes toastIn { from { opacity: 0; transform: translateY(-6px); } }
  .error { position: absolute; inset: 0; z-index: 3; display: grid; place-content: center; justify-items: center; text-align: center; padding: var(--s5); background: var(--bg); }
  .error h2 { font: 600 1.5rem var(--serif); margin: 0 0 var(--s2); }
  .error p { color: var(--muted); max-width: 420px; margin: 0 0 var(--s5); }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
