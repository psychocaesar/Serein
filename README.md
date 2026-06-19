# Serein

**Serein** est une application de méditation en français, conçue comme une alternative éthique, open source et respectueuse de la vie privée aux applications de méditation grand public.

L'objectif est simple : aider les personnes à respirer, dormir et se recentrer grâce à des audios guidés en français, sans publicité, sans paywall agressif et sans tracking tiers.

📱 **Télécharger** : [App Store](https://apps.apple.com/fr/app/serein-meditation-guidee/id6780955764) · [Google Play](https://play.google.com/store/apps/details?id=fr.sereinapp.app)
🌐 **Site** : [sereinapp.fr](https://sereinapp.fr) · 📄 [Politique de confidentialité](https://sereinapp.fr/privacy.html)

## Vision

Serein traite la méditation comme un **bien public numérique**.

Nous pensons qu'un produit destiné au calme, au sommeil ou à l'anxiété ne devrait pas se reposer sur l'extraction d'attention, le profilage comportemental ou une monétisation manipulatrice.

- Pas de publicité, pas de compte, pas de trackers.
- Statistiques 100 % locales (localStorage), exportables et importables depuis les Réglages.
- Polices, images et code embarqués : la seule requête réseau est le chargement des audios.
- Code AGPL-3.0, contenus audio CC BY 4.0.

## Ce que contient l'app

- **35 séances guidées** réparties en 6 parcours : Premiers pas, Calme & Stress, Sommeil, Respirer, Anxiété, Concentration — conçues par un psychologue, approche TCC, voix humaines.
- **Guide intelligent** : 2 questions pour recommander la séance adaptée au moment.
- **Lecture hors ligne** (service worker, cache audio à la demande).
- **Minuteur de méditation libre** avec sons d'ambiance.
- Rappel quotidien par notification locale, thèmes clair/sombre, deux voix (masculine/féminine).

## Structure du dépôt

```text
.
├── app/
│   ├── pwa/                  # L'application web (vanilla JS, aucun build)
│   │   ├── index.html        # Interface complète (écrans, styles)
│   │   ├── app.js            # Logique : player, catalogue, stats, guide
│   │   ├── sw.js             # Service worker (offline, cache audio + Range)
│   │   ├── manifest.json     # Manifest PWA (icônes, screenshots)
│   │   ├── privacy.html      # Politique de confidentialité
│   │   └── assets/
│   │       ├── sessions.json # ⭐ Le catalogue des séances (source de vérité)
│   │       ├── fonts/        # Polices auto-hébergées (woff2)
│   │       └── audio/        # MP3 (non versionnés — servis par le CDN)
│   ├── android/              # Wrapper Capacitor Android (plugin lecture native)
│   └── ios/                  # Wrapper Capacitor iOS
├── tests/                    # Tests Node (catalogue, versions, manifest)
├── docs/                     # Manifeste, config nginx de référence
├── .github/workflows/        # CI : npm test à chaque push/PR
└── capacitor.config.json
```

## Démarrer

### Lancer l'app en local

Aucun build, aucune dépendance front : servez `app/pwa/` avec n'importe quel serveur statique.

```bash
npx serve app/pwa
```

### Lancer les tests

```bash
npm test
```

Les tests valident le catalogue (`sessions.json`), la cohérence des versions et le manifest. Ils tournent aussi en CI sur chaque push et pull request.

### Builds natifs (Capacitor)

```bash
npm install
npx cap sync android   # puis ouvrir app/android dans Android Studio
npx cap sync ios       # puis ouvrir app/ios dans Xcode
```

La version de l'app est définie dans `package.json` et doit correspondre à `versionName` (build.gradle) et à l'écran Réglages — un test le vérifie.

## Contribuer

Les contributions sont les bienvenues, mais Serein doit rester cohérent avec sa mission : lis le [manifeste](docs/manifesto.md) et [CONTRIBUTING.md](CONTRIBUTING.md) avant une contribution importante.

**Le point d'entrée le plus simple : [`app/pwa/assets/sessions.json`](app/pwa/assets/sessions.json).** Ajouter ou corriger une séance = éditer une entrée JSON (titre, durée, fichier audio, description). L'interface se génère à partir de ce catalogue.

Autres contributions utiles, y compris non techniques :
- écriture et relecture de scripts de méditation ;
- enregistrement de voix ;
- revues d'accessibilité et de confidentialité ;
- amélioration des textes et de la documentation.

Quelques règles :
- pas de SDK tiers par défaut ;
- privilégier les motifs « local-first » ;
- expliquer l'impact d'une proposition sur la confidentialité, l'utilisabilité et la maintenance.

## Licence

- **Code** : [GNU AGPL-3.0](LICENSE) (`AGPL-3.0-or-later`). Toute modification déployée, y compris en tant que service en ligne, doit être publiée sous la même licence.
- **Contenus audio** : [Creative Commons BY 4.0](LICENSE-audio.md) (attribution requise).

## Position sur la vie privée

Serein évite : les SDK d'analyse tiers, les pixels publicitaires, les permissions inutiles, la collecte cachée et les dark patterns de consentement. Si une mesure technique devait un jour s'avérer nécessaire, elle resterait minimale, documentée et compréhensible. Détails : [privacy.html](app/pwa/privacy.html).

## Statut du projet

Projet porté par un psychologue, financé uniquement par les dons. Version actuelle : voir `package.json`. Disponible sur l'[App Store](https://apps.apple.com/fr/app/serein-meditation-guidee/id6780955764) et [Google Play](https://play.google.com/store/apps/details?id=fr.sereinapp.app) ; le site [sereinapp.fr](https://sereinapp.fr) présente l'application.

## Contact

Ouvre une [issue GitHub](https://github.com/psychocaesar/Serein/issues) ou écris à [serein@cesarbroche.fr](mailto:serein@cesarbroche.fr).

---

Copyright (C) 2026 César Broche Aguilar — [sereinapp.fr](https://sereinapp.fr)
