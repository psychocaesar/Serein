// Widget d'écran d'accueil : contrat entre l'app (publierEtatWidget, app.js)
// et le widget natif (SereinWidget.java + WidgetContenu.java, testé par
// ./gradlew :app:testDebugUnitTest). Si l'un change sans l'autre, le widget
// afficherait « Prendre un moment » en silence.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSandbox, createFakeClock } = require('./harness');

const ROOT = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const src = lire('app/pwa/app.js');
const catalogue = JSON.parse(lire('app/pwa/assets/sessions.json'));
const JAVA = 'app/android/app/src/main/java/fr/sereinapp/app';
const widgetJava = lire(`${JAVA}/SereinWidget.java`);

const SHIM = `
;globalThis.__w = { etatWidget, pickSuggestion, catalogue: c => { CATALOG = c; }, WIDGET_KEY };`;

function charger(donnees = {}, quand = new Date(2026, 10, 7, 12)) {
  const store = new Map(Object.entries(donnees));
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
  const { sandbox } = createSandbox({ clock: createFakeClock(quand.getTime()), localStorage });
  vm.createContext(sandbox);
  vm.runInContext(src + '\n' + SHIM, sandbox, { filename: 'app.js' });
  sandbox.__w.catalogue(catalogue);
  return { W: sandbox.__w, quand };
}

test('état publié : exactement les champs lus par SereinWidget.java', () => {
  const p = catalogue.programs[0];
  const { W } = charger({ 'serein-program': JSON.stringify({ programId: p.id, doneCount: 2, lastDate: '2026-11-06' }) });
  const etat = JSON.parse(JSON.stringify(W.etatWidget()));
  assert.deepStrictEqual(Object.keys(etat.programme).sort(), ['derniereDate', 'duree', 'jour', 'nom', 'termine', 'titre', 'total']);
  assert.strictEqual(etat.programme.jour, 3);
  assert.strictEqual(etat.programme.total, p.days.length);
  const s = catalogue.groups.flatMap(g => g.sessions || []).find(x => x.id === p.days[2].sessionId);
  assert.strictEqual(etat.programme.titre, s.title);
  assert.strictEqual(etat.programme.derniereDate, '2026-11-06');
  for (const champ of ['nom', 'jour', 'total', 'titre', 'duree', 'derniereDate', 'termine']) {
    assert.match(widgetJava, new RegExp(`"${champ}"`), `SereinWidget.java ne lit pas « ${champ} »`);
  }
  for (const champ of ['"seances"', '"id"', '"t"', '"d"', '"programme"']) assert.ok(widgetJava.includes(champ), champ);
  assert.ok(etat.seances.every(x => typeof x.id === 'string' && typeof x.t === 'string'));
});

test('même clé et même stockage des deux côtés', () => {
  const { W } = charger();
  assert.match(widgetJava, new RegExp(`CLE = "${W.WIDGET_KEY}"`));
  // Capacitor Preferences écrit dans les SharedPreferences « CapacitorStorage ».
  assert.match(widgetJava, /PREFERENCES = "CapacitorStorage"/);
  assert.match(lire('node_modules/@capacitor/preferences/android/src/main/java/com/capacitorjs/plugins/preferences/PreferencesConfiguration.java'), /DEFAULTS\.group = "CapacitorStorage"/);
});

test('séance du jour : le widget tire la même que l\'accueil', () => {
  const { W, quand } = charger({ 'serein-history': JSON.stringify([{ title: catalogue.groups[0].sessions[0].title, ts: 1 }]) });
  const etat = W.etatWidget();
  const jourEpoch = Math.floor(quand.getTime() / 86400000);       // WidgetContenu : floorMod(jourEpoch, taille)
  assert.strictEqual(etat.seances[jourEpoch % etat.seances.length].id, W.pickSuggestion().session.id);
  assert.match(widgetJava, /Math\.floorDiv\(System\.currentTimeMillis\(\), 86400000L\)/);
});

test('programme terminé ou absent', () => {
  const p = catalogue.programs[0];
  const fini = charger({ 'serein-program': JSON.stringify({ programId: p.id, doneCount: p.days.length, lastDate: '2026-11-07' }) });
  assert.strictEqual(fini.W.etatWidget().programme.termine, true);
  assert.strictEqual(charger().W.etatWidget().programme, null);
});

test('branchements : publication et rafraîchissement', () => {
  assert.match(src, /function setProgramState\([\s\S]*?publierEtatWidget\(\);\s*\n\}/, 'à chaque changement de programme');
  assert.match(src, /recordGuidePlay\(session\.title, quand\);\s*publierEtatWidget\(\)/, 'à chaque séance terminée');
  assert.match(src, /DOMContentLoaded[\s\S]*?publierEtatWidget\(\)/, 'au démarrage');
  assert.match(lire(`${JAVA}/MainActivity.java`), /onStop\(\) \{[\s\S]*?SereinWidget\.rafraichir\(this\)/);
  const manifeste = lire('app/android/app/src/main/AndroidManifest.xml');
  assert.match(manifeste, /<receiver[^>]*android:name="\.SereinWidget"[\s\S]*?APPWIDGET_UPDATE[\s\S]*?@xml\/widget_serein_info/);
  // Chaque toucher passe par un lien serein:// que le routeur connaît.
  for (const lien of widgetJava.match(/serein:\/\/[a-z]+/g).concat(lire(`${JAVA}/WidgetContenu.java`).match(/serein:\/\/[a-z]+/g))) {
    assert.match(src, new RegExp(`'${lien.slice(9)}'`), `${lien} inconnu du routeur`);
  }
});
