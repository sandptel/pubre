// Library persistence: book metadata + EPUB files in IndexedDB.
// Binary data is stored as ArrayBuffer, not Blob: WebKit (Safari private mode, Playwright) rejects Blobs in IDB.
import { Book } from './epub.ts'
import type { Settings } from './settings.ts'
import type { NameInfo } from '../insights/names.ts'

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
  prefs?: Partial<Settings> // this book's overrides of the global settings
  profile?: { v: number; names: NameInfo[]; words?: number[] } // on-device insights (cast, words per chapter), computed once
}

let dbp: Promise<IDBDatabase> | undefined
function db() {
  return dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('pubre', 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('books', { keyPath: 'id' })
      r.result.createObjectStore('files')
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
  }
  book.destroy()
  await run('files', 'readwrite', s => s.put(bytes.buffer, id))
  await saveBook(record)
  navigator.storage?.persist?.() // ask the browser not to evict the library (matters on iOS)
  return record
}
