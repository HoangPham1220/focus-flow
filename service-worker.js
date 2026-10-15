const CACHE = 'focusflow-v6';
const FILES = ['./', './index.html', './styles.css', './app.js', './config.js', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];
const ASSETS = new Set(FILES.map(path => new URL(path, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(path => new Request(path, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => (key.startsWith('tempo-') || key.startsWith('focusflow-')) && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode !== 'navigate' && !ASSETS.has(url.pathname)) return;
  // Prefer published files on reload; cached copies keep the app usable offline.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request, { cache: 'no-cache' });
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      if (event.request.mode === 'navigate') return cache.match('./index.html');
      return Response.error();
    }
  })());
});
