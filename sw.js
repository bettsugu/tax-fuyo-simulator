// 電波がないときも開けるようにするための控え。
// まず最新を取りに行き、取れなかったときだけ控えを使う（古い基準額が残り続けないように）。
const CACHE = 'tax-fuyo-simulator-v1';
const FILES = ['./', 'index.html', 'style.css', 'js/app.js', 'js/calc.js', 'js/rules.js', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
