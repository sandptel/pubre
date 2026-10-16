<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { fade, fly } from 'svelte/transition'
  import { Book, tocLabel, type TocItem } from '../lib/epub.ts'
  import { Paginator, type Relocation, type Section } from '../lib/paginator.ts'
  import { effective, type Settings } from '../lib/settings.ts'
  import { Guide, type GuideState } from '../lib/guide.ts'
  import { Lenses, RARE, type Token } from '../lib/lenses.ts'
  import { define, loadCommon, rarity } from '../lib/lexicon.ts'
  import { sectionOf, type Decor } from '../lib/stagetext.ts'
  import { nearestWord } from '../lib/textindex.ts'
  import { colourOf } from '../lib/palette.ts'
  import { chapterFor, fingerprint, openerOf } from '../insights/chapters.ts'
  import { companions } from '../insights/cast.ts'
  import { computeProfile, PROFILE_V } from '../lib/profile.ts'
  import { portraitUrl } from '../lib/portrait.ts'
  import { keepsakeSvg } from '../insights/keepsake.ts'
  import { mix } from '../lib/settings.ts'
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
  import Ticker from './Ticker.svelte'
  import Zoom from './Zoom.svelte'
  import ReadPreview from './ReadPreview.svelte'
  import Constellation from './Constellation.svelte'
  import ChapterStrip, { type StripChapter } from './ChapterStrip.svelte'
  import Toc from './Toc.svelte'
  import { readToOf, wordOf, wordsRange } from '../lib/readto.ts'
  import Coach from './Coach.svelte'
  import { learn, learned, shown } from '../lib/hints.ts'

  let { record, settings = $bindable(), onclose }: { record: BookRecord; settings: Settings; onclose: () => void } = $props()

  type View = 'menu' | 'contents' | 'appearance' | 'aids' | 'book' | 'notes' | 'cast'
  const titles: Record<View, string> = { menu: '', contents: 'Contents', appearance: 'Themes & Settings', aids: 'Reading aids', book: 'This book', notes: 'Highlights & notes', cast: 'The cast so far' }

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
  /** A reading setting changed from inside the reader: this book's own if it has overrides for it, else everyone's. */
  function setSetting(k: string, val: unknown) { if (custom && k in prefs) (bookVal as any)[k] = val; else (settings as any)[k] = val }
  /** Is this character named in the text, by any of their forms ("Lizzy" is Elizabeth)? */
  const named = (n: { name: string; aliases?: string[] }, text: string) => new RegExp(`(?<![A-Za-z])(?:${[n.name, ...(n.aliases ?? [])].map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z])`).test(text)
  // ---------- coach marks: show the move until it has been made ----------
  const touchUI = matchMedia('(pointer: coarse)').matches
  let coach = $state<'space' | 'stage' | null>(null), coachDone = $state(false), gentle = $state(false), coachT = 0, nudgeT = 0, lastNudge = 0
  const quiet = () => staged || panel || gstate.active || !eff.guide || !((pag?.current?.ix.words.length ?? 0) > 0)
  /** Only where there's something to read (a cover waits for the next page with words). Until you've read once,
   *  the hint stays; after that it comes back gently whenever you've lingered on a page without the guide. */
  function coachSpace() {
    if (coach || quiet()) return
    if (!learned('space')) { gentle = false; coach = 'space'; return }
    clearTimeout(nudgeT)
    nudgeT = window.setTimeout(() => {
      if (coach || quiet() || Date.now() - lastNudge < 120_000) return
      lastNudge = Date.now(); gentle = true; coach = 'space'
      coachT = window.setTimeout(() => { if (gentle) coach = null }, 6400)
    }, 12_000) // a page turn restarts the wait: only a reader who has stopped on a page is reminded
  }
  function coachOpened() {
    clearTimeout(coachT); clearTimeout(nudgeT)
    if (coach === 'space' && gentle) coach = null
    else if (coach === 'space') { learn('space'); coachDone = true; coachT = window.setTimeout(() => { coach = null; coachDone = false; coachOpened() }, 1300); return }
    if (stageStyle() && shown('stage', 3)) { coach = 'stage'; coachT = window.setTimeout(() => (coach = null), 7200) }
  }
  function coachClosed() {
    if (coach === 'stage') { clearTimeout(coachT); coach = null }
    setTimeout(coachSpace, 1500) // back on the page: the gentle reminder may come again later
    if (pin && shown('pin', 2)) setTimeout(() => { if (!pin?.classList.contains('on')) return; pin.querySelector('b')!.textContent = 'Your place · tap to move'; pin.classList.add('hint'); setTimeout(() => pin?.classList.remove('hint'), 4500) }, 900)
  }
  // ---------- your place: a highlighter up to the word the guide last stood on, and a pin there ----------
  let pin: HTMLElement | undefined, pinT = 0, placeT = 0, placeK = -1, placeV: BookView | undefined
  let moving = false // tapped the pin: the next tap on a word moves your place
  /** Keep your place (the guide calls this on every step; the record is written at most once a second). */
  function setPlace(v: BookView, k: number, now = false) {
    placeV = v; placeK = k
    const write = () => { if (!book || !placeV || placeK < 0) return; rec.readTo = readToOf(placeV, placeK, r => book!.cfi(placeV!.index, r)); save() }
    clearTimeout(placeT)
    if (now) write(); else placeT = window.setTimeout(write, 1000)
  }
  /** The word your place is on, if it's on the page you're looking at (-1 otherwise). */
  function placeHere(): number {
    const v = pag?.current, k = v ? wordOf(v, rec.readTo) : -1
    if (k < 0) return -1
    const r = wordsRange(v!, k).getClientRects()[0]
    return r && pag!.pageOf(r) === pag!.currentPage ? k : -1
  }
  /** Paint your place: what you read of its paragraph in a soft highlighter, the word itself stronger, the pin beside it. */
  function paintPlace(fresh = false) {
    const v = pag?.current
    if (!v || !pin) return
    const k = staged ? -1 : wordOf(v, rec.readTo)
    if (k < 0) { v.marks.set('r-read', []); v.marks.set('r-here', []); pin.classList.remove('on'); return }
    const w = v.ix.words[k], a = v.ix.blocks[w.b].a
    v.marks.set('r-read', k > a ? [wordsRange(v, a, k - 1)] : [])
    v.marks.set('r-here', [wordsRange(v, k)])
    if (fresh && !reduceMotion) v.doc.documentElement.animate([{ '--place': 0 }, { '--place': 1 }] as Keyframe[], { duration: 900, easing: 'ease-out' })
    const r = wordsRange(v, k).getClientRects()[0]
    if (!r || pag!.pageOf(r) !== pag!.currentPage) { pin.classList.remove('on'); return }
    // a flag in the margin beside the line (the word itself is underlined); nothing sits on the letters
    pin.style.transform = `translate(${pag!.columnLeft(v, r.left) - 14}px, ${r.top + r.height / 2 - 8}px)`
    pin.classList.add('on')
  }
  /** Pages slide: the pin hides, then settles in once the page has (it lives outside the book frame). */
  function placeSoon(fresh = false) { pin?.classList.remove('on'); clearTimeout(pinT); pinT = window.setTimeout(() => paintPlace(fresh), 460) }
  /** Back after a while: go to your place and make it unmissable for a moment. */
  async function showPlace() {
    const v = pag?.current, k = v ? wordOf(v, rec.readTo) : -1
    if (k < 0 || !pin) return
    const r = wordsRange(v!, k).getClientRects()[0]
    if (r) await pag!.showPage(pag!.pageOf(r))
    setTimeout(() => { paintPlace(true); pin!.querySelector('b')!.textContent = 'Continue here'; pin!.classList.add('resume'); setTimeout(() => pin?.classList.remove('resume'), 6000) }, 480)
  }
  /** The selection bar's ▶: your place moves to the start of the selection, and the guide reads from there. */
  function readFromHere() {
    const r = bar?.range, v = bar?.v
    if (!r || !v) return
    const k = nearestWord(v.ix.words, r.startContainer, r.startOffset)
    bar = null; v.doc.getSelection()?.removeAllRanges()
    if (k < 0) return
    setPlace(v, k, true); paintPlace(true)
    if (stageStyle()) stage?.start(false, k); else guide?.holdStart(k)
  }
  /** Tap the pin to pick your place up; the next tap on a word puts it down there. */
  function tapPlace(v: BookView, x: number, y: number) {
    if (!pin) return false
    if (moving) {
      moving = false; pin.classList.remove('lift')
      const k = wordAtPoint(v, x, y)
      if (k >= 0) { setPlace(v, k, true); paintPlace(true); toast('Your place is here') }
      return true
    }
    if (!pin.classList.contains('on')) return false
    const p = pin.getBoundingClientRect(), f = v.iframe.getBoundingClientRect(), px = f.left + x, py = f.top + y
    if (px < p.left - 22 || px > p.right + 22 || py < p.top - 22 || py > p.bottom + 10) return false
    moving = true; pin.querySelector('b')!.textContent = 'Tap a word'; pin.classList.add('lift')
    return true
  }
  let staged = $state(false)
  let sstate = $state<StageState>({ open: false, moving: false, progress: 0 })
  let paperEl = $state<HTMLDivElement>()
  let lenses: Lenses | undefined
  let card = $state<{ x: number; y: number; below: boolean; html: string; nx?: number } | null>(null)
  let cardKey = '', dwellT = 0, hoverT = 0
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  let gstate = $state<GuideState>({ active: false, gliding: false, wpm: 180 })
  let toastMsg = $state('')
  let toastT = 0
  // This book's overrides (only the differences from your global settings are stored).
  let prefs = $state<Partial<Settings>>(untrack(() => ({ ...(rec.prefs ?? {}) })))
  let custom = $state(untrack(() => !!rec.prefs && Object.keys(rec.prefs).length > 0))
  let bookVal = $state<Settings>(untrack(() => effective(settings, rec.prefs)))
  const eff = $derived(custom ? effective(settings, prefs) : settings)
  const showChrome = $derived(chrome || eff.pinControls) // pinned: the buttons stay
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

  const footLeft = $derived(footText.replace(/ in chapter$/, ''))
  function save() {
    clearTimeout(saveTimer)
    saveBook(rec)
  }
  /** Keep your place for the homepage: when, the sentence you're on, who was around, words left in the chapter. */
  function snapshotPlace() {
    const v = pag?.current
    if (!v || !v.ix.words.length || !loc) return
    const ix = v.ix, k = pag!.firstWordOnPage(v), sp = ix.sentences[ix.words[k]?.s ?? 0]
    if (!sp) return
    const r = v.doc.createRange()
    r.setStart(ix.words[sp.a].sn, ix.words[sp.a].so); r.setEnd(ix.words[sp.b].en, ix.words[sp.b].eo)
    const t = r.toString().replace(/\s+/g, ' ').trim()
    rec.lastLine = t.length > 220 ? t.slice(0, 220).replace(/\s+\S*$/, '') + '…' : t
    const b0 = ix.words[k].b, before = ix.blocks.slice(Math.max(0, b0 - 25), b0 + 1).map(bl => bl.text).join(' ')
    rec.who = (rec.profile?.names ?? []).filter(n => n.kind === 'person' && n.slot >= 0 && named(n, before)).slice(0, 3).map(n => n.name)
    const total = rec.profile?.words?.reduce((a, n) => a + n, 0) ?? 0
    rec.chapterLeft = total ? Math.max(0, Math.round((loc.chapterEnd - loc.top) * total)) : undefined
    rec.readAt = Date.now()
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
        guide.onState = s => { const was = gstate.active; gstate = s; if (s.active !== was) { lastFocusBlock = -1; if (!s.active) { paintLenses(); where = null; whereBlock = -1 } } if (s.active) chrome = false; if (s.gliding) hideCard() }
        guide.onPace = wpm => (settings.wpm = wpm)
        guide.onToast = toast
        pag.keyHook = e => !!stage?.key(e) || guide!.key(e)
        pag.tapHook = (v, x, y) => tapPlace(v, x, y) || tapPlate(v, x, y) || guide!.tapWord(v, x, y) || tapAnnotation(v, x, y) || tapLens(v, x, y)
        pin = Object.assign(document.createElement('i'), { className: 'pubre-place', innerHTML: '<b></b>' }); pag.port.append(pin)
        pag.holdHook = textHold
        pag.prepareHook = (doc, index) => { if (eff.openers) { titleHeadings(doc); applyOpeners(doc, index) } }
        lenses = new Lenses($state.snapshot(eff), b.metadata.language)
        lenses.onChange = () => paintLenses()
        pag.onView = v => { stage?.view(v); guide!.view(v); attachHover(v); attachSelection(v); paintAnns(v); paintLenses(); placeSoon() }
        listAnnotations(rec.id).then(list => { anns = list; if (pag?.current) paintAnns(pag.current) })
        guide.onArrive = (v, k) => { arrive(v, k); setPlace(v, k) }
        loadCommon().then(set => { lenses?.setCommon(set); paintLenses() })
        loadProfile(b)
        pag.onSections = s => (sections = s)
        pag.onRelocate = r => {
          chapterTurn(r)
          const backMatter = r.progress > 0.85 && /licen[cs]e|gutenberg|endnotes|^notes|index|about the author|acknowledg|colophon|copyright/i.test(r.chapter)
          if ((r.progress >= 0.995 || backMatter) && !rec.keepsake && rec.profile?.punct) { // you finished: your copy, drawn
            const t = resolveTheme(eff.palette, 'paper'), moods = (rec.profile.chapters ?? []).filter(c => c.title).map(c => moodTint(c.mood))
            rec.keepsake = keepsakeSvg(rec.profile.punct, moods.length ? moods : [t.base[t.accent]], rec.title, t.base[5], t.base[0])
            if (rec.progress < 0.995) rec.progress = 1 // back matter counts as finished
            toast('You finished. Your copy is on your shelf.'); save()
          }
          loc = r
          rec.location = { index: r.index, fraction: r.fraction, cfi: r.cfi }
          rec.progress = rec.keepsake && r.progress > 0.85 ? 1 : r.progress // finished stays finished in the back matter
          rec.chapter = r.chapter
          if (!gstate.active) paintLenses()
          const at = `${r.index}:${r.page}`
          if (at !== stagedAt) { stagedAt = at; if (pag?.current) { stageFirstLine(pag.current); starBirth(pag.current) } }
          hideCard(); placeSoon(); if (!coach) setTimeout(coachSpace, 900)
          clearTimeout(saveTimer)
          saveTimer = window.setTimeout(() => { snapshotPlace(); save() }, 500)
        }
        pag.onTap = zone => { chrome = zone === 'center' ? !chrome : false }
        rec.sessionFrom = rec.progress // for the library's arc reveal: what you climb this session grows in
        const away = Date.now() - (rec.opened || Date.now())
        rec.opened = Date.now()
        if (rec.location?.cfi) await pag.openCfi(rec.location.cfi)
        else await pag.open(rec.location?.index ?? 0, rec.location?.fraction ?? 0)
        if (away > 2 * 3600 * 1000) setTimeout(showPlace, 700) // back after a while: your place, unmissable
        setTimeout(coachSpace, 2400) // after the page has settled (and any first-line staging)
        // "Previously…": after a day or more away, ask first, then recap (retrieval beats rereading).
        if (away > 24 * 3600 * 1000 && rec.progress > 0.002) prepareRecap()
        setTimeout(() => { if (!panel) chrome = false }, 1400)
      } catch (e) {
        error = (e as Error).message
      }
    })()
    return () => {
      gone = true
      snapshotPlace()
      save()
      guide?.destroy()
      pag?.destroy()
      book?.destroy()
    }
  })

  // Pinned controls: the book makes room for them (no text under the buttons).
  $effect(() => {
    const pinned = eff.pinControls, t = Math.round(Math.min(72, Math.max(36, innerHeight * 0.065)))
    pag?.setReserve(eff.guide || pinned ? Math.max(0, 76 - t) : 0, pinned ? Math.max(0, 64 - t) : 0) // the pad never sits on text
  })
  // Only appearance changes re-lay out the book; feature settings (guide, lenses, pace) don't.
  const LAYOUT = ['palette', 'mode', 'font', 'fontScale', 'lineHeight', 'margin', 'justify', 'bold', 'spread', 'letterSpacing', 'measure', 'inkRead'] as const
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

  // ---------- chapter openers: each chapter opens into its own room (from its profile) ----------
  /** "CHAPTER 5. The Wealth Equation" → a small eyebrow over the title (a CFI-transparent span; the text is untouched). */
  function titleHeadings(doc: Document) {
    for (const h of Array.from(doc.querySelectorAll('h1, h2'))) {
      if (h.querySelector('[data-pubre="eyebrow"]')) continue
      const tw = doc.createTreeWalker(h, NodeFilter.SHOW_TEXT)
      let t: Text | null = null
      while (tw.nextNode()) { const n = tw.currentNode as Text; if (n.data.trim()) { t = n; break } }
      const m = t && /^\s*((?:chapter|book|part|letter|canto|act|section|volume)\s+[0-9ivxlcdm]+[.:]?)\s+(?=\S)/i.exec(t.data)
      if (!t || !m) continue
      t.splitText(m[0].length)
      const span = doc.createElementNS(doc.documentElement.namespaceURI, 'span') as HTMLElement
      span.setAttribute('data-pubre', 'eyebrow')
      t.before(span); span.append(t)
      h.setAttribute('data-pubre-titled', '')
    }
  }
  /** Mark chapter headings (and the first paragraph after each) with their opener; true if anything changed. */
  function applyOpeners(doc: Document, index: number) {
    const list = rec.profile?.chapters
    if (!list?.length) return false
    let changed = false
    for (const h of Array.from(doc.querySelectorAll('h1, h2'))) {
      const c = chapterFor(list, h.textContent ?? '', index)
      if (!c || !c.title) continue
      const o = openerOf(c)
      if (h.getAttribute('data-pubre-opener') === o) continue
      h.setAttribute('data-pubre-opener', o); changed = true
      let p = h.nextElementSibling
      while (p && (p.textContent ?? '').trim().length < 60) p = p.nextElementSibling
      if (p && /^(p|div)$/i.test(p.localName)) { p.setAttribute('data-pubre-first', o); markCap(p) }
    }
    return changed
  }
  /** The book's own initial (a short span or an image before the first words, e.g. Gutenberg's
   *  <span class="letra">I</span>T is…) gets our drop-cap geometry, and our ::first-letter stands down. */
  function markCap(p: Element) {
    let n: Node | null = p.firstChild
    while (n && n.nodeType === 3 && !(n as Text).data.trim()) n = n.nextSibling
    if (n?.nodeType !== 1) return // (instanceof fails across the iframe)
    const el = n as HTMLElement, win = el.ownerDocument.defaultView
    if (!win) return
    const cs = win.getComputedStyle(el), big = parseFloat(cs.fontSize) > 1.4 * parseFloat(win.getComputedStyle(p).fontSize)
    const text = (el.textContent ?? '').trim()
    const img = el.localName === 'img' ? el : !text && el.children.length === 1 && el.firstElementChild?.localName === 'img' ? el.firstElementChild : null
    if (img ? img.getBoundingClientRect().height > 200 : text.length < 1 || text.length > 2 || (cs.float === 'none' && !big)) return
    el.setAttribute('data-pubre-cap', img ? 'img' : '')
    p.setAttribute('data-pubre-hascap', '')
  }
  // The book's chapters for the strips (Stage label, pointer capsule): length + mood (dark → bright).
  let profileChapters = $state.raw(untrack(() => rec.profile?.chapters))
  const moodTint = (m: number) => mix('#5d6d8f', '#d6a248', Math.max(0, Math.min(1, (m + 1) / 2)))
  const stripChapters = $derived.by((): StripChapter[] => sections.length < 2 ? [] : sections.map((s, i) => {
    const c = profileChapters && chapterFor(profileChapters, s.label, book?.spineIndex(s.href) ?? -1)
    return { weight: Math.max(0.0005, (sections[i + 1]?.start ?? 1) - s.start), tint: c?.title ? moodTint(c.mood) : undefined }
  }))
  // Weather & time of day: the chapter you're in, as a faint trace on the page (≈5%, never on the text's contrast).
  const weather = $derived.by(() => {
    if (!loc || !eff.weather || eff.intensity === 'quiet' || !profileChapters) return ''
    const s = sections[stripCur]
    const c = s && chapterFor(profileChapters, s.label, book?.spineIndex(s.href) ?? -1)
    return c?.title ? c.weather ?? '' : ''
  })
  const wedgeInfo = (label: string, href: string) => {
    const c = profileChapters && chapterFor(profileChapters, label, book?.spineIndex(href) ?? -1)
    return c?.title ? { tint: moodTint(c.mood), talk: c.talk } : undefined
  }
  const stripCur = $derived(loc && sections.length ? Math.max(0, sections.findLastIndex(s => s.start <= loc!.top + 1e-6)) : 0)
  // A chapter's title soaks into the paper as you arrive, once. (The first line no longer types itself in:
  // it held the page back and could stop halfway.)
  const staged1 = new Set<string>()
  let stagedAt = ''
  function stageFirstLine(v: BookView) {
    if (!eff.openers || eff.motion !== 'full' || reduceMotion || gstate.active || staged || !pag) return
    const ix = v.ix, first = pag.firstWordOnPage(v), last = pag.currentPage + 1 < v.pages ? pag.firstWordOnPage(v, pag.currentPage + 1) - 1 : ix.words.length - 1
    for (let b = ix.words[first]?.b ?? 0; b < ix.blocks.length && ix.blocks[b].a <= last; b++) {
      const h = ix.blocks[b], key = `${v.index}:${b}`
      if (staged1.has(key) || h.kind !== 'heading' || !h.el.hasAttribute('data-pubre-opener')) continue
      staged1.add(key)
      ;(h.el as HTMLElement).animate([{ filter: 'blur(5px)', opacity: 0.15, letterSpacing: '.06em' }, { filter: 'blur(1.2px)', opacity: 0.85, offset: 0.55 }, { filter: 'none', opacity: 1, letterSpacing: 'normal' }], { duration: 1100, easing: 'cubic-bezier(.2,.7,.2,1)' })
      return
    }
  }
  // Star-birth: the first time a character is ever named, a small spark rises from the name.
  const born = new Set<string>(untrack(() => rec.born ?? []))
  function starBirth(v: BookView) {
    if (eff.motion !== 'full' || reduceMotion || !lenses || !eff.names || !pag) return
    const first = pag.firstWordOnPage(v), last = pag.currentPage + 1 < v.pages ? pag.firstWordOnPage(v, pag.currentPage + 1) - 1 : v.ix.words.length - 1
    const f = v.iframe.getBoundingClientRect()
    for (const pr of rec.profile?.names ?? []) {
      if (pr.kind !== 'person' || pr.slot < 0 || pr.first !== v.index || born.has(pr.name)) continue
      for (let b = v.ix.words[first]?.b ?? 0; b < v.ix.blocks.length && v.ix.blocks[b].a <= last; b++) {
        const t = lenses.tokensIn(v, b).find(t => t.kind === 'name' && t.key === pr.name)
        if (!t) continue
        const r = lenses.rangeOf(v, t).getClientRects()[0]
        if (!r || r.left + f.left < 0 || r.left + f.left > innerWidth) continue
        born.add(pr.name); rec.born = [...born]
        const hue = whoHue(resolveTheme(eff.palette, eff.mode), pr.slot % WHO_SLOTS)
        const dot = document.createElement('i')
        dot.className = 'star-birth'; dot.style.cssText = `left:${f.left + r.left + r.width / 2}px;top:${f.top + r.top}px;background:${hue};box-shadow:0 0 12px ${hue}`
        host.parentElement?.append(dot)
        dot.animate([{ transform: 'translate(-50%, 0) scale(.4)', opacity: 0 }, { transform: 'translate(-50%, -10px) scale(1.4)', opacity: 1, offset: 0.25 }, { transform: `translate(-50%, ${-(f.top + r.top) + 30}px) scale(.5)`, opacity: 0 }], { duration: 1400, delay: 500, easing: 'cubic-bezier(.3,.6,.2,1)', fill: 'both' }).finished.then(() => dot.remove())
        toast(`Meet ${pr.name}`)
        break
      }
    }
  }
  /** The TOC chapter a spine item starts in (for "first met in…"). */
  const chapterOfSpine = (i: number) => sections.findLast(s => (book?.spineIndex(s.href) ?? 0) <= i)?.label ?? ''
  const tocGlyph = (label: string, href: string) => {
    const list = rec.profile?.chapters, c = list && chapterFor(list, label, book?.spineIndex(href) ?? -1)
    return c?.title ? fingerprint(c.lens, 22) : ''
  }

  // ---------- ambient palette drift: a colourful chapter lends the accent its colour, at the crossing ----------
  let drift = $state<{ name: string; accent: string } | null>(null)
  let driftKey = ''
  $effect(() => {
    const at = loc, v = pag?.current
    if (!at || !v || !v.ix.words.length) return
    const on = eff.chapterColour && eff.intensity !== 'quiet', t = resolveTheme(eff.palette, eff.mode)
    const key = `${v.index}:${at.chapter}:${on}:${eff.palette}:${eff.mode}`
    if (key === driftKey) return
    driftKey = key
    if (!on) { drift = null; return }
    const sec = sectionOf(v.ix, v.ix.words[pag!.firstWordOnPage(v)]?.b ?? 0)
    const tint = colourOf(v.ix.blocks.slice(sec.from, sec.to).map(b => b.text).join(' '), t.dark)
    const was = drift?.name
    drift = tint ? { name: tint.name, accent: mix(t.base[t.accent], tint.hex, 0.65) } : null
    if (tint && tint.name !== was) toast(`This chapter leans ${tint.name}`)
  })

  // ---------- the reading pad (one control for both guide styles) ----------
  // Tap: start, then pause / play (double-tap: back to the sentence start). Hold: read only while held,
  // let go and it goes back. While holding, slide right = faster, left = slower then backwards, up = lock.
  let press = $state<{ hold: boolean; locked: boolean; dx: number; dy: number } | null>(null)
  // Quick speed: a chip by the pad opens presets, a stepper and a slider; changes apply mid-sentence.
  let speedOpen = $state(false), speedT = 0
  const PACES = [[180, 'Slow'], [220, 'Calm'], [260, 'Steady'], [300, 'Brisk'], [340, 'Fast']] as const
  const paceName = (w: number) => PACES.reduce((a, p) => (Math.abs(p[0] - w) < Math.abs(a[0] - w) ? p : a))[1]
  function setPace(w: number) { settings.wpm = Math.max(120, Math.min(350, Math.round(w / 5) * 5)); clearTimeout(speedT); speedT = window.setTimeout(() => (speedOpen = false), 4000) }
  let pressX = 0, pressY = 0, pressT = 0
  const stageStyle = () => eff.guideStyle === 'stage'
  // The speed chip shows while reading; with the controls up it shows too, except on narrow screens where the bar needs the room.
  let wide = $state(innerWidth >= 720)
  const speedChip = $derived(staged || gstate.active || (showChrome && wide))
  const padMoving = $derived(eff.guideStyle === 'stage' ? sstate.moving : gstate.gliding)
  /** Shuttle: a dead zone around the press, then right speeds up to 2.5×; left slows to still, then reads backwards. */
  /** Shuttle: scaled to the room the thumb actually has. Right: up to 2.5×; left: slower → still → backwards (−2×). */
  let shuttleX = 0
  function shuttle(dx: number) {
    if (Math.abs(dx) < 10) return 1
    const room = Math.max(40, dx > 0 ? innerWidth - shuttleX - 8 : shuttleX - 8)
    const f = Math.min(1, (Math.abs(dx) - 10) / (room - 10))
    return dx > 0 ? 1 + 1.5 * f : 1 - 3 * f
  }
  const rateLabel = (r: number) => Math.abs(r) < 0.15 ? 'Still' : r < 0 ? `◀ ${(-r).toFixed(1)}×` : Math.abs(r - 1) < 0.05 ? 'Your pace' : `${r.toFixed(1)}×`
  function padPress(e: PointerEvent) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pressX = e.clientX; pressY = e.clientY; shuttleX = e.clientX; pressUp = showChrome && !staged; pressAt0 = performance.now()
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
    const short = performance.now() - pressAt0 < 600 && Math.hypot(press.dx, press.dy) < 12
    if (!press.hold) padTap()
    else if (short && !press.locked) { if (stageStyle()) stage?.keep(); else guide?.lock() } // a slow tap is still a tap: keep reading
    else if (stageStyle()) stage?.holdEnd(); else guide?.holdEnd()
    press = null
  }
  let pressUp = $state(false), pressAt0 = 0
  /** Press-and-hold on the page: read from that word while held (the same slides as the pad). */
  let pressAt = $state<{ x: number; y: number } | null>(null)
  function wordAtPoint(v: BookView, x: number, y: number) {
    const { node, off } = caretAt(v, x, y)
    if (!node) return -1
    return nearestWord(v.ix.words, node, off)
  }
  const textHold = {
    start(v: BookView, x: number, y: number) {
      if (!eff.guide || !eff.holdToRead || panel || bar) return false
      const k = wordAtPoint(v, x, y)
      if (k < 0) return false
      const f = v.iframe.getBoundingClientRect()
      pressAt = { x: f.left + x, y: f.top + y }
      press = { hold: true, locked: false, dx: 0, dy: 0 }
      chrome = false; hideCard()
      navigator.vibrate?.(8)
      if (stageStyle()) stage?.holdStart(k); else guide?.holdStart(k)
      return true
    },
    move(dx: number, dy: number) {
      if (!press) return
      let locked = press.locked
      if (!locked && dy < -64) { locked = true; navigator.vibrate?.(12); if (stageStyle()) stage?.lock(); else guide?.lock() }
      const r = locked ? 1 : shuttle(dx)
      if (stageStyle()) stage?.setRate(r); else guide?.setRate(r)
      press = { ...press, dx, dy, locked }
    },
    end() {
      if (press && !press.locked) { if (stageStyle()) stage?.holdEnd(); else guide?.holdEnd() }
      else if (press) { if (stageStyle()) stage?.setRate(1); else guide?.setRate(1) }
      press = null; pressAt = null
    },
  }

  let backT = 0
  // Quick speed closes on a tap outside (that tap does nothing else) and on Escape.
  $effect(() => {
    if (!speedOpen) return
    const away = (e: PointerEvent) => { if (!(e.target as Element).closest?.('.speedpop, .speed')) { e.stopPropagation(); e.preventDefault(); speedOpen = false } }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') speedOpen = false }
    addEventListener('pointerdown', away, true); addEventListener('keydown', esc, true)
    const docs = [...document.querySelectorAll('iframe')].map(f => (f as HTMLIFrameElement).contentDocument).filter(Boolean) as Document[]
    for (const d of docs) d.addEventListener('pointerdown', away, true)
    return () => { removeEventListener('pointerdown', away, true); removeEventListener('keydown', esc, true); for (const d of docs) d.removeEventListener('pointerdown', away, true) }
  })
  // Android Back: the Stage and the sheets are history entries, so Back closes them instead of leaving.
  const backStack: string[] = []
  function pushBack(kind: string) { history.pushState({ pubre: kind }, ''); backStack.push(kind) }
  function popBack(kind: string) { const i = backStack.lastIndexOf(kind); if (i < 0) return; backStack.splice(i, 1); if (history.state?.pubre === kind) history.back() }
  function onPop() {
    const kind = backStack.pop()
    if (kind === 'stage') stage?.close()
    else if (kind === 'sheet') panel = false
  }
  $effect(() => { if (panel) { pushBack('sheet'); return () => popBack('sheet') } })
  function stepBy(dir: 1 | -1) { if (stageStyle() && staged) stage?.nudge(dir); else guide?.stepBy(dir) }
  const hold = (dir: 1 | -1) => (e: PointerEvent) => { e.preventDefault(); stepBy(dir); backT = window.setTimeout(function rep() { stepBy(dir); backT = window.setTimeout(rep, 170) }, 420) }

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
  /** Long-press a sentence in the Stage: highlight it as Key, or remove that highlight again. */
  async function markSentence(v: BookView, s: number): Promise<boolean | null> {
    if (!book) return null
    const sp = v.ix.sentences[s], ws = v.ix.words, r = v.doc.createRange()
    r.setStart(ws[sp.a].sn, ws[sp.a].so); r.setEnd(ws[sp.b].en, ws[sp.b].eo)
    const cfi = book.cfi(v.index, r), old = anns.find(a => a.spine === v.index && a.cfi === cfi)
    if (old) { anns = anns.filter(a => a !== old); await deleteAnnotation(old.id); paintAnns(v); return false }
    const a: Annotation = { id: crypto.randomUUID(), book: rec.id, spine: v.index, cfi, ...quoteOf(r), color: '0A', bold: false, italic: false, note: '', chapter: loc?.chapter ?? '', created: Date.now() }
    anns = [...anns, a]; await saveAnnotation(a); paintAnns(v)
    return true
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
  // The cast is worked out in the background while you read. Meanwhile you see what there is: the cast an older
  // version found, or a first one from the chapters up to your place; a small chip says it's still at it.
  let cast = $state<{ refining: boolean; p: number; done?: string } | null>(null), castShown = $state(false)
  async function loadProfile(b: Book) {
    if (rec.profile?.v === PROFILE_V) { lenses?.setProfile(rec.profile.names); if (lenses) lenses.hapax = rec.profile.hapax ?? {}; paintLenses(); return }
    const had = rec.profile?.names?.some(n => n.kind === 'person') ? rec.profile : undefined
    if (had) { lenses?.setProfile(had.names); if (lenses) lenses.hapax = had.hapax ?? {}; paintLenses() }
    cast = { refining: !!had, p: 0 }
    const showT = window.setTimeout(() => (castShown = true), 600) // only when it takes long enough to notice
    const pr = await computeProfile(b, { key: rec.id, upto: rec.location?.index ?? 0, on: e => {
      if (e.p !== undefined && cast) cast = { ...cast, p: e.p }
      if (e.partial && !had) { rec.profile = { v: 0, names: e.partial }; lenses?.setProfile(e.partial); paintLenses() }
    } })
    clearTimeout(showT)
    const n = pr.names.filter(x => x.kind === 'person').length
    if (castShown || had) { cast = { refining: !!had, p: 1, done: `${had ? 'Cast refined' : 'Met the cast'} · ${n} characters` }; castShown = true; setTimeout(() => { cast = null; castShown = false }, 2800) }
    else cast = null
    rec.profile = pr
    if (lenses) lenses.hapax = pr.hapax ?? {}
    profileChapters = pr.chapters
    if (pag?.current && eff.openers && applyOpeners(pag.current.doc, pag.current.index)) pag.refresh()
    lenses?.setProfile(pr.names); paintLenses(); save()
  }
  const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  async function cardHtml(v: BookView, t: Token): Promise<string> {
    const theme = resolveTheme(eff.palette, eff.mode)
    if (t.kind === 'name' || (t.kind === 'speech' && t.key)) {
      const p = lenses!.person(t.key)
      const sofar = p ? p.perSpine.slice(0, v.index + 1).reduce((a, n) => a + n, 0) : 0
      const hue = p && p.slot >= 0 ? whoHue(theme, p.slot % WHO_SLOTS) : 'var(--muted)'
      // Meet the cast: first met, how often, who they're seen with, a little history — all up to your page.
      const lead = t.kind === 'speech' ? 'is speaking.' : sofar > 1 ? `Mentioned ${sofar} times so far.` : 'You’re meeting them now.'
      const met = p && p.first < v.index ? chapterOfSpine(p.first) : '', mates = companions(rec.profile?.links, t.key, v.index)
      const hist = p ? p.perSpine.slice(0, v.index + 1) : [], peak = Math.max(1, ...hist)
      const spark = hist.length > 2 ? `<div class="c-hist">${hist.slice(-40).map(n => `<i style="height:${Math.max(1, Math.round(n / peak * 14))}px;background:${hue}"></i>`).join('')}</div>` : ''
      return `<div class="c-who"><img class="c-av" alt="" src="${portraitUrl(t.key, mix(hue, theme.base[0], 0.55), theme.dark ? theme.base[0] : '#1d1b19', theme.dark ? theme.base[5] : '#fbf8f2')}"><b>${escape(t.key)}</b></div><div class="c-def">${lead}${met ? ` First met in ${escape(met)}.` : ''}</div>${mates.length ? `<div class="c-def">Often with ${mates.map(escape).join(', ')}.</div>` : ''}${spark}`
    }
    if (t.kind === 'speech') return `<div class="c-def">Quoted words with no speaker named nearby.</div>`
    if (t.kind === 'foreign') return `<b>${escape(lenses!.rangeOf(v, t).toString().slice(0, 60))}</b><div class="c-def">A phrase in another language (${escape(t.key)}).</div>`
    const d = await define(t.key)
    // your own sentence, the word in bold: the sense that fits is the one you're reading
    const rg = lenses!.rangeOf(v, t), k = nearestWord(v.ix.words, rg.startContainer, rg.startOffset), sn = k >= 0 ? v.ix.sentences[v.ix.words[k].s] : null
    let quote = ''
    if (sn) {
      const r = v.doc.createRange(); r.setStart(v.ix.words[sn.a].sn, v.ix.words[sn.a].so); r.setEnd(v.ix.words[sn.b].en, v.ix.words[sn.b].eo)
      const text = r.toString().replace(/\s+/g, ' ').trim(), word = rg.toString(), at = text.indexOf(word)
      if (at >= 0) { const a = Math.max(0, at - 60), b = Math.min(text.length, at + word.length + 60); quote = `${a ? '…' : ''}${escape(text.slice(a, at))}<b>${escape(word)}</b>${escape(text.slice(at + word.length, b))}${b < text.length ? '…' : ''}` }
    }
    return `<div class="c-word"><b>${escape(t.key)}</b>${d ? ` <em class="c-pos">${escape(d.pos)}</em>` : ''}</div>${d ? `<div class="c-def">${escape(d.text)}</div>` : '<div class="c-def">A rare word. No offline definition for this form.</div>'}${quote ? `<div class="c-q">${quote}</div>` : ''}`
  }
  async function showCard(v: BookView, t: Token) {
    const key = `${v.index}:${t.blk}:${t.a}:${t.kind}`
    if (key === cardKey) return
    cardKey = key
    const html = await cardHtml(v, t)
    if (cardKey !== key) return
    const r = lenses!.rangeOf(v, t).getClientRects()[0], f = v.iframe.getBoundingClientRect()
    if (!r) return
    const mid = f.left + r.left + r.width / 2, x = Math.max(12, Math.min(innerWidth - 292, mid - 140))
    // under the word's line, so what you just read stays in view; above only when the page bottom is near
    const below = f.top + r.bottom + 230 < innerHeight - 70 || f.top + r.top < 200
    card = { x, y: below ? f.top + r.bottom + 12 : f.top + r.top - 12, below, html, nx: Math.max(18, Math.min(262, mid - x)) }
  }
  function hideCard() { clearTimeout(dwellT); clearTimeout(hoverT); card = null; cardKey = '' }
  const hooked = new WeakSet<Document>()
  function attachHover(v: BookView) {
    if (hooked.has(v.doc)) return
    hooked.add(v.doc)
    v.doc.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return // a held finger fires emulated mouse moves; cards on touch come from a tap
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
  /** Touch: a tap on a marked word (rare word, name, other language) opens its card. */
  /** Tap a picture on the page to look at it closely. */
  let zoom = $state<{ src: string; from: { x: number; y: number; w: number; h: number } } | null>(null)
  function tapPlate(v: BookView, x: number, y: number) {
    const img = (v.doc.elementFromPoint(x, y) as Element | null)?.closest('[data-pubre-plate]')?.querySelector('img')
    if (!img) return false
    const r = img.getBoundingClientRect(), f = v.iframe.getBoundingClientRect()
    zoom = { src: img.currentSrc || img.src, from: { x: r.left + f.left, y: r.top + f.top, w: r.width, h: r.height } }
    return true
  }
  function tapLens(v: BookView, x: number, y: number) {
    if (matchMedia('(hover: hover)').matches) return false
    // a finger is wider than a word: look at the tap point, then a little to each side
    let t: Token | null = null
    for (const dx of [0, -10, 10, -18, 18]) { const { node, off } = caretAt(v, x + dx, y); const c = node && lenses?.tokenAt(v, node, off); if (c && c.kind !== 'speech') { t = c; break } }
    if (!t) { if (card) { hideCard(); return true } return false }
    showCard(v, t)
    return true
  }
  // ---------- "Previously…" ----------
  // ---------- chapter end: three words + open questions (optional, gentle, non-modal) ----------
  let ending = $state<{ chapter: string; questions: Annotation[]; sparks: string[] } | null>(null)
  let lastSpine = -1
  let endWords = $state('')
  let endOpen = $state(false) // the chapter-end pill, opened into its card
  let words = $state<Record<string, string>>(untrack(() => rec.words ?? {}))
  let lastLoc: { chapter: string; progress: number } | null = null
  function chapterTurn(r: { chapter: string; progress: number; index: number }) {
    const prev = lastLoc
    lastLoc = { chapter: r.chapter, progress: r.progress }
    const prevSpine = lastSpine; lastSpine = r.index
    void prev; void prevSpine
    if (ending) { ending = null; return } // the card leaves on your next page turn
    teaseSoon()
  }
  /** The chapter-end card, opened from the last page's teaser: three words, an open question, rare words. */
  function openEnding() {
    const chapter = loc?.chapter, spine = pag?.current?.index ?? -1
    if (!chapter) return
    const sparks = Object.entries(rec.profile?.hapax ?? {}).filter(([w, si]) => si === spine && typeof rarity(w) === 'number' && rarity(w)! < RARE).map(([w]) => w).slice(0, 6)
    ending = { chapter, questions: anns.filter(a => a.color === '09' && a.chapter === chapter && !a.note.startsWith('✓')).slice(0, 1), sparks }
    endWords = words[chapter] ?? ''
    endOpen = true; tease = null
  }
  // ---------- a chapter's last page: what comes next, in the room under the final line (L2) ----------
  let tease = $state<{ x: number; y: number; kind: string; title: string; line: string; ask: boolean } | null>(null), teaseT = 0
  function teaseSoon() {
    tease = null; clearTimeout(teaseT)
    teaseT = window.setTimeout(async () => {
      const e = staged || gstate.gliding ? null : await pag?.sectionEnd()
      if (!e) return
      const m = /^(chapter|book|part|letter|canto|volume|act)\s+([0-9ivxlcdm]+)[.:]?\s*(?:·\s*)?(.*)$/i.exec(e.label)
      const port = pag!.port
      tease = { x: e.x + port.offsetLeft + host!.offsetLeft, y: e.y + port.offsetTop + host!.offsetTop, kind: m ? `${m[1]} ${m[2]}` : '', title: m ? (m[3].replace(/\.$/, '') || '') : e.label, line: e.line, ask: eff.chapterPrompts }
    }, 520)
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
  let recapDown = { x: 0, t: 0 }
  const focusOnMount = (el: HTMLElement) => { el.focus() }
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
    const who = (rec.profile?.names ?? []).filter(n => n.kind === 'person' && n.slot >= 0 && named(n, before)).slice(0, 4).map(n => n.name)
    recap = { stage: 'ask', chapter: rec.chapter ?? '', lines, who, mine: [] }
    listAnnotations(rec.id).then(list => { if (recap) recap = { ...recap, mine: list.filter(a => a.spine === v.index && ['0A', '09'].includes(a.color)).slice(-2).map(a => a.exact.slice(0, 140)) } })
  }

  // ---------- highlights & notes ----------
  let anns = $state.raw<Annotation[]>([]) // raw: the toolbar edits these objects in place, then reassigns
  // Your highlights and notes as dots on the capsule: exact in the chapter on screen, else at the start of their file.
  const annMarks = $derived.by(() => { void loc; const v = pag?.current; return anns.map(a => {
    const r = v && a.spine === v.index ? ranges.get(a.id)?.getClientRects()[0] : undefined
    return { at: r && pag ? pag.progressAt(a.spine) + (pag.progressAt(a.spine + 1) - pag.progressAt(a.spine)) * (pag.pageOf(r) / Math.max(1, v!.pages)) : pag?.progressAt(a.spine) ?? 0, color: a.color }
  }) })
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

  // Where am I (pointer guide): the section's paragraphs as wedges; the one you're in springs as you cross into it.
  let where = $state<{ key: string; paras: { b: number; n: number }[]; cur: number } | null>(null)
  let whereBlock = -1
  function trackWhere(v: BookView, b: number) {
    if (b === whereBlock && where) return
    whereBlock = b
    const sec = sectionOf(v.ix, b), key = `${v.index}:${sec.from}`
    const cur = sec.paras.findIndex(p => p.b === b)
    if (where?.key !== key) where = { key, paras: sec.paras.length <= 60 ? sec.paras : [], cur }
    else if (where.cur !== cur && cur >= 0) where = { ...where, cur }
  }

  /** The guide reached word k: repaint lenses if the block changed, bloom names, and offer a card after a dwell. */
  function arrive(v: BookView, k: number) {
    hideCard()
    const w = v.ix.words[k]
    if (!w) return
    trackWhere(v, w.b)
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

<svelte:window onpopstate={onPop} onkeydown={e => { if (e.key === 'Escape' && !panel && !gstate.active && !staged) chrome = !chrome }} onresize={() => (wide = innerWidth >= 720)} />

<div class="reader" style:--accent={drift?.accent} class:guiding={gstate.active && !!where} class:chrome={showChrome} class:padded={eff.guide} class:speedy={speedChip}>
  <div class="paper" bind:this={paperEl} style:view-transition-name="cover">
    <div class="stage" bind:this={host}></div>
    {#if tease && !chrome && !staged}
      <div class="tease" style:left="{tease.x}px" style:top="{tease.y}px">
        <span class="t-orn" aria-hidden="true">❦</span>
        <span class="t-k">Next{tease.kind ? ` · ${tease.kind}` : ''}</span>
        {#if tease.title}<b class="t-t">{tease.title}</b>{/if}
        {#if tease.line}<i class="t-l">{tease.line}</i>{/if}
        {#if tease.ask}<button class="t-ask" onclick={openEnding}>three words?</button>{/if}
      </div>
    {/if}
    {#if !loc && !error}<div class="spinner" aria-label="Opening book"></div>{/if}
  </div>

  {#if loc}
    <div class="running head" aria-hidden="true"><Ticker value={loc.chapter || rec.title} /></div>
    <div class="running foot" aria-hidden="true">
      {#if loc.cpages > 1}<span class="pgn"><Ticker value={loc.cpage + 1} /> of {loc.cpages}</span>{#if footText}<span class="sep">·</span>{/if}{/if}<span class="ftx">{footText}</span>
    </div>
  {/if}

  {#if gstate.active && where && loc}
    <div class="where glass" transition:fly={{ y: -14, duration: 380, easing: cubicOut }} aria-hidden="true">
      <span class="w-ch"><Ticker value={loc.chapter || rec.title} /></span>
      {#if stripChapters.length > 1}
        {@const tot = where.paras.reduce((a, p) => a + p.n, 0) || 1}
        <span class="w-strip"><ChapterStrip chapters={stripChapters} cur={stripCur}
          fill={where.cur >= 0 ? (where.paras.slice(0, where.cur).reduce((a, p) => a + p.n, 0) + where.paras[where.cur].n / 2) / tot : 0}
          ticks={where.paras.slice(1).map((_, i) => where!.paras.slice(0, i + 1).reduce((a, p) => a + p.n, 0) / tot)} /></span>
      {:else if where.paras.length > 1}
        <span class="w-row">{#each where.paras as p, i (p.b)}<i class:done={i < where.cur} class:cur={i === where.cur} style:flex-grow={Math.max(1, Math.sqrt(p.n))}></i>{/each}</span>
      {/if}
      {#if loc.cpages > 1}<span class="w-pg"><Ticker value={loc.cpage + 1} /><span>/{loc.cpages}</span></span>{/if}
      {#key where.key}<em class="w-sweep"></em>{/key}
    </div>
  {/if}
  <button class="fab glass close" aria-label="Back to library" onclick={onclose}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6l-6 6 6 6" /></svg>
  </button>
  <div class="topright glass">
    <button aria-label={resolveTheme(eff.palette, eff.mode).dark ? 'Light' : 'Dark'} onclick={() => { settings.mode = resolveTheme(eff.palette, eff.mode).dark ? 'paper' : 'night' }}>
      {#if resolveTheme(eff.palette, eff.mode).dark}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></svg>
      {:else}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /></svg>{/if}
    </button>
    <button aria-label="Themes and text" onclick={() => { view = 'appearance'; dir = 1; panel = true }}><span class="aa-t">Aa</span></button>
    <button aria-label="Contents" onclick={() => { view = 'contents'; dir = 1; panel = true }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></svg>
    </button>
  <button class="pin" class:on={eff.pinControls} aria-pressed={eff.pinControls} aria-label={eff.pinControls ? 'Let the controls hide while reading' : 'Keep the controls on screen'}
    onclick={() => { settings.pinControls = !eff.pinControls; toast(settings.pinControls ? 'Controls pinned' : 'Controls hide while you read') }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z" fill={eff.pinControls ? 'currentColor' : 'none'} /><path d="M12 14v6" /></svg>
  </button>
  </div>

  <div class="dock">
    {#if loc}
      <div class="progress">
        <Progress {sections} {words} progress={loc.progress} chapter={loc.chapter || rec.title} page={loc.cpage} pages={loc.cpages}
          onjump={jump} onscrub={p => pag?.goToProgress(p)} left={footLeft} info={wedgeInfo} marks={annMarks} />
      </div>
    {/if}
    <button class="fab glass menu" aria-label="Reading menu" onclick={() => { view = 'menu'; panel = true }} disabled={!book}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h9" /></svg>
    </button>
  </div>

  {#if eff.guide && loc && !error}
    {#if cast && castShown && !staged && !panel}
      <div class="castchip glass" role="status" transition:fly={{ y: -8, duration: 300 }}>
        <i class:done={!!cast.done} style:--p={cast.p}></i>{cast.done ?? `${cast.refining ? 'Refining' : 'Getting to know'} the cast`}{#if !cast.done}<b>{Math.round(cast.p * 100)}%</b>{/if}
      </div>
    {/if}
    {#if coach && !panel}<Coach kind={coach} touch={touchUI} done={coachDone} {gentle} />{/if}
    <div class="padgroup transport glass" class:up={press ? pressUp : showChrome && !staged} class:reading={staged || gstate.active} class:solo={!speedChip && !(staged || (gstate.active && !showChrome))}>
      {#if staged}
        <button class="ptrbtn" aria-label="Pointer and contrast" onclick={() => stage?.toggleQuick()}>
          <span class="ptr-mini"><span>Aa</span><i class="ptr" data-p={eff.stageStep === 'sentence' ? 'underline' : eff.stagePointer === 'ink' ? 'underline' : eff.stagePointer}></i></span>
        </button>
        <button class="ptrbtn lookbtn" class:on={eff.lookBack !== false} aria-pressed={eff.lookBack !== false} aria-label="Look back when paused"
          onclick={() => { const on = eff.lookBack === false; setSetting('lookBack', on); stage?.relook(); toast(on ? 'Look back on · pause to see what you read, ↑ to step back' : 'Look back off') }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18h9M5 13h12M5 8h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55" /><path d="M19 18V7m0 0l-3 3m3-3l3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      {/if}
      {#if speedChip}
        <button class="speed" class:on={speedOpen} aria-label="Reading speed, {eff.wpm} words a minute" aria-expanded={speedOpen}
          onclick={() => { speedOpen = !speedOpen; clearTimeout(speedT); if (speedOpen) speedT = window.setTimeout(() => (speedOpen = false), 5000) }}>
          <b>{eff.wpm}</b><small>wpm</small>
        </button>
      {/if}
      {#if staged || (gstate.active && !showChrome)}
        <span class="steps">
          <button class="back" aria-label="Back a word (hold to keep going)" onpointerdown={hold(-1)}
            onpointerup={() => clearTimeout(backT)} onpointercancel={() => clearTimeout(backT)} onpointerleave={() => clearTimeout(backT)} oncontextmenu={e => e.preventDefault()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </span>
      {/if}
      <button class="pad" class:moving={padMoving} class:held={press?.hold} class:active={gstate.active || staged}
        aria-label={padMoving ? 'Pause (tap). Hold and slide to change speed.' : 'Read (tap to start; hold to read while held, slide while holding to change speed, slide up to lock)'}
        onpointerdown={padPress} onpointermove={padDrag} onpointerup={padRelease} onpointercancel={padRelease}
        onkeydown={e => { if (e.key === 'Enter') { e.preventDefault(); padTap() } }}
        oncontextmenu={e => e.preventDefault()}>
        <span class="pad-ring"></span>
        {#if staged}<span class="pad-progress" style:--p={sstate.progress} aria-hidden="true"></span>{/if}
        {#if padMoving}<svg class="pad-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.6" height="12" rx="1.2" fill="currentColor" /><rect x="13.4" y="6" width="3.6" height="12" rx="1.2" fill="currentColor" /></svg>
        {:else}<svg class="pad-i play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8v12.4a.8.8 0 001.2.7l9.6-6.2a.8.8 0 000-1.4L9.7 5.1a.8.8 0 00-1.2.7z" fill="currentColor" /></svg>{/if}
      </button>
      {#if staged || (gstate.active && !showChrome)}
        <button class="back" aria-label="Next word (hold to keep going)" onpointerdown={hold(1)}
          onpointerup={() => clearTimeout(backT)} onpointercancel={() => clearTimeout(backT)} onpointerleave={() => clearTimeout(backT)} oncontextmenu={e => e.preventDefault()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      {/if}
      </div>
    {#if speedOpen}
      <div class="speedpop" class:up={showChrome && !staged} role="dialog" aria-label="Reading speed">
        <div class="sp-top">
          <span class="sp-num"><b>{eff.wpm}</b><small>words / min</small></span>
          <span class="sp-name">{paceName(eff.wpm)}{footLeft ? ` · ${footLeft} in chapter` : ''}</span>
        </div>
        <!-- what this pace feels like: a sample line, reading at it -->
        <ReadPreview step={eff.guideStyle === 'stage' ? (eff.stageStep === 'sentence' ? 'phrase' : eff.stageStep) : eff.step} pointer={(eff.guideStyle === 'stage' ? eff.stagePointer : eff.pointer) as any}
          read={eff.inkRead ?? 10} now={eff.inkNow ?? 100} ahead={eff.inkAhead ?? 20} wpm={eff.wpm} />
        <div class="sp-dial">
          <button aria-label="Slower" onclick={() => setPace(eff.wpm - 10)}>−</button>
          <div class="sp-track">
            <input type="range" min="120" max="350" step="5" value={eff.wpm} aria-label="Words a minute" oninput={e => setPace(+e.currentTarget.value)} style:--f="{(eff.wpm - 120) / 230 * 100}%" />
            <div class="sp-ticks" aria-hidden="true">{#each PACES as [w, name]}<button style:left="{(w - 120) / 230 * 100}%" class:on={paceName(eff.wpm) === name} aria-label="{name}, {w}" onclick={() => setPace(w)}><i></i>{w}</button>{/each}</div>
          </div>
          <button aria-label="Faster" onclick={() => setPace(eff.wpm + 10)}>+</button>
        </div>
      </div>
    {/if}
    {#if press?.hold}
      <div class="shuttle glass" class:at={pressAt || staged} role="status" aria-live="polite">
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
  <Stage bind:this={stage} {pag} settings={eff} chapter={loc?.chapter || rec.title} page={loc?.cpage ?? 0} pages={loc?.cpages ?? 0} pageEl={paperEl} {decorate} {explain} onmark={markSentence} book={{ chapters: stripChapters, cur: stripCur }}
    onopen={o => { staged = o; speedOpen = false; if (o) { chrome = false; hideCard(); guide?.deactivate(); pushBack('stage'); paintPlace(); coachOpened() } else { paintLenses(); popBack('stage'); if (placeV) setPlace(placeV, placeK, true); placeSoon(true); setTimeout(() => { pag?.current?.marks.clear('r-'); requestAnimationFrame(() => paintPlace()) }, 1200) /* WebKit keeps highlight geometry from the set-down a few letters off: clear, then paint again once settled */; coachClosed() } }} onplace={(v, k) => setPlace(v, k)} resumeAt={placeHere} onstate={st => (sstate = st)}
    onpace={w => (settings.wpm = w)} ontoast={toast}
    onsetting={setSetting} />
  {#if weather}{#key weather}<div class="weather w-{weather}" class:still={eff.motion !== 'full' || reduceMotion} transition:fade={{ duration: 1200 }} aria-hidden="true"></div>{/key}{/if}
  {#if (eff.brightness ?? 100) < 100}<div class="dimmer" style:opacity={(100 - eff.brightness) / 100 * 0.9} aria-hidden="true"></div>{/if}
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
        <button class="hl-b" aria-label="Read from here" title="Read from here" onclick={readFromHere}><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z" /></svg></button>
        {#if bar.ann}<button class="hl-b" aria-label="Remove highlight" onclick={removeAnn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>{/if}
      </div>
      {#if bar.note}
        <input class="hl-note" placeholder="Note… (Enter to save)" bind:value={noteText} onkeydown={e => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') bar = null }} />
      {/if}
      {#if bar.ann}<span class="hl-m">{meaning(bar.ann.color)}</span>{/if}
    </div>
  {/if}
  {#if ending && !chrome && !staged}
    <!-- a small pill in the running-head strip, above the text and away from the pad; it leaves on its own unless you open it -->
    <div class="ending" class:open={endOpen} role="status" transition:fly={{ y: -10, duration: 280 }}>
      <button class="e-pill" aria-expanded={endOpen} onclick={() => (endOpen = !endOpen)}>
        <svg class="e-ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span class="e-t">End of {ending.chapter}</span>
        {#if !endOpen}<span class="e-meta">{ending.questions.length ? 'a question for you' : ending.sparks.length ? `${ending.sparks.length} rare word${ending.sparks.length > 1 ? 's' : ''}` : 'three words?'}</span>{/if}
        <svg class="e-chev" class:up={endOpen} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      {#if endOpen}
        <div class="e-body" transition:fade={{ duration: 160 }}>
          {#if ending.sparks.length}<p class="e-sparks"><span>Words you won’t meet again</span>{#each ending.sparks as w}<button class="spark-w" onclick={async () => { const d = await define(w); toast(d ? `${w} · ${d.text}` : w) }}>{w}</button>{/each}</p>{/if}
          {#each ending.questions as q (q.id)}
            <p class="e-q">You asked: <i>“{q.exact.slice(0, 120)}{q.exact.length > 120 ? '…' : ''}”</i>. Answered yet?</p>
            <div class="r-actions"><button class="pill ghost" onclick={() => answered(q, true)}>Yes</button><button class="r-skip" onclick={() => answered(q, false)}>Not yet</button></div>
          {/each}
          {#if !ending.questions.length}
            <label class="e-l" for="three">Three words for this chapter?</label>
            <div class="e-row"><input id="three" class="e-in" placeholder="storm, oath, doubloon" bind:value={endWords} onkeydown={e => { e.stopPropagation(); if (e.key === 'Enter') keepWords(); if (e.key === 'Escape') skipEnding() }} />
              <button class="pill ghost" onclick={keepWords}>Keep</button><button class="r-skip" onclick={skipEnding}>Skip</button></div>
          {/if}
        </div>
      {:else}
        <i class="e-timer" aria-hidden="true" onanimationend={() => (ending = null)}></i>
      {/if}
    </div>
  {/if}
  {#if zoom}<Zoom src={zoom.src} from={zoom.from} onclose={() => (zoom = null)} />{/if}
  {#if recap}
    <!-- "Previously…" is a page before yours: remember first, tap to see the recap, turn the page to read on -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="recap" role="dialog" aria-label="Previously" tabindex="-1" use:focusOnMount out:fly={{ x: -innerWidth, duration: reduceMotion ? 0 : 380, opacity: 1, easing: cubicOut }}
      onkeydown={e => { if (['ArrowRight', ' ', 'PageDown', 'Enter', 'Escape'].includes(e.key)) { e.preventDefault(); recap = null } }}
      onpointerdown={e => (recapDown = { x: e.clientX, t: Date.now() })}
      onpointerup={e => { const dx = e.clientX - recapDown.x; if (dx < -50 || e.clientX > innerWidth * 0.7) recap = null; else if (Math.abs(dx) < 8 && recap?.stage === 'ask') recap = { ...recap, stage: 'show' } }}>
      <div class="r-page">
        <span class="r-eyebrow">Previously{recap.chapter ? ` · ${tocLabel(recap.chapter)}` : ''}</span>
        <b class="r-title">{rec.title}</b>
        {#if recap.stage === 'ask'}<p class="r-q">What happened last? Take a moment to remember, then tap to see.</p>{/if}
        {#if recap.lines.length}<div class="r-lines" class:hidden={recap.stage === 'ask'}>{#each recap.lines as l}<p>{l}</p>{/each}</div>{/if}
        {#if recap.stage !== 'ask'}
          {#if recap.mine.length}<span class="r-label">Your marks</span>{#each recap.mine as m}<p class="r-mine">“{m}”</p>{/each}{/if}
          {#if recap.who.length}<span class="r-label">With</span><p class="r-who">{recap.who.join(' · ')}</p>{/if}
        {/if}
        <span class="r-turn">Turn the page to read on ›</span>
      </div>
    </div>
  {/if}
  {#if card}
    <div class="lens-card glass" class:below={card.below} style:left="{card.x}px" style:top="{card.y}px" style:--nx="{card.nx ?? 140}px" role="tooltip">{@html card.html}</div>
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
      <div class="view" in:fly={{ x: dir * 18, duration: 220, delay: 70, easing: cubicOut }} out:fade={{ duration: 70 }}>
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
            {#if rec.profile?.names?.some(n => n.kind === 'person')}
              <button onclick={() => go('cast')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="7" r="1.6" fill="currentColor" /><circle cx="17" cy="6" r="2.2" fill="currentColor" /><circle cx="12" cy="17" r="1.8" fill="currentColor" /><path d="M7.4 7.6l8 -1M7 8.4l4.2 7.2M16.2 7.9L12.9 15.4" stroke-width="1.2" /></svg>
                <span>The cast</span>
                <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            {/if}
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
          <Toc toc={book.toc} {isCurrent} onpick={jump} glyph={tocGlyph} />
        {:else if view === 'appearance'}
          <Appearance bind:settings />
        {:else if view === 'aids'}
          <ReadingAids bind:value={settings} part="guide" />
        {:else if view === 'cast'}
          <Constellation people={rec.profile?.names ?? []} links={rec.profile?.links} upto={loc?.index ?? 0}
            hue={slot => whoHue(resolveTheme(eff.palette, eff.mode), slot % WHO_SLOTS)}
            onpick={name => { const p = lenses?.person(name); const n = p ? p.perSpine.slice(0, (loc?.index ?? 0) + 1).reduce((a, x) => a + x, 0) : 0; const m = companions(rec.profile?.links, name, loc?.index ?? 0); toast(`${name} · ${n} mentions so far${m.length ? ` · often with ${m.slice(0, 2).join(', ')}` : ''}`) }} />
          <p class="empty-notes">Everyone you've met, brighter the more they're around; a thread for each scene two of them share. It grows as you read.</p>
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
  .reader { position: fixed; inset: 0; overflow: hidden; background: var(--bg); transition: --accent 2.6s ease; } /* --accent is a registered <color> (app.css): it drifts */
  .paper { position: absolute; inset: 0; background: var(--bg); }
  .stage {
    position: absolute; overflow: hidden;
    inset: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  .stage :global(.pubre-view) { will-change: transform; } /* inherits the theme's color-scheme, matching the book's (else an opaque canvas hides what's behind) */

  .running {
    position: absolute; left: 0; right: 0; margin-inline: auto; width: fit-content; max-width: 60vw; pointer-events: none;
    font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: opacity .3s var(--ease);
  }
  .head { top: calc(env(safe-area-inset-top) + var(--s4)); font-family: var(--serif); font-style: italic; }
  .foot { bottom: calc(env(safe-area-inset-bottom) + var(--s4)); font-variant-numeric: tabular-nums; }
  .running { display: flex; justify-content: safe center; align-items: baseline; gap: 4px; }
  .ftx { min-width: 0; overflow: hidden; text-overflow: ellipsis; } /* the time text gives way, never the page number */
  .sep { flex: none; }
  .running :global(.ticker) { min-width: 0; }
  .pgn { display: inline-flex; gap: 3px; align-items: baseline; }
  .pgn :global(.ticker), .w-pg :global(.ticker) { flex: none; } /* a page number never shrinks (it collapsed to 0 when the count first appeared) */
  .sep { margin: 0 4px; }
  .chrome .running { opacity: 0; }
  .guiding .running.head { opacity: 0; }
  /* Where am I, while the pointer guide runs: section · a wedge per paragraph · page */
  .where {
    position: absolute; z-index: 3; top: calc(env(safe-area-inset-top) + 8px); left: 0; right: 0; margin-inline: auto; width: fit-content; overflow: hidden; /* not left:50% + translate: that caps an auto width at half the screen */
    display: flex; align-items: center; gap: 10px; padding: 6px 12px; border-radius: 999px; max-width: min(560px, calc(100vw - 32px));
    font: 600 11px system-ui; color: var(--muted); pointer-events: none;
  }
  .w-ch { display: inline-grid; min-width: 0; max-width: 42%; letter-spacing: .02em; }
  .w-pg { display: inline-flex; flex: none; font-weight: 500; font-variant-numeric: tabular-nums; }
  .w-strip { display: block; width: min(230px, 42vw); flex: none; }
  .w-row { display: flex; gap: 2px; align-items: center; width: min(200px, 34vw); height: 8px; flex: none; }
  .w-row i { flex-basis: 0; min-width: 2px; height: 3px; border-radius: 2px; background: color-mix(in srgb, var(--fg) 14%, transparent); transition: background-color .45s ease, height .35s var(--spring); }
  .w-row i.done { background: color-mix(in srgb, var(--accent) 42%, transparent); }
  .w-row i.cur { height: 6px; background: var(--accent); animation: wedge .65s var(--spring); }
  @keyframes wedge { 0% { transform: scaleY(.6); } 40% { transform: scaleY(1.9); } 100% { transform: scaleY(1); } }
  .w-sweep { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 18%, transparent), transparent); background-size: 45% 100%; background-repeat: no-repeat; animation: wsweep 1.2s cubic-bezier(.4,0,.2,1) both; }
  @keyframes wsweep { from { background-position: -70% 0; } to { background-position: 170% 0; } }
  @media (prefers-reduced-motion: reduce) { .w-row i.cur, .w-sweep { animation: none; } }

  /* Floating chrome springs in from its edge; the dock trails slightly. */
  .close, .dock { position: absolute; z-index: 2; transition: transform .5s var(--spring), opacity .25s var(--ease); }
  .close { top: calc(env(safe-area-inset-top) + var(--s3)); left: calc(env(safe-area-inset-left) + var(--s3)); }
  /* top right: one quiet cluster (light/dark · Aa · contents · pin) */
  .topright { position: absolute; z-index: 2; top: calc(env(safe-area-inset-top) + var(--s3)); right: calc(env(safe-area-inset-right) + var(--s3)); display: flex; padding: 2px; border-radius: 999px; transition: transform .5s var(--spring), opacity .25s var(--ease); }
  .topright button { width: 40px; height: 40px; border: 0; border-radius: 50%; background: none; color: var(--fg); display: grid; place-items: center; transition: background-color .2s, color .2s, transform .3s var(--spring); }
  .topright button:hover { background: var(--hover); }
  .topright button:active { transform: scale(.9); }
  .topright svg { width: 19px; height: 19px; }
  .aa-t { font: 500 16px var(--serif); }
  .pin.on { color: var(--accent); }
  .reader:not(.chrome) .topright { transform: translateY(-12px) scale(.8); opacity: 0; pointer-events: none; }
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
  /* The reading pad: always in the thumb's corner; above the menu while the controls show; above the Stage too. */
  .castchip { position: absolute; z-index: 9; top: calc(env(safe-area-inset-top) + 80px); left: 50%; translate: -50% 0; display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 8px; border-radius: 999px; font: 600 11px var(--mono); letter-spacing: .04em; color: var(--fg); white-space: nowrap; pointer-events: none; }
  .castchip i { width: 14px; height: 14px; border-radius: 50%; background: conic-gradient(var(--accent) calc(var(--p) * 360deg), color-mix(in srgb, var(--fg) 14%, transparent) 0); transition: background .3s; }
  .castchip i.done { background: var(--accent); box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--accent) 40%, var(--bg)); }
  .castchip b { color: var(--muted); font-weight: 600; font-variant-numeric: tabular-nums; }
  .padgroup {
    position: absolute; z-index: 8; right: calc(env(safe-area-inset-right) + var(--s3)); bottom: calc(env(safe-area-inset-bottom) + var(--s3));
    display: flex; align-items: center; gap: var(--s2); transition: transform .5s var(--spring);
  }
  .padgroup.up { transform: translateX(-52px); } /* inline in the bottom bar, just left of the menu */
  @media (max-width: 719px) {
    .reader.chrome.padded .progress { margin-right: 64px; transition: margin .3s var(--ease); }
    .reader.chrome.padded.speedy .progress { margin-right: 186px; }
  }
  .steps { display: flex; border-radius: 999px; animation: padIn .4s var(--spring); }
  .back { width: 40px; height: 40px; border: 0; border-radius: 50%; background: none; display: grid; place-items: center; color: var(--fg); touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  .back svg { width: 20px; height: 20px; }
  .back:active { transform: scale(.92); }
  @media (hover: hover) and (pointer: fine) { .back { opacity: .6; height: 34px; width: 34px; } .back:hover { opacity: 1; } }
  .speed { height: 40px; min-width: 64px; padding: 0 12px; border: 0; border-radius: 999px; display: flex; align-items: baseline; justify-content: center; gap: 3px; color: var(--fg); font-variant-numeric: tabular-nums; animation: padIn .4s var(--spring); transition: background-color .2s, color .2s; }
  .speed b { font: 600 15px system-ui; }
  .speed small { font-size: 10.5px; color: var(--muted); }
  .speed.on { background: var(--accent); color: var(--bg); }
  .speed.on small { color: color-mix(in srgb, var(--bg) 75%, transparent); }
  @media (hover: hover) and (pointer: fine) { .speed { opacity: .6; height: 34px; } .speed:hover, .speed.on, .padgroup.up .speed { opacity: 1; } }
  .speedpop {
    position: absolute; z-index: 9; right: calc(env(safe-area-inset-right) + var(--s3)); bottom: calc(env(safe-area-inset-bottom) + var(--s3) + 68px);
    width: min(320px, calc(100vw - 2 * var(--s3))); padding: 14px; border-radius: 20px; display: grid; gap: 12px; animation: popIn .3s var(--spring); transform-origin: bottom right;
  }
  .speedpop.up { right: calc(env(safe-area-inset-right) + var(--s3) + 52px); }
  .speedpop { padding: 14px; gap: 12px; background: color-mix(in srgb, var(--accent) 9%, var(--surface)); box-shadow: 0 0 0 1px var(--hairline), var(--e2); font-family: var(--mono); }
  .sp-top { display: flex; align-items: end; justify-content: space-between; gap: var(--s2); }
  .sp-num { display: flex; align-items: baseline; gap: 6px; }
  .sp-num b { font: 600 34px/1 var(--mono); letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .sp-num small { font: 500 10px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .sp-name { font: 500 11px var(--mono); color: var(--muted); text-align: right; }
  .sp-dial { display: flex; align-items: start; gap: 10px; }
  .sp-dial > button { width: 44px; height: 44px; flex: none; border: 0; border-radius: 50%; background: transparent; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 20%, transparent); color: var(--fg); font: 500 20px/1 var(--mono); }
  .sp-dial > button:active { background: var(--hover); }
  .sp-track { position: relative; flex: 1; padding-top: 10px; }
  .sp-track input { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; margin: 0; border-radius: 3px; background: linear-gradient(90deg, var(--accent) var(--f), color-mix(in srgb, var(--fg) 14%, transparent) var(--f)); }
  .sp-track input::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: var(--ink); border: 3px solid var(--accent); box-shadow: 0 2px 6px rgb(0 0 0 / .25); }
  .sp-track input::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: var(--ink); border: 3px solid var(--accent); }
  .sp-ticks { position: relative; height: 30px; margin-top: 6px; }
  .sp-ticks button { position: absolute; translate: -50% 0; display: grid; justify-items: center; gap: 3px; border: 0; background: none; padding: 0 2px; color: var(--muted); font: 600 9px var(--mono); letter-spacing: .06em; text-transform: uppercase; }
  .sp-ticks i { width: 1px; height: 6px; background: currentColor; }
  .sp-ticks button.on { color: var(--accent); }
  @keyframes popIn { from { opacity: 0; transform: scale(.92) translateY(8px); } }
  .pad {
    position: relative;
    width: 56px; height: 56px; border: 0; border-radius: 50%; display: grid; place-items: center; color: var(--fg);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 14%, transparent), 0 4px 14px -6px rgb(0 0 0 / .3);
    touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
    transition: transform .5s var(--spring), opacity .3s, background-color .3s, color .3s; animation: padIn .45s var(--spring);
  }
  .pad.active { color: var(--accent); }
  .pad.held { transform: scale(.92); background: color-mix(in srgb, var(--accent) 18%, var(--bg)); }
  .pad-i { width: 22px; height: 22px; transition: transform .3s var(--spring); }
  .pad-i.play { margin-left: 2px; }
  .pad:active .pad-i { transform: scale(.9); }
  /* While the Stage is up: a hairline ring that fills through the chapter. */
  .pad-progress { position: absolute; inset: 3px; border-radius: 50%; pointer-events: none; opacity: .55;
    background: conic-gradient(var(--accent) calc(var(--p) * 1turn), color-mix(in srgb, var(--fg) 10%, transparent) 0);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px)); mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px)); }
  .pad-ring { position: absolute; inset: -4px; border-radius: 50%; border: 2px solid var(--accent); opacity: 0; pointer-events: none; }
  .pad.held .pad-ring { opacity: 1; animation: ring 1.4s ease-out infinite; }
  @media (hover: hover) and (pointer: fine) { .pad { width: 48px; height: 48px; opacity: .6; } .pad:hover, .pad.held, .padgroup.up .pad { opacity: 1; } }
  @keyframes padIn { from { opacity: 0; transform: scale(.7); } }
  @keyframes ring { from { transform: scale(.96); opacity: .9; } to { transform: scale(1.18); opacity: 0; } }
  /* The transport: one capsule — speed · ‹ ▶ › — like a player's controls, the play button the clear centre */
  .transport { display: flex; align-items: center; gap: 2px; padding: 5px; border-radius: 999px; height: 58px; box-sizing: border-box; }
  .transport.solo { padding: 0; height: auto; background: none; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
  .transport .speed { height: 48px; min-width: 52px; padding: 0 10px 0 14px; border-radius: 999px; background: none; box-shadow: none; animation: none;
    display: grid; place-content: center; justify-items: center; gap: 1px; line-height: 1; }
  .transport .speed b { font: 600 15px var(--mono); }
  .transport .speed small { font: 500 9px var(--mono); letter-spacing: .12em; text-transform: uppercase; }
  .transport .speed.on { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--fg); }
  .transport .speed.on small { color: var(--muted); }
  .transport .speed { position: relative; margin-right: 4px; }
  .ptrbtn { width: 46px; height: 48px; border: 0; border-radius: 999px; background: none; color: var(--fg); display: grid; place-items: center; }
  .lookbtn { width: 40px; color: var(--muted); transition: color .2s; }
  .lookbtn.on { color: var(--accent); }
  .lookbtn svg { width: 22px; height: 22px; }
  .ptrbtn:active { background: var(--hover); }
  .ptr-mini { position: relative; isolation: isolate; font: 600 16px var(--serif); padding: 2px 3px; }
  .ptr-mini i { position: absolute; z-index: -1; left: -1px; right: -1px; }
  .ptr-mini i[data-p="underline"], .ptr-mini i[data-p="dot"] { top: auto; bottom: -2px; height: 2.5px; left: 2px; right: 2px; }
  .ptr-mini i[data-p="dot"] { width: 5px; height: 5px; left: calc(50% - 2.5px); }
  .ptr-mini i[data-p="highlighter"] { top: 55%; bottom: 0; }
  .ptr-mini i[data-p="caret"] { left: -3px; right: auto; width: 2px; top: 3px; bottom: 3px; }
  .ptr-mini i:not([data-p="underline"]):not([data-p="dot"]):not([data-p="highlighter"]):not([data-p="caret"]) { top: -1px; bottom: -1px; }
  .transport .speed::after { content: ''; position: absolute; right: -3px; top: 12px; bottom: 12px; width: 1px; background: var(--hairline); }
  .transport .steps { display: contents; }
  .transport .back { width: 44px; height: 48px; border-radius: 999px; margin: 0; color: var(--fg); transition: background-color .15s, transform .25s var(--spring); }
  .transport .back:active { background: var(--hover); }
  .transport .pad { width: 48px; height: 48px; flex: none; background: var(--ink); color: var(--on-ink); box-shadow: none; opacity: 1; animation: none; }
  .transport.solo .pad { width: 56px; height: 56px; box-shadow: var(--e2); }
  .transport .pad.active { color: var(--on-ink); }
  .transport .pad.held { background: var(--accent); transform: scale(.94); }
  .transport .pad-progress { inset: -3px; opacity: .9; }
  .transport .pad-i { width: 20px; height: 20px; }
  /* While holding: the shuttle and the lock, just above the thumb */
  .shuttle {
    position: absolute; z-index: 8; right: calc(env(safe-area-inset-right) + var(--s3)); bottom: calc(env(safe-area-inset-bottom) + var(--s3) + 70px);
    width: 216px; padding: 10px 12px; border-radius: 16px; display: grid; gap: 8px; justify-items: center;
    font-size: 11.5px; color: var(--muted); pointer-events: none; animation: cardIn .25s var(--ease);
  }
  .shuttle.at { right: 0; left: 0; margin-inline: auto; bottom: auto; top: calc(env(safe-area-inset-top) + 64px); } /* in the top fade, clear of the reading band */
  .sh-lock { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; transition: background-color .2s, color .2s, transform .3s var(--spring); }
  .sh-lock svg { width: 14px; height: 14px; }
  .sh-lock.near { color: var(--fg); transform: translateY(-2px); }
  .sh-lock.on { background: var(--accent); color: var(--bg); }
  .sh-row { display: flex; align-items: center; gap: 8px; width: 100%; }
  .sh-track { position: relative; flex: 1; height: 4px; border-radius: 2px; background: linear-gradient(90deg, color-mix(in srgb, var(--fg) 12%, transparent), color-mix(in srgb, var(--accent) 45%, transparent)); }
  .sh-track::before { content: ''; position: absolute; left: 50%; top: -3px; width: 1px; height: 10px; background: var(--muted); opacity: .5; }
  .sh-track i { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--accent); box-shadow: 0 1px 4px rgb(0 0 0 / .25); }
  .sh-rate { font: 600 15px system-ui; color: var(--fg); font-variant-numeric: tabular-nums; }
  .tease { position: absolute; z-index: 4; translate: -50% 0; width: min(300px, 80vw); display: grid; justify-items: center; gap: 6px; text-align: center; pointer-events: none; }
  .tease > * { animation: tease-in .9s cubic-bezier(.2,.7,.2,1) both; } /* a chapter's close settles in, once */
  .tease > :nth-child(2) { animation-delay: .12s; } .tease > :nth-child(3) { animation-delay: .24s; } .tease > :nth-child(4) { animation-delay: .36s; } .tease > :nth-child(5) { animation-delay: .5s; }
  @keyframes tease-in { from { opacity: 0; transform: translateY(6px); } }
  .t-orn { color: var(--accent); font: 20px var(--serif); margin-bottom: 6px; }
  .t-k { font: 600 10px var(--mono); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .t-t { font: 400 20px/1.25 var(--serif); color: var(--fg); text-wrap: balance; }
  .t-l { font: italic 14px/1.5 var(--serif); color: color-mix(in srgb, var(--fg) 55%, transparent); text-wrap: pretty; }
  .t-ask { pointer-events: auto; margin-top: 10px; border: 1px solid var(--hairline); border-radius: 999px; background: none; color: var(--muted); font: 500 11px var(--mono); letter-spacing: .06em; padding: 7px 12px; min-height: 36px; }
  @media (prefers-reduced-motion: reduce) { .tease > * { animation: none; } }
  .ending { position: absolute; z-index: 6; left: 50%; top: calc(env(safe-area-inset-top) + 6px); translate: -50% 0; max-width: calc(100vw - 24px); overflow: hidden;
    border-radius: 999px; background: color-mix(in srgb, var(--accent) 7%, var(--surface)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 24%, var(--hairline)), var(--e2); }
  .ending.open { width: min(380px, calc(100vw - 24px)); border-radius: 18px; }
  .e-pill { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px 7px 8px; font: 600 11px var(--mono); letter-spacing: .06em; color: var(--fg); white-space: nowrap; }
  .e-ok { width: 18px; height: 18px; flex: none; padding: 2px; box-sizing: border-box; border-radius: 50%; background: var(--accent); color: var(--bg); }
  .e-t { text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; }
  .e-meta { color: var(--muted); font-weight: 500; letter-spacing: .02em; }
  .e-meta::before { content: '· '; }
  .e-chev { width: 16px; height: 16px; flex: none; color: var(--muted); transition: transform .25s var(--ease); }
  .e-chev.up { transform: rotate(180deg); }
  .e-body { display: grid; gap: var(--s2); padding: 2px var(--s4) var(--s4); }
  /* a quiet timer: it drains, and the pill goes; hovering holds it, opening it stops it */
  .e-timer { position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; background: var(--accent); transform-origin: left; animation: e-drain 9s linear forwards; }
  .ending:hover .e-timer { animation-play-state: paused; }
  @keyframes e-drain { to { transform: scaleX(0); } }
  .e-sparks { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
  .e-sparks span { width: 100%; font: 600 10.5px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .spark-w { border: 0; border-radius: 999px; padding: 4px 10px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--fg); font: italic 14px var(--serif); box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 25%, transparent); }
  .e-q { margin: 0; font: 14.5px/1.45 var(--serif); }
  .e-l { font-size: 13px; color: var(--muted); }
  .e-row { display: flex; gap: var(--s2); align-items: center; }
  .e-in { flex: 1; min-width: 0; border: 0; border-radius: 10px; padding: 8px 10px; background: var(--hover); font: 14px system-ui; color: var(--fg); outline: none; }
  .recap { position: absolute; z-index: 7; inset: 0; background: var(--bg); display: grid; place-items: center; overflow: auto; outline: none; box-shadow: 8px 0 24px -12px rgba(0,0,0,.25); animation: recapIn .5s var(--ease); }
  @keyframes recapIn { from { opacity: 0; } }
  .r-page { width: min(440px, calc(100vw - 48px)); display: grid; gap: var(--s2); justify-items: center; text-align: center; padding-block: var(--s6); }
  .r-lines { text-align: left; transition: filter .5s ease, opacity .5s ease; }
  .r-lines.hidden { filter: blur(6px); opacity: .55; }
  .r-turn { margin-top: var(--s5); font: 600 10.5px var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
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
    transform: translateY(-100%); pointer-events: none; animation: cardIn .16s cubic-bezier(.2,.9,.3,1.1); transform-origin: var(--nx) 100%;
  }
  .lens-card.below { transform: none; transform-origin: var(--nx) 0; }
  /* a notch points at the word it explains */
  .lens-card::before { content: ''; position: absolute; left: calc(var(--nx) - 6px); bottom: -6px; width: 12px; height: 12px; background: inherit; backdrop-filter: inherit; transform: rotate(45deg); border-radius: 2px; clip-path: polygon(100% 0, 100% 100%, 0 100%); }
  .lens-card.below::before { bottom: auto; top: -6px; clip-path: polygon(0 0, 100% 0, 0 100%); }
  .lens-card :global(.c-word) { display: flex; align-items: baseline; gap: 8px; }
  .lens-card :global(.c-pos) { font: italic 13px var(--serif); color: var(--accent); }
  .lens-card :global(.c-q) { margin-top: 6px; padding-left: 8px; border-left: 2px solid var(--hairline); font: italic 13px/1.45 var(--serif); color: var(--muted); }
  .lens-card :global(.c-q b) { font: italic 600 13px var(--serif); color: var(--fg); }
  .lens-card :global(b) { font: 600 16px var(--serif); }
  .lens-card :global(.c-def) { font: 14px/1.4 var(--serif); margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .lens-card :global(.c-meta) { font-size: 11.5px; color: var(--muted); }
  .lens-card :global(.c-who) { display: flex; align-items: center; gap: 8px; }
  .lens-card :global(.c-hist) { display: flex; align-items: end; gap: 1px; height: 14px; margin-top: 6px; }
  .lens-card :global(.c-hist i) { flex: 1; min-width: 1px; border-radius: 1px; opacity: .7; }
  .lens-card :global(.c-av) { width: 44px; height: 44px; border-radius: 12px; flex: none; }
  @keyframes cardIn { from { opacity: 0; scale: .94; } }
  :global(.star-birth) { position: fixed; z-index: 6; width: 8px; height: 8px; border-radius: 50%; pointer-events: none; }
  /* weather: a whisper of rain, fog at the edges, slow snow, a night vignette — all very faint */
  .weather { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
  .w-storm { opacity: .06; background: repeating-linear-gradient(105deg, transparent 0 14px, var(--fg) 14px 15px, transparent 15px 46px); background-size: 180px 180px; animation: rain .7s linear infinite; }
  .w-fog { background: radial-gradient(ellipse at 50% 50%, transparent 55%, color-mix(in srgb, var(--fg) 7%, transparent) 100%), linear-gradient(transparent 70%, color-mix(in srgb, var(--bg) 60%, color-mix(in srgb, var(--fg) 8%, transparent))); }
  .w-snow { opacity: .1; background-image: radial-gradient(circle, var(--fg) 1px, transparent 1.5px), radial-gradient(circle, var(--fg) .8px, transparent 1.2px); background-size: 90px 90px, 140px 140px; background-position: 0 0, 40px 60px; animation: snow 14s linear infinite; }
  .w-night { background: radial-gradient(ellipse at 50% 40%, transparent 50%, rgb(10 14 30 / .14) 100%); }
  .weather.still { animation: none; }
  @keyframes rain { to { background-position: -40px 180px; } }
  @keyframes snow { to { background-position: 30px 90px, 80px 200px; } }
  .dimmer { position: absolute; inset: 0; z-index: 7; background: #000; pointer-events: none; transition: opacity .2s; }
  .toast { position: absolute; z-index: 9; left: 50%; top: calc(env(safe-area-inset-top) + var(--s5)); translate: -50% 0; padding: 8px 14px; border-radius: 999px; font-size: 13px; animation: toastIn .35s var(--ease); pointer-events: none; }
  @keyframes toastIn { from { opacity: 0; transform: translateY(-6px); } }
  .error { position: absolute; inset: 0; z-index: 3; display: grid; place-content: center; justify-items: center; text-align: center; padding: var(--s5); background: var(--bg); }
  .error h2 { font: 600 1.5rem var(--serif); margin: 0 0 var(--s2); }
  .error p { color: var(--muted); max-width: 420px; margin: 0 0 var(--s5); }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
