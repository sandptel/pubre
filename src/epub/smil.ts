// Media Overlays (EPUB 3 Media Overlays 3.3): SMIL documents → a flat, timed list of text/audio
// pairs, grouped per content document.
import { kids, local, attr, first } from './xml.ts'
import { resolvePath, resolveHref, splitHref } from './resources.ts'
import { epubTypes } from './semantics.ts'

/**
 * SMIL 3.0 clock value → seconds. Full clock ("1:02:03.5"), partial clock ("02:03.5"), and
 * timecount ("3.5s", "120ms", "1.5h", "2min", bare "12.3" = seconds). Tolerates a leading "npt=".
 */
export function parseClock(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const v = value.trim().replace(/^npt=/, '')
  let m = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(v)
  if (m) return round(Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]))
  m = /^(\d+(?:\.\d*)?|\.\d+)\s*(h|min|s|ms)?$/.exec(v)
  if (m) return round(Number(m[1]) * { h: 3600, min: 60, s: 1, ms: 0.001 }[(m[2] ?? 's') as 'h' | 'min' | 's' | 'ms'])
  return undefined
}

const round = (s: number) => Math.round(s * 1e6) / 1e6

export interface OverlayAudio { src: string; clipBegin: number; clipEnd?: number }

export interface OverlayPar {
  id?: string
  /** "zip/path#fragment" of the text element. */
  text: string
  path: string
  fragment: string
  audio?: OverlayAudio
  /** epub:type of the par and its enclosing seqs, innermost first. */
  types: string[]
}

export interface TimelineEntry extends OverlayPar {
  /** Position within this content document's narration (seconds); undefined after a clip of unknown length. */
  start?: number
  end?: number
}

export interface MediaOverlay {
  path: string
  pars: OverlayPar[]
  /** Flat timeline per content document (zip path). */
  timelines: Map<string, TimelineEntry[]>
  /** Sum of clip durations, if all are known. */
  duration?: number
}

export function parseSmil(doc: Document, smilPath: string): MediaOverlay {
  const pars: OverlayPar[] = []
  const body = first(doc, 'body')
  const walk = (el: Element, types: string[]) => {
    for (const c of kids(el)) {
      const name = local(c)
      if (name === 'seq') walk(c, [...epubTypes(c), ...types])
      else if (name === 'par' || name === 'text') pars.push(par(c, smilPath, [...epubTypes(c), ...types]))
    }
  }
  if (body) walk(body, epubTypes(body))

  const timelines = new Map<string, TimelineEntry[]>()
  let total: number | undefined = 0
  for (const p of pars) {
    let list = timelines.get(p.path)
    if (!list) timelines.set(p.path, list = [])
    const prev = list[list.length - 1]
    const start = prev ? prev.end : 0
    const len = p.audio?.clipEnd !== undefined ? p.audio.clipEnd - p.audio.clipBegin : p.audio ? undefined : 0
    list.push({ ...p, start, end: start === undefined || len === undefined ? undefined : round(start + len) })
    total = total === undefined || len === undefined ? undefined : round(total + len)
  }
  return { path: smilPath, pars, timelines, duration: total }
}

function par(el: Element, base: string, types: string[]): OverlayPar {
  const t = local(el) === 'text' ? el : kids(el, 'text')[0]
  const a = local(el) === 'par' ? kids(el, 'audio')[0] : undefined
  const src = (t && attr(t, 'src')) ?? ''
  const text = src ? resolveHref(base, src) : ''
  const out: OverlayPar = { id: attr(el, 'id'), text, path: src ? resolvePath(base, src) : '', fragment: splitHref(src).fragment, types }
  if (a && attr(a, 'src')) {
    out.audio = {
      src: resolvePath(base, attr(a, 'src')!),
      clipBegin: parseClock(attr(a, 'clipBegin') ?? attr(a, 'clipbegin')) ?? 0,
      clipEnd: parseClock(attr(a, 'clipEnd') ?? attr(a, 'clipend')),
    }
  }
  return out
}
