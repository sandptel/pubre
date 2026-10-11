import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Zip } from '../src/lib/zip.ts'

test('reads stored and deflated entries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pubre-'))
  const big = 'Call me Ishmael. '.repeat(500)
  writeFileSync(join(dir, 'mimetype'), 'application/epub+zip')
  writeFileSync(join(dir, 'ch1.xhtml'), big)
  execFileSync('zip', ['-X0q', 'b.epub', 'mimetype'], { cwd: dir })
  execFileSync('zip', ['-X9q', 'b.epub', 'ch1.xhtml'], { cwd: dir })
  const zip = new Zip(new Uint8Array(readFileSync(join(dir, 'b.epub'))))
  assert.equal(zip.entries.get('mimetype')!.method, 0)
  assert.equal(zip.entries.get('ch1.xhtml')!.method, 8)
  assert.equal(await zip.text('mimetype'), 'application/epub+zip')
  assert.equal(await zip.text('ch1.xhtml'), big)
  await assert.rejects(zip.bytes('nope'))
})
