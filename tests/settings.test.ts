import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mix, modes, palettes, resolveTheme } from '../src/lib/settings.ts'

test('mix interpolates hex colors', () => {
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080')
  assert.equal(mix('#102030', '#102030', 0.7), '#102030')
})

test('every palette × mode resolves to 16 valid colors with the right darkness', () => {
  for (const p of Object.keys(palettes)) {
    for (const m of Object.keys(modes)) {
      const t = resolveTheme(p, m)
      assert.equal(t.base.length, 16, `${p}/${m}`)
      for (const c of t.base) assert.match(c, /^#[0-9a-f]{6}$/, `${p}/${m}`)
      if (m !== 'original') assert.equal(t.dark, modes[m].dark, `${p}/${m}`)
    }
  }
})

test('Original is the palette as authored; other modes tint the mode ramp', () => {
  assert.deepEqual(resolveTheme('gruvbox', 'original').base, palettes.gruvbox.light)
  assert.equal(resolveTheme('dracula', 'original').dark, true) // dark-only palette stays dark
  assert.deepEqual(resolveTheme('pubre', 'calm').base.slice(0, 8), modes.calm.ramp)
  assert.notEqual(resolveTheme('gruvbox', 'calm').base[0], modes.calm.ramp[0])
})
