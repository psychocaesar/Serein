// Harnais partagé par les tests qui chargent app.js dans un sandbox vm.
// Regroupe ce qui était dupliqué entre guide.test.js et navigation.test.js
// (stub universel + liste des globals à fournir), et ajoute une horloge
// contrôlable.
//
// Pourquoi une horloge : app.js contient de la logique différée (minuteur,
// fondu d'extinction, filets de sécurité de la navigation). Les sandbox
// stubaient `setTimeout`/`setInterval` en no-op, donc ce code n'était JAMAIS
// exécuté en test — le bug du minuteur fantôme (un setInterval orphelin créé
// 1,5 s après la fermeture du player) était structurellement invisible pour
// `npm test`. Avec createFakeClock(), un test peut avancer le temps
// instantanément et observer ce qui se déclenche.
'use strict';

// ── Stub universel : app.js manipule beaucoup le DOM au chargement. Un Proxy
//    callable/indexable absorbe tout (getElementById().onclick = …,
//    addEventListener, matchMedia, new Audio()…) sans rien casser.
function createStub() {
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
  return stub;
}

// Nombre maximal de callbacks exécutés par tick() : garde-fou contre une
// boucle infinie si un intervalle se reprogramme indéfiniment.
const MAX_CALLBACKS_PER_TICK = 10000;

// Horloge virtuelle : setTimeout/setInterval y sont enregistrés mais ne
// partent que quand le test appelle tick(ms). `Date` suit la même horloge,
// sinon le code qui calcule un écoulé (Date.now() - début) verrait toujours 0.
function createFakeClock(startMs = Date.now()) {
  let now = startMs;
  let nextId = 1;
  const timers = new Map();

  const schedule = (fn, delay, args, interval) => {
    const id = nextId++;
    timers.set(id, { due: now + Math.max(0, delay || 0), fn, args, interval });
    return id;
  };

  const clear = id => { timers.delete(id); };

  function tick(ms) {
    const target = now + ms;
    let executed = 0;
    for (;;) {
      let nextId_ = null, next = null;
      for (const [id, t] of timers) {
        if (t.due <= target && (next === null || t.due < next.due)) { next = t; nextId_ = id; }
      }
      if (!next) break;
      if (++executed > MAX_CALLBACKS_PER_TICK) {
        throw new Error('fake clock: plus de ' + MAX_CALLBACKS_PER_TICK + ' callbacks sur un seul tick — boucle probable');
      }
      now = next.due;
      if (next.interval == null) timers.delete(nextId_);
      else next.due = now + next.interval;
      next.fn(...next.args);
    }
    now = target;
  }

  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(now);
      else super(...args);
    }
    static now() { return now; }
  }

  return {
    tick,
    now: () => now,
    // Nombre de minuteries encore armées — sert à détecter un setInterval
    // orphelin qui continuerait de tourner après une fermeture.
    pending: () => timers.size,
    globals: {
      setTimeout: (fn, delay, ...args) => schedule(fn, delay, args, null),
      setInterval: (fn, delay, ...args) => schedule(fn, delay, args, Math.max(1, delay || 0)),
      clearTimeout: clear,
      clearInterval: clear,
      Date: FakeDate,
    },
  };
}

// Globals communs aux sandbox. `document`, `history`, `localStorage` et
// `addEventListener` varient d'un fichier de test à l'autre : à fournir dans
// `overrides`.
function createSandbox(overrides = {}) {
  const stub = createStub();
  const noop = () => {};
  const clock = overrides.clock || createFakeClock();

  const sandbox = {
    console,
    document: stub,
    navigator: stub,
    location: stub,
    history: stub,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
    addEventListener: noop,
    removeEventListener: noop,
    matchMedia: () => stub,
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
    ...clock.globals,
    ...overrides,
  };
  delete sandbox.clock;

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  return { sandbox, stub, clock };
}

module.exports = { createStub, createFakeClock, createSandbox };
