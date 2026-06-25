# Soumission à F-Droid

## Ce qui a été vérifié / nettoyé (juin 2026)

- Aucune dépendance proprio (pas de Google Play Services, Firebase, AdMob,
  Crashlytics, analytics). Les seuls plugins Capacitor utilisés sont
  `@capacitor/haptics` et `@capacitor/local-notifications` (alarmes locales,
  pas de FCM).
- Le boilerplate Capacitor lié à Google Services (classpath
  `com.google.gms:google-services` dans `app/android/build.gradle`, et le
  bloc conditionnel `apply plugin: 'com.google.gms.google-services'` dans
  `app/android/app/build.gradle`) a été retiré : il n'était jamais appliqué
  (pas de `google-services.json` dans le repo) mais sa simple présence peut
  attirer l'attention d'un reviewer F-Droid.
- `AndroidManifest.xml` : permissions minimales, `allowBackup="false"`,
  `usesCleartextTraffic="false"`.
- Licence : AGPL-3.0-or-later (fichier `LICENSE` à la racine).
- Build reproductible : `npx cap sync android` régénère
  `app/android/app/src/main/assets/public/` depuis `app/pwa/` (ce dossier est
  gitignoré, donc il faut bien ce prebuild dans la recette F-Droid — voir
  `fr.sereinapp.app.yml`).

## Ce qui reste à faire avant de soumettre

1. **Tagger la release actuelle.** F-Droid build à partir d'un tag git, pas
   d'une branche. Le seul tag existant est `v0.3-alpha` (très ancien). Il
   faut créer et pousser un tag correspondant à la version publiée sur les
   stores, ex. `v1.3.0` (à faire pointer sur le commit qui a ce
   `versionCode`/`versionName`, pas forcément `HEAD`).
2. **Vérifier le build depuis un checkout propre** (idéalement via Android
   Studio ou la CI Codemagic existante) après le nettoyage Gradle ci-dessus —
   pas pu être vérifié localement dans cette session (JDK 17 absent de cet
   environnement, seul un JRE 8 était disponible).
3. **Créer un compte GitLab** (si pas déjà fait) pour ouvrir la merge request
   sur https://gitlab.com/fdroid/fdroiddata.
4. **Copier `fr.sereinapp.app.yml`** dans `metadata/fr.sereinapp.app.yml` de
   ce dépôt fdroiddata, ajuster `commit:`/`versionCode:`/`versionName:` si la
   version a changé entre temps.
5. **Optionnel mais recommandé** : tester la recette en local avec
   `fdroid build --verbose fr.sereinapp.app` (nécessite d'installer
   `fdroidserver`, voir https://f-droid.org/docs/Submitting_to_F-Droid_Quick_Start_Guide/).
6. Ouvrir la merge request sur fdroiddata avec le fichier YAML. Le délai de
   revue est généralement de plusieurs jours à quelques semaines.

## Fiche descriptive (à réutiliser dans la MR ou en fastlane metadata)

**Résumé court (~80 car. max) :**
Méditation guidée gratuite, sans pub ni tracking, conçue par un psychologue

**Description longue :**

Serein propose des séances de méditation guidée en français, entièrement
gratuites, sans publicité, sans compte et sans collecte de données.

L'application est conçue par un psychologue du travail spécialisé en
thérapies cognitivo-comportementales (TCC) et en thérapie d'acceptation et
d'engagement (ACT). Les séances couvrent l'anxiété, le stress, le sommeil,
la respiration, l'attention et la régulation émotionnelle.

Fonctionnalités :
* Plus de 35 séances guidées réparties en parcours thématiques
* Minuteur de méditation libre et exercice de respiration visuelle
* Guide conversationnel qui recommande une séance selon le ressenti du moment
* Écoute hors ligne (téléchargement des séances)
* Aucun compte, aucune publicité, aucun tracker
* Code source ouvert sous licence AGPL-3.0

Serein est porté par une association loi 1901 à but non lucratif.
L'application restera gratuite.

## Pourquoi pas d'Anti-Feature

L'app charge les fichiers audio depuis `audio.sereinapp.fr` (CDN propre au
projet, pas un service tiers proprio) — ce n'est pas un cas de
`NonFreeNet`. Aucun autre anti-feature (`Ads`, `Tracking`,
`NonFreeDep`, `NonFreeNet`, `NonFreeAdd`) ne s'applique à ce jour.
