// Incrémente versionCode dans app/android/app/build.gradle (équivalent du build number iOS).
// À lancer une seule fois par build de release (pas à chaque build debug),
// juste avant de générer l'AAB/APK dans Android Studio.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = join(root, 'app', 'android', 'app', 'build.gradle');

const gradle = readFileSync(gradlePath, 'utf8');
const match = gradle.match(/versionCode\s+(\d+)/);
if (!match) {
  console.error('versionCode introuvable dans app/android/app/build.gradle');
  process.exit(1);
}

const oldCode = parseInt(match[1], 10);
const newCode = oldCode + 1;
const updated = gradle.replace(/versionCode\s+\d+/, `versionCode ${newCode}`);
writeFileSync(gradlePath, updated);

console.log(`versionCode : ${oldCode} → ${newCode}`);
