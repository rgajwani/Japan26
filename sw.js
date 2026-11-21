// Offline support. Every page load asks the network for fresh files but falls back
// to the saved copy after 3 seconds or when there is no signal.
// Paths are relative to where the app lives, so it works at a domain root (Render)
// or in a subfolder (GitHub Pages).
const CACHE = 'japan-v3';
const TILES = 'japan-tiles';
const BASE = self.registration.scope;
const FILES = ['./', 'app.css', 'app.js', 'data.js', 'data.enc.json', 'unlock.js', 'manifest.webmanifest',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'vendor/leaflet.js', 'vendor/leaflet.css'].map((f) => new URL(f, BASE).href);

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {})))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== TILES).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  // Map tiles: keep every tile we have seen, so viewed areas work offline.
  if (req.method === 'GET' && url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(caches.open(TILES).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin || !url.href.startsWith(BASE)) return;
  if (/\/(login|logout|healthz)$/.test(url.pathname)) return;
  const key = req.mode === 'navigate' ? BASE : url.origin + url.pathname;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(key);
    const net = fetch(req).then((res) => {
      // A redirect means the session ended (sent to the login page). Keep the saved copy then.
      if (res.ok && !res.redirected) cache.put(key, res.clone());
      else if (saved && res.redirected) return saved;
      return res;
    });
    if (!saved) return net;
    const timeout = new Promise((done) => setTimeout(() => done(saved), 3000));
    return Promise.race([net.catch(() => saved), timeout]);
  })());
});
