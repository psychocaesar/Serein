// Couche 3 du harnais : capture chaque écran de l'app en format iPhone, iPad
// et Android, vérifie automatiquement la mise en page, et produit une planche
// à parcourir d'un coup d'œil (captures/index.html, non versionné).
//   npm run captures
// iPhone et iPad passent par WebKit (le moteur de Safari et de l'app iOS),
// Android par Chromium (celui de la WebView Android).
// Vérifications bloquantes : défilement horizontal, écran plein écran qui ne
// couvre pas toute la largeur (le refus iPad de sept. 2026), erreur JavaScript.
// Prérequis, une fois par machine : npx playwright install webkit chromium
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { webkit, chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PWA = join(ROOT, 'app/pwa');
const SORTIE = join(ROOT, 'captures');

const APPAREILS = [
  { id: 'iphone', nom: 'iPhone 15', moteur: webkit, largeur: 393, hauteur: 852, dpr: 3, mobile: true },
  { id: 'ipad', nom: 'iPad Air 11"', moteur: webkit, largeur: 820, hauteur: 1180, dpr: 2, mobile: true },
  { id: 'ipad13', nom: 'iPad Pro 13"', moteur: webkit, largeur: 1024, hauteur: 1366, dpr: 2, mobile: true },
  { id: 'android', nom: 'Android (Pixel 7)', moteur: chromium, largeur: 412, hauteur: 915, dpr: 2.625, mobile: true },
];

// Chaque écran : ce qu'on exécute dans la page après chargement.
// `vierge` : premier lancement (onboarding visible).
const ECRANS = [
  { id: 'onboarding', nom: 'Premier lancement', vierge: true },
  { id: 'accueil', nom: 'Accueil', action: `showScreen('home')` },
  { id: 'explorer', nom: 'Explorer', action: `showScreen('explore')` },
  { id: 'apprendre', nom: 'Apprendre', action: `showScreen('guide')` },
  { id: 'guide', nom: 'Guide (conversation)', action: `openGuideMood('sommeil')`, attente: 3000 },
  { id: 'reglages', nom: 'Réglages', action: `showScreen('settings')` },
  { id: 'parcours', nom: 'Fiche parcours', action: `openParcoursOverlay('Premiers pas')` },
  { id: 'programme', nom: 'Programme', action: `openProgramOverlay('sommeil-5j')` },
  { id: 'lecteur', nom: 'Lecteur de séance', action: `(() => { const f = findSessionById('s1'); launchPlayer('s1', f.session.title, f.group.name, f.session.duration + ' min', f.session.file, 'masculine', f.group.artwork); })()`, attente: 1200 },
  { id: 'pratique', nom: 'Ta pratique', action: `openPratique()` },
  { id: 'respiration', nom: 'Respiration guidée', action: `openBreathing()` },
  { id: 'minuteur', nom: 'Minuteur', action: `openTimerSheet()` },
  // Le don n'existe qu'en natif : on simule le module Stripe juste le temps d'ouvrir l'écran.
  { id: 'don', nom: 'Don', action: `(() => { window.Capacitor = { isNativePlatform: () => false, Plugins: { Stripe: {} } }; openDon(); })()` },
];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };

function demarrerServeur() {
  const serveur = createServer(async (req, res) => {
    const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const fichier = normalize(join(PWA, chemin === '/' ? 'index.html' : chemin));
    if (!fichier.startsWith(PWA)) { res.writeHead(403).end(); return; }
    try {
      const contenu = await readFile(fichier);
      res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] || 'application/octet-stream' }).end(contenu);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise(ok => serveur.listen(0, '127.0.0.1', () => ok(serveur)));
}

// Contrôles de mise en page, exécutés dans la page.
const CONTROLES = `(() => {
  const pb = [];
  const L = innerWidth, H = innerHeight;
  const deborde = document.scrollingElement.scrollWidth - L;
  if (deborde > 1) pb.push('défilement horizontal de ' + deborde + ' px');
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.height < H * 0.9) continue; // feuilles du bas, barres : pas des écrans plein écran
    if (r.left > 0.5 || r.right < L - 0.5) {
      pb.push('écran plein écran trop étroit : ' + (el.id ? '#' + el.id : el.className || el.tagName) + ' (' + Math.round(r.width) + ' px sur ' + L + ')');
    }
  }
  return pb;
})()`;

export async function lancerCaptures({ silencieux = false } = {}) {
  const serveur = await demarrerServeur();
  const base = `http://127.0.0.1:${serveur.address().port}/`;
  await rm(SORTIE, { recursive: true, force: true });
  const problemes = [];
  const resultats = {};

  for (const app of APPAREILS) {
    const navigateur = await app.moteur.launch();
    await mkdir(join(SORTIE, app.id), { recursive: true });
    for (const ecran of ECRANS) {
      const contexte = await navigateur.newContext({
        viewport: { width: app.largeur, height: app.hauteur },
        deviceScaleFactor: app.dpr, isMobile: app.mobile, hasTouch: true,
        colorScheme: 'dark', serviceWorkers: 'block',
      });
      if (!ecran.vierge) {
        // Utilisateur installé : onboarding vu, quelques séances terminées
        // (fait apparaître « Ta pratique » et la progression).
        await contexte.addInitScript(() => {
          try {
            localStorage.setItem('serein-onboarding-vu', '1');
            if (!localStorage.getItem('serein-history')) {
              const j = 24 * 3600 * 1000, t = Date.now();
              localStorage.setItem('serein-history', JSON.stringify([
                { title: 'Première respiration consciente', ts: t - 2 * j },
                { title: "S'asseoir, ne rien faire", ts: t - j },
                { title: 'Cohérence cardiaque 5 minutes', ts: t - 3600 * 1000 },
              ]));
            }
          } catch (e) {}
        });
      }
      const page = await contexte.newPage();
      const erreurs = [];
      page.on('pageerror', e => erreurs.push('erreur JavaScript : ' + e.message));
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof CATALOG !== 'undefined' && CATALOG, null, { timeout: 10000 }).catch(() => {});
      if (!ecran.vierge) await page.evaluate(() => { try { enregistrerPratique(10); } catch (e) {} });
      if (ecran.action) await page.evaluate(ecran.action).catch(e => erreurs.push('action impossible : ' + e.message));
      await page.waitForTimeout(ecran.attente || 700);
      const pb = [...erreurs, ...(await page.evaluate(CONTROLES))];
      await page.screenshot({ path: join(SORTIE, app.id, ecran.id + '.png'), scale: 'css' });
      resultats[`${app.id}/${ecran.id}`] = pb;
      for (const p of pb) problemes.push(`${app.nom} · ${ecran.nom} : ${p}`);
      await contexte.close();
    }
    await navigateur.close();
  }
  serveur.close();
  await ecrirePlanche(resultats, problemes);
  if (!silencieux) console.log(`${APPAREILS.length * ECRANS.length} captures → captures/index.html`);
  return problemes;
}

async function ecrirePlanche(resultats, problemes) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let commit = '';
  try { commit = execSync('git log -1 --format="%h · %s"', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch {}
  const lignes = ECRANS.map(e => `
    <section><h2>${esc(e.nom)}</h2><div class="rangee">${APPAREILS.map(a => {
      const pb = resultats[`${a.id}/${e.id}`] || [];
      return `<figure class="${pb.length ? 'ko' : ''}"><a href="${a.id}/${e.id}.png"><img src="${a.id}/${e.id}.png" alt="${esc(e.nom)} sur ${esc(a.nom)}" style="width:${Math.round(a.largeur / 3.2)}px" loading="lazy"></a>
        <figcaption>${esc(a.nom)}${pb.map(p => `<br><b>${esc(p)}</b>`).join('')}</figcaption></figure>`;
    }).join('')}</div></section>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><title>Captures Serein</title>
<style>
  body { margin: 0; padding: 24px 16px 48px; background: #101814; color: #e8efe9; font: 14px/1.5 system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; } .meta { color: #93a89b; margin: 0 0 20px; }
  .alerte { background: #3a1d17; border: 1px solid #9a4a3a; border-radius: 10px; padding: 12px 16px; margin-bottom: 24px; }
  .ok { background: #16301f; border: 1px solid #2f6b50; border-radius: 10px; padding: 12px 16px; margin-bottom: 24px; }
  h2 { font-size: 15px; margin: 28px 0 10px; color: #93c9ac; }
  .rangee { display: flex; gap: 16px; align-items: flex-start; overflow-x: auto; padding-bottom: 8px; }
  figure { margin: 0; flex: none; } img { display: block; border-radius: 10px; border: 1px solid #2a3a31; }
  figure.ko img { outline: 3px solid #e0a292; } figcaption { color: #93a89b; font-size: 12px; margin-top: 6px; max-width: 320px; }
  figcaption b { color: #e0a292; font-weight: 600; }
</style>
<h1>Captures Serein</h1><p class="meta">${esc(commit)} · ${new Date().toLocaleString('fr-FR')}</p>
${problemes.length ? `<div class="alerte"><b>${problemes.length} problème(s) de mise en page</b><br>${problemes.map(esc).join('<br>')}</div>` : '<div class="ok">Aucun problème de mise en page détecté. Parcours quand même les écrans modifiés.</div>'}
${lignes}`;
  await writeFile(join(SORTIE, 'index.html'), html);
}

// Lancer vraiment les moteurs : executablePath() pointe vers le Chromium
// complet, alors que les captures n'utilisent que sa version sans fenêtre.
export async function navigateursInstalles() {
  try {
    for (const moteur of [webkit, chromium]) await (await moteur.launch()).close();
    return true;
  } catch { return false; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!(await navigateursInstalles())) {
    console.error('Navigateurs Playwright absents : npx playwright install webkit chromium');
    process.exit(1);
  }
  const problemes = await lancerCaptures();
  problemes.forEach(p => console.log(`  ✖ ${p}`));
  if (process.argv.includes('--ouvrir')) {
    const planche = join(SORTIE, 'index.html');
    execSync(process.platform === 'win32' ? `start "" "${planche}"` : `open "${planche}"`);
  }
  process.exit(problemes.length ? 1 : 0);
}
