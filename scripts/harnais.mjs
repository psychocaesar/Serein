// Harnais de vérification : à passer avant toute mise en ligne.
//   npm run harnais               tout (tests, règles, audio sur le CDN)
//   npm run harnais -- --sans-reseau
// Lancé automatiquement avant chaque `git push` (scripts/git-hooks/pre-push),
// par Xcode Cloud (ci_post_clone.sh : le build s'arrête s'il échoue) et par
// `npm run release:android`. Voir la section « Harnais » de CLAUDE.md.
import { spawnSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sansReseau = process.argv.includes('--sans-reseau');
const echecs = [];

function etape(titre) { console.log(`\n── ${titre} ──`); }

// 1 et 2. Tests et règles (tests/*.test.js, dont tests/regles.test.js)
etape('Tests et règles');
const tests = spawnSync(process.execPath, ['--test', 'tests/*.test.js'], { cwd: ROOT, stdio: 'inherit' });
if (tests.status !== 0) echecs.push('des tests ou des règles échouent (détail ci-dessus)');

// Chaque fichier audio référencé par l'app existe sur le CDN, casse comprise
// (le serveur est sensible à la casse : une majuscule de trop = séance muette).
async function verifierAudio() {
  const app = readFileSync(join(ROOT, 'app/pwa/app.js'), 'utf8');
  const base = app.match(/'(https:\/\/audio\.[^']+\/)'/)[1];
  const catalogue = JSON.parse(readFileSync(join(ROOT, 'app/pwa/assets/sessions.json'), 'utf8'));
  const chemins = new Set();
  const seances = catalogue.groups.flatMap(g => g.sessions || (g.subgroups || []).flatMap(s => s.sessions));
  for (const s of seances) {
    chemins.add(`masculin/${s.file}`);
    if (s.fileFem) chemins.add(`feminin/${s.fileFem}`);
  }
  // Audios hors catalogue, lus dans app.js pour ne pas dériver du code.
  for (const [, , f] of app.matchAll(/(['"])([^'"]+\.mp3)\1,\s*\n\s*'masculine'/g)) chemins.add(`masculin/${f}`);
  for (const [, f] of app.matchAll(/'([a-z-]+\.mp3)':\s*'/g)) chemins.add(`ambiance/${f}`);
  for (const [, f] of app.matchAll(/AUDIO_BASE_URL \+ ["']([a-z]+\.mp3)["']/g)) chemins.add(f);
  const html = readFileSync(join(ROOT, 'app/pwa/index.html'), 'utf8');
  for (const [, m] of html.matchAll(/startTimer\((\d+)\)/g)) chemins.add(`timer-${m}min.mp3`);

  const manquants = [];
  const liste = [...chemins];
  const encoder = c => c.split('/').map(encodeURIComponent).join('/');
  for (let i = 0; i < liste.length; i += 8) {
    await Promise.all(liste.slice(i, i + 8).map(async c => {
      try {
        const rep = await fetch(base + encoder(c), { headers: { Range: 'bytes=0-0' } });
        if (!rep.ok) manquants.push(`${c} (HTTP ${rep.status})`);
      } catch (e) {
        manquants.push(`${c} (${e.cause?.code || e.message})`);
      }
    }));
  }
  console.log(`${liste.length} fichiers audio vérifiés sur ${base}`);
  return manquants;
}

if (sansReseau) {
  etape('Audio sur le CDN : ignoré (--sans-reseau)');
} else {
  etape('Audio sur le CDN');
  const manquants = await verifierAudio();
  if (manquants.length) {
    manquants.forEach(m => console.log(`  ✖ ${m}`));
    echecs.push(`${manquants.length} fichier(s) audio introuvable(s) sur le CDN`);
  } else {
    console.log('  ✔ tous présents');
  }
}

// Avertissement (non bloquant) : pousser sur main lance Xcode Cloud. Si l'app
// a changé sans nouveau build number, le build échouera à l'envoi (numéro
// déjà utilisé). Pas bloquant : un push peut servir à synchroniser les machines.
function avertirBuildIos() {
  try {
    execSync('git rev-parse --verify --quiet origin/main', { cwd: ROOT, stdio: 'ignore' });
  } catch { return; }
  const build = ref => {
    const pbx = execSync(`git show ${ref}:app/ios/App/App.xcodeproj/project.pbxproj`, { cwd: ROOT, encoding: 'utf8' });
    return Number(pbx.match(/CURRENT_PROJECT_VERSION = (\d+);/)[1]);
  };
  const appChangee = execSync('git diff --name-only origin/main..HEAD -- app/pwa app/ios', { cwd: ROOT, encoding: 'utf8' }).trim();
  if (appChangee && build('HEAD') <= build('origin/main')) {
    etape('Attention');
    console.log(`L'app a changé mais le build iOS reste ${build('HEAD')} : Xcode Cloud échouera à l'envoi.`);
    console.log('Si ce push doit produire un build TestFlight, augmente CURRENT_PROJECT_VERSION (×2 dans le pbxproj).');
  }
}
if (!process.env.CI) avertirBuildIos();

etape('Résultat');
if (echecs.length) {
  echecs.forEach(e => console.log(`✖ ${e}`));
  console.log('\nMise en ligne bloquée : corrige avant de pousser ou de publier.');
  process.exit(1);
}
console.log('✔ Harnais passé.');
