// The weather of the passage, drawn in type (E1): a field of small monospace glyphs in the page's margins,
// never over the text column. Rain falls as | and ' and splashes into o and ( ); snow drifts as * and ·,
// fog rolls in rows of ~ and -, night twinkles, sun motes rise, the sea swells in ~ and ≈.
// Motion is glyphs changing in place and drifting slowly (the motion research: ambient, peripheral, steady,
// nothing that flashes); under Calm or reduced motion it draws one still frame.
import type { Scene } from '../insights/scene.ts'

export interface Box { left: number; right: number; top: number; bottom: number } // the text, kept clear (CSS px)
export interface Inks { rain: string; snow: string; fog: string; night: string; sun: string; sea: string; wind: string }
interface P { x: number; y: number; v: number; g: string; a: number; t: number; k: number } // a glyph in flight
interface Splash { x: number; y: number; t: number }

const CELL = 12 // px per glyph cell
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

export class AsciiWeather {
  private ctx: CanvasRenderingContext2D
  private scene: Scene = ''
  private inks!: Inks
  private box: Box = { left: 0, right: 0, top: 0, bottom: 0 }
  private ps: P[] = []
  private splashes: Splash[] = []
  private raf = 0
  private last = 0
  private still = false
  private W = 0
  private H = 0
  private strength = 0.5 // overall opacity of the glyphs

  private canvas: HTMLCanvasElement
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.go()))
  }

  /** What to draw, in which colours, around which text box. */
  set(scene: Scene, inks: Inks, box: Box, still: boolean, dark: boolean) {
    const changed = scene !== this.scene
    this.inks = inks; this.box = box; this.still = still; this.strength = dark ? 0.95 : 0.85
    this.resize()
    if (changed) { this.scene = scene; this.ps = []; this.splashes = []; this.seed() }
    this.go()
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1)
    if (Math.round(r.width) === this.W && Math.round(r.height) === this.H) return
    this.W = Math.round(r.width); this.H = Math.round(r.height)
    this.canvas.width = this.W * dpr; this.canvas.height = this.H * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** Mostly in the side margins; the rest anywhere across (hidden over the text, seen again below it). */
  private marginX(): number {
    const { left, right } = this.box, L = Math.max(0, left - 8), R = Math.max(0, this.W - right - 8)
    if (L + R > CELL && Math.random() < 0.6) { const at = Math.random() * (L + R); return at < L ? at : right + 8 + (at - L) }
    return rnd(4, this.W - 4)
  }
  /** Where a falling glyph starts: in a side margin from the top, else just under the text so it's seen falling. */
  private startY(x: number) { return x > this.box.left && x < this.box.right ? this.box.bottom + rnd(-4, 20) : -CELL * rnd(1, 10) }
  /** How far a point is from the text box (0 inside it); the running header and footer keep a clear patch too. */
  private clearance(x: number, y: number): number {
    const { left, right, top, bottom } = this.box
    const dx = Math.max(left - x, 0, x - right), dy = Math.max(top - y, 0, y - bottom)
    const d = Math.max(dx, dy)
    if (d <= 0) return 0
    if (dx === 0 && Math.abs(x - (left + right) / 2) < 150 && (y < top - 4 && y > top - 44 || y > bottom + 4 && y < bottom + 44)) return 0 // the running head and the page number
    return d
  }

  private seed() {
    const n = { rain: 90, storm: 150, snow: 70, fog: 0, night: 46, sun: 30, sea: 0, wind: 14, '': 0 }[this.scene]
    for (let i = 0; i < n; i++) this.spawn(true)
  }
  private spawn(anywhere = false) {
    const x = this.marginX()
    if (x < 0) return
    const y = anywhere ? rnd(0, this.H) : this.startY(x)
    switch (this.scene) {
      case 'rain': this.ps.push({ x, y, v: rnd(150, 230), g: pick(['|', '|', '¦', "'"]), a: rnd(0.5, 1), t: 0, k: 0 }); break
      case 'storm': this.ps.push({ x, y, v: rnd(260, 380), g: pick(['/', '/', '|', "'"]), a: rnd(0.6, 1), t: 0, k: 0 }); break
      case 'snow': this.ps.push({ x, y, v: rnd(14, 30), g: pick(['*', '·', '+', '.']), a: rnd(0.45, 1), t: rnd(0, 6), k: rnd(0.6, 1.4) }); break
      case 'night': this.ps.push({ x, y: rnd(0, this.H), v: 0, g: pick(['.', '·', '+', '*']), a: rnd(0.3, 1), t: rnd(0, 4), k: rnd(1.5, 4.5) }); break
      case 'sun': this.ps.push({ x, y: anywhere ? rnd(0, this.H) : this.H + CELL, v: -rnd(6, 14), g: pick(['°', '*', '·', '°']), a: rnd(0.3, 0.9), t: rnd(0, 6), k: rnd(0.5, 1.2) }); break
      case 'wind': this.ps.push({ x: anywhere ? rnd(0, this.W) : -40, y: rnd(0, this.H), v: rnd(70, 130), g: pick(['—', '-', '–']), a: rnd(0.3, 0.8), t: 0, k: rnd(2, 5) }); break
    }
  }

  private go() {
    if (this.raf || !this.scene || document.hidden) { if (!this.scene) this.clear(); return }
    if (this.still) { this.frame(0); return }
    this.last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000)
      if (dt >= 1 / 24) { this.last = now; this.frame(dt) } // about 24 frames a second is plenty for weather
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0 }
  clear() { this.ctx.clearRect(0, 0, this.W, this.H) }
  destroy() { this.stop(); this.clear() }

  private glyph(g: string, x: number, y: number, color: string, a: number) {
    const d = this.clearance(x, y)
    if (d <= 2) return
    const edge = Math.min(1, d / 6) // fades as it nears the text: the field never meets the letters with a hard edge
    this.ctx.globalAlpha = Math.max(0, a * this.strength * edge)
    this.ctx.fillStyle = color
    this.ctx.fillText(g, x, y)
  }

  private frame(dt: number) {
    const c = this.ctx, H = this.H, now = performance.now() / 1000
    c.clearRect(0, 0, this.W, H)
    c.font = `${CELL - 1}px ui-monospace, "IBM Plex Mono", monospace`; c.textBaseline = 'middle'; c.textAlign = 'center'
    const ink = this.inks
    switch (this.scene) {
      case 'rain': case 'storm': {
        const col = ink.rain, slant = this.scene === 'storm' ? 0.32 : 0
        for (const p of this.ps) {
          p.y += p.v * dt; p.x += p.v * dt * slant
          this.glyph(p.g, p.x, p.y, col, p.a)
          this.glyph("'", p.x - slant * CELL, p.y - CELL, col, p.a * 0.45) // a short trail
          this.glyph('.', p.x - slant * 2 * CELL, p.y - 2 * CELL, col, p.a * 0.2)
          if (p.y > H - rnd(6, Math.max(8, H - this.box.bottom - 10)) || p.y > H) { this.splashes.push({ x: p.x, y: Math.min(p.y, H - 6), t: 0 }); p.x = this.marginX(); p.y = this.startY(p.x) }
        }
        // a drop lands: . then o then ( ) widening, then gone
        this.splashes = this.splashes.filter(s => (s.t += dt) < 0.5)
        for (const s of this.splashes) {
          const f = s.t / 0.5, a = 1 - f
          if (f < 0.25) this.glyph('.', s.x, s.y, col, a)
          else if (f < 0.5) this.glyph('o', s.x, s.y, col, a)
          else { const w = CELL * (0.6 + f); this.glyph('(', s.x - w, s.y, col, a * 0.8); this.glyph(')', s.x + w, s.y, col, a * 0.8) }
        }
        break
      }
      case 'snow':
        for (const p of this.ps) {
          p.t += dt; p.y += p.v * dt; p.x += Math.sin(p.t * p.k) * 6 * dt
          if (p.y > H + CELL) { p.x = this.marginX(); p.y = this.startY(p.x) }
          this.glyph(p.g, p.x, p.y, ink.snow, p.a)
        }
        break
      case 'night':
        for (const p of this.ps) {
          p.t += dt
          if (p.t > p.k) { p.t = 0; p.g = pick(['.', '·', '+', '*', '·']) } // twinkle: the glyph changes in place
          this.glyph(p.g, p.x, p.y, ink.night, p.a * (0.6 + 0.4 * Math.sin(now * 1.3 + p.x)))
        }
        break
      case 'sun':
        for (const p of this.ps) {
          p.t += dt; p.y += p.v * dt; p.x += Math.sin(p.t * p.k) * 4 * dt
          if (p.y < -CELL) { p.y = H + CELL; p.x = this.marginX() }
          this.glyph(p.g, p.x, p.y, ink.sun, p.a * (0.7 + 0.3 * Math.sin(now + p.t)))
        }
        break
      case 'wind':
        for (const p of this.ps) {
          p.x += p.v * dt
          if (p.x > this.W + 40) { p.x = -40; p.y = rnd(0, H) }
          for (let i = 0; i < p.k; i++) this.glyph(p.g, p.x - i * CELL * 0.9, p.y, ink.wind, p.a * (1 - i / p.k))
        }
        break
      case 'fog': case 'sea': {
        // rows of type: fog drifts, the sea swells (both slow, 6–10 s cycles)
        const sea = this.scene === 'sea', col = sea ? ink.sea : ink.fog, glyphs = sea ? ['~', '≈', '~', '-'] : ['~', '-', '.', '·']
        const from = sea ? H * 0.55 : 0
        for (let y = from + CELL / 2; y < H; y += CELL * 1.4) {
          for (let x = CELL / 2; x < this.W; x += CELL) {
            if (this.clearance(x, y) <= 2) continue
            const w = Math.sin(x * 0.045 + now * (sea ? 0.7 : 0.25) + y * 0.08), d = sea ? (y - from) / (H - from) : 0.5 + 0.5 * Math.sin(y * 0.02 + now * 0.15)
            if (w < (sea ? -0.2 : 0.1)) continue
            this.glyph(glyphs[Math.floor((w + 1) * 2) % glyphs.length], x + Math.sin(now * 0.3 + y) * 3, y, col, (sea ? 0.5 + 0.5 * d : 0.55 * d) * w)
          }
        }
        break
      }
    }
    // keep the population steady
    const want = { rain: 90, storm: 150, snow: 70, night: 46, sun: 30, wind: 14 }[this.scene as 'rain'] ?? 0
    while (this.ps.length < want) { const n = this.ps.length; this.spawn(); if (this.ps.length === n) break }
    c.globalAlpha = 1
  }
}
