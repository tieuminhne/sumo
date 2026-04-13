const CACHE = 'sumo-quan-v3';
const ASSETS = [
  './',
  './login.html',
  './register.html',
  './food.html',
  './kds.html',
  './manifest.json',
  './supabase.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(
      k.filter(v => v !== CACHE).map(v => caches.delete(v))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) {
        const c = res.clone();
        caches.open(CACHE).then(x => x.put(e.request, c));
      }
      return res;
    }).catch(() => caches.match('./login.html')))
  );
});
