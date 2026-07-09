// Teste la pile de navigation (overlayStack + history.pushState/back) telle
// qu'elle tourne réellement dans app.js, en chargeant le fichier dans un
// sandbox vm (même approche que guide.test.js). Contrairement au stub Proxy
// universel de guide.test.js (qui absorbe tout indistinctement), ce fichier
// a besoin d'un DOM minimal MAIS avec état réel pour les 4 écrans (home/
// explore/guide/settings) et d'un window.history simulé qui rejoue vraiment
// popstate — sinon impossible de distinguer "on est sur Explorer" de "on est
// sur Apprendre", et donc impossible de reproduire le bug remonté par César :
// ouvrir un article de psychoéducation depuis Explorer puis revenir en
// arrière atterrissait sur Apprendre au lieu de revenir sur Explorer.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PWA_DIR = path.join(__dirname, '..', 'app', 'pwa');

// ── Stub universel pour tout ce qui n'est pas un des 4 écrans suivis ──
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

// ── Élément DOM minimal avec classList à état réel (Set), pour les 4 écrans ──
const SCREEN_IDS = ['home', 'explore', 'guide', 'settings'];
const trackedElements = new Map();
function makeTrackedElement(id) {
  const classes = new Set();
  return {
    id,
    dataset: {},
    style: {},
    classList: {
      contains: c => classes.has(c),
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      toggle: (c, force) => {
        const has = classes.has(c);
        const shouldHave = force === undefined ? !has : force;
        if (shouldHave) classes.add(c); else classes.delete(c);
        return shouldHave;
      },
    },
  };
}
SCREEN_IDS.forEach(id => trackedElements.set(id, makeTrackedElement(id)));

const documentStub = {
  getElementById: id => trackedElements.get(id) || stub,
  querySelectorAll: () => [],
  querySelector: () => stub,
  addEventListener: noop, // DOMContentLoaded ne doit jamais se déclencher ici
  removeEventListener: noop,
  createElement: () => stub,
  body: stub,
  documentElement: stub,
};

// ── history simulé : pushState empile, back() dépile ET rejoue le vrai
//    popstate d'app.js (capturé via window.addEventListener ci-dessous). ──
const historyStack = [];
let popstateHandler = null;
const historyStub = {
  pushState: (state) => { historyStack.push(state); },
  back: () => {
    historyStack.pop();
    if (popstateHandler) popstateHandler();
  },
};

const sandbox = {
  console,
  document: documentStub,
  navigator: stub,
  location: stub,
  history: historyStub,
  addEventListener: (type, fn) => { if (type === 'popstate') popstateHandler = fn; },
  removeEventListener: noop,
  matchMedia: () => stub,
  setTimeout: () => 0,
  clearTimeout: noop,
  setInterval: () => 0,
  clearInterval: noop,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: noop,
  fetch: () => Promise.resolve(stub),
  scrollTo: noop,
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
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

const SHIM = `
;globalThis.__nav = {
  setCatalog: function (c) { CATALOG = c; },
  showScreen: showScreen,
  openArticle: openArticle,
  goBack: goBack,
  setupAndroidBackButton: setupAndroidBackButton,
  overlayStack: overlayStack,
  ARTICLES: ARTICLES,
  activeScreen: function () {
    return ['home','explore','guide','settings'].find(function (s) {
      return document.getElementById(s).classList.contains('active');
    });
  },
};`;

const src = fs.readFileSync(path.join(PWA_DIR, 'app.js'), 'utf8');
vm.createContext(sandbox);
vm.runInContext(src + '\n' + SHIM, sandbox, { filename: 'app.js' });

const N = sandbox.__nav;
const catalog = JSON.parse(fs.readFileSync(path.join(PWA_DIR, 'assets', 'sessions.json'), 'utf8'));
N.setCatalog(catalog);

test('ouvrir un article depuis Explorer puis goBack() revient sur Explorer', () => {
  N.showScreen('explore');
  assert.strictEqual(N.activeScreen(), 'explore');

  const slug = Object.keys(N.ARTICLES)[0];
  assert.ok(slug, 'aucun article dans ARTICLES pour le test');
  N.openArticle(slug);
  assert.strictEqual(N.activeScreen(), 'guide', 'openArticle doit basculer sur Apprendre pour afficher le lecteur');

  N.goBack();
  assert.strictEqual(N.activeScreen(), 'explore', 'goBack() doit revenir sur Explorer, pas rester/atterrir sur Apprendre');
});

test('ouvrir un article depuis Apprendre puis goBack() reste sur Apprendre', () => {
  N.showScreen('guide');
  assert.strictEqual(N.activeScreen(), 'guide');

  const slug = Object.keys(N.ARTICLES)[1] || Object.keys(N.ARTICLES)[0];
  N.openArticle(slug);
  assert.strictEqual(N.activeScreen(), 'guide');

  N.goBack();
  assert.strictEqual(N.activeScreen(), 'guide', 'un article ouvert depuis Apprendre doit revenir sur Apprendre');
});

test('goBack() ne fait rien à la racine (pile vide)', () => {
  N.showScreen('home');
  assert.strictEqual(N.overlayStack.length, 0, 'pile attendue vide sur home sans overlay ouvert');
  assert.doesNotThrow(() => N.goBack());
  assert.strictEqual(N.activeScreen(), 'home');
});

test('bouton retour Android : ferme un écran secondaire, quitte seulement depuis la racine', () => {
  // Simule le plugin natif @capacitor/app : capture le handler + compte exitApp.
  let backHandler = null;
  let exitCalls = 0;
  sandbox.Capacitor = { Plugins: { App: {
    addListener: (evt, cb) => { if (evt === 'backButton') backHandler = cb; return { remove() {} }; },
    exitApp: () => { exitCalls++; },
  } } };
  N.setupAndroidBackButton();
  assert.strictEqual(typeof backHandler, 'function', 'le handler backButton doit être enregistré');

  // Depuis Explorer (pile non vide) : back revient à l'accueil, ne quitte pas.
  N.showScreen('explore');
  assert.ok(N.overlayStack.length > 0, 'Explorer doit empiler une entrée "screen"');
  backHandler();
  assert.strictEqual(N.activeScreen(), 'home', 'back depuis un écran secondaire doit revenir à l\'accueil');
  assert.strictEqual(exitCalls, 0, 'back depuis un écran secondaire ne doit pas quitter l\'app');

  // Depuis l'accueil (pile vide) : back quitte l'app.
  assert.strictEqual(N.overlayStack.length, 0, 'pile vide attendue sur l\'accueil');
  backHandler();
  assert.strictEqual(exitCalls, 1, 'back depuis l\'accueil doit quitter l\'app');

  delete sandbox.Capacitor;
});
