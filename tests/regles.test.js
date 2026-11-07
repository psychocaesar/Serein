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

// Vouvoiement : « vous/votre/vos », mais aussi les verbes en -ez (« Vérifiez
// l'espace disponible » était passé inaperçu dans une alerte de app.js).
const MOTS_EN_EZ_ADMIS = new Set(['chez', 'assez', 'nez', 'rez', 'translatez']);
function vouvoiement(texte) {
  const t = texte.replace(/rendez-vous/gi, '').replace(/translateZ/g, '');
  const m = t.match(/[^.\n]{0,40}\b(vous|votre|vos)\b[^.\n]{0,20}/i)
    || [...t.matchAll(/[^.\n]{0,40}\b([a-zà-ÿ]{2,}ez)\b[^.\n]{0,20}/gi)].find(x => !MOTS_EN_EZ_ADMIS.has(x[1].toLowerCase()));
  return m ? m[0].trim() : null;
}

// Chaînes littérales de app.js qui ressemblent à du texte (au moins deux mots).
function chainesDeTexte(js) {
  const sansCommentaires = js.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...sansCommentaires.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)]
    .map(m => m[1] ?? m[2] ?? m[3])
    .filter(s => /[a-zà-ÿ]{3,} [a-zà-ÿ]/i.test(s));
}

test('le détecteur de vouvoiement attrape bien les cas fautifs', () => {
  assert.ok(vouvoiement("Vérifiez l'espace disponible."));
  assert.ok(vouvoiement('Merci pour votre don'));
  assert.strictEqual(vouvoiement("Vérifie l'espace, chez toi, assez vite. Rendez-vous demain."), null);
  assert.deepStrictEqual(chainesDeTexte("alert('Erreur. Vérifiez ceci.'); // Notez bien\nconst a = 'id';"), ['Erreur. Vérifiez ceci.']);
});

test('tutoiement partout : ni « vous » ni « votre » ni verbe en -ez dans les textes', () => {
  for (const [fichier, texte] of Object.entries(textesVisibles)) {
    const trouve = vouvoiement(texte);
    assert.ok(!trouve, `${fichier} : « ${trouve} »`);
  }
  for (const chaine of chainesDeTexte(appJs)) {
    const trouve = vouvoiement(chaine);
    assert.ok(!trouve, `app.js : « ${trouve} »`);
  }
});

test('écriture inclusive au point médian, pas de « (e) » ni de « /se »', () => {
  for (const [fichier, texte] of Object.entries(textesVisibles)) {
    const trouve = texte.match(/[a-zàâçéèêëîïôûùüÿœ]\((e|es|se)\)|\b\w+\/(se|euse)\b/i);
    assert.ok(!trouve, `${fichier} : « ${trouve && trouve[0]} » → écrire « ·e » (ex. Stressé·e)`);
  }
});

// ── Sécurité de la pratique ──

test('la FAQ informe des effets indésirables possibles et des précautions', () => {
  // Effets indésirables documentés (Farias 2020, Goldberg 2022, Britton 2021) :
  // transparence demandée par les auteurs, et risque accru en cas de trauma,
  // d'antécédents psychotiques ou bipolaires. Veille d'octobre 2026.
  const faq = indexHtml.match(/<div class="faq-item" id="faq-mal">[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(faq, 'entrée « La méditation peut-elle mal se passer ? » absente de la FAQ');
  for (const motif of [/t'arrêter/, /traumatisme/, /psychotique/, /psychologue|médecin/]) {
    assert.match(faq[0], motif, `la réponse ne mentionne plus ${motif}`);
  }
});

function faqReponse(id) {
  const m = indexHtml.match(new RegExp(`<div class="faq-item" id="${id}">[\\s\\S]*?<div class="faq-answer">([\\s\\S]*?)<\\/div>`));
  assert.ok(m, `entrée #${id} absente de la FAQ`);
  return m[1];
}

test('FAQ sommeil : la méditation n\'est pas présentée comme un moyen de s\'endormir', () => {
  // Chercher à dormir entretient l'insomnie (Espie 2006) : voir CLAUDE.md.
  const r = faqReponse('faq-lit');
  assert.doesNotMatch(r, /si c'est ton objectif|pour (mieux )?(t'endormir|dormir|trouver le sommeil)\b(?! :)/i, r);
  assert.match(r, /laisse le sommeil venir/);
});

test('FAQ confidentialité : ne prétend pas qu\'aucune donnée n\'est collectée', () => {
  // Depuis les dons, l'e-mail du donateur est collecté.
  const r = faqReponse('faq-donnees');
  assert.doesNotMatch(r, /aucune donnée/i, r);
  assert.match(r, /don/);
  assert.match(r, /e-mail/);
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

// ── Android : ressources appelées par leur nom depuis le JavaScript ──

test('Android : chaque icône de notification existe et est protégée de R8', () => {
  // Le rappel quotidien demandait « ic_notification », absente du projet :
  // Android affichait une icône de secours. Et R8 (shrinkResources) supprime
  // toute ressource qu'il ne voit appelée que par son nom depuis le JS.
  const RES = 'app/android/app/src/main/res';
  const keep = fs.existsSync(path.join(ROOT, RES, 'raw/keep.xml')) ? lire(`${RES}/raw/keep.xml`) : '';
  const icones = [...new Set([...appJs.matchAll(/smallIcon:\s*'([a-z0-9_]+)'/g)].map(m => m[1]))];
  assert.ok(icones.length > 0, 'aucune smallIcon trouvée dans app.js : règle à revoir');
  for (const nom of icones) {
    const existe = fs.readdirSync(path.join(ROOT, RES)).some(d => d.startsWith('drawable')
      && fs.readdirSync(path.join(ROOT, RES, d)).some(f => f.replace(/\.(xml|png|webp)$/, '') === nom));
    assert.ok(existe, `icône « ${nom} » absente de ${RES}/drawable*`);
    assert.match(keep, new RegExp(`@drawable/${nom}\\b`), `« ${nom} » non protégée dans ${RES}/raw/keep.xml`);
  }
});

test('Android : la notification de lecture n\'a pas le même id qu\'une notification locale', () => {
  const service = lire('app/android/app/src/main/java/fr/sereinapp/app/AudioPlaybackService.java');
  const idService = Number(service.match(/NOTIFICATION_ID\s*=\s*(\d+)/)[1]);
  const idsLocaux = [...appJs.matchAll(/\bid:\s*(\d{3,})\b/g)].map(m => Number(m[1]));
  assert.ok(idsLocaux.length > 0, 'aucun id de notification locale trouvé dans app.js : règle à revoir');
  assert.ok(!idsLocaux.includes(idService), `id ${idService} partagé entre le service de lecture et une notification locale`);
});

// La notification de lecture utilisait l'icône de l'app (R.mipmap.ic_launcher) :
// Android ne garde que la silhouette des petites icônes, d'où un carré gris.
test('Android : les petites icônes de notification natives sont des silhouettes de res/drawable', () => {
  const RES = 'app/android/app/src/main/res';
  const dossier = 'app/android/app/src/main/java/fr/sereinapp/app';
  const icones = [];
  for (const f of fs.readdirSync(path.join(ROOT, dossier)).filter(f => f.endsWith('.java'))) {
    for (const m of lire(`${dossier}/${f}`).matchAll(/setSmallIcon\(\s*([\w.]+)\s*\)/g)) icones.push([f, m[1]]);
  }
  assert.ok(icones.length > 0, 'aucun setSmallIcon trouvé dans le code natif : règle à revoir');
  for (const [f, ref] of icones) {
    const nom = (ref.match(/^R\.drawable\.(\w+)$/) || [])[1];
    assert.ok(nom, `${f} : setSmallIcon(${ref}) — utiliser une icône de res/drawable (silhouette blanche sur transparent), jamais l'icône de l'app`);
    assert.ok(fs.existsSync(path.join(ROOT, RES, `drawable/${nom}.xml`)), `${f} : res/drawable/${nom}.xml introuvable`);
    const xml = lire(`${RES}/drawable/${nom}.xml`);
    const couleurs = [...xml.matchAll(/android:(?:fill|stroke)Color="#(?:FF)?([0-9A-F]{6})"/gi)].map(m => m[1].toUpperCase());
    assert.ok(couleurs.length > 0 && couleurs.every(c => c === 'FFFFFF'), `${nom}.xml : la silhouette doit être blanche sur transparent`);
  }
});

// NotificationChannel (Android 8, API 26) appelé sans garde de version faisait
// planter l'app sur Android 7 (minSdk 24) dès la mise en arrière-plan.
function canauxSansGarde(java) {
  const signatures = [...java.matchAll(/\b(?:public|private|protected|static|void)\b[^;{}()]*\([^)]*\)\s*\{/g)].map(s => s.index);
  const fautifs = [];
  for (const m of java.matchAll(/new NotificationChannel\(/g)) {
    const debut = Math.max(0, ...signatures.filter(i => i < m.index));
    if (!/SDK_INT[\s\S]*VERSION_CODES\.O\b/.test(java.slice(debut, m.index))) fautifs.push(m.index);
  }
  return fautifs;
}

test('le détecteur de NotificationChannel sans garde attrape bien le cas fautif', () => {
  const sansGarde = 'void creer() {\n  NotificationChannel c = new NotificationChannel("a", "b", 2);\n}';
  const avecGarde = 'void creer() {\n  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;\n  NotificationChannel c = new NotificationChannel("a", "b", 2);\n}';
  assert.strictEqual(canauxSansGarde(sansGarde).length, 1);
  assert.strictEqual(canauxSansGarde(avecGarde).length, 0);
});

test('Android : NotificationChannel toujours protégé par une garde de version', () => {
  const minSdk = Number(lire('app/android/variables.gradle').match(/minSdkVersion\s*=\s*(\d+)/)[1]);
  if (minSdk >= 26) return;
  const dossier = 'app/android/app/src/main/java/fr/sereinapp/app';
  for (const f of fs.readdirSync(path.join(ROOT, dossier)).filter(f => f.endsWith('.java'))) {
    assert.strictEqual(canauxSansGarde(lire(`${dossier}/${f}`)).length, 0,
      `${f} : new NotificationChannel sans « if (Build.VERSION.SDK_INT … VERSION_CODES.O) » alors que minSdk = ${minSdk}`);
  }
});

test('aucun prototype dans app/pwa : tout ce dossier part dans les apps natives', () => {
  const protos = fs.readdirSync(path.join(ROOT, 'app/pwa')).filter(f => /prototype/i.test(f));
  assert.deepStrictEqual(protos, [], 'prototype à sortir de app/pwa (il serait embarqué dans les apps et publié)');
});

test('aucun fichier CNAME : le dépôt ne revendique pas le domaine du site', () => {
  // GitHub Pages était resté actif avec ce CNAME et republiait l'app web,
  // cassée hors de l'app native, sous www.sereinapp.fr à chaque push.
  assert.ok(!fs.existsSync(path.join(ROOT, 'CNAME')), 'CNAME à la racine : voir CLAUDE.md, GitHub Pages doit rester désactivé');
});
