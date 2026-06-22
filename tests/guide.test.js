// Teste la logique du guide telle qu'elle tourne réellement dans app.js :
// on charge le fichier dans un sandbox vm avec un DOM stub, puis on appelle
// resolveEntry/resolveRec sur le vrai catalogue. Complète sessions.test.js
// (qui vérifie l'existence des ids) en validant tout le pipeline de résolution.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PWA_DIR = path.join(__dirname, '..', 'app', 'pwa');
const catalog = JSON.parse(fs.readFileSync(path.join(PWA_DIR, 'assets', 'sessions.json'), 'utf8'));

// ── Stub universel : app.js manipule beaucoup le DOM au chargement.
//    Un Proxy callable/indexable absorbe tout (getElementById().onclick = …,
//    addEventListener, matchMedia, new Audio()…) sans rien casser.
const noop = () => {};
const stub = new Proxy(function () {}, {
  get: (_t, p) => {
    if (p === Symbol.toPrimitive || p === 'valueOf' || p === 'toString') return () => '';
    if (p === Symbol.iterator) return function* () {};
    if (p === 'length') return 0;
    return stub;
  },
  apply: () => stub,
  construct: () => stub,
  set: () => true,
  has: () => true,
});

// localStorage doit renvoyer null (pas le stub) : app.js fait
// JSON.parse(localStorage.getItem(k) || '{}').
const storage = new Map();
const localStorageStub = {
  getItem: k => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k),
  clear: () => storage.clear(),
};

const sandbox = {
  console,
  document: stub,
  navigator: stub,
  location: stub,
  history: stub,
  localStorage: localStorageStub,
  addEventListener: noop,
  removeEventListener: noop,
  matchMedia: () => stub,
  setTimeout: () => 0,
  clearTimeout: noop,
  setInterval: () => 0,
  clearInterval: noop,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: noop,
  fetch: () => Promise.resolve(stub),
  alert: noop,
  confirm: () => true,
  Audio: stub,
  MediaMetadata: stub,
  AudioContext: stub,
  webkitAudioContext: stub,
  IntersectionObserver: stub,
  URL: stub,
  Blob: stub,
  FileReader: stub,
};
sandbox.window = sandbox; // window.addEventListener / window.matchMedia → sandbox
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

// Shim ajouté en fin de fichier : expose les fonctions/données du guide
// (closures sur le scope module de app.js) et permet d'injecter le catalogue.
const SHIM = `
;globalThis.__guide = {
  setCatalog: function (c) { CATALOG = c; },
  resolveEntry: resolveEntry,
  resolveRec: resolveRec,
  findSessionById: findSessionById,
  GUIDE_MAP: GUIDE_MAP,
  MOOD_PARCOURS: MOOD_PARCOURS,
};`;

const src = fs.readFileSync(path.join(PWA_DIR, 'app.js'), 'utf8');
vm.createContext(sandbox);
vm.runInContext(src + '\n' + SHIM, sandbox, { filename: 'app.js' });

const G = sandbox.__guide;
G.setCatalog(catalog);

function leaves(map) {
  const out = [];
  for (const mood of Object.keys(map))
    for (const dur of Object.keys(map[mood]))
      for (const ctx of Object.keys(map[mood][dur]))
        out.push({ at: `${mood}/${dur}/${ctx}`, entry: map[mood][dur][ctx] });
  return out;
}

test('chaque entrée GUIDE_MAP produit une fiche complète', () => {
  const all = leaves(G.GUIDE_MAP);
  assert.ok(all.length >= 20, `trop peu d'entrées GUIDE_MAP (${all.length})`);
  for (const { at, entry } of all) {
    const rec = G.resolveEntry(entry);
    assert.ok(rec, `resolveEntry renvoie null pour ${at}`);
    assert.ok(typeof rec.main.title === 'string' && rec.main.title.length, `titre manquant (${at})`);
    assert.match(rec.main.duration, /^\d+ min$/, `durée mal formée (${at}) : ${rec.main.duration}`);
    assert.ok(rec.main.file.endsWith('.mp3'), `fichier invalide (${at}) : ${rec.main.file}`);
    assert.ok(rec.main.parcours, `parcours manquant (${at})`);
    assert.ok(rec.main.reason && rec.main.reason.length, `raison manquante (${at})`);
    assert.ok(Array.isArray(rec.alts), `alts non-array (${at})`);
    for (const alt of rec.alts) {
      assert.ok(alt.title && alt.reason, `alternative incomplète (${at})`);
    }
  }
});

test('resolveRec renvoie null pour un id absent du catalogue', () => {
  assert.strictEqual(G.resolveRec({ id: 's_inexistant', reason: 'x' }), null);
});

test('MOOD_PARCOURS pointe vers des parcours/sous-parcours réels', () => {
  for (const [mood, ref] of Object.entries(G.MOOD_PARCOURS)) {
    const group = catalog.groups.find(g => g.name === ref.group);
    assert.ok(group, `MOOD_PARCOURS.${mood} : groupe inconnu "${ref.group}"`);
    if (ref.sub) {
      assert.ok((group.subgroups || []).some(s => s.name === ref.sub),
        `MOOD_PARCOURS.${mood} : sous-groupe "${ref.sub}" absent de "${ref.group}"`);
    }
  }
});
