/* MyMoney service worker. Keeps this site's own files so the app opens without a connection.
   It never touches other origins (sign-in and sync go straight to the network) and never stores your data.
   The build puts a unique id in the cache name so each release gets a fresh cache and old ones are deleted. */
const CACHE = 'mymoney-__BUILD__';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'manifest.webmanifest', 'icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Pages: the network first, so a new release shows up; the saved copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return res; })
        .catch(() => caches.match('./').then((r) => r || Response.error())),
    );
    return;
  }

  // Built files have a hash in their name and never change: saved copy first.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })));
    return;
  }

  // Icons and the manifest: show the saved copy, refresh it in the background.
  event.respondWith(caches.match(req).then((hit) => {
    const fresh = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || fresh;
  }));
});
