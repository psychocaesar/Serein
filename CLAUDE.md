# Serein — contexte projet

App de méditation guidée en français (PWA + Capacitor Android/iOS), alternative éthique/open source à Calm/Petit Bambou. Fondée et portée par César Broche Aguilar (psychologue, conçoit les séances, rédige tout le contenu) et son épouse Daïdrée (co-fondatrice, trésorière de l'association loi 1901 "Sereinapp Méditation", RNA W302023362 — et voix féminine de certains enregistrements). Ne pas présenter Daïdrée comme co-créatrice à parts égales du contenu produit.

Positionnement assumé : **pas de traduction prévue** — la niche est "LA méditation en français, par un psychologue français". Ne pas proposer d'internationalisation.

## Stack & structure

- **`app/pwa/`** : le code source réel — vanilla JS, **pas de build step** (`index.html` + `app.js` + `sw.js`). C'est la source unique servie en web ET packagée en natif.
- **`app/android/`** et **`app/ios/`** : projets Capacitor générés/gérés — `app/android/app/src/main/assets/public/` et l'équivalent iOS sont **gitignorés**, régénérés par `npx cap sync`.
- **`app/pwa/assets/sessions.json`** : catalogue des séances (source de vérité). Champs clés : `file` (voix masculine, César), `fileFem` (voix féminine, Daïdrée, `null` si pas encore enregistrée), `desc` (requis par les tests).
- **`app/pwa/assets/audio/{masculin,feminin,ambiance}/`** : MP3 **gitignorés**, jamais commités. En prod ils sont servis par un CDN externe (pas le repo, pas le device en dur) — voir `AUDIO_BASE_URL` dans `app.js`.
- **Tests** : `npm test` (`node --test tests/*.test.js`) — catalogue, navigation/overlays, cohérence des versions, guide conversationnel. À lancer avant tout commit touchant `app.js`/`index.html`/`sessions.json`.
- **`fastlane/metadata/`** : release notes App Store + Play Store, versionnées dans le repo.

## Pièges connus (ne pas redécouvrir)

- **Casse des fichiers audio** : le CDN est sensible à la casse (Linux). Toujours référencer `file`/`fileFem` dans `sessions.json` en respectant **exactement** le nom réel du fichier sur le bucket (espaces, accents, majuscules compris).
- **`aaptOptions.ignoreAssetsPattern` ne fonctionne PAS pour les AAB Android** (bug connu, seulement pour les APK). Les MP3 sont retirés via la tâche Gradle `stripBundledAudio` (`app/android/app/build.gradle`) + `scripts/strip-native-audio.mjs`. **Toujours utiliser `npm run sync:android`**, jamais `npx cap sync android` seul, sinon l'AAB regonfle à ~900 Mo.
- **Hook post-commit versionné** (`scripts/git-hooks/`, activé par `postinstall` via `scripts/setup-git-hooks.mjs`) : relance `npx cap sync android` après chaque commit pour que le natif ne parte jamais en retard sur le web. Survit aux nouveaux clones (donc au Mac aussi, après un premier `npm install`).
- **`tests/versions.test.js`** force la cohérence de version entre `package.json`, `build.gradle` (versionName), l'écran Réglages (`index.html`), `MARKETING_VERSION` iOS (pbxproj, ×2 occurrences) et `CACHE_VERSION` (`sw.js`, doit **contenir** la version). Un bump de version incomplet fait échouer les tests.
- **Android versionCode monotone** : Play Store refuse tout versionCode déjà utilisé, y compris dans une branche jamais publiée. Vérifier le max historique (`git log -p -- app/android/app/build.gradle`) avant d'en choisir un nouveau, pas juste `+1` sur la branche courante.
- **iOS ignore `HTMLMediaElement.volume`** (restriction Apple, volume matériel only) : le volume d'ambiance passe par Web Audio API (`GainNode`), voir `ensureAmbianceGraph`/`setAmbianceVolume` dans `app.js`. Le volume principal (voix) reste au bouton matériel (Web Audio se suspend en arrière-plan sur iOS, risquerait de couper la lecture écran verrouillé).
- **Offline iOS** : WKWebView + scheme `capacitor://` = pas de service worker actif en natif. `resolveAudioSrc` lit Cache Storage → blob URL pour contourner.
- **CORS/tainted audio** : `crossOrigin="anonymous"` doit être posé sur les éléments `<audio>` AVANT toute src (sinon Web Audio sort du silence sur un flux CDN cross-origin). Le SW doit répécuter l'en-tête ACAO sur ses réponses 206 synthétisées.
- **Keystore Android** (`app/android/release-key.keystore` + `keystore.properties`) : **irremplaçable**, non versionné. Sauvegardé dans Bitwarden. Nécessaire pour toute mise à jour Play Store — sans lui, plus jamais possible de publier sous la même app.

## Conventions produit

- **Ton éditorial : tutoiement partout**, sans exception.
- **Guide conversationnel sans LLM** : choix déontologique et de confidentialité assumé. Ne jamais ajouter de saisie libre ou d'appel à un modèle de langage dans le guide — c'est un arbre de questions fermé (`GUIDE_MAP` → `resolveEntry`/`resolveRec` dans `app.js`), résolu depuis `sessions.json`.
- **Invitation aux dons désactivée** (`DON_INVITATION_ACTIVE = false` dans `app.js`) en attendant la validation de l'association par **Benevity** (Apple) et **Goodstack** (Google Play). Ne pas réactiver sans confirmation explicite de César.
- **z-index des overlays** (`index.html`) : onboarding (300) > modales ouvertes depuis le player — voix/minuteur/ambiance/signalement (270) > player (260) > overlays de contenu — parcours/programme/respiration (250). Respecter cette hiérarchie pour tout nouvel overlay.

## Workflow

- **Deux machines actives** : PC Windows (historique) + MacBook Pro M4 (depuis juillet 2026, iOS en local). Une seule modifie le repo à la fois. **`git pull` en début de session, `git push` en fin de session**, systématiquement.
- **Build Android** : manuel via Android Studio (pas de CI Codemagic pour Android). `npm run release:android` = sync + strip + bump versionCode (**une fois par release**, pas à chaque build debug).
- **Build iOS** : via Codemagic (`codemagic.yaml`).
- **Hotfix isolé d'une version publiée** : partir du commit exact qui a produit le build live (vérifier versionCode/versionName dans l'historique de `build.gradle`, pas juste la branche `main` qui peut contenir du travail non publié), pas de `main` si `main` a divergé avec des features non finalisées.

## Roadmap (juillet 2026, par priorité — voir aussi commits/changelogs pour l'état d'avancement réel)

1. **Voix féminine sur toutes les séances** (contenu, César/Daïdrée enregistrent) — en cours, ~11/37 séances couvertes à ce jour.
2. **Séances longues 15-20 min** (contenu) — pas commencé.
3. **Programmes jour par jour** (code+UX) — fait (3 programmes : débuter 7j, anxiété 7j, sommeil 5j).
4. **Parcours "Travail"** (contenu, différenciation psychologue du travail) — pas commencé.
5. **Widget écran d'accueil Android** — pas commencé.
6. **Passerelles inter-apps** (Serein ↔ TCC·ACT ↔ Sommeil CBTI) — bloqué tant que les 2 autres apps ne sont pas sorties.
7. **Page "Pour les pros" + PDF patient** — fait, déployée sur sereinapp.fr/pro.

Ne pas se fier à cette liste seule pour l'état exact : croiser avec `git log --oneline -20` et les fichiers `fastlane/metadata/*/changelogs/` pour voir ce qui a réellement été livré récemment.
