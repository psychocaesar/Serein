// Vérifie que tous les fichiers statiques référencés par la PWA existent
// réellement sur disque. Attrape les suppressions/renommages oubliés qui
// casseraient le service worker (cache.addAll est atomique) ou afficheraient
// des icônes/aperçus 404. Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PWA_DIR = path.join(__dirname, '..', 'app', 'pwa');
const ASSET_RE = /(?:assets|illustrations)\/[A-Za-z0-9_\-./]+\.(?:png|jpe?g|webp|svg|ico|woff2|mp3|json)/g;

function exists(rel) {
  return fs.existsSync(path.join(PWA_DIR, rel.replace(/^\//, '')));
}

test('les assets référencés dans index.html existent', () => {
  const html = fs.readFileSync(path.join(PWA_DIR, 'index.html'), 'utf8');
  const refs = [...new Set(html.match(ASSET_RE) || [])];
  assert.ok(refs.length > 0, 'aucune référence d’asset trouvée dans index.html');
  for (const ref of refs) {
    assert.ok(exists(ref), `asset introuvable (index.html) : ${ref}`);
  }
});

test('les icônes du manifest existent', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PWA_DIR, 'manifest.json'), 'utf8'));
  for (const icon of manifest.icons || []) {
    assert.ok(exists(icon.src), `icône introuvable (manifest) : ${icon.src}`);
  }
});

test('les ressources pré-cachées par le service worker existent', () => {
  const sw = fs.readFileSync(path.join(PWA_DIR, 'sw.js'), 'utf8');
  // STATIC_ASSETS est passé à cache.addAll() : un seul 404 fait échouer
  // toute l’installation du SW. On vérifie donc chaque entrée locale.
  const block = /const STATIC_ASSETS = \[([\s\S]*?)\];/.exec(sw);
  assert.ok(block, 'bloc STATIC_ASSETS introuvable dans sw.js');
  const paths = [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]).filter(p => p !== '/');
  assert.ok(paths.length > 0, 'STATIC_ASSETS vide ?');
  for (const p of paths) {
    const rel = p === '/index.html' || p === '/' ? 'index.html' : p;
    assert.ok(exists(rel), `ressource pré-cachée introuvable (sw.js STATIC_ASSETS) : ${p}`);
  }
});
