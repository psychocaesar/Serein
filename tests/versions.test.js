// Cohérence des versions et du manifest entre package.json, l'écran Réglages
// et le build Android. Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PWA_DIR = path.join(ROOT, 'app', 'pwa');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('la version affichée dans les Réglages correspond à package.json', () => {
  const html = fs.readFileSync(path.join(PWA_DIR, 'index.html'), 'utf8');
  const m = /<h3>Version<\/h3><\/div>\s*<span class="setting-value">([^<]+)<\/span>/.exec(html);
  assert.ok(m, 'bloc Version introuvable dans index.html');
  assert.strictEqual(m[1], pkg.version, `index.html affiche ${m[1]}, package.json dit ${pkg.version}`);
});

test('le versionName Android correspond à package.json', () => {
  const gradle = fs.readFileSync(path.join(ROOT, 'app', 'android', 'app', 'build.gradle'), 'utf8');
  const m = /versionName "([^"]+)"/.exec(gradle);
  assert.ok(m, 'versionName introuvable dans build.gradle');
  assert.strictEqual(m[1], pkg.version, `build.gradle dit ${m[1]}, package.json dit ${pkg.version}`);
});

test('le MARKETING_VERSION iOS correspond à package.json', () => {
  const pbxproj = fs.readFileSync(
    path.join(ROOT, 'app', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8');
  const versions = [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(m => m[1].trim());
  assert.ok(versions.length > 0, 'MARKETING_VERSION introuvable dans project.pbxproj');
  for (const v of versions) {
    assert.strictEqual(v, pkg.version, `project.pbxproj dit ${v}, package.json dit ${pkg.version}`);
  }
});

test('les screenshots déclarés dans le manifest existent', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PWA_DIR, 'manifest.json'), 'utf8'));
  assert.ok(Array.isArray(manifest.screenshots) && manifest.screenshots.length > 0, 'aucun screenshot déclaré');
  for (const shot of manifest.screenshots) {
    assert.ok(fs.existsSync(path.join(PWA_DIR, shot.src)), `screenshot introuvable : ${shot.src}`);
    assert.ok(shot.sizes && shot.type && shot.form_factor, `champs manquants pour ${shot.src}`);
  }
});
