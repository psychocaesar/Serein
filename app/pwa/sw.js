// Doit contenir la version de package.json (vérifié par tests/versions.test.js) :
// change à chaque release, ce qui purge l'ancien index.html/app.js du cache client.
const CACHE_VERSION = 'serein-1.4.0';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const AUDIO_CACHE   = 'serein-audio'; // non versionné — survit aux mises à jour
const AUDIO_CDN_HOST = 'audio.sereinapp.fr'; // CDN audio utilisé par l'app native

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/privacy.html',
  '/assets/sessions.json',
  '/assets/logo.png',
  '/assets/logo-serein.png',
  '/assets/fonts/bricolage-grotesque-latin.woff2',
  '/assets/fonts/bricolage-grotesque-latin-ext.woff2',
  '/assets/fonts/hanken-grotesk-latin.woff2',
  '/assets/fonts/hanken-grotesk-latin-ext.woff2',
];

const OPTIONAL_ASSETS = [
  '/assets/audio/cloche.mp3',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/illustrations/player-01.jpg',
  '/assets/illustrations/player-02.jpg',
  '/assets/illustrations/player-03.jpg',
  '/assets/illustrations/player-04.jpg',
  '/assets/illustrations/player-05.jpg',
  '/assets/illustrations/player-06.jpg'
];

// Une requête audio peut venir des assets locaux (web) ou du CDN (app native).
function isAudioRequest(url) {
  return url.hostname === AUDIO_CDN_HOST || url.pathname.includes('/assets/audio/');
}

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

// Sert un audio depuis le cache, avec support des requêtes Range :
// Safari/iOS exige des réponses 206 pour pouvoir chercher dans le fichier.
async function audioResponse(request) {
  const cache = await caches.open(AUDIO_CACHE);
  let response = await cache.match(request.url);
  if (!response) {
    response = await fetch(request);
    if (response && response.ok && response.status === 200) {
      await cache.put(request.url, response.clone());
    }
    return response;
  }
  const range = request.headers.get('range');
  if (!range) return response;
  const m = /bytes=(\d+)-(\d+)?/.exec(range);
  if (!m) return response;
  const buf = await response.arrayBuffer();
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
  if (start >= buf.byteLength) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + buf.byteLength } });
  }
  // Le média est désormais chargé avec crossOrigin="anonymous" (Web Audio, pour
  // régler le volume sur iOS) : la réponse 206 synthétisée doit rester
  // CORS-propre, sinon le son servi depuis le cache est « tainted » (silence).
  const acao = response.headers.get('Access-Control-Allow-Origin') || '*';
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Length': String(end - start + 1),
      'Content-Range': 'bytes ' + start + '-' + end + '/' + buf.byteLength,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': acao
    }
  });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Audio : cache-first dans AUDIO_CACHE (rempli aussi par les téléchargements explicites).
  if (isAudioRequest(url)) {
    event.respondWith(audioResponse(event.request));
    return;
  }

  // Le reste : uniquement les ressources de l'app elle-même.
  if (url.origin !== self.location.origin) return;

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
