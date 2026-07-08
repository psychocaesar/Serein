// Retire les MP3 des assets natifs après un `cap sync`.
//
// Les fichiers audio (gitignorés, présents seulement en local pour le dev web
// et l'upload CDN) sont servis en natif via le CDN Cloudflare
// (AUDIO_BASE_URL = https://audio.sereinapp.fr) et ne sont jamais lus depuis le
// bundle. Mais `cap sync` copie tout le webDir (app/pwa) dans les projets
// natifs, MP3 compris → un AAB/IPA de ~900 Mo si on ne les retire pas.
//
// Android a AUSSI un filet côté Gradle (tâche stripBundledAudio dans
// app/android/app/build.gradle) qui garantit un AAB propre même si ce script
// n'a pas tourné. Ce script garde en plus l'arbre de travail léger et couvre
// un build iOS local (Xcode), où Codemagic ne passe pas.
import { rmSync, existsSync } from 'node:fs';

const targets = [
  'app/android/app/src/main/assets/public/assets/audio',
  'app/ios/App/App/public/assets/audio',
];

for (const dir of targets) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log('strip-native-audio: supprimé ' + dir);
  }
}
