// sw.js — PsyGest PWA Service Worker
// Stratégie : Network-First avec fallback cache
// Les appels /api/ ne sont jamais mis en cache (données temps réel)

const CACHE_VERSION = 'psygest-pwa-v20260608c';
const CACHE_NAME = CACHE_VERSION;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/sw-init.js',
  '/manifest.json',
  '/offline.html',
];

// Installation : précacher le shell de l'app
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activation : supprimer les anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch : Network-First
self.addEventListener('fetch', event => {
  // Ne jamais intercepter les appels API — toujours réseau
  if (event.request.url.includes('/api/')) {
    return;
  }
  // Ne pas intercepter les requêtes non-GET
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Mise à jour du cache avec la réponse fraîche
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() =>
        // Réseau indisponible : servir depuis le cache
        caches.match(event.request)
          .then(cached => cached || caches.match('/offline.html'))
      )
  );
});
