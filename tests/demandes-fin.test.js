// Ce que l'app demande en fin de séance, une chose à la fois :
// - invitation au don : une seule fois, sur l'écran de fin de la séance qui
//   atteint le seuil, jamais à l'ouverture de l'app ;
// - avis sur le store : au retour à l'accueil, jamais par-dessus « Cette
//   séance était… », jamais liée à la réponse, jamais la même séance que le don.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSandbox, createFakeClock, createStub } = require('./harness');

const PWA_DIR = path.join(__dirname, '..', 'app', 'pwa');
const src = fs.readFileSync(path.join(PWA_DIR, 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(PWA_DIR, 'index.html'), 'utf8');

const SHIM = `
;donsDisponibles = () => true;
globalThis.__d = {
  afficherInvitationDon, preparerDemandeAvis, demanderAvisAuRetour,
  DON_INVITATION_SEUIL, STORE_REVIEW_SEUIL,
};`;

function charger(donnees = {}) {
  const store = new Map(Object.entries(donnees));
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
  const stub = createStub();
  const elements = {
    'complete-don': { style: { display: 'none' } },
    'complete-don-text': { textContent: '' },
  };
  const document = new Proxy(stub, {
    get: (t, p) => (p === 'getElementById' ? id => elements[id] || stub : stub[p]),
  });
  const avis = { demandes: 0 };
  const Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: { InAppReview: { requestReview: () => { avis.demandes++; return Promise.resolve(); } } },
  };
  const clock = createFakeClock(new Date(2026, 10, 7, 12).getTime());
  const { sandbox } = createSandbox({ clock, localStorage, document, Capacitor });
  vm.createContext(sandbox);
  vm.runInContext(src + '\n' + SHIM, sandbox, { filename: 'app.js' });
  return { D: sandbox.__d, store, elements, avis, clock };
}

test('invitation au don : sur l\'écran de fin, à partir du seuil, une seule fois', () => {
  const { D, store, elements } = charger();
  store.set('serein_seances_terminees', String(D.DON_INVITATION_SEUIL - 1));
  D.afficherInvitationDon();
  assert.strictEqual(elements['complete-don'].style.display, 'none', 'pas avant le seuil');

  store.set('serein_seances_terminees', String(D.DON_INVITATION_SEUIL));
  D.afficherInvitationDon();
  assert.strictEqual(elements['complete-don'].style.display, '', 'affichée au seuil');
  assert.match(elements['complete-don-text'].textContent, new RegExp(`${D.DON_INVITATION_SEUIL} séances`));
  assert.strictEqual(store.get('serein_invitation_don_vue'), 'true', 'comptée comme vue dès qu\'elle apparaît');

  store.set('serein_seances_terminees', String(D.DON_INVITATION_SEUIL + 1));
  D.afficherInvitationDon();
  assert.strictEqual(elements['complete-don'].style.display, 'none', 'jamais une deuxième fois');
});

test('invitation au don : plus rien sur l\'accueil, le bloc vit dans l\'écran de fin', () => {
  assert.ok(!/renderDonInvitation|don-invitation-block/.test(src + indexHtml), 'ancien bloc d\'accueil encore présent');
  const ecranFin = indexHtml.match(/<div class="complete-screen" id="complete-screen">[\s\S]*?<div class="complete-actions">/);
  assert.ok(ecranFin && ecranFin[0].includes('id="complete-don"'), 'l\'invitation doit être dans l\'écran de fin, avant les actions');
  assert.match(src, /showCompletionFeedback\(\);\s*\n\s*if \(currentSession[^\n]*afficherInvitationDon\(\)/, 'branchée après le retour de séance');
});

test('avis sur le store : rien sur l\'écran de fin, la fenêtre s\'ouvre au retour à l\'accueil', () => {
  const { D, store, avis, clock } = charger();
  store.set('serein-stats', JSON.stringify({ sessions: D.STORE_REVIEW_SEUIL }));
  D.preparerDemandeAvis();                 // fin de la séance
  clock.tick(10000);
  assert.strictEqual(avis.demandes, 0, 'aucune fenêtre par-dessus l\'écran de fin');
  D.demanderAvisAuRetour();                // closePlayer, séance allée au bout
  clock.tick(1000);
  assert.strictEqual(avis.demandes, 1);
  assert.strictEqual(store.get('serein-store-review-demande'), 'true');
  D.preparerDemandeAvis();
  D.demanderAvisAuRetour();
  clock.tick(1000);
  assert.strictEqual(avis.demandes, 1, 'une seule fois, jamais relancée');
});

test('avis sur le store : pas la même séance que l\'invitation au don', () => {
  const { D, store, elements, avis, clock } = charger();
  store.set('serein-stats', JSON.stringify({ sessions: 12 }));
  elements['complete-don'].style.display = '';   // invitation affichée sur cet écran de fin
  D.preparerDemandeAvis();
  D.demanderAvisAuRetour();
  clock.tick(1000);
  assert.strictEqual(avis.demandes, 0);
  assert.ok(!store.has('serein-store-review-demande'), 'reportée, pas consommée');
  elements['complete-don'].style.display = 'none'; // séance suivante
  D.preparerDemandeAvis();
  D.demanderAvisAuRetour();
  clock.tick(1000);
  assert.strictEqual(avis.demandes, 1);
});

test('avis sur le store : branchements (fin → préparation, fermeture du player → demande)', () => {
  const finDeSeance = src.match(/audio\.addEventListener\('ended', \(\) => \{[\s\S]*?\n\}\);/)[0];
  assert.ok(!/requestReview/.test(finDeSeance), 'la fenêtre ne doit pas partir de l\'écran de fin');
  assert.match(finDeSeance, /preparerDemandeAvis\(\)/);
  assert.match(src, /function closePlayer\(\) \{[\s\S]*?if \(audio\.ended\) demanderAvisAuRetour\(\)/);
  // Jamais déclenchée par la réponse au retour de séance (règle Google Play).
  const retour = src.match(/function showCompletionFeedback\(\) \{[\s\S]*?\n\}/)[0];
  assert.ok(!/demanderAvis|requestReview|preparerDemandeAvis/.test(retour));
});
