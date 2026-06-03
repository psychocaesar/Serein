const CACHE_VERSION = 'serein-v3';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const AUDIO_CACHE   = 'serein-audio'; // non versionné — survit aux mises à jour
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/assets/logo.png',
];

const OPTIONAL_ASSETS = [
  '/assets/audio/cloche.mp3',
  '/assets/illustrations/player-01.jpg',
  '/assets/illustrations/player-02.jpg',
  '/assets/illustrations/player-03.jpg',
  '/assets/illustrations/player-04.jpg',
  '/assets/illustrations/player-05.jpg',
  '/assets/illustrations/player-06.jpg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      cache.addAll(STATIC_ASSETS).then(() =>
        Promise.allSettled(OPTIONAL_ASSETS.map(url => cache.add(url)))
      )
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== AUDIO_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname.includes('/assets/audio/')) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response && response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  event.respondWith(
    caches.open(STATIC_CACHE).then(cache =>
      cache.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response && response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});
