// Library persistence: book metadata + EPUB files in IndexedDB.
// Binary data is stored as ArrayBuffer, not Blob: WebKit (Safari private mode, Playwright) rejects Blobs in IDB.
import { Book } from './epub.ts'
import type { Settings } from './settings.ts'
import type { NameInfo } from '../insights/names.ts'
import type { ChapterInfo } from '../insights/chapters.ts'
import type { Annotation } from './annotations.ts'
import type { ReadTo } from './readto.ts'

export interface Location { index: number; fraction: number; cfi?: string }
export interface BookRecord {
  id: string
  title: string
  creator: string
  cover?: ArrayBuffer
  coverType?: string
  added: number
  opened: number
  progress: number // 0..1 across the whole book
  location?: Location
  chapter?: string // label of the chapter you're in
  words?: Record<string, string> // your "three words" per chapter
  promptSkips?: number // consecutive dismissals of the chapter-end card
  prefs?: Partial<Settings> // this book's overrides of the global settings
  profile?: { v: number; names: NameInfo[]; words?: number[]; chapters?: ChapterInfo[]; links?: Record<string, Record<string, number[]>>; hapax?: Record<string, number>; punct?: string } // on-device insights (cast, words per part, chapter profiles), computed once
  // Your place, kept for the homepage (only what you've read: spoiler-safe)
  readAt?: number // when you last read
  lastLine?: string // the sentence at your place
  who?: string[] // who was around just before your place
  chapterLeft?: number // words left in the chapter
  tint?: string // the cover's colour (Up next cards, the landing page)
  about?: { description: string; language: string; publisher: string; date: string; subjects: string[] } // from the book's metadata
  keepsake?: string // the finish keepsake (an SVG), drawn when you finish
  born?: string[] // characters whose first appearance you've seen (star-birth plays once)
  sessionFrom?: number // progress when this reading session began (the library's arc reveal)
  readTo?: ReadTo // your place: the word the reading guide last stood on (marked on the page; the Stage starts there)
}

let dbp: Promise<IDBDatabase> | undefined
function db() {
  return dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('pubre', 2)
    r.onupgradeneeded = () => {
      const d = r.result
      if (!d.objectStoreNames.contains('books')) d.createObjectStore('books', { keyPath: 'id' })
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files')
      if (!d.objectStoreNames.contains('annotations')) d.createObjectStore('annotations', { keyPath: 'id' }).createIndex('book', 'book')
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const s = (await db()).transaction(store, mode).objectStore(store)
  const r = fn(s)
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export const listBooks = () =>
  run<BookRecord[]>('books', 'readonly', s => s.getAll()).then(b => b.sort((x, y) => y.opened - x.opened))
export const getBook = (id: string) => run<BookRecord | undefined>('books', 'readonly', s => s.get(id))
export const saveBook = (b: BookRecord) => run('books', 'readwrite', s => s.put($state.snapshot(b)))
export const getFile = (id: string) => run<ArrayBuffer | undefined>('files', 'readonly', s => s.get(id))

export const listAnnotations = (book: string) => run<Annotation[]>('annotations', 'readonly', s => s.index('book').getAll(book))
export const saveAnnotation = (a: Annotation) => run('annotations', 'readwrite', s => s.put($state.snapshot(a)))
export const deleteAnnotation = (id: string) => run('annotations', 'readwrite', s => s.delete(id))

export async function removeBook(id: string) {
  await run('books', 'readwrite', s => s.delete(id))
  await run('files', 'readwrite', s => s.delete(id))
}

async function thumbnail(blob: Blob): Promise<Blob> {
  try {
    const img = await createImageBitmap(blob)
    const w = Math.min(480, img.width)
    const canvas = new OffscreenCanvas(w, Math.round(img.height * w / img.width))
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  } catch {
    return blob // e.g. SVG covers: keep the original
  }
}

/** The book's own description of itself (metadata), with the markup stripped. */
export function aboutOf(m: { description?: string; language?: string; publisher?: string; date?: string; subjects?: { value: string }[] }) {
  const text = (m.description ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  return { description: text, language: m.language ?? '', publisher: m.publisher ?? '', date: m.date ?? '', subjects: (m.subjects ?? []).map(s => s.value).slice(0, 6) }
}
export async function importFile(file: File): Promise<BookRecord> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  const id = Array.from(hash.subarray(0, 12), b => b.toString(16).padStart(2, '0')).join('')
  const existing = await getBook(id)
  if (existing) return existing

  const book = await Book.open(bytes) // validates + extracts metadata
  const blob = await book.coverBlob()
  const cover = blob && await thumbnail(blob)
  const record: BookRecord = {
    id,
    title: book.metadata.title,
    creator: book.metadata.creator,
    cover: await cover?.arrayBuffer(),
    coverType: cover?.type,
    added: Date.now(),
    opened: Date.now(),
    progress: 0,
    about: aboutOf(book.metadata),
  }
  book.destroy()
  await run('files', 'readwrite', s => s.put(bytes.buffer, id))
  await saveBook(record)
  navigator.storage?.persist?.() // ask the browser not to evict the library (matters on iOS)
  return record
}
