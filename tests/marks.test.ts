import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contrast, level, ORDER, marksCss, whoHue } from '../src/lib/marks.ts'
import { resolveTheme, modes, palettes, effective, defaults } from '../src/lib/settings.ts'

test('dimmed text never drops below its contrast floor, in every palette × mode', () => {
  for (const p of Object.keys(palettes)) for (const m of Object.keys(modes)) {
    const t = resolveTheme(p, m)
    assert.ok(contrast(level(t, 0.6, 3), t.base[0]) >= Math.min(3, contrast(t.base[5], t.base[0])) - 1e-9, `${p}/${m} page`)
    assert.ok(contrast(level(t, 0.8, 4), t.base[0]) >= Math.min(4, contrast(t.base[5], t.base[0])) - 1e-9, `${p}/${m} para`)
  }
})

test('every registered highlight has a style and names are unique', () => {
  assert.equal(new Set(ORDER).size, ORDER.length)
  const css = marksCss(resolveTheme('gruvbox', 'focus'))
  for (const n of ORDER) if (!['c-focus'].includes(n)) assert.ok(css.includes(`::highlight(${n})`), n)
})

test('book overrides layer over global settings', () => {
  const e = effective(defaults, { voices: 'marks', intensity: 'quiet' })
  assert.equal(e.voices, 'marks'); assert.equal(e.intensity, 'quiet'); assert.equal(e.pointer, defaults.pointer)
})

test('character hues read (≥ 4.5:1) but never outshine body text, in every palette × mode', () => {
  for (const p of Object.keys(palettes)) for (const m of Object.keys(modes)) {
    const t = resolveTheme(p, m), body = contrast(t.base[5], t.base[0])
    for (let k = 0; k < 8; k++) {
      const c = contrast(whoHue(t, k), t.base[0])
      assert.ok(c >= Math.min(4.5, body) - 0.05 && c <= body + 0.05, `${p}/${m} slot ${k}: ${c.toFixed(2)} vs body ${body.toFixed(2)}`)
    }
  }
})

test('read-dimming paints over asides', () => {
  assert.ok(ORDER.indexOf('aside') < ORDER.indexOf('c-read'))
})
