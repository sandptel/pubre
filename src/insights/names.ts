// Find the cast of a book from its chapters' plain text — on-device heuristics, no models.
//
// 1. Clean: Project Gutenberg wrappers, title-case lines (headings, contents, captions) and licence pages are dropped.
// 2. Collect: runs of capitalised words, with their title ("Mr.", "Captain", "Lady"), whether "the" came before
//    ("the Hatter"), and whether they start a sentence ("Mr." is not a sentence end).
// 3. Weigh each form on its evidence: speech ("said Ahab", "the Hatter said"), a person's verbs and possessions
//    ("Elizabeth smiled", "Darcy's face"), titles and given names for people; prepositions, place nouns and a
//    small gazetteer for places; nationalities and languages are things.
// 4. Join the forms of one person: a title and its bare name ("Mr. Darcy" / "Darcy", unless Mr. and Mrs. both
//    use it), a full name and its parts ("Rodion Romanovitch Raskolnikov"), and nicknames ("Lizzy" → Elizabeth).
//    The most used form names the character; the rest become aliases, so the page marks them all.

import { DEMONYMS, FEMALE, MALE, NICK, PLACES, TITLES } from './gazetteer.ts'

export interface NameInfo { name: string; kind: 'person' | 'place' | 'thing'; count: number; perSpine: number[]; first: number; slot: number; aliases?: string[] }

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean))
/** Never names: function words, sentence starters, interjections, calendar words, the divine. */
const STOP = words(`I A An The And But Or Nor For So Yet Then There Here This That These Those It Its He She They We You Your His Her Him Their Them
Our Us My Me Mine What When Where Why How Who Whom Whose Which Well Now Still Thus Hence Let If In On At To Of With By From As Is Was Be Are Were
Not No Yes Oh O Ah Alas Ay Aye Nay Hullo Hello Hey Pray Indeed Perhaps Surely Certainly Only Even Just Yet Also Too Very Much More Most Some Any
All Every Each Both Either Neither One Two Three Four Five Six Seven Eight Nine Ten First Second Third Last Next Many Few Such Same Other Another
After Before Upon Over Under Again Once Never Always Sometimes Often Soon Ever Do Does Did Have Has Had Can Could Will Would Shall Should May
Might Must Good Dear Poor Old Young Little Great Mrs Mr Ms Dr St Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March
April May June July August September October November December Christmas Easter God Lord Heaven Heavens Christ Jesus Providence Satan Bible
Chapter Book Part Volume Section Contents Preface Introduction Appendix Footnote Footnotes Note Notes Index Illustration Illustrations Plate
Frontispiece Transcriber Copyright Edition Title Heading Author Editor Translator Translated Published Printed Ebook EBook Project Gutenberg
Literary Archive Foundation Company Press Library University Esq Esquire Sir Madam Ma'am Majesty Highness Ladyship Lordship Honour Honor
Grace Excellency Reverence Worship Mamma Mama Papa Grandmamma Grandpapa`)
const PLACE_NOUN = words(`Street Road Lane Square Park House Hall Court Abbey Castle Church Chapel Inn Bridge Island Isle Islands River Lake Mountain Mountains
Hill Hills City Town Village Market Place Garden Gardens Bay Sea Ocean Strait Gulf Cape Point Row Terrace Place Common Fields Downs Heath Wood
Forest Valley Canal Harbour Harbor Dock Docks Quay Prison Gaol Hospital School College Cathedral Palace Tower Gate Gates Boar Arms Head Cross Lodge`)
const SPEECH = 'said|says|asked|asks|cried|replied|answered|exclaimed|shouted|whispered|muttered|returned|continued|added|remarked|observed|repeated|called|roared|sighed|growled|screamed|interrupted|rejoined|retorted|resumed|inquired|enquired|murmured|declared|urged|pleaded|demanded|explained|began|thought|laughed|sobbed|stammered|faltered|gasped|groaned|shrieked|bawled|bellowed|grumbled|protested|persisted|insisted|suggested|admitted|agreed|whimpered|hissed|snapped|sneered|went on'
const SPEECH_BEFORE = new RegExp(`\\b(?:${SPEECH})\\s+(?:the\\s+)?$`)
const SPEECH_AFTER = new RegExp(`^(?:[’']s)?\\s+(?:${SPEECH})\\b`)
const AGENT_AFTER = /^\s+(?:had\s+|was\s+|could\s+|would\s+|did\s+|then\s+|now\s+|only\s+|still\s+)?(?:looked|turned|smiled|laughed|nodded|sighed|spoke|cried|thought|felt|knew|wondered|whispered|stared|frowned|shook|wept|came|went|stood|sat|rose|ran|walked|took|gave|told|saw|heard|seemed|began|replied|answered|asked|said|hesitated|paused|blushed|coloured|colored|listened|watched|waited|hurried|entered|followed|exclaimed|bowed|curtsied|shrugged|grinned|glanced|gazed|wrote|read|loved|hated|married|died|smoked|shouted|whispered)\b/
const POSS_AFTER = /^[’']s\s+(?:own\s+)?(?:face|eyes?|hands?|head|voice|heart|mind|mother|father|wife|husband|sister|brother|sons?|daughters?|room|arms?|lips|hair|feet|legs?|name|friends?|uncle|aunt|cousin|look|manner|countenance|words|letter|house|life|death|shoulders?|cheeks?|brow|smile|temper|opinion|fortune|family|leg|ivory|cabin|nose|mouth|chair|coat|hat)\b/
const PREP_BEFORE = /\b(?:in|at|near|into|towards?|through|across|reached|visit|visited|around|beyond)\s+$/
const THE_BEFORE = /\bthe\s+$/
const CONTRACTION = /[’'](?:ll|d|ve|m|re|t)$/
const WORD = /\p{Lu}[\p{Ll}’']*\p{Ll}(?:-\p{L}[\p{Ll}’']*)*/gu // "Dough-Boy", "Frog-Footman"
const LOWER = /(?<![\p{L}’'])\p{Ll}[\p{Ll}’'\-]*\p{Ll}/gu

interface Form { form: string; parts: string[]; title: string; n: number; mid: number; the: number; speech: number; agent: number; poss: number; prep: number; per: number[]; first: number }

/** The story text of a chapter: no Gutenberg wrapper or licence, no title-case lines (headings, contents, captions). */
function story(raw: string): string {
  let t = raw
  const s = t.search(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG/i)
  if (s >= 0) t = t.slice(t.indexOf('\n', s + 10) + 1 || s)
  const e = t.search(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG/i)
  if (e >= 0) t = t.slice(0, e)
  if ((t.match(/Project Gutenberg/gi)?.length ?? 0) > 2) return '' // the licence, or the header page
  return t.split('\n').map(l => {
    const ws = l.match(/[\p{L}’'-]+/gu) ?? []
    if (ws.length >= 2 && ws.length <= 16 && ws.filter(w => /^\p{Lu}/u.test(w)).length / ws.length >= 0.6) return '' // a heading or a caption
    return l.replace(/[ \t ]+/g, ' ')
  }).join('\n')
}

/** Does the word at `a` start a sentence (or a line, or a quotation)? "Mr." and other titles don't end sentences. */
function initial(text: string, a: number): boolean {
  let k = a - 1
  while (k >= 0 && /[\s“‘"'(\[_*—–-]/.test(text[k])) { if (text[k] === '\n') return true; k-- }
  if (k < 0) return true
  while (k >= 0 && /[”’"')\]]/.test(text[k])) k--
  const c = text[k]
  if (c === '.') { const w = /(\p{L}+)\.$/u.exec(text.slice(Math.max(0, k - 14), k + 1)); return !(w && (TITLES.has(w[1]) || w[1].length === 1)) }
  return c === '!' || c === '?' || c === '…' || c === ':' || c === undefined
}

const gender = (given: string): '' | 'm' | 'f' => (FEMALE.has(given) ? 'f' : MALE.has(given) ? 'm' : '')

export function findNames(texts: string[], opts: { min?: number; slots?: number; exclude?: string[]; onProgress?: (done: number, total: number) => void } = {}): NameInfo[] {
  const min = opts.min ?? 3, slots = opts.slots ?? 7
  const excluded = new Set((opts.exclude ?? []).flatMap(s => [s, ...s.split(/[\s.]+/)]).filter(w => w.length > 1))
  const forms = new Map<string, Form>(), lower = new Map<string, number>()

  for (const [si, raw] of texts.entries()) {
    const text = story(raw)
    for (const m of text.matchAll(LOWER)) lower.set(m[0], (lower.get(m[0]) ?? 0) + 1)
    const toks = [...text.matchAll(WORD)].map(m => ({ t: m[0], a: m.index!, b: m.index! + m[0].length }))
    let i = 0
    while (i < toks.length) {
      let j = i
      while (j + 1 < toks.length) { // one run: "Mr. Darcy", "Rodion Romanovitch Raskolnikov", "Queen of Hearts"
        const gap = text.slice(toks[j].b, toks[j + 1].a)
        if (gap === ' ' || (TITLES.has(toks[j].t) && gap === '. ') || (/^ (?:of|of the|de|van|von|du|le|la) $/.test(gap) && !STOP.has(toks[j].t))) j++
        else break
      }
      take(text, si, toks.slice(i, j + 1))
      i = j + 1
    }
    opts.onProgress?.(si + 1, texts.length)
  }

  function take(text: string, si: number, run: { t: string; a: number; b: number }[]) {
    if (run.some(r => CONTRACTION.test(r.t))) return
    let init = initial(text, run[0].a)
    const bareTok = (t: string) => t.replace(/[’']s$/, '')
    while (run.length && STOP.has(bareTok(run[0].t)) && !TITLES.has(run[0].t)) { run = run.slice(1); init = false } // "Then Starbuck", "That’s Bill" → the name, mid-sentence
    if (!run.length) return
    let title = ''
    if (run.length > 1 && TITLES.has(run[0].t) && /^\.? $/.test(text.slice(run[0].b, run[1].a))) { title = run[0].t + (text[run[0].b] === '.' ? '.' : ''); run = run.slice(1) } // not "King of the Winged Monkeys"
    else if (run.length === 1 && TITLES.has(run[0].t) && !STOP.has(run[0].t)) title = '' // a bare title ("the Queen"): a role, if it acts
    const a = run[0].a, last = run[run.length - 1]
    const end = last.b, name = text.slice(a, end).replace(/[’']s$/, '').replace(/\s+/g, ' ')
    const parts = name.split(/ (?:of the |of |de |van |von |du |le |la )?/).filter(p => !/^(?:of|the|de|van|von|du|le|la)$/.test(p))
    if (parts.some(p => STOP.has(p) || excluded.has(p)) && !(parts.length === 1 && TITLES.has(parts[0]))) return
    if (excluded.has(name)) return
    const start = title ? a - title.length - 1 : a
    const form = title ? `${title} ${name}` : name
    const before = text.slice(Math.max(0, start - 40), start), after = text.slice(end, end + 48)
    let f = forms.get(form)
    if (!f) forms.set(form, (f = { form, parts, title, n: 0, mid: 0, the: 0, speech: 0, agent: 0, poss: 0, prep: 0, per: new Array(texts.length).fill(0), first: si }))
    f.n++; f.per[si]++
    if (!init) f.mid++
    if (!title && THE_BEFORE.test(before)) f.the++
    if (SPEECH_BEFORE.test(before) || SPEECH_AFTER.test(after)) f.speech++
    if (AGENT_AFTER.test(after)) f.agent++
    if (POSS_AFTER.test(after)) f.poss++
    if (PREP_BEFORE.test(before)) f.prep++
  }

  // ---------- weigh each form ----------
  const low = (w: string) => lower.get(w.toLowerCase()) ?? 0
  // a sentence's first word glued to a name ("Meantime Pip", "Because Pumblechook") folds into the name
  for (const f of [...forms.values()]) {
    if (f.title || f.parts.length < 2 || low(f.parts[0]) < 3 || gender(f.parts[0]) || TITLES.has(f.parts[0])) continue
    if (f.the / f.n >= 0.3 || (f.mid / f.n > 0.5 && low(f.parts[0]) < 20)) continue // "the Tin Woodman" is a name; "Overhearing Starbuck" starts a sentence
    const rest = f.form.slice(f.form.indexOf(' ') + 1).replace(/^(?:of the|of|de|van|von|du|le|la) /, ''), parts = f.parts.slice(1), t = TITLES.has(parts[0]) && parts.length > 1 ? parts[0] : ''
    let g = forms.get(rest)
    if (!g) forms.set(rest, (g = { ...f, form: rest, parts: t ? parts.slice(1) : parts, title: t ? rest.split(' ')[0] : '', n: 0, mid: 0, the: 0, speech: 0, agent: 0, poss: 0, prep: 0, per: new Array(texts.length).fill(0) }))
    g.n += f.n; g.mid += f.n; g.the += f.the; g.speech += f.speech; g.agent += f.agent; g.poss += f.poss; g.prep += f.prep
    f.per.forEach((n, i) => (g!.per[i] += n)); g.first = Math.min(g.first, f.first)
    forms.delete(f.form)
  }
  const kindOf = new Map<string, NameInfo['kind'] | null>()
  for (const f of forms.values()) {
    const bare = f.parts.join(' '), lastPart = f.parts[f.parts.length - 1], single = f.parts.length === 1
    const titleOnly = single && TITLES.has(bare)
    const given = gender(f.parts[0]) !== '' || f.parts[0] in NICK
    const person = 3 * f.speech + f.agent + 2 * f.poss + (f.title ? 2 * Math.min(3, f.n) : 0) + (given ? 2 : 0)
    const place = f.prep + (PLACES.has(bare) ? 4 : 0) + (PLACE_NOUN.has(lastPart) && !single ? 6 : 0) + (/shire$/.test(bare) ? 4 : 0)
    let kind: NameInfo['kind'] | null
    if (DEMONYMS.has(bare) || DEMONYMS.has(lastPart)) kind = 'thing'
    else if (titleOnly) kind = f.the >= 3 && f.speech >= 2 && low(bare) <= f.mid * 0.4 + 2 ? 'person' : null // "the Queen" who speaks; never "Colonel" alone, nor Moby-Dick's many captains
    else if (!f.title && f.the / f.n > 0.6 && f.speech < 2) kind = 'thing' // "the Pequod": a role that never speaks is a thing
    else if (f.speech < 2 && (place >= 4 || (f.prep >= 2 && f.prep / f.n > 0.3)) && place > person) kind = 'place'
    else if (person >= 3 || (given && person >= 2) || (f.title && f.n >= 2)) kind = 'person'
    else if (!single && f.mid >= 25 && f.the / f.n < 0.3) kind = 'person' // a long name used everywhere ("Moby Dick")
    else kind = f.the / f.n > 0.5 ? 'thing' : null
    // a common word wearing a capital ("Whale", "Mouse") is only a character when it plays one: "the Mouse said"
    if (kind === 'person' && single && !f.title && low(bare) > f.mid * 0.4 + 2 && !(f.the >= 2 && f.speech >= 2)) kind = null
    if (f.n < 2 && !f.speech) kind = null // one stray capital; the count that matters is the whole character's (below)
    if (kind !== 'person' && f.mid < min) kind = null
    kindOf.set(f.form, kind)
  }

  // ---------- one person, many forms ----------
  const parent = new Map<string, string>()
  const root = (x: string): string => { const p = parent.get(x); return !p || p === x ? x : root(p) }
  const join = (a: string, b: string) => { const ra = root(a), rb = root(b); if (ra !== rb) parent.set(rb, ra) }
  const people = [...forms.values()].filter(f => kindOf.get(f.form) === 'person')
  const isPerson = (form: string) => kindOf.get(form) === 'person'
  const byBare = new Map<string, Form[]>()
  for (const f of forms.values()) { const k = f.parts.join(' '); let l = byBare.get(k); if (!l) byBare.set(k, (l = [])); l.push(f) }

  for (const [bare, fs] of byBare) {
    // titles: "Mr. Darcy" and "Darcy" are one, unless the name is shared ("Mr. Bennet", "Mrs. Bennet", "Miss Bennet")
    const titled = fs.filter(f => f.title && isPerson(f.form)), plain = fs.find(f => !f.title)
    if (!titled.length) continue
    const total = titled.reduce((s, f) => s + f.n, 0), top = titled.reduce((a, b) => (b.n > a.n ? b : a))
    const g = gender(bare.split(' ')[0]), tg = TITLES.get(top.title.replace('.', '')) ?? ''
    const fits = !g || !tg || g === tg // "Mrs. Joe" is not Joe
    if (top.n / total >= 0.8 && fits && plain && isPerson(plain.form)) join(plain.form, top.form)
    for (const f of titled) if (f !== top && (TITLES.get(f.title.replace('.', '')) ?? '') === '' && (TITLES.get(top.title.replace('.', '')) ?? '') === '') join(top.form, f.form) // "Captain Ahab" / "Old Ahab"
  }
  for (const f of people) {
    // a full name and its parts: "Rodion Romanovitch Raskolnikov" holds "Rodion Romanovitch" and "Raskolnikov"
    if (f.title || f.parts.length > 1) continue
    const holders = [...forms.values()].filter(h => h.parts.length > 1 && !h.title && h.parts.includes(f.parts[0]))
    if (!holders.length) continue
    const titles = new Set((byBare.get(f.parts[0]) ?? []).filter(h => h.title).map(h => TITLES.get(h.title.replace('.', '')) ?? ''))
    if (titles.has('m') && titles.has('f')) continue // a family name ("Mr. Bingley", "Miss Bingley"): which Bingley is unknowable
    const tot = holders.reduce((s, h) => s + h.n, 0), top = holders.reduce((a, b) => (b.n > a.n ? b : a))
    const fits = (h: Form) => h.parts.every(p => top.parts.includes(p)) || top.parts.every(p => h.parts.includes(p))
    if (top.n / tot >= 0.75 && holders.filter(h => h !== top).every(fits)) {
      join(f.form, top.form)
      for (const h of holders) if (h !== top) join(top.form, h.form)
    }
  }
  for (const f of forms.values()) { // pairs inside a longer name join it ("Rodion Romanovitch" ⊂ "Rodion Romanovitch Raskolnikov")
    if (f.parts.length < 3 || f.title || / of /.test(f.form)) continue // a name and patronymic, not "Witch of the East" / "of the West"
    for (const h of forms.values()) if (h !== f && !h.title && h.parts.length === 2 && f.parts.join(' ').startsWith(h.parts.join(' '))) join(h.form, f.form)
  }
  for (const f of people) { // nicknames: "Lizzy" is Elizabeth, "Sonia" is Sofya (Semyonovna)
    if (f.title || f.parts.length > 1) continue
    const full = NICK[f.parts[0]]
    if (!full) continue
    const target = [...forms.values()].find(h => !h.title && h.parts[0] === full && (isPerson(h.form) || h.parts.length > 1))
    if (!target) continue
    const group = [...forms.values()].filter(h => root(h.form) === root(target.form)), lead = group.reduce((a, b) => (b.n > a.n ? b : a))
    if (!lead.title) join(target.form, f.form) // not "Kitty" into "Lady Catherine"
  }

  // ---------- gather ----------
  const groups = new Map<string, Form[]>()
  for (const f of forms.values()) {
    const k = kindOf.get(f.form)
    const r = root(f.form)
    if (!k && !(parent.has(f.form) || [...parent.values()].includes(f.form))) continue // weak forms only count inside a person
    let l = groups.get(r); if (!l) groups.set(r, (l = [])); l.push(f)
  }
  const out: NameInfo[] = []
  for (const fs of groups.values()) {
    const kinds = fs.map(f => kindOf.get(f.form)).filter(Boolean) as NameInfo['kind'][]
    const kind: NameInfo['kind'] | undefined = kinds.includes('person') ? 'person' : kinds[0]
    if (!kind) continue
    const count = fs.reduce((s, f) => s + f.n, 0)
    if (count < min) continue
    const lead = fs.filter(f => kindOf.get(f.form)).reduce((a, b) => (b.n > a.n ? b : a))
    const per = new Array(texts.length).fill(0)
    for (const f of fs) f.per.forEach((n, i) => (per[i] += n))
    // the page marks every alias, so only clean ones: no stray word glued on ("Overhearing Starbuck", "Mock Turtle Soup")
    const clean = (f: Form) => f.parts.every(p => lead.parts.includes(p) || low(p) === 0 || gender(p) || p in NICK || TITLES.has(p))
    const aliases = fs.filter(f => f !== lead && clean(f)).map(f => f.form)
    out.push({ name: lead.form, kind, count, perSpine: per, first: Math.min(...fs.map(f => f.first)), slot: -1, ...(aliases.length ? { aliases } : {}) })
  }
  out.sort((a, b) => b.count - a.count)
  let s = 0
  for (const n of out) if (n.kind === 'person' && s < slots) n.slot = s++
  return out
}
