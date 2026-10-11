// EPUB Canonical Fragment Identifiers (EPUB CFI 1.1, W3C epub-33/epubcfi): parse, stringify,
// compare/sort, generate from DOM positions/ranges, and resolve back to DOM positions/ranges,
// honoring id assertions and text location assertions (with correction when the DOM drifted).
import { EpubError } from './errors.ts'

// ---------------------------------------------------------------- model

export interface CfiStep {
  index: number
  /** Id assertion. */
  id?: string
  params?: Record<string, string>
}

export interface CfiOffset {
  /** Character offset (UTF-16 code units). */
  char?: number
  /** Temporal offset (seconds). */
  temporal?: number
  /** Spatial offset [x, y], 0-100. */
  spatial?: [number, number]
  /** Text location assertion. */
  before?: string
  after?: string
  /** Side bias: a(fter) / b(efore). */
  side?: 'a' | 'b'
  params?: Record<string, string>
}

/** Steps grouped by indirection ("!"): segments[0] = package document, segments[1] = content document. */
export interface CfiPath { segments: CfiStep[][]; offset?: CfiOffset }

/** A location (parent only) or a range (parent + start + end local paths). */
export interface Cfi { parent: CfiPath; start?: CfiPath; end?: CfiPath }

const bad = (msg: string, s: string) => new EpubError('BAD_CFI', `${msg}: ${s}`)

// ---------------------------------------------------------------- parse

const SPECIAL = /[\^[\](),;=]/g
export const escapeCfi = (s: string) => s.replace(SPECIAL, '^$&')
export const unescapeCfi = (s: string) => s.replace(/\^(.)/g, '$1')

/** Split on an unescaped separator. Parts stay escaped. */
function splitEsc(s: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '^') { cur += s[i] + (s[i + 1] ?? ''); i++ }
    else if (s[i] === sep) { out.push(cur); cur = '' }
    else cur += s[i]
  }
  out.push(cur)
  return out
}

interface Assertion { values: string[]; params: Record<string, string> }

function parseAssertion(raw: string): Assertion {
  const [head, ...rest] = splitEsc(raw, ';')
  const params: Record<string, string> = {}
  for (const p of rest) {
    const [k, ...v] = splitEsc(p, '=')
    if (k) params[unescapeCfi(k).trim()] = unescapeCfi(v.join('='))
  }
  return { values: head ? splitEsc(head, ',').map(unescapeCfi) : [], params }
}

class Reader {
  s: string
  i = 0
  constructor(s: string) { this.s = s }
  peek() { return this.s[this.i] }
  eof() { return this.i >= this.s.length }
  int(): number {
    const m = /^\d+/.exec(this.s.slice(this.i))
    if (!m) throw bad('Expected integer', this.s)
    this.i += m[0].length
    return Number(m[0])
  }
  num(): number {
    const m = /^\d+(?:\.\d+)?|^\.\d+/.exec(this.s.slice(this.i))
    if (!m) throw bad('Expected number', this.s)
    this.i += m[0].length
    return Number(m[0])
  }
  /** Raw (still escaped) content of a [...] assertion, or undefined. */
  bracket(): string | undefined {
    if (this.peek() !== '[') return undefined
    let out = ''
    for (this.i++; !this.eof(); this.i++) {
      const c = this.s[this.i]
      if (c === '^') { out += c + (this.s[this.i + 1] ?? ''); this.i++ }
      else if (c === ']') { this.i++; return out }
      else out += c
    }
    throw bad('Unterminated assertion', this.s)
  }
  path(): CfiPath {
    const segments: CfiStep[][] = [[]]
    for (;;) {
      const c = this.peek()
      if (c === '/') {
        this.i++
        const step: CfiStep = { index: this.int() }
        const raw = this.bracket()
        if (raw !== undefined) {
          const a = parseAssertion(raw)
          if (a.values[0]) step.id = a.values[0]
          if (Object.keys(a.params).length) step.params = a.params
        }
        segments[segments.length - 1].push(step)
      } else if (c === '!') {
        this.i++
        segments.push([])
      } else if (c === ':' || c === '~' || c === '@') {
        return { segments, offset: this.offset() }
      } else return { segments }
    }
  }
  offset(): CfiOffset {
    const o: CfiOffset = {}
    const c = this.s[this.i++]
    if (c === ':') o.char = this.int()
    else {
      if (c === '~') {
        o.temporal = this.num()
        if (this.peek() === '@') this.i++
      }
      if (c === '@' || this.s[this.i - 1] === '@') {
        const x = this.num()
        if (this.s[this.i++] !== ':') throw bad('Expected ":" in spatial offset', this.s)
        o.spatial = [x, this.num()]
      }
    }
    const raw = this.bracket()
    if (raw !== undefined) {
      const a = parseAssertion(raw)
      if (a.values[0]) o.before = a.values[0]
      if (a.values[1]) o.after = a.values[1]
      if (a.params.s === 'a' || a.params.s === 'b') o.side = a.params.s
      const { s: _s, ...rest } = a.params
      if (Object.keys(rest).length) o.params = rest
    }
    return o
  }
}

/** Parse "epubcfi(...)" (also accepts a leading "#" and the bare inner form). */
export function parseCfi(input: string): Cfi {
  let s = input.trim().replace(/^#/, '')
  const m = /^epubcfi\(([\s\S]*)\)$/.exec(s)
  if (m) s = m[1]
  else if (/^epubcfi\(/.test(s)) throw bad('Unterminated epubcfi(', input)
  const r = new Reader(s)
  const parent = r.path()
  const cfi: Cfi = { parent }
  if (r.peek() === ',') {
    r.i++
    cfi.start = r.path()
    if (r.peek() !== ',') throw bad('Range needs start and end', input)
    r.i++
    cfi.end = r.path()
  }
  if (!r.eof()) throw bad(`Unexpected "${r.peek()}" at ${r.i}`, input)
  if (!parent.segments[0].length && !cfi.start) throw bad('Empty path', input)
  return cfi
}

// ---------------------------------------------------------------- stringify

const numStr = (n: number) => String(n)

function stepStr(s: CfiStep) {
  const params = Object.entries(s.params ?? {}).map(([k, v]) => `;${escapeCfi(k)}=${escapeCfi(v)}`).join('')
  return `/${s.index}` + (s.id || params ? `[${escapeCfi(s.id ?? '')}${params}]` : '')
}

function offsetStr(o: CfiOffset | undefined) {
  if (!o) return ''
  let s = ''
  if (o.char !== undefined) s += ':' + o.char
  if (o.temporal !== undefined) s += '~' + numStr(o.temporal)
  if (o.spatial) s += '@' + numStr(o.spatial[0]) + ':' + numStr(o.spatial[1])
  const text = o.before || o.after ? escapeCfi(o.before ?? '') + (o.after ? ',' + escapeCfi(o.after) : '') : ''
  const params = { ...o.params, ...(o.side ? { s: o.side } : {}) }
  const p = Object.entries(params).map(([k, v]) => `;${escapeCfi(k)}=${escapeCfi(v)}`).join('')
  return s + (text || p ? `[${text}${p}]` : '')
}

export function stringifyPath(p: CfiPath): string {
  return p.segments.map(seg => seg.map(stepStr).join('')).join('!') + offsetStr(p.offset)
}

export function stringifyCfi(cfi: Cfi): string {
  const range = cfi.start && cfi.end ? ',' + stringifyPath(cfi.start) + ',' + stringifyPath(cfi.end) : ''
  return `epubcfi(${stringifyPath(cfi.parent)}${range})`
}

// ---------------------------------------------------------------- compare

/** The absolute path of a location, or of a range's start (or end). */
export function collapse(cfi: Cfi | string, toEnd = false): CfiPath {
  const c = typeof cfi === 'string' ? parseCfi(cfi) : cfi
  const local = toEnd ? c.end : c.start
  if (!local) return c.parent
  const segments = c.parent.segments.map(s => [...s])
  segments[segments.length - 1].push(...local.segments[0])
  segments.push(...local.segments.slice(1).map(s => [...s]))
  return { segments, offset: local.offset ?? c.parent.offset }
}

export const isRange = (cfi: Cfi) => !!(cfi.start && cfi.end)

// Ranks within a step, least to most important (spec §sorting): character offset, child, temporal-spatial, indirection.
function sortKey(p: CfiPath): number[][] {
  const out: number[][] = []
  p.segments.forEach((seg, i) => {
    if (i > 0) out.push([3])
    for (const s of seg) out.push([1, s.index])
  })
  const o = p.offset
  if (o?.char !== undefined) out.push([0, o.char])
  if (o && (o.temporal !== undefined || o.spatial)) out.push([2, o.temporal ?? -1, o.spatial?.[1] ?? -1, o.spatial?.[0] ?? -1])
  return out
}

function comparePaths(a: CfiPath, b: CfiPath): number {
  const ka = sortKey(a)
  const kb = sortKey(b)
  for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
    const x = ka[i]
    const y = kb[i]
    for (let j = 0; j < Math.max(x.length, y.length); j++) {
      const d = (x[j] ?? -1) - (y[j] ?? -1)
      if (d) return Math.sign(d)
    }
  }
  return Math.sign(ka.length - kb.length)
}

/** Document order: -1, 0, 1. Ranges compare by start, then end. */
export function compareCfi(a: Cfi | string, b: Cfi | string): number {
  const pa = typeof a === 'string' ? parseCfi(a) : a
  const pb = typeof b === 'string' ? parseCfi(b) : b
  return comparePaths(collapse(pa), collapse(pb)) || comparePaths(collapse(pa, true), collapse(pb, true))
}

// ---------------------------------------------------------------- DOM: generate

export interface Boundaries { startContainer: Node; startOffset: number; endContainer: Node; endOffset: number }

const isChar = (n: Node) => n.nodeType === 3 || n.nodeType === 4
const isElem = (n: Node): n is Element => n.nodeType === 1

function elementId(el: Element): string | undefined {
  return el.getAttribute('id') || el.getAttribute('xml:id') || undefined
}

// Elements a reading system injects (e.g. pubre's italic-highlight spans, marked data-pubre) are
// transparent to CFIs: their children count as children of the nearest real ancestor, and their text
// joins the surrounding character chunk. CFIs therefore never change when such spans come and go.
const ignored = (n: Node | null): boolean => !!n && n.nodeType === 1 && !!(n as Element).hasAttribute?.('data-pubre')
function vkids(el: Node): Node[] {
  const out: Node[] = []
  for (let c = el.firstChild; c; c = c.nextSibling) ignored(c) ? out.push(...vkids(c)) : out.push(c)
  return out
}
function realParent(n: Node): Node | null {
  let p = n.parentNode
  while (p && ignored(p)) p = p.parentNode
  return p
}

/** Steps from the document element down to `el` (the document element itself = no steps). */
function stepsTo(el: Element): CfiStep[] {
  const steps: CfiStep[] = []
  for (let e: Element | null = el; e; ) {
    const parent = realParent(e)
    if (!parent || parent.nodeType !== 1) break
    let n = 0
    for (const s of vkids(parent)) { if (isElem(s)) n++; if (s === e) break }
    const id = elementId(e)
    steps.unshift(id ? { index: n * 2, id } : { index: n * 2 })
    e = parent as Element
  }
  return steps
}

/** A DOM boundary point → steps + character offset (always in an odd chunk). */
function pointSteps(node: Node, offset: number): { steps: CfiStep[]; char: number } {
  let parent: Node
  let index: number // child position in the (virtual) child list
  let char = 0
  if (ignored(node)) { // a position inside an injected span: move to its first leaf
    const kids = vkids(node)
    const target = kids[Math.min(offset, kids.length - 1)]
    if (target) return pointSteps(target, 0)
    node = node.parentNode!; offset = 0
  }
  if (isChar(node)) {
    parent = realParent(node)!
    char = offset
    index = parent ? vkids(parent).indexOf(node) : 0
  } else if (isElem(node)) {
    parent = node
    const real = Array.from(node.childNodes).slice(0, offset)
    index = real.reduce((n, c) => n + (ignored(c) ? vkids(c).length : 1), 0)
  } else {
    // comment / PI: treat as a position before the node
    parent = realParent(node)!
    index = parent ? vkids(parent).indexOf(node) : 0
  }
  if (!parent || !isElem(parent)) throw new EpubError('BAD_CFI', 'Position is outside the document element')
  const children = vkids(parent)
  let elems = 0
  for (let i = 0; i < index; i++) if (isElem(children[i])) elems++
  // Characters of the chunk before the position.
  for (let i = index - 1; i >= 0 && !isElem(children[i]); i--) if (isChar(children[i])) char += (children[i] as CharacterData).length
  return { steps: [...stepsTo(parent), { index: elems * 2 + 1 }], char }
}

export interface GenerateOptions {
  /** Steps of the package part, e.g. spineSteps(6, 2, 'chap01ref'). Omit for a document-local CFI. */
  base?: CfiStep[]
  /** Add a text location assertion with up to this many characters on each side. */
  assertText?: number
  side?: 'a' | 'b'
}

/** Package-document steps for spine item `index` (0-based); `spineStep` is usually 6. */
export function spineSteps(spineStep: number, index: number, itemrefId?: string): CfiStep[] {
  return [{ index: spineStep }, itemrefId ? { index: (index + 1) * 2, id: itemrefId } : { index: (index + 1) * 2 }]
}

const withBase = (steps: CfiStep[], base?: CfiStep[]): CfiStep[][] => (base ? [base, steps] : [steps])

/** CFI for a single DOM position. */
export function cfiFromPoint(node: Node, offset: number, opts: GenerateOptions = {}): string {
  const { steps, char } = pointSteps(node, offset)
  const o: CfiOffset = { char }
  if (opts.assertText) Object.assign(o, textAround(node, offset, opts.assertText))
  if (opts.side) o.side = opts.side
  return stringifyCfi({ parent: { segments: withBase(steps, opts.base), offset: o } })
}

/** CFI pointing at an element itself (no offset). */
export function cfiFromElement(el: Element, opts: GenerateOptions = {}): string {
  return stringifyCfi({ parent: { segments: withBase(stepsTo(el), opts.base) } })
}

/** CFI for a DOM Range (or anything with start/end containers); collapsed ranges give a location. */
export function cfiFromRange(range: Boundaries, opts: GenerateOptions = {}): string {
  const { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = range
  if (sc === ec && so === eo) return cfiFromPoint(sc, so, opts)
  const a = pointSteps(sc, so)
  const b = pointSteps(ec, eo)
  let n = 0
  while (n < a.steps.length && n < b.steps.length && a.steps[n].index === b.steps[n].index) n++
  return stringifyCfi({
    parent: { segments: withBase(a.steps.slice(0, n), opts.base) },
    start: { segments: [a.steps.slice(n)], offset: { char: a.char } },
    end: { segments: [b.steps.slice(n)], offset: { char: b.char } },
  })
}

// ---------------------------------------------------------------- DOM: resolve

export interface Point { node: Node; offset: number; /** Set when the path ends at an element. */ element?: Element }

function findById(doc: Document, id: string): Element | undefined {
  const el = doc.getElementById?.(id)
  if (el) return el
  return Array.from(doc.getElementsByTagName('*')).find(e => elementId(e) === id)
}

const indexIn = (n: Node) => { let i = 0; for (let s = n.previousSibling; s; s = s.previousSibling) i++; return i }

/** The steps that apply inside the content document: after the first indirection, if any. */
export const contentSteps = (p: CfiPath) => (p.segments.length > 1 ? p.segments[1] : p.segments[0])

/** Resolve document-local steps + offset to a DOM point. Throws BAD_CFI when unresolvable. */
export function resolvePoint(doc: Document, steps: CfiStep[], offset?: CfiOffset): Point {
  let el: Element = doc.documentElement
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const elems = vkids(el).filter(isElem)
    if (step.index % 2 === 0) {
      let target: Element | undefined = elems[step.index / 2 - 1]
      if (step.id && (!target || elementId(target) !== step.id)) target = findById(doc, step.id) ?? target // id assertion wins
      if (!target) {
        if (step.index === 0) return { node: el, offset: 0 }
        if (step.index === elems.length * 2 + 2) return { node: el, offset: el.childNodes.length }
        throw new EpubError('BAD_CFI', `No element at step /${step.index}`)
      }
      el = target
    } else {
      if (step.index > elems.length * 2 + 1) throw new EpubError('BAD_CFI', `No character chunk at step /${step.index}`)
      return chunkPoint(el, step.index, offset?.char ?? 0)
    }
  }
  // Path ends at an element: the point just before it (an img+offset would address its alt text).
  if (el === doc.documentElement) return { node: el, offset: 0, element: el }
  return { node: el.parentNode!, offset: indexIn(el), element: el }
}

function chunkPoint(parent: Element, odd: number, char: number): Point {
  const k = (odd - 1) / 2 // elements before the chunk
  const kids = vkids(parent)
  let i = 0
  for (let seen = 0; i < kids.length && seen < k; i++) if (isElem(kids[i])) seen++
  let last: Node | undefined
  let rest = char
  for (let j = i; j < kids.length && !isElem(kids[j]); j++) {
    const n = kids[j]
    if (!isChar(n)) continue
    const len = (n as CharacterData).length
    if (rest <= len) return { node: n, offset: rest }
    rest -= len
    last = n
  }
  if (last) return { node: last, offset: (last as CharacterData).length } // offset past the end: clamp
  return { node: parent, offset: i }
}

// ---- text location assertions

interface TextMap {
  text: string
  map: [Node, number][]
  /** Character node → [first, end) indexes into `map`/`text`. */
  ranges: Map<Node, [number, number]>
}

/** Whitespace-collapsed text of the whole document with a map back to (node, offset). */
function textMap(doc: Document): TextMap {
  let text = ''
  const map: [Node, number][] = []
  const ranges = new Map<Node, [number, number]>()
  const walk = (n: Node) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (isChar(c)) {
        const from = map.length
        const v = c.nodeValue ?? ''
        for (let i = 0; i < v.length; i++) {
          const ws = /\s/.test(v[i])
          if (ws && text.endsWith(' ')) continue
          text += ws ? ' ' : v[i]
          map.push([c, i])
        }
        ranges.set(c, [from, map.length])
      } else if (isElem(c)) walk(c)
    }
  }
  walk(doc.documentElement)
  return { text, map, ranges }
}

/** First character node at or after a boundary point, in document order. */
function nextCharNode(container: Node, offset: number): Node | undefined {
  let n: Node | null = isChar(container) ? container : container.childNodes[offset] ?? null
  if (!n) {
    let up: Node | null = container
    while (up && !up.nextSibling) up = up.parentNode
    n = up?.nextSibling ?? null
  }
  while (n) {
    if (isChar(n)) return n
    if (n.firstChild) n = n.firstChild
    else {
      while (n && !n.nextSibling) n = n.parentNode
      n = n?.nextSibling ?? null
    }
  }
  return undefined
}

/** Index into the collapsed text of a DOM boundary point. */
function mapIndex(m: TextMap, node: Node, offset: number): number {
  if (isChar(node)) {
    const [from, to] = m.ranges.get(node) ?? [m.map.length, m.map.length]
    for (let i = from; i < to; i++) if (m.map[i][1] >= offset) return i
    return to
  }
  const next = nextCharNode(node, offset)
  return next ? (m.ranges.get(next)?.[0] ?? m.map.length) : m.map.length
}

const collapseWs = (s: string) => s.replace(/\s+/g, ' ')

function textAround(node: Node, offset: number, n: number): Pick<CfiOffset, 'before' | 'after'> {
  const doc = node.ownerDocument ?? (node as Document)
  const m = textMap(doc)
  const i = mapIndex(m, node, offset)
  const out: Pick<CfiOffset, 'before' | 'after'> = {}
  const before = m.text.slice(Math.max(0, i - n), i)
  const after = m.text.slice(i, i + n)
  if (before) out.before = before
  if (after) out.after = after
  return out
}

/** If the text assertion does not hold at `p`, relocate to the nearest place where it does. */
function correctByText(doc: Document, p: Point, o: CfiOffset): Point {
  if (!o.before && !o.after) return p
  const m = textMap(doc)
  const before = collapseWs(o.before ?? '')
  const after = collapseWs(o.after ?? '')
  const i = mapIndex(m, p.node, p.offset)
  if (m.text.slice(i - before.length, i) === before && m.text.slice(i, i + after.length) === after) return p
  const needle = before + after
  let best = -1
  for (let j = m.text.indexOf(needle); j >= 0; j = m.text.indexOf(needle, j + 1)) {
    const pos = j + before.length
    if (best < 0 || Math.abs(pos - i) < Math.abs(best - i)) best = pos
  }
  if (best < 0) return p
  if (best < m.map.length) return { node: m.map[best][0], offset: m.map[best][1] }
  const [n, off] = m.map[best - 1]
  return { node: n, offset: off + 1 }
}

/** Resolve a CFI (location or range) against a content document. */
export function resolveCfi(doc: Document, cfi: Cfi | string): Boundaries {
  const c = typeof cfi === 'string' ? parseCfi(cfi) : cfi
  const sp = collapse(c)
  let start = resolvePoint(doc, contentSteps(sp), sp.offset)
  if (sp.offset) start = correctByText(doc, start, sp.offset)
  if (!isRange(c)) {
    if (start.element && sp.offset?.char === undefined) {
      return { startContainer: start.node, startOffset: start.offset, endContainer: start.node, endOffset: start.offset + 1 }
    }
    return { startContainer: start.node, startOffset: start.offset, endContainer: start.node, endOffset: start.offset }
  }
  const ep = collapse(c, true)
  let end = resolvePoint(doc, contentSteps(ep), ep.offset)
  if (ep.offset) end = correctByText(doc, end, ep.offset)
  return { startContainer: start.node, startOffset: start.offset, endContainer: end.node, endOffset: end.offset }
}

/** Resolve to a live DOM Range (needs document.createRange, i.e. a browser). */
export function cfiToRange(doc: Document, cfi: Cfi | string): Range {
  if (typeof doc.createRange !== 'function') throw new EpubError('NO_DOM', 'document.createRange is not available')
  const b = resolveCfi(doc, cfi)
  const r = doc.createRange()
  r.setStart(b.startContainer, b.startOffset)
  r.setEnd(b.endContainer, b.endOffset)
  return r
}

/** 0-based spine index addressed by a full CFI (second step of the package segment). */
export function cfiSpineIndex(cfi: Cfi | string): number | undefined {
  const p = collapse(typeof cfi === 'string' ? parseCfi(cfi) : cfi)
  const step = p.segments.length > 1 ? p.segments[0][1] : undefined
  return step && step.index % 2 === 0 && step.index > 0 ? step.index / 2 - 1 : undefined
}
