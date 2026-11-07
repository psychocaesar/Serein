// Liens profonds (serein://… et https://sereinapp.fr/ouvrir/…) : utilisés par
// les widgets et tout objet qui ouvre l'app sur une séance. N'importe quelle
// app ou page web peut ouvrir un lien serein:// : navigation seulement, et
// tout identifiant vérifié contre le catalogue.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSandbox, createFakeClock, createStub } = require('./harness');

const ROOT = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const src = lire('app/pwa/app.js');
const catalogue = JSON.parse(lire('app/pwa/assets/sessions.json'));

const SHIM = `
;globalThis.__appels = [];
const __note = nom => (...a) => { globalThis.__appels.push([nom, ...a]); };
showScreen = __note('ecran'); openBreathing = __note('respirer'); openVoiceOverlay = __note('seance');
openParcoursOverlay = __note('parcours'); openProgramOverlay = __note('programme'); launchProgramDay = __note('jourProgramme');
closePlayer = __note('fermerPlayer');
globalThis.__l = {
  analyserLienProfond, ouvrirLienProfond, executerLienEnAttente,
  empiler: nom => registerOverlay(nom, __note('fermer ' + nom)),
  pile: () => overlayStack.length,
  catalogue: c => { CATALOG = c; },
};`;

function charger({ onboarding = false, playerOuvert = false, donnees = {} } = {}) {
  const store = new Map(Object.entries(donnees));
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
  const stub = createStub();
  const classesRacine = new Set(onboarding ? ['needs-onboarding'] : []);
  const documentElement = { classList: { contains: c => classesRacine.has(c), add: c => classesRacine.add(c), remove: c => classesRacine.delete(c) } };
  const player = { classList: { contains: c => c === 'open' && playerOuvert } };
  const document = new Proxy(stub, {
    get: (t, p) => {
      if (p === 'documentElement') return documentElement;
      if (p === 'getElementById') return id => (id === 'player-screen' ? player : stub);
      return stub[p];
    },
  });
  const clock = createFakeClock(new Date(2026, 10, 7, 12).getTime());
  const { sandbox } = createSandbox({ clock, localStorage, document });
  vm.createContext(sandbox);
  vm.runInContext(src + '\n' + SHIM, sandbox, { filename: 'app.js' });
  // Array.from : tableaux du test, pas du bac à sable (sinon deepStrictEqual échoue).
  return { L: sandbox.__l, appels: () => Array.from(sandbox.__appels, a => Array.from(a).join(' ')), vider: () => { sandbox.__appels.length = 0; }, classesRacine, clock };
}

test('analyse : les formes acceptées', () => {
  const { L } = charger();
  const a = u => JSON.stringify(L.analyserLienProfond(u));
  assert.strictEqual(a('serein://respirer'), '{"route":"respirer","param":null}');
  assert.strictEqual(a('serein://seance/s1'), '{"route":"seance","param":"s1"}');
  assert.strictEqual(a('serein:///seance/s1/'), '{"route":"seance","param":"s1"}');
  assert.strictEqual(a('SEREIN://Programme'), '{"route":"programme","param":null}');
  assert.strictEqual(a('serein://parcours/Premiers%20pas?source=widget'), '{"route":"parcours","param":"Premiers pas"}');
  assert.strictEqual(a('serein://'), '{"route":"accueil","param":null}');
  assert.strictEqual(a('https://sereinapp.fr/ouvrir/seance/s1'), '{"route":"seance","param":"s1"}');
  assert.strictEqual(a('https://www.sereinapp.fr/ouvrir/respirer'), '{"route":"respirer","param":null}');
  assert.strictEqual(a('https://sereinapp.fr/ouvrir'), '{"route":"accueil","param":null}');
});

test('analyse : tout le reste est refusé', () => {
  const { L } = charger();
  for (const u of ['https://exemple.com/ouvrir/respirer', 'http://sereinapp.fr/ouvrir/respirer', 'https://sereinapp.fr/pro',
    'serein://reglages', 'serein://don', 'serein://seance', 'serein://seance/%E0%A4%A', 'javascript:alert(1)', '', null, 42]) {
    assert.strictEqual(L.analyserLienProfond(u), null, String(u));
  }
});

test('exécution : chaque route ouvre le bon écran', () => {
  const { L, appels, vider } = charger();
  L.catalogue(catalogue);
  const s1 = catalogue.groups[0].sessions[0];
  L.ouvrirLienProfond('serein://respirer');
  assert.deepStrictEqual(appels(), ['ecran home', 'respirer']); vider();
  L.ouvrirLienProfond(`serein://seance/${s1.id}`);
  assert.match(appels()[1], new RegExp(`^seance ${s1.id} `)); vider();
  L.ouvrirLienProfond('serein://parcours/sommeil');              // sans majuscule
  assert.deepStrictEqual(appels(), ['ecran home', 'parcours Sommeil']); vider();
  L.ouvrirLienProfond('serein://explorer');
  assert.deepStrictEqual(appels(), ['ecran explore']); vider();
  L.ouvrirLienProfond(`serein://programme/${catalogue.programs[0].id}`);
  assert.deepStrictEqual(appels(), ['ecran home', `programme ${catalogue.programs[0].id}`]);
});

test('exécution : identifiant inconnu → rien d\'autre que l\'accueil', () => {
  const { L, appels, vider } = charger();
  L.catalogue(catalogue);
  for (const u of ['serein://seance/inexistante', 'serein://parcours/Inconnu', 'serein://programme/inconnu']) {
    vider(); L.ouvrirLienProfond(u);
    assert.deepStrictEqual(appels(), ['ecran home'], u);
  }
});

test('programme : lance le jour du jour s\'il est disponible, sinon la fiche, sinon Explorer', () => {
  const p = catalogue.programs[0];
  const sans = charger(); sans.L.catalogue(catalogue);
  sans.L.ouvrirLienProfond('serein://programme');
  assert.deepStrictEqual(sans.appels(), ['ecran home', 'ecran explore']);

  const dispo = charger({ donnees: { 'serein-program': JSON.stringify({ programId: p.id, doneCount: 1, lastDate: '2026-11-06' }) } });
  dispo.L.catalogue(catalogue);
  dispo.L.ouvrirLienProfond('serein://programme');
  assert.deepStrictEqual(dispo.appels(), ['ecran home', 'jourProgramme']);

  const fait = charger({ donnees: { 'serein-program': JSON.stringify({ programId: p.id, doneCount: 2, lastDate: '2026-11-07' }) } });
  fait.L.catalogue(catalogue);
  fait.L.ouvrirLienProfond('serein://programme');
  assert.deepStrictEqual(fait.appels(), ['ecran home', `programme ${p.id}`]);
});

test('premier lancement : le lien attend la fin de l\'onboarding', () => {
  const { L, appels, classesRacine } = charger({ onboarding: true });
  L.catalogue(catalogue);
  L.ouvrirLienProfond('serein://respirer');
  assert.deepStrictEqual(appels(), [], 'rien sous l\'onboarding');
  classesRacine.delete('needs-onboarding');
  L.executerLienEnAttente();
  assert.deepStrictEqual(appels(), ['ecran home', 'respirer']);
});

test('catalogue pas encore chargé : le lien attend', () => {
  const { L, appels } = charger();
  L.ouvrirLienProfond('serein://respirer');
  assert.deepStrictEqual(appels(), []);
  L.catalogue(catalogue);
  L.executerLienEnAttente();
  assert.deepStrictEqual(appels(), ['ecran home', 'respirer']);
});

test('player ouvert : il est fermé avant d\'ouvrir la destination ; doublon ignoré', () => {
  const { L, appels, vider, clock } = charger({ playerOuvert: true });
  L.catalogue(catalogue);
  L.ouvrirLienProfond('serein://respirer');
  assert.deepStrictEqual(appels(), ['fermerPlayer', 'ecran home', 'respirer']); vider();
  L.ouvrirLienProfond('serein://respirer');                      // getLaunchUrl + appUrlOpen
  assert.deepStrictEqual(appels(), [], 'même lien dans les 2 s : une seule fois');
  clock.tick(3000);
  L.ouvrirLienProfond('serein://respirer');
  assert.strictEqual(appels().length, 3);
});

test('surcouches ouvertes (fiche, respiration…) : toutes fermées avant la destination', () => {
  const { L, appels } = charger();
  L.catalogue(catalogue);
  L.empiler('parcours'); L.empiler('breath');
  L.ouvrirLienProfond('serein://explorer');
  assert.deepStrictEqual(appels(), ['fermer breath', 'fermer parcours', 'ecran explore']);
  assert.strictEqual(L.pile(), 0);
});

test('branchements natifs et démarrage', () => {
  const manifeste = lire('app/android/app/src/main/AndroidManifest.xml');
  const activite = manifeste.match(/<activity[\s\S]*?android:name="\.MainActivity"[\s\S]*?<\/activity>/)[0];
  assert.match(activite, /<intent-filter>(?:(?!<\/intent-filter>)[\s\S])*android\.intent\.action\.VIEW(?:(?!<\/intent-filter>)[\s\S])*BROWSABLE(?:(?!<\/intent-filter>)[\s\S])*android:scheme="serein"/);
  const plist = lire('app/ios/App/App/Info.plist');
  assert.match(plist, /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>serein<\/string>/);
  assert.match(lire('app/ios/App/App/SceneDelegate.swift'), /openURLContexts[\s\S]*SceneDelegateProxy\.shared\.scene\(scene, openURLContexts/);
  assert.match(src, /DOMContentLoaded[\s\S]*?initialiserLiensProfonds\(\);\s*executerLienEnAttente\(\)/);
  assert.match(src, /function finishOnboarding\(\) \{[\s\S]*?executerLienEnAttente\(\)/);
  // Aucune route ne touche aux données (dons, réglages, export…).
  const routeur = src.match(/function executerLien\(\{ route, param \}\) \{[\s\S]*?\n\}/)[0];
  assert.ok(!/localStorage\.setItem|setProgramState|openDon|exportData|importData|purge/.test(routeur));
});
