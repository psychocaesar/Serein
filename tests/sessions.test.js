// Validation du catalogue de séances (assets/sessions.json).
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PWA_DIR = path.join(__dirname, '..', 'app', 'pwa');
const catalog = JSON.parse(fs.readFileSync(path.join(PWA_DIR, 'assets', 'sessions.json'), 'utf8'));

function allSessions() {
  const out = [];
  for (const group of catalog.groups) {
    const sessions = group.subgroups
      ? group.subgroups.flatMap(sub => sub.sessions)
      : group.sessions;
    for (const s of sessions) out.push({ group, session: s });
  }
  return out;
}

test('le catalogue contient des groupes et des séances', () => {
  assert.ok(Array.isArray(catalog.groups) && catalog.groups.length > 0);
  assert.ok(allSessions().length >= 30, 'au moins 30 séances attendues');
});

test('chaque séance a les champs requis', () => {
  for (const { session: s } of allSessions()) {
    assert.match(s.id, /^s\w+$/, `id invalide : ${JSON.stringify(s.id)}`);
    assert.ok(typeof s.title === 'string' && s.title.length > 0, `titre manquant pour ${s.id}`);
    assert.ok(Number.isInteger(s.duration) && s.duration > 0, `durée invalide pour ${s.id}`);
    assert.ok(typeof s.file === 'string' && s.file.endsWith('.mp3'), `fichier invalide pour ${s.id}`);
    assert.ok(s.fileFem === null || (typeof s.fileFem === 'string' && s.fileFem.endsWith('.mp3')), `fileFem invalide pour ${s.id}`);
    assert.ok(typeof s.desc === 'string' && s.desc.length >= 15 && s.desc.length <= 120, `desc manquante ou hors format pour ${s.id}`);
  }
});

test('les ids de séances sont uniques', () => {
  const ids = allSessions().map(({ session }) => session.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'ids dupliqués : ' + ids.filter((id, i) => ids.indexOf(id) !== i).join(', '));
});

test('chaque groupe a un nom et un artwork existant', () => {
  for (const group of catalog.groups) {
    assert.ok(group.name, 'groupe sans nom');
    assert.ok(group.artwork, `artwork manquant pour ${group.name}`);
    assert.ok(fs.existsSync(path.join(PWA_DIR, group.artwork)), `artwork introuvable : ${group.artwork}`);
  }
});

// Les MP3 sont gitignorés : on ne vérifie leur présence que si les dossiers existent localement.
const mascDir = path.join(PWA_DIR, 'assets', 'audio', 'masculin');
const femDir = path.join(PWA_DIR, 'assets', 'audio', 'feminin');

test('les fichiers audio référencés existent localement', { skip: !fs.existsSync(mascDir) }, () => {
  for (const { session: s } of allSessions()) {
    assert.ok(fs.existsSync(path.join(mascDir, s.file)), `MP3 masculin introuvable : ${s.file} (${s.id})`);
    if (s.fileFem) {
      assert.ok(fs.existsSync(path.join(femDir, s.fileFem)), `MP3 féminin introuvable : ${s.fileFem} (${s.id})`);
    }
  }
});

// Le guide (GUIDE_MAP) et les lancements directs dans app.js référencent
// leurs propres fichiers : on vérifie qu'aucun ne pointe dans le vide.
test('les fichiers audio référencés dans app.js existent localement', { skip: !fs.existsSync(mascDir) }, () => {
  const appJs = fs.readFileSync(path.join(PWA_DIR, 'app.js'), 'utf8');
  const ambianceDir = path.join(PWA_DIR, 'assets', 'audio', 'ambiance');
  const audioDir = path.join(PWA_DIR, 'assets', 'audio');
  const refs = new Set();
  for (const m of appJs.matchAll(/'([^'\n]+\.mp3)'|"([^"\n]+\.mp3)"/g)) refs.add(m[1] || m[2]);
  for (const file of refs) {
    if (file === 'min.mp3' || file === 'cloche.mp3' || file.startsWith('timer-')) continue; // noms construits ou racine audio
    const found = [mascDir, femDir, ambianceDir, audioDir].some(dir => fs.existsSync(path.join(dir, file)));
    assert.ok(found, `MP3 référencé dans app.js introuvable : ${file}`);
  }
});
