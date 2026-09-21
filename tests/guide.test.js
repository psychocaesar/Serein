// Teste la logique du guide telle qu'elle tourne réellement dans app.js :
// on charge le fichier dans un sandbox vm avec un DOM stub, puis on appelle
// resolveEntry/resolveRec sur le vrai catalogue. Complète sessions.test.js
// (qui vérifie l'existence des ids) en validant tout le pipeline de résolution.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSandbox } = require('./harness');

const PWA_DIR = path.join(__dirname, '..', 'app', 'pwa');
const catalog = JSON.parse(fs.readFileSync(path.join(PWA_DIR, 'assets', 'sessions.json'), 'utf8'));

// localStorage doit renvoyer null (pas le stub) : app.js fait
// JSON.parse(localStorage.getItem(k) || '{}').
const storage = new Map();
const localStorageStub = {
  getItem: k => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k),
  clear: () => storage.clear(),
};

const { sandbox } = createSandbox({ localStorage: localStorageStub });

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
  recordGuidePlay: recordGuidePlay,
  getRecentHistory: getRecentHistory,
  getListenedTitles: getListenedTitles,
  getIntensityBias: getIntensityBias,
  HISTORY_KEY: HISTORY_KEY,
  FEEDBACK_KEY: FEEDBACK_KEY,
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

// ── Historique d'écoute ──
// Bug de septembre 2026 : recordGuidePlay() réécrivait dans le stockage le
// tableau déjà filtré à 15 jours par getRecentHistory(). Chaque séance
// terminée supprimait donc définitivement tout l'historique plus ancien — et
// comme il est partagé avec getListenedTitles(), les coches « déjà écoutée »
// et les compteurs de progression des parcours régressaient tout seuls.
const JOUR = 24 * 60 * 60 * 1000;

test('terminer une séance ne supprime pas l\'historique de plus de 15 jours', () => {
  storage.clear();
  storage.set(G.HISTORY_KEY, JSON.stringify([
    { title: 'Séance ancienne', ts: Date.now() - 40 * JOUR },
    { title: 'Séance récente', ts: Date.now() - 1000 },
  ]));

  G.recordGuidePlay('Nouvelle séance');

  const titres = JSON.parse(storage.get(G.HISTORY_KEY)).map(e => e.title);
  assert.deepStrictEqual(titres, ['Séance ancienne', 'Séance récente', 'Nouvelle séance'],
    'l\'entrée de 40 jours doit survivre');
  assert.ok(G.getListenedTitles().has('Séance ancienne'),
    'les coches « déjà écoutée » doivent encore voir la séance ancienne');
});

test('le guide ne considère que les 15 derniers jours, sans toucher au stockage', () => {
  storage.clear();
  storage.set(G.HISTORY_KEY, JSON.stringify([
    { title: 'Séance ancienne', ts: Date.now() - 40 * JOUR },
    { title: 'Séance récente', ts: Date.now() - 1000 },
  ]));

  // Array.from : le tableau vient du realm du sandbox vm, et deepStrictEqual
  // compare aussi les prototypes — sans ça la comparaison échoue alors que le
  // contenu est identique.
  const vus = Array.from(G.getRecentHistory().map(e => e.title));
  assert.deepStrictEqual(vus, ['Séance récente'], 'la fenêtre du guide reste à 15 jours');
  assert.strictEqual(JSON.parse(storage.get(G.HISTORY_KEY)).length, 2,
    'lire la fenêtre ne doit rien supprimer du stockage');
});

// ── Biais d'intensité ──
// Seuils resserrés (septembre 2026) : avant, 2 retours et 50 % suffisaient,
// donc un seul « trop intense » accompagné d'un « bien » basculait déjà toute
// la recommandation — trop réactif pour un signal aussi bruité.
function biaisPour(ratings) {
  storage.set(G.FEEDBACK_KEY, JSON.stringify(ratings.map(rating => ({
    mood: 'stress', duration: 'court', context: 'corps', title: 't', rating, ts: Date.now(),
  }))));
  return G.getIntensityBias('stress', 'court', 'corps');
}

test('le biais d\'intensité ne se déclenche qu\'à partir de 3 retours concordants', () => {
  storage.clear();
  assert.strictEqual(biaisPour(['intense', 'ok']), null,
    'deux retours ne suffisent plus à infléchir la recommandation');
  assert.strictEqual(biaisPour(['intense', 'ok', 'ok']), null,
    'un seul signal minoritaire ne doit rien déclencher');
  assert.strictEqual(biaisPour(['intense', 'intense', 'ok']), 'softer',
    'deux « trop intense » sur trois retours doivent adoucir');
  assert.strictEqual(biaisPour(['doux', 'doux', 'ok']), 'harder',
    'deux « trop doux » sur trois retours doivent approfondir');
});

test('des retours contradictoires à égalité ne tranchent pas', () => {
  storage.clear();
  assert.strictEqual(biaisPour(['intense', 'intense', 'doux', 'doux']), null);
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
