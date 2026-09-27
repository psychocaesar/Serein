// Règles du harnais : chaque « piège connu » de CLAUDE.md devient une
// vérification qui bloque la mise en ligne, pour qu'une erreur ne puisse
// arriver qu'une fois. Règle de travail : aucun bug corrigé sans une
// vérification ajoutée ici (ou dans le test qui couvre la zone touchée).
// Les vérifications qui demandent le réseau vivent dans scripts/harnais.mjs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const indexHtml = lire('app/pwa/index.html');
const appJs = lire('app/pwa/app.js');
const privacy = lire('app/pwa/privacy.html');
const catalogue = lire('app/pwa/assets/sessions.json');
const gradle = lire('app/android/app/build.gradle');
const pbxproj = lire('app/ios/App/App.xcodeproj/project.pbxproj');
const infoPlist = lire('app/ios/App/App/Info.plist');

const META_IOS = 'fastlane/metadata/fr-FR';
const META_ANDROID = 'fastlane/metadata/android/fr-FR';
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)[1]);

// Textes que l'utilisateur lit : écran, catalogue, confidentialité, fiches
// des stores. Le code JS n'y est pas : ses textes sont trop mêlés au code
// pour une recherche fiable, il est couvert par les tests de chaque zone.
const textesVisibles = {
  'index.html': indexHtml.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ''),
  'sessions.json': catalogue,
  'privacy.html': privacy.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ''),
};
for (const dossier of [META_IOS, META_ANDROID, `${META_ANDROID}/changelogs`]) {
  for (const f of fs.readdirSync(path.join(ROOT, dossier))) {
    if (f.endsWith('.txt')) textesVisibles[`${dossier}/${f}`] = lire(`${dossier}/${f}`);
  }
}

// ── CSS ──

function reglesCss(html) {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return css;
}
function blocs(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selecteur: m[1].trim(), corps: m[2] }));
}
const HOVER_SOURIS = /@media\s*\(hover:\s*hover\)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;

function fixesAvecLargeurMax(css) {
  return blocs(css).filter(b => /position:\s*fixed/.test(b.corps) && /max-width/.test(b.corps)).map(b => b.selecteur);
}
function survolsQuiBougent(css) {
  return blocs(css.replace(HOVER_SOURIS, ''))
    .filter(b => /:hover/.test(b.selecteur) && /transform/.test(b.corps)).map(b => b.selecteur);
}

test('les détecteurs CSS attrapent bien les cas fautifs', () => {
  // Garde-fou du garde-fou : une règle qui ne détecte rien passerait toujours.
  assert.deepStrictEqual(fixesAvecLargeurMax('.x { position: fixed; inset: 0; max-width: 460px; }'), ['.x']);
  assert.deepStrictEqual(survolsQuiBougent('.c:hover { transform: translateY(-2px); }'), ['.c:hover']);
  assert.deepStrictEqual(survolsQuiBougent('@media (hover: hover) and (pointer: fine) { .c:hover { transform: none; } }'), []);
});

test('iPad : aucun écran plein écran à largeur fixe', () => {
  // Refus App Review (guideline 4, sept. 2026) : l'onboarding faisait 460 px
  // et laissait voir l'app de part et d'autre. Centrer un enfant à la place.
  assert.deepStrictEqual(fixesAvecLargeurMax(reglesCss(indexHtml)), []);
});

test('tactile : aucun effet de survol qui déplace un élément hors souris', () => {
  // Sur iPhone, un doigt posé déclenche :hover ; un transform à la coupure
  // des colonnes d'Explorer faisait disparaître la carte Respirer (WebKit).
  assert.deepStrictEqual(survolsQuiBougent(reglesCss(indexHtml)), [],
    'placer ces règles dans @media (hover: hover) and (pointer: fine)');
});

// ── Ton et écriture ──

test('tutoiement partout : ni « vous » ni « votre » dans les textes', () => {
  for (const [fichier, texte] of Object.entries(textesVisibles)) {
    const trouve = texte.replace(/rendez-vous/gi, '').match(/[^.\n]{0,40}\b(vous|votre|vos)\b[^.\n]{0,20}/i);
    assert.ok(!trouve, `${fichier} : « ${trouve && trouve[0].trim()} »`);
  }
});

test('écriture inclusive au point médian, pas de « (e) » ni de « /se »', () => {
  for (const [fichier, texte] of Object.entries(textesVisibles)) {
    const trouve = texte.match(/[a-zàâçéèêëîïôûùüÿœ]\((e|es|se)\)|\b\w+\/(se|euse)\b/i);
    assert.ok(!trouve, `${fichier} : « ${trouve && trouve[0]} » → écrire « ·e » (ex. Stressé·e)`);
  }
});

// ── Dons ──

test('aucune promesse de reçu fiscal ou de réduction d\'impôt', () => {
  // L'association n'est pas d'intérêt général : en promettre serait illégal.
  // Seules les phrases qui le nient sont admises.
  for (const [fichier, texte] of Object.entries(textesVisibles)) {
    for (const phrase of texte.split(/(?<=[.!?])\s+/)) {
      if (/reçu fiscal|réduction d'impôt|déductible|défiscalis/i.test(phrase)) {
        assert.match(phrase, /\b(pas|ni|aucun|aucune)\b/i, `${fichier} : « ${phrase.trim().slice(0, 120)} »`);
      }
    }
  }
});

test('les textes ne promettent pas Google Pay tant qu\'il est masqué', () => {
  const actif = /googlePayActif:\s*true/.test(appJs);
  if (actif) return;
  for (const [fichier, texte] of Object.entries(textesVisibles)) {
    if (fichier === 'sessions.json') continue;
    assert.doesNotMatch(texte, /google pay/i, `${fichier} mentionne Google Pay alors que googlePayActif est false`);
  }
});

// ── Versions et builds ──

test('iOS : build number identique aux deux endroits et relié à Info.plist', () => {
  const builds = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map(m => m[1]);
  assert.strictEqual(builds.length, 2, 'CURRENT_PROJECT_VERSION attendu deux fois dans le pbxproj');
  assert.strictEqual(builds[0], builds[1], `build numbers différents : ${builds.join(' / ')}`);
  // agvtool casse ce lien en silence (voir CLAUDE.md).
  assert.match(infoPlist, /<key>CFBundleVersion<\/key>\s*<string>\$\(CURRENT_PROJECT_VERSION\)<\/string>/);
  assert.match(infoPlist, /<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/);
});

test('Android : une note de version existe pour le versionCode courant', () => {
  const fichier = `${META_ANDROID}/changelogs/${versionCode}.txt`;
  assert.ok(fs.existsSync(path.join(ROOT, fichier)), `${fichier} manquant (renommer la note de la version en cours)`);
});

// ── Fiches des stores : limites de longueur ──

const LIMITES = {
  [`${META_IOS}/name.txt`]: 30,
  [`${META_IOS}/subtitle.txt`]: 30,
  [`${META_IOS}/keywords.txt`]: 100,
  [`${META_IOS}/promotional_text.txt`]: 170,
  [`${META_IOS}/release_notes.txt`]: 4000,
  [`${META_IOS}/description.txt`]: 4000,
  [`${META_ANDROID}/title.txt`]: 30,
  [`${META_ANDROID}/short_description.txt`]: 80,
  [`${META_ANDROID}/full_description.txt`]: 4000,
};

test('fiches des stores dans les limites de longueur', () => {
  const limites = { ...LIMITES, [`${META_ANDROID}/changelogs/${versionCode}.txt`]: 500 };
  for (const [fichier, max] of Object.entries(limites)) {
    if (!fs.existsSync(path.join(ROOT, fichier))) continue;
    const longueur = [...lire(fichier).trim()].length;
    assert.ok(longueur <= max, `${fichier} : ${longueur} caractères pour ${max} autorisés`);
  }
});
