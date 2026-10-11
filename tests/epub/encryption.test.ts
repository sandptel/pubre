import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { parseEncryption, detectDrm, obfuscationKey, deobfuscate, IDPF_OBFUSCATION, ADOBE_OBFUSCATION } from '../../src/epub/encryption.ts'
import { xml } from './helpers.ts'

const ENC = (alg: string, uri: string, keyInfo = '') => `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <enc:EncryptedData><enc:EncryptionMethod Algorithm="${alg}"/>${keyInfo}<enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData></enc:EncryptedData>
</encryption>`

test('parseEncryption: obfuscated fonts vs real encryption', () => {
  const e = parseEncryption(xml(ENC(IDPF_OBFUSCATION, 'OEBPS/fonts/My%20Font.otf')))
  assert.deepEqual([...e.obfuscated], [['OEBPS/fonts/My Font.otf', 'idpf']])
  assert.deepEqual(e.encrypted, [])
  const a = parseEncryption(xml(ENC(ADOBE_OBFUSCATION, 'a.ttf')))
  assert.equal(a.obfuscated.get('a.ttf'), 'adobe')
  const lcp = parseEncryption(xml(ENC('http://www.w3.org/2001/04/xmlenc#aes256-cbc', 'OEBPS/ch1.xhtml',
    '<ds:KeyInfo><ds:RetrievalMethod URI="license.lcpl#/encryption/content_key" Type="http://readium.org/2014/01/lcp#EncryptedContentKey"/></ds:KeyInfo>')))
  assert.equal(lcp.encrypted.length, 1)
  assert.equal(detectDrm(() => false, lcp)?.detail, 'lcp')
})

test('detectDrm: markers and unknown encryption', () => {
  assert.equal(detectDrm(() => false), undefined)
  assert.equal(detectDrm(() => false, parseEncryption(xml(ENC(IDPF_OBFUSCATION, 'f.otf')))), undefined)
  for (const [file, scheme] of [['META-INF/license.lcpl', 'lcp'], ['META-INF/rights.xml', 'adobe-adept'], ['META-INF/sinf.xml', 'apple-fairplay']]) {
    const err = detectDrm(p => p === file)!
    assert.equal(err.code, 'DRM')
    assert.equal(err.detail, scheme)
  }
  const aes = parseEncryption(xml(ENC('http://www.w3.org/2001/04/xmlenc#aes128-cbc', 'c.xhtml')))
  assert.equal(detectDrm(() => false, aes)?.detail, 'unknown')
})

test('IDPF key = SHA-1 of the unique identifier without whitespace; obfuscation roundtrips', async () => {
  const id = ' urn:uuid:1234\t5678 \n'
  const key = (await obfuscationKey('idpf', [id]))!
  assert.deepEqual(Buffer.from(key), createHash('sha1').update('urn:uuid:12345678').digest())
  const font = new Uint8Array(3000).map((_, i) => (i * 7) & 0xff)
  const obf = deobfuscate(font, key, 'idpf')
  assert.notDeepEqual(obf.subarray(0, 1040), font.subarray(0, 1040))
  assert.deepEqual(obf.subarray(1040), font.subarray(1040), 'only the first 1040 bytes')
  assert.deepEqual(deobfuscate(obf, key, 'idpf'), font)
})

test('Adobe key = 16 bytes of the urn:uuid identifier; 1024 bytes XORed', async () => {
  const key = (await obfuscationKey('adobe', ['isbn:123', 'urn:uuid:00112233-4455-6677-8899-aabbccddeeff']))!
  assert.deepEqual([...key], [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff])
  const font = new Uint8Array(2000).fill(0xab)
  const obf = deobfuscate(font, key, 'adobe')
  assert.equal(obf[1023], 0xab ^ 0xff)
  assert.equal(obf[1024], 0xab)
  assert.equal(await obfuscationKey('adobe', ['not-a-uuid']), undefined)
})
