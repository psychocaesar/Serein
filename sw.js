const CACHE_VERSION = 'serein-v1';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const AUDIO_CACHE   = CACHE_VERSION + '-audio';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/assets/logo.png'
];

// ── Install : pré-cache des assets statiques ────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// ── Activate : nettoyage des anciens caches ──────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE && k !== AUDIO_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch : stratégie cache-first pour audio, network-first pour le reste ───
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Audio : cache-first
  if (url.pathname.includes('/assets/audio/')) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response && response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Reste : stale-while-revalidate
  event.respondWith(
    caches.open(STATIC_CACHE).then(cache =>
      cache.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response && response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});

// ── Message : mise en cache à la demande ─────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CACHE_AUDIO') {
    const urls = event.data.urls;
    event.waitUntil(
      caches.open(AUDIO_CACHE).then(cache =>
        Promise.all(
          urls.map(url =>
            cache.match(url).then(cached => {
              if (cached) return;
              return fetch(url).then(response => {
                if (response && response.ok) cache.put(url, response.clone());
              });
            })
          )
        ).then(() => {
          if (event.source) {
            event.source.postMessage({ type: 'CACHE_DONE', urls });
          }
        })
      )
    );
  }

  if (event.data && event.data.type === 'CHECK_CACHE') {
    const url = event.data.url;
    event.waitUntil(
      caches.open(AUDIO_CACHE).then(cache =>
        cache.match(url).then(cached => {
          if (event.source) {
            event.source.postMessage({ type: 'CACHE_STATUS', url, cached: !!cached });
          }
        })
      )
    );
  }
});
