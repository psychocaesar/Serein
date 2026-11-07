// Séance fermée dans ses dernières secondes : si l'app est balayée ou tuée
// pendant le silence final, « ended » ne part jamais. Passé 95 % d'écoute, la
// séance est notée, puis comptée au lancement suivant, à sa date (stats,
// historique, jour de programme), et la carte « Reprendre · 20 s » disparaît.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSandbox, createFakeClock } = require('./harness');

const PWA_DIR = path.join(__dirname, '..', 'app', 'pwa');
const src = fs.readFileSync(path.join(PWA_DIR, 'app.js'), 'utf8');
const catalogue = JSON.parse(fs.readFileSync(path.join(PWA_DIR, 'assets', 'sessions.json'), 'utf8'));
const JOUR = 24 * 60 * 60 * 1000;

const SHIM = `
;globalThis.__fin = {
  lancer: (session, programDay) => { currentSession = session; finEnAttenteNotee = false; programDayInProgress = programDay || null; },
  catalogue: c => { CATALOG = c; },
  suivreFinEnAttente, oublierFinEnAttente, rattraperFinEnAttente, getStats,
};`;

// Un « lancement de l'app » : nouveau contexte, même stockage.
function lancerApp(store, quand) {
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
  const clock = createFakeClock(quand.getTime());
  const { sandbox } = createSandbox({ clock, localStorage });
  vm.createContext(sandbox);
  vm.runInContext(src + '\n' + SHIM, sandbox, { filename: 'app.js' });
  sandbox.__fin.catalogue(catalogue);
  return { F: sandbox.__fin, clock };
}

const SEANCE = { id: 's-test', title: 'Respiration consciente', parcours: 'Premiers pas', duration: '10', filename: 'x.mp3', voice: 'masculine' };

test('app fermée à 97 % : la séance est comptée au lancement suivant, à sa date', () => {
  const store = new Map([['serein-resume', JSON.stringify({ session: SEANCE, time: 560, total: 600, ts: Date.now() })]]);
  const veille = new Date(2026, 10, 6, 22, 30);
  const { F } = lancerApp(store, veille);
  F.lancer(SEANCE);
  F.suivreFinEnAttente(500, 600);                 // 83 % : rien
  assert.ok(!store.has('serein-fin-en-attente'));
  F.suivreFinEnAttente(582, 600);                 // 97 % : notée
  assert.ok(store.has('serein-fin-en-attente'));
  // … l'app est tuée ici, sans « ended » ni fermeture du player.

  const { F: F2 } = lancerApp(store, new Date(2026, 10, 7, 9, 0));
  assert.strictEqual(F2.rattraperFinEnAttente(), true);
  const stats = F2.getStats();
  assert.strictEqual(stats.sessions, 1);
  assert.strictEqual(stats.minutes, 10);
  assert.deepStrictEqual([...stats.jours], ['2026-11-06'], 'comptée le jour où elle a été faite, pas au relancement');
  const historique = JSON.parse(store.get('serein-history'));
  assert.strictEqual(historique.at(-1).title, 'Respiration consciente');
  assert.ok(!store.has('serein-fin-en-attente'), 'la note est consommée');
  assert.ok(!store.has('serein-resume'), 'plus de « Reprendre · 20 s restantes »');
  assert.strictEqual(F2.rattraperFinEnAttente(), false, 'jamais comptée deux fois');
});

test('fermeture volontaire du player ou retour en arrière : rien n\'est compté', () => {
  const store = new Map();
  const { F } = lancerApp(store, new Date(2026, 10, 6, 12));
  F.lancer(SEANCE);
  F.suivreFinEnAttente(590, 600);
  F.suivreFinEnAttente(300, 600);                 // retour à la moitié
  assert.ok(!store.has('serein-fin-en-attente'));
  F.suivreFinEnAttente(590, 600);
  F.oublierFinEnAttente();                        // closePlayer / ended
  const { F: F2 } = lancerApp(store, new Date(2026, 10, 6, 13));
  assert.strictEqual(F2.rattraperFinEnAttente(), false);
  assert.strictEqual(F2.getStats().sessions || 0, 0);
});

test('jour de programme : validé à la date de la séance, une seule fois', () => {
  const programme = catalogue.programs[0];
  const store = new Map([['serein-program', JSON.stringify({ programId: programme.id, doneCount: 2, lastDate: '2026-11-05' })]]);
  const { F } = lancerApp(store, new Date(2026, 10, 6, 21));
  F.lancer(SEANCE, { programId: programme.id, day: 2 });
  F.suivreFinEnAttente(599, 600);

  lancerApp(store, new Date(2026, 10, 7, 8)).F.rattraperFinEnAttente();
  const etat = JSON.parse(store.get('serein-program'));
  assert.strictEqual(etat.doneCount, 3);
  assert.strictEqual(etat.lastDate, '2026-11-06', 'la date de la séance : le jour suivant reste disponible dès aujourd\'hui');
});

test('une note trop ancienne (plus de 14 jours) est ignorée', () => {
  const store = new Map();
  const { F } = lancerApp(store, new Date(2026, 9, 1, 12));
  F.lancer(SEANCE);
  F.suivreFinEnAttente(599, 600);
  const { F: F2 } = lancerApp(store, new Date(2026, 9, 1, 12 + 15 * 24));
  assert.strictEqual(F2.rattraperFinEnAttente(), false);
  assert.ok(!store.has('serein-fin-en-attente'));
});

test('branchements : suivi pendant la lecture, effacement à la fin ou à la fermeture, rattrapage au lancement', () => {
  assert.match(src, /addEventListener\('timeupdate'[\s\S]*?suivreFinEnAttente\(audio\.currentTime, audio\.duration\)/);
  assert.match(src, /addEventListener\('ended', \(\) => \{\s*oublierFinEnAttente\(\)/);
  assert.match(src, /function closePlayer\(\) \{[\s\S]*?oublierFinEnAttente\(\);[\s\S]*?\n\}/);
  assert.match(src, /DOMContentLoaded[\s\S]*?await renderSessionList\(\);\s*rattraperFinEnAttente\(\)/);
});
