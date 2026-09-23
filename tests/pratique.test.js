// « Ta pratique » : jours de pratique du mois plutôt qu'une série de jours
// d'affilée, et historique des dernières séances. Choix clinique : un jour
// manqué ne doit rien faire perdre (pas de compteur qui retombe à zéro).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSandbox, createFakeClock } = require('./harness');

const PWA_DIR = path.join(__dirname, '..', 'app', 'pwa');
const src = fs.readFileSync(path.join(PWA_DIR, 'app.js'), 'utf8');
const JOUR = 24 * 60 * 60 * 1000;

const SHIM = `
;globalThis.__pratique = {
  enregistrerPratique: enregistrerPratique,
  joursDePratiqueCeMois: joursDePratiqueCeMois,
  dernieresSeances: dernieresSeances,
  formatDureePratique: formatDureePratique,
  getStats: getStats,
  JOURS_CONSERVES: JOURS_CONSERVES,
};`;

// Un localStorage réel (Map) et une horloge virtuelle calée à midi, heure
// locale, pour ne jamais tomber à cheval sur minuit.
function charger(debut, donnees = {}) {
  const store = new Map(Object.entries(donnees));
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
  const clock = createFakeClock(debut.getTime());
  const { sandbox } = createSandbox({ clock, localStorage });
  vm.createContext(sandbox);
  vm.runInContext(src + '\n' + SHIM, sandbox, { filename: 'app.js' });
  return { P: sandbox.__pratique, clock, store };
}

test('un jour manqué ne fait rien perdre : on compte les jours du mois', () => {
  const { P, clock } = charger(new Date(2026, 8, 3, 12));
  P.enregistrerPratique(10);
  P.enregistrerPratique(5);           // 2e séance le même jour : 1 seul jour
  clock.tick(2 * JOUR);               // le 4 est manqué
  P.enregistrerPratique(10);
  clock.tick(JOUR);
  P.enregistrerPratique(10);
  assert.strictEqual(P.joursDePratiqueCeMois(), 3);
  const s = P.getStats();
  assert.strictEqual(s.sessions, 4);
  assert.strictEqual(s.minutes, 35);
  assert.strictEqual(s.streak, undefined, 'plus aucune série n\'est tenue');
});

test('le compteur repart au début de chaque mois', () => {
  const { P, clock } = charger(new Date(2026, 8, 29, 12));
  P.enregistrerPratique(10);
  clock.tick(JOUR);
  P.enregistrerPratique(10);          // 30 septembre
  clock.tick(2 * JOUR);               // 2 octobre
  P.enregistrerPratique(10);
  assert.strictEqual(P.joursDePratiqueCeMois(), 1);
});

test('les séances d\'avant cette version sont comptées grâce à l\'historique', () => {
  // Données d'une 1.3.x : une série et un historique, pas encore de s.jours.
  const debut = new Date(2026, 8, 20, 12);
  const { P } = charger(debut, {
    'serein-stats': JSON.stringify({ sessions: 3, minutes: 30, streak: 2, lastDate: '2026-09-20' }),
    'serein-history': JSON.stringify([
      { title: 'A', ts: new Date(2026, 7, 30, 12).getTime() },  // août : hors du mois
      { title: 'B', ts: new Date(2026, 8, 12, 12).getTime() },
      { title: 'C', ts: new Date(2026, 8, 19, 12).getTime() },
    ]),
  });
  assert.strictEqual(P.joursDePratiqueCeMois(), 3, '12, 19 et 20 septembre');
});

test('les jours conservés restent bornés', () => {
  const { P, clock } = charger(new Date(2026, 0, 1, 12));
  for (let i = 0; i < P.JOURS_CONSERVES + 10; i++) {
    P.enregistrerPratique(1);
    clock.tick(JOUR);
  }
  assert.strictEqual(P.getStats().jours.length, P.JOURS_CONSERVES);
});

test('dernières séances : la plus récente d\'abord, sans doublon, 10 au plus', () => {
  const historique = [];
  for (let i = 0; i < 14; i++) historique.push({ title: 'Séance ' + i, ts: 1000 + i });
  historique.push({ title: 'Séance 3', ts: 5000 }); // réécoutée : remonte en tête
  const { P } = charger(new Date(2026, 8, 20, 12), { 'serein-history': JSON.stringify(historique) });
  const titres = Array.from(P.dernieresSeances(), e => e.title);
  assert.strictEqual(titres.length, 10);
  assert.strictEqual(titres[0], 'Séance 3');
  assert.strictEqual(titres[1], 'Séance 13');
  assert.strictEqual(new Set(titres).size, 10, 'aucun doublon');
});

test('durée totale lisible', () => {
  const { P } = charger(new Date(2026, 8, 20, 12));
  assert.strictEqual(P.formatDureePratique(0), '0 min');
  assert.strictEqual(P.formatDureePratique(45), '45 min');
  assert.strictEqual(P.formatDureePratique(60), '1 h');
  assert.strictEqual(P.formatDureePratique(95), '1 h 35');
  assert.strictEqual(P.formatDureePratique(605), '10 h 05');
});
