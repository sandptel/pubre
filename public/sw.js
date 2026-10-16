// Offline (R4): the app keeps a copy of itself, so pubre opens with no connection. Books already live in
// IndexedDB. Pages: network first (a new release shows up), the saved copy when offline. Everything else
// the app fetches (its scripts, styles, the dictionary, fonts): the saved copy at once, refreshed behind.
const CACHE = 'pubre-v1'
const FONTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./']))) })
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url)
  if (req.method !== 'GET' || (url.origin !== location.origin && !FONTS.includes(url.origin))) return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); return res }).catch(() => caches.match('./')))
    return
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req)
    const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res }).catch(() => hit)
    return hit ?? net
  }))
})
