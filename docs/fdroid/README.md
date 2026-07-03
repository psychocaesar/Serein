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

## Suivi de la soumission

1. ✅ Tag `v1.3.0` créé et poussé (commit `4d3bc17b93fd305109e4edf76cfc3387901ce1d9`).
2. ✅ Build vérifié (compile toujours après le nettoyage Gradle).
3. ✅ Merge request ouverte sur https://gitlab.com/fdroid/fdroiddata.
4. **Retour reviewer (juin 2026) : ne pas utiliser de tag ni de branche dans
   `commit:`, utiliser le hash de commit complet.** Corrigé dans
   `fr.sereinapp.app.yml` (`commit: 4d3bc17b93fd305109e4edf76cfc3387901ce1d9`
   au lieu de `commit: v1.3.0`). Si une nouvelle version est taguée plus
   tard, il faudra toujours résoudre le tag vers son hash de commit complet
   (`git rev-parse v1.3.0^{commit}`) avant de mettre à jour la recette —
   F-Droid n'accepte pas les références mutables (tag/branche) dans les
   recettes de build, seulement des commits figés.
5. **Reste à faire sur la MR GitLab** : éditer la description de la MR pour
   utiliser le template "App Inclusion" fourni par F-Droid, lire ses
   instructions et cocher les cases de la checklist qu'il contient.
6. ✅ Fastlane metadata ajoutée dans le dépôt (`fastlane/metadata/android/fr-FR/`),
   lue automatiquement par F-Droid depuis `Repo:` — la case "strongly
   recommended" du template App Inclusion peut être cochée.

## Fiche descriptive (dupliquée dans fastlane/metadata/android/fr-FR/)

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
