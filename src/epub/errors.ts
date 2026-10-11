// Typed errors for everything that makes a book unopenable (or a request unanswerable).
export type EpubErrorCode =
  | 'NOT_ZIP' // no ZIP structure found at all
  | 'CORRUPT_ZIP' // structure found but unreadable (bad offsets, CRC mismatch, truncated data)
  | 'UNSUPPORTED_COMPRESSION' // entry uses a method other than stored/deflate
  | 'NO_CONTAINER' // no META-INF/container.xml and no .opf anywhere
  | 'NO_OPF' // container points nowhere and no .opf anywhere
  | 'BAD_OPF' // package document is not parseable XML
  | 'EMPTY_SPINE' // nothing to read
  | 'DRM' // encrypted with a scheme we cannot (and will not) decrypt
  | 'MISSING_RESOURCE' // requested path not in the archive
  | 'BAD_CFI' // malformed or unresolvable EPUB CFI
  | 'NO_DOM' // no XML parser available (inject one with `parseXml`)

export class EpubError extends Error {
  readonly code: EpubErrorCode
  /** Extra machine-readable detail, e.g. the DRM scheme ('adobe-adept', 'lcp', 'apple-fairplay', ...). */
  readonly detail?: string

  constructor(code: EpubErrorCode, message: string, detail?: string) {
    super(message)
    this.name = 'EpubError'
    this.code = code
    this.detail = detail
  }
}
