// Épure de l'interface (revue UX/UI de novembre 2026). Chaque défaut relevé
// sur les captures devient ici une vérification, pour ne pas revenir :
// une seule famille d'icônes, une demande à la fois en fin de séance, la suite
// annoncée après un jour de programme, les outils sans guide à portée de
// pouce, des cartes de séance compactes, le thème clair regardé lui aussi.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSandbox, createFakeClock, createStub } = require('./harness');

const ROOT = path.join(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const indexHtml = lire('app/pwa/index.html');
const appJs = lire('app/pwa/app.js');
const catalogue = JSON.parse(lire('app/pwa/assets/sessions.json'));
const captures = lire('scripts/captures.mjs');

const css = [...indexHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const htmlVisible = indexHtml.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '');
const bloc = (debut, fin) => {
  const a = indexHtml.indexOf(debut);
  assert.ok(a >= 0, `repère introuvable dans index.html : ${debut}`);
  const b = indexHtml.indexOf(fin, a);
  assert.ok(b > a, `fin de bloc introuvable après : ${debut}`);
  return indexHtml.slice(a, b);
};

// ── Icônes ──

// ▶ et ↩ sont des signes typographiques posés devant un verbe (« ▶ Lancer »),
// pas des pictogrammes en couleur.
const EMOJI = /(?![▶↩])\p{Extended_Pictographic}/u;

test('une seule famille d\'icônes : aucun emoji dans les écrans ni dans le catalogue', () => {
  const dansHtml = htmlVisible.match(new RegExp(EMOJI.source, 'gu')) || [];
  assert.deepStrictEqual(dansHtml, [], 'index.html : utiliser une icône de la planche (<svg class="icone"><use href="#i-…"/></svg>)');
  const dansCatalogue = JSON.stringify(catalogue).match(new RegExp(EMOJI.source, 'gu')) || [];
  assert.deepStrictEqual(dansCatalogue, [], 'sessions.json : pas d\'emoji dans les libellés');
});

test('chaque icône appelée existe dans la planche', () => {
  const symboles = new Set([...indexHtml.matchAll(/<symbol id="(i-[a-z-]+)"/g)].map(m => m[1]));
  assert.ok(symboles.size > 10, 'planche d\'icônes absente de index.html');
  for (const [fichier, texte] of [['index.html', indexHtml], ['app.js', appJs]]) {
    for (const m of texte.matchAll(/<use href="#(i-[a-z-]+)"/g)) {
      assert.ok(symboles.has(m[1]), `${fichier} : icône #${m[1]} absente de la planche`);
    }
  }
});

test('retours de séance : libellés sans emoji (écran de fin et séance interrompue)', () => {
  const retours = appJs.match(/function showCompletionFeedback[\s\S]*?\n\}/)[0] + appJs.match(/function showInterruptedFeedbackToast[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(retours, EMOJI);
});

// ── Barre d'onglets ──

test('barre d\'onglets : assez opaque pour ne pas laisser lire le contenu derrière', () => {
  const nav = css.match(/\.nav\s*\{[^}]*background:\s*rgba\([^)]*,\s*([\d.]+)\)/);
  assert.ok(nav, 'fond de .nav introuvable');
  assert.ok(Number(nav[1]) >= 0.95, `opacité ${nav[1]} : les titres de cartes se lisaient sous les onglets à 0,88`);
});

// ── Écran de fin ──

const ecranFin = bloc('<div class="complete-screen" id="complete-screen">', '<!-- Réglages sheet');

test('écran de fin : une seule question, un seul bouton principal', () => {
  const sousTitre = ecranFin.match(/<p class="complete-subtitle">([\s\S]*?)<\/p>/)[1];
  assert.doesNotMatch(sousTitre, /\?/, '« Comment tu te sens ? » était suivi de réponses à une autre question (« Cette séance était… »)');
  assert.strictEqual((ecranFin.match(/class="btn-fin"/g) || []).length, 1, 'un seul bouton principal');
  assert.doesNotMatch(indexHtml, /btn-white/, 'plus de bouton blanc : le bouton principal garde le dégradé de toute l\'app');
  assert.match(css, /:has\(\.complete-screen\.visible\)\s*\.player-header-label\s*\{[^}]*visibility:\s*hidden/, '« En écoute » ne doit plus s\'afficher une fois la séance finie');
});

const SHIM = `
;donsDisponibles = () => true;
globalThis.__i = {
  afficherInvitationDon, preparerSuiteFin, texteSuiteProgramme, salutationAccueil,
  DON_INVITATION_SEUIL, DON_TYPE_DEFAUT, DON_PALIERS,
  definirCatalogue: c => { CATALOG = c; },
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
  const retour = { retire: false, remove() { this.retire = true; } };
  const elements = {
    'complete-don': { style: { display: 'none' } },
    'complete-don-text': { textContent: '' },
    'guide-feedback-wrap': retour,
    'complete-suite': { textContent: '' },
    'complete-programme': { textContent: '', hidden: true },
  };
  const document = new Proxy(stub, {
    get: (t, p) => (p === 'getElementById' ? id => elements[id] || stub : stub[p]),
  });
  const clock = createFakeClock(new Date(2026, 10, 12, 12).getTime());
  const { sandbox } = createSandbox({ clock, localStorage, document });
  vm.createContext(sandbox);
  vm.runInContext(appJs + '\n' + SHIM, sandbox, { filename: 'app.js' });
  return { I: sandbox.__i, store, elements, retour };
}

test('fin de séance : une demande à la fois, l\'invitation au don remplace le retour de séance', () => {
  const { I, store, retour } = charger();
  store.set('serein_seances_terminees', String(I.DON_INVITATION_SEUIL - 1));
  I.afficherInvitationDon();
  assert.strictEqual(retour.retire, false, 'sans invitation, « Cette séance était… » reste');

  store.set('serein_seances_terminees', String(I.DON_INVITATION_SEUIL));
  I.afficherInvitationDon();
  assert.strictEqual(retour.retire, true, 'avec l\'invitation, le retour de séance s\'efface');
});

test('fin d\'un jour de programme : le bouton principal annonce la suite', () => {
  const { I, store, elements } = charger();
  I.definirCatalogue({ groups: [], programs: [{ id: 'p', days: [{}, {}, {}] }] });

  // Séance ordinaire.
  I.preparerSuiteFin(null);
  assert.strictEqual(elements['complete-suite'].textContent, 'Terminer');
  assert.strictEqual(elements['complete-programme'].hidden, true);

  // Jour 2 (indice 1) tout juste validé : la progression est à 2.
  store.set('serein-program', JSON.stringify({ programId: 'p', doneCount: 2, lastDate: '2026-11-12' }));
  I.preparerSuiteFin({ programId: 'p', day: 1 });
  assert.strictEqual(elements['complete-suite'].textContent, 'Revenir au programme');
  assert.strictEqual(elements['complete-programme'].hidden, false);
  assert.match(elements['complete-programme'].textContent, /Jour 2 sur 3 terminé.*jour 3.*demain/);

  // Dernier jour.
  store.set('serein-program', JSON.stringify({ programId: 'p', doneCount: 3, lastDate: '2026-11-12' }));
  I.preparerSuiteFin({ programId: 'p', day: 2 });
  assert.match(elements['complete-programme'].textContent, /Programme terminé/);

  // Jour non validé (progression inchangée) : pas de fausse annonce.
  store.set('serein-program', JSON.stringify({ programId: 'p', doneCount: 1, lastDate: null }));
  I.preparerSuiteFin({ programId: 'p', day: 1 });
  assert.strictEqual(elements['complete-suite'].textContent, 'Terminer');
  assert.strictEqual(elements['complete-programme'].hidden, true);

  // Le minuteur libre remet lui aussi l'écran à neuf.
  assert.match(appJs, /Minuteur libre · [\s\S]{0,400}preparerSuiteFin\(null\)/);
  assert.match(appJs, /completeProgramDay\(\); programDayInProgress = null; \}\s*preparerSuiteFin\(jourDeProgramme\)/);
});

test('texte de suite : ni promesse ni reproche, juste où on en est', () => {
  const { I } = charger();
  assert.strictEqual(I.texteSuiteProgramme(1, 7), 'Jour 1 sur 7 terminé. Le jour 2 t\'attend demain.');
  assert.strictEqual(I.texteSuiteProgramme(7, 7), 'Programme terminé : tu as traversé les 7 jours.');
});

// ── Accueil ──

test('accueil : respiration et minuteur juste sous les humeurs, plus en bas de page', () => {
  const accueil = bloc('<section id="home"', '<!-- Overlay Respiration guidée');
  const humeurs = accueil.indexOf('class="mood-chips"');
  const outils = accueil.indexOf('class="outils-rapides"');
  const suggestion = accueil.indexOf('id="suggestion-block"');
  assert.ok(humeurs >= 0 && outils > humeurs && suggestion > outils, 'ordre attendu : humeurs, outils sans guide, séance du jour');
  const tuiles = accueil.slice(outils, suggestion);
  assert.match(tuiles, /openBreathing\(\)/);
  assert.match(tuiles, /openTimerSheet\(\)/);
  assert.strictEqual((accueil.match(/openBreathing\(\)/g) || []).length, 1, 'une seule entrée vers la respiration sur l\'accueil');
});

test('accueil : le slogan laisse la place à une salutation d\'une ligne après la première séance', () => {
  assert.match(css, /\.has-sessions \.titre-slogan,\s*html:not\(\.has-sessions\) \.titre-salut\s*\{\s*display:\s*none/);
  const { I } = charger();
  assert.strictEqual(I.salutationAccueil(8), 'Bonjour.');
  assert.strictEqual(I.salutationAccueil(15), 'Bonjour.');
  assert.strictEqual(I.salutationAccueil(21), 'Bonsoir.');
  assert.strictEqual(I.salutationAccueil(2), 'Bonsoir.');
});

test('accueil : « Ta pratique » n\'a plus l\'icône du logo', () => {
  const bouton = indexHtml.match(/<button class="pratique-btn"[\s\S]*?<\/button>/)[0];
  assert.match(bouton, /#i-calendrier/);
});

test('ta pratique : « 1 séance terminée » au singulier', () => {
  assert.match(appJs, /stat-sessions-label'\)\.innerHTML = \(s\.sessions \|\| 0\) > 1 \? 'Séances<br>terminées' : 'Séance<br>terminée'/);
  assert.match(indexHtml, /id="stat-sessions-label"/);
});

// ── Cartes de séance ──

test('cartes de séance : compactes, sans redite du parcours dans sa propre fiche, avec la coche « déjà écoutée »', () => {
  const carte = appJs.match(/function makeSessionCard[\s\S]*?\n\}/)[0];
  assert.match(carte, /options\.dansParcours \? durationLabel/, 'dans la fiche d\'un parcours, seule la durée s\'affiche');
  assert.match(carte, /session-play/, 'un rond de lecture, plus de grand bouton « Lancer »');
  assert.doesNotMatch(carte, /textContent = 'Lancer'/);
  assert.match(carte, /closest\('\.session-actions'\)/, 'favori et téléchargement ne lancent pas la séance');
  const fiche = appJs.match(/function openParcoursOverlay[\s\S]*?\n\}/)[0];
  assert.strictEqual((fiche.match(/dansParcours: true/g) || []).length, 2, 'les deux formes de fiche (avec et sans sous-groupes)');
  // La coche oubliait les cartes de la fiche parcours.
  const coches = appJs.match(/function updateSessionChecks[\s\S]*?\n\}/)[0];
  assert.match(coches, /querySelectorAll\('\.session-card'\)/);
});

// ── Lecteur, respiration ──

test('lecteur : le signalement est rangé dans les réglages, pas dans la barre du bas', () => {
  const barre = bloc('<div class="player-toolbar">', '<!-- Timer display');
  assert.doesNotMatch(barre, /openReportSheet/);
  const reglages = bloc('<div class="player-options-sheet" id="options-sheet">', '<!-- ACCUEIL -->');
  assert.match(reglages, /openReportSheet\(\)/);
});

test('lecteur : sombre dans les deux thèmes, son dégradé aussi', () => {
  // En thème clair, --gradient devient un vert foncé uni : texte foncé illisible dans le lecteur.
  assert.match(css, /\.player-screen\s*\{\s*--gradient:\s*linear-gradient/);
});

test('respiration : une seule commande pour démarrer', () => {
  assert.doesNotMatch(indexHtml + appJs, /Appuie<br>pour commencer/, 'le cercle et le bouton proposaient tous deux de commencer');
  assert.match(indexHtml, /id="breathBtn"[^>]*>▶ Commencer</);
});

// ── Don ──

test('don : le ponctuel est proposé par défaut, le mensuel reste à un toucher', () => {
  const { I } = charger();
  assert.strictEqual(I.DON_TYPE_DEFAUT, 'ponctuel', 'présélectionner l\'engagement mensuel est une incitation que Serein refuse');
  const ouverture = appJs.match(/function openDon\(\)[\s\S]*?\n\}/)[0];
  assert.match(ouverture, /donType = DON_TYPE_DEFAUT/);
  assert.match(ouverture, /donMontant = DON_PALIERS\[DON_TYPE_DEFAUT\]\[1\]/);
  assert.ok(indexHtml.indexOf('id="don-type-ponctuel"') < indexHtml.indexOf('id="don-type-mensuel"'), 'le choix par défaut est à gauche');
});

// ── Programmes ──

test('programmes : aucun titre ne promet un résultat sur le sommeil', () => {
  for (const p of catalogue.programs) {
    assert.doesNotMatch(`${p.title} ${p.subtitle || ''}`, /meilleur sommeil|mieux dormir|bien dormir|retrouver le sommeil|t'endormir|endormissement/i,
      `programme ${p.id} : chercher à dormir entretient l'insomnie, voir CLAUDE.md`);
  }
});

// ── Thème clair ──

test('thème clair : regardé par le harnais, et lisible là où le fond change', () => {
  assert.match(captures, /theme:\s*'light'/, 'scripts/captures.mjs doit capturer au moins un appareil en thème clair');
  assert.match(captures, /colorScheme:\s*app\.theme \|\| 'dark'/);
  // Titre des fiches parcours et programme : blanc sur fond crème avant correction.
  assert.match(css, /\[data-theme="light"\] \.parcours-hero-txt h1\s*\{[^}]*color:\s*var\(--color-text\)/);
  // Étiquette d'une carte toujours sombre : ne dépend pas des couleurs du thème.
  const etiquette = css.match(/\.article-hero-badge\s*\{[^}]*\}/)[0];
  assert.doesNotMatch(etiquette, /var\(--color-primary/);
});
