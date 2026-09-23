// Certains plugins Capacitor référencent getDefaultProguardFile
// ('proguard-android.txt'), une API que l'AGP du projet (9.x) refuse désormais
// ("no longer supported since it includes -dontoptimize") — ça fait planter
// tout build Android. Correctif upstream non publié sur les versions qu'on
// utilise ; patché ici car un edit direct dans node_modules serait écrasé au
// prochain `npm install`. Lancé automatiquement par `npm install` (postinstall).
// Ajouter à TARGETS tout nouveau plugin qui casse le build de la même façon.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const TARGETS = [
  'node_modules/@capacitor-community/in-app-review/android/build.gradle',
  'node_modules/@capacitor-community/stripe/android/build.gradle',
];
const BROKEN = "getDefaultProguardFile('proguard-android.txt')";
const FIXED = "getDefaultProguardFile('proguard-android-optimize.txt')";

for (const target of TARGETS) {
  if (!existsSync(target)) continue;
  const content = readFileSync(target, 'utf8');
  if (content.includes(BROKEN)) {
    writeFileSync(target, content.replaceAll(BROKEN, FIXED));
    console.log(`patch-plugins-proguard : ${target} → proguard-android-optimize.txt`);
  }
}
