// META-INF/encryption.xml: font obfuscation (IDPF + Adobe) is undone; anything else is DRM and
// refused with a typed error, as are Adobe ADEPT (rights.xml), Readium LCP (license.lcpl) and
// Apple FairPlay (sinf.xml) markers.
import { byTag, attr } from './xml.ts'
import { resolvePath } from './resources.ts'
import { EpubError } from './errors.ts'

export const IDPF_OBFUSCATION = 'http://www.idpf.org/2008/embedding'
export const ADOBE_OBFUSCATION = 'http://ns.adobe.com/pdf/enc#RC'
export type Obfuscation = 'idpf' | 'adobe'
export type DrmScheme = 'adobe-adept' | 'lcp' | 'apple-fairplay' | 'unknown'

export interface Encryption {
  /** Zip path → obfuscation algorithm. */
  obfuscated: Map<string, Obfuscation>
  /** Resources encrypted with anything else (real encryption). */
  encrypted: { path: string; algorithm: string; keyInfo: string }[]
}

export function parseEncryption(doc: Document): Encryption {
  const obfuscated = new Map<string, Obfuscation>()
  const encrypted: Encryption['encrypted'] = []
  for (const data of byTag(doc, 'EncryptedData')) {
    const algorithm = attr(byTag(data, 'EncryptionMethod')[0] ?? data, 'Algorithm') ?? ''
    const uri = attr(byTag(data, 'CipherReference')[0] ?? data, 'URI')
    if (!uri) continue
    const path = resolvePath('', uri)
    if (algorithm === IDPF_OBFUSCATION) obfuscated.set(path, 'idpf')
    else if (algorithm === ADOBE_OBFUSCATION) obfuscated.set(path, 'adobe')
    else {
      const key = byTag(data, 'KeyInfo')[0]
      encrypted.push({ path, algorithm, keyInfo: key ? (byTag(key, 'RetrievalMethod')[0]?.getAttribute('URI') ?? '') + ' ' + (key.textContent ?? '') + ' ' + (key.namespaceURI ?? '') : '' })
    }
  }
  return { obfuscated, encrypted }
}

const DRM_MESSAGE = 'This book is DRM-protected. pubre can only open DRM-free EPUBs.'

/** DRM markers in the container. `has` checks archive paths. */
export function detectDrm(has: (path: string) => boolean, enc?: Encryption): EpubError | undefined {
  let scheme: DrmScheme | undefined
  if (has('META-INF/license.lcpl')) scheme = 'lcp'
  else if (has('META-INF/rights.xml')) scheme = 'adobe-adept'
  else if (has('META-INF/sinf.xml')) scheme = 'apple-fairplay'
  else if (enc?.encrypted.length) {
    const info = enc.encrypted.map(e => e.keyInfo).join(' ')
    scheme = /readium\.org\/20\d\d\/\d\d\/lcp|license\.lcpl/.test(info) ? 'lcp' : /adobe/i.test(info) ? 'adobe-adept' : 'unknown'
  }
  return scheme && new EpubError('DRM', DRM_MESSAGE, scheme)
}

/**
 * Obfuscation key. IDPF: SHA-1 of the unique identifier with whitespace removed (EPUB 3.3 OCF §4.3).
 * Adobe: the 16 bytes of the book's urn:uuid identifier. `identifiers` = unique identifier first.
 */
export async function obfuscationKey(alg: Obfuscation, identifiers: string[]): Promise<Uint8Array | undefined> {
  if (alg === 'idpf') {
    const id = (identifiers[0] ?? '').replace(/[ \u0009\u000d\u000a]/g, '')
    return id ? new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(id))) : undefined
  }
  for (const id of identifiers) {
    const hex = id.trim().replace(/^urn:uuid:/i, '').replace(/-/g, '')
    if (/^[\da-f]{32}$/i.test(hex)) return new Uint8Array(hex.match(/../g)!.map(h => parseInt(h, 16)))
  }
  return undefined
}

/** XOR the head of the file with the key (obfuscation is symmetric: this also obfuscates). */
export function deobfuscate(data: Uint8Array, key: Uint8Array, alg: Obfuscation): Uint8Array {
  const out = data.slice()
  const len = Math.min(alg === 'idpf' ? 1040 : 1024, out.length)
  for (let i = 0; i < len; i++) out[i] ^= key[i % key.length]
  return out
}
