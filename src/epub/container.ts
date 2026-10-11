// OCF container: META-INF/container.xml (rootfiles = renditions) and the mimetype file.
import { byTag, attr, pattr } from './xml.ts'
import { resolvePath } from './resources.ts'

export const OPF_MEDIA_TYPE = 'application/oebps-package+xml'
export const EPUB_MIMETYPE = 'application/epub+zip'

export interface Rootfile {
  fullPath: string
  mediaType: string
  /** Multiple-rendition selection attributes (rendition:media, layout, language, accessMode, label). */
  selection: Record<string, string>
}

export interface Container {
  rootfiles: Rootfile[]
  /** The default rendition: the first rootfile with the OPF media type. */
  rootfile?: Rootfile
  /** <link> elements (e.g. a rendition mapping document). */
  links: { href: string; rel: string; mediaType?: string }[]
}

export function parseContainer(doc: Document): Container {
  const rootfiles = byTag(doc, 'rootfile').flatMap(el => {
    const fullPath = resolvePath('', attr(el, 'full-path') ?? '')
    if (!fullPath) return []
    const selection: Record<string, string> = {}
    for (const key of ['media', 'layout', 'language', 'accessMode', 'label']) {
      const v = el.getAttribute('rendition:' + key) ?? pattr(el, key.toLowerCase())
      if (v) selection[key] = v
    }
    return [{ fullPath, mediaType: attr(el, 'media-type') ?? '', selection }]
  })
  const rootfile = rootfiles.find(r => r.mediaType === OPF_MEDIA_TYPE)
    ?? rootfiles.find(r => /\.opf$/i.test(r.fullPath))
    ?? rootfiles[0]
  const links = byTag(doc, 'link').map(el => ({
    href: resolvePath('', attr(el, 'href') ?? ''),
    rel: attr(el, 'rel') ?? '',
    mediaType: attr(el, 'media-type'),
  }))
  return { rootfiles, rootfile, links }
}

/** OCF mimetype rules. Returns warnings: real-world books often break these and still read fine. */
export function checkMimetype(entry: { name: string; method: number; offset: number } | undefined, content: string | undefined): string[] {
  if (!entry) return ['mimetype file missing']
  const out: string[] = []
  if (content?.trim() !== EPUB_MIMETYPE) out.push(`mimetype is "${content?.trim()}", expected "${EPUB_MIMETYPE}"`)
  else if (content !== EPUB_MIMETYPE) out.push('mimetype has surrounding whitespace')
  if (entry.method !== 0) out.push('mimetype is compressed')
  if (entry.offset !== 0) out.push('mimetype is not the first entry in the archive')
  return out
}
