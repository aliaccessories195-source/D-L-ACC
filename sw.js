const CACHE_NAME = 'dl-acc-v14-reviews';
const STATIC_ASSETS = [
  './', './index.html', './favorites.html', './admin.html',
  './style.css', './script.js', './admin.js',
  './manifest.json', './icon-192.svg', './icon-512.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never cache Supabase/API responses: product, order, auth and coupon data stay fresh.
  if (url.hostname.endsWith('supabase.co')) return;
  // Navigation: network first, then cached page.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html'))));
    return;
  }
  if (/\.(js|css|html)$/.test(url.pathname)) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && url.origin === location.origin) { const copy = response.clone(); caches.open(CACHE_NAME).then(c => c.put(request, copy)); }
      return response;
    }).catch(() => caches.match(request)));
    return;
  }
  event.respondWith(caches.match(request).then(cached => {
    const network = fetch(request).then(response => {
      if (response.ok && url.origin === location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});
