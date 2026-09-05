// Le plugin @capacitor-community/in-app-review référence getDefaultProguardFile
// ('proguard-android.txt'), une API que l'AGP du projet (9.x) refuse désormais
// ("no longer supported since it includes -dontoptimize") — ça fait planter
// tout build Android. Correctif upstream jamais publié sur la version qu'on
// utilise ; patché ici car un edit direct dans node_modules serait écrasé au
// prochain `npm install`. Lancé automatiquement par `npm install` (postinstall).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const TARGET = 'node_modules/@capacitor-community/in-app-review/android/build.gradle';
const BROKEN = "getDefaultProguardFile('proguard-android.txt')";
const FIXED = "getDefaultProguardFile('proguard-android-optimize.txt')";

if (existsSync(TARGET)) {
  const content = readFileSync(TARGET, 'utf8');
  if (content.includes(BROKEN)) {
    writeFileSync(TARGET, content.replaceAll(BROKEN, FIXED));
    console.log('patch-in-app-review-proguard : proguard-android.txt -> proguard-android-optimize.txt');
  }
}
