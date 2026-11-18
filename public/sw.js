// Cache minima: l'app si apre anche senza rete in palestra.
const CACHE = 'alba-v3'
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/']))); self.skipWaiting() })
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.pathname.startsWith('/.netlify/')) return
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))))
})
