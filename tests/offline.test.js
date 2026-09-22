// Résolution de la voix pour le téléchargement hors ligne.
//
// Bug trouvé en test sur appareil (septembre 2026) : la voix était figée au
// RENDU de la carte de séance. Or la liste n'est rendue qu'au démarrage de
// l'app — sur une install fraîche, aucune voix n'est encore choisie, donc
// tous les boutons partaient sur la masculine. Changer ensuite pour Daïdrée
// dans les Réglages ne re-rendait rien : on téléchargeait le fichier
// masculin, la lecture cherchait le féminin, et l'écoute hors ligne échouait
// sur « Fichier audio introuvable ». La voix est désormais résolue à chaque
// action, ce que ces tests verrouillent.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSandbox } = require('./harness');

const PWA_DIR = path.join(__dirname, '..', 'app', 'pwa');

const storage = new Map();
const localStorageStub = {
  getItem: k => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k),
  clear: () => storage.clear(),
};

const { sandbox } = createSandbox({ localStorage: localStorageStub });

const SHIM = `
;globalThis.__offline = {
  offlineTargetFor: offlineTargetFor,
  offlineUrlFor: offlineUrlFor,
  resolveAudioSrc: resolveAudioSrc,
  VOICE_KEY: VOICE_KEY,
};`;

const src = fs.readFileSync(path.join(PWA_DIR, 'app.js'), 'utf8');
vm.createContext(sandbox);
vm.runInContext(src + '\n' + SHIM, sandbox, { filename: 'app.js' });

const O = sandbox.__offline;

// Faux bouton : seul `dataset` compte pour la résolution.
const boutonDeuxVoix = { dataset: { fileMasc: 'masculin.mp3', fileFem: 'feminin.mp3' } };
const boutonVoixUnique = { dataset: { fileMasc: 'masculin.mp3' } };

test('sans voix choisie, le téléchargement part sur la voix masculine', () => {
  storage.clear();
  assert.deepStrictEqual(
    { ...O.offlineTargetFor(boutonDeuxVoix) },
    { voice: 'masculine', filename: 'masculin.mp3' }
  );
});

test('avec la voix féminine choisie, le téléchargement suit cette voix', () => {
  storage.clear();
  storage.set(O.VOICE_KEY, 'feminine');
  assert.deepStrictEqual(
    { ...O.offlineTargetFor(boutonDeuxVoix) },
    { voice: 'feminine', filename: 'feminin.mp3' }
  );
});

test('une séance sans voix féminine reste sur la masculine même si Daïdrée est choisie', () => {
  storage.clear();
  storage.set(O.VOICE_KEY, 'feminine');
  assert.deepStrictEqual(
    { ...O.offlineTargetFor(boutonVoixUnique) },
    { voice: 'masculine', filename: 'masculin.mp3' }
  );
});

test('changer de voix après le rendu change la cible du même bouton', () => {
  // Le cœur du bug : le bouton n'est pas re-créé, seul le réglage change.
  storage.clear();
  const avant = O.offlineUrlFor(boutonDeuxVoix);
  storage.set(O.VOICE_KEY, 'feminine');
  const apres = O.offlineUrlFor(boutonDeuxVoix);

  assert.match(avant, /masculin\/masculin\.mp3$/, 'avant : dossier masculin');
  assert.match(apres, /feminin\/feminin\.mp3$/, 'après : dossier féminin, sans re-rendu');
  assert.notStrictEqual(avant, apres);
});

// L'invariant qui compte : le fichier mis en cache doit être exactement celui
// que la lecture ira chercher. C'est cette égalité qui était rompue.
for (const voixChoisie of [null, 'feminine', 'masculine']) {
  test(`URL téléchargée = URL jouée (voix réglée sur ${voixChoisie || 'aucune'})`, async () => {
    storage.clear();
    if (voixChoisie) storage.set(O.VOICE_KEY, voixChoisie);

    const { voice, filename } = O.offlineTargetFor(boutonDeuxVoix);
    const urlLecture = await O.resolveAudioSrc(voice, filename);

    assert.strictEqual(O.offlineUrlFor(boutonDeuxVoix), urlLecture,
      'le téléchargement et la lecture doivent viser le même fichier');
  });
}
