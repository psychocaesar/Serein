// Incrémente versionCode dans app/android/app/build.gradle (équivalent du build number iOS).
// À lancer une seule fois par build de release (pas à chaque build debug),
// juste avant de générer l'AAB/APK dans Android Studio.
//
// Le Play Store refuse tout versionCode déjà utilisé, y compris publié depuis
// une branche jamais mergée dans main (ex. un hotfix isolé) — un simple +1
// sur la valeur locale peut donc retomber sur un code déjà publié ailleurs.
// On prend le max historique observé sur `git log --all` (toutes branches et
// refs distantes connues de ce clone), pas juste la valeur du fichier local.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = join(root, 'app', 'android', 'app', 'build.gradle');
const gradleRelPath = 'app/android/app/build.gradle';

function extractVersionCodes(text) {
  return [...text.matchAll(/versionCode\s+(\d+)/g)].map((m) => parseInt(m[1], 10));
}

const gradle = readFileSync(gradlePath, 'utf8');
const currentCodes = extractVersionCodes(gradle);
if (currentCodes.length === 0) {
  console.error('versionCode introuvable dans app/android/app/build.gradle');
  process.exit(1);
}
const currentCode = currentCodes[0];

let historicalMax = currentCode;
try {
  execSync('git fetch --all --quiet', { cwd: root, stdio: 'ignore' });
} catch {
  console.warn("⚠️  git fetch --all a échoué (hors ligne ?) — le max historique peut ne pas inclure les branches distantes les plus récentes.");
}
try {
  const log = execSync(`git log --all -p -- ${gradleRelPath}`, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50,
  });
  for (const code of extractVersionCodes(log)) {
    if (code > historicalMax) historicalMax = code;
  }
} catch {
  console.warn("⚠️  Impossible de lire l'historique git (toutes branches) — bump basé uniquement sur la valeur locale. Vérifie manuellement qu'aucune branche/release publiée n'a un versionCode supérieur.");
}

const newCode = historicalMax + 1;
const updated = gradle.replace(/versionCode\s+\d+/, `versionCode ${newCode}`);
writeFileSync(gradlePath, updated);

const historyNote = historicalMax > currentCode ? ` (max historique détecté : ${historicalMax}, toutes branches confondues)` : '';
console.log(`versionCode : ${currentCode} → ${newCode}${historyNote}`);
