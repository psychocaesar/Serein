# Fastlane metadata

Centralise dans le dépôt ce qui était retapé à la main dans trois consoles
différentes (Play Console, App Store Connect, MR F-Droid) : descriptions,
notes de version, mots-clés, captures d'écran. C'est la structure standard
lue par les outils `fastlane supply` (Android) et `fastlane deliver` (iOS),
et par F-Droid directement depuis le dépôt source (`Repo:` dans
`docs/fdroid/fr.sereinapp.app.yml`) — voir la case « Fastlane metadata »
du template F-Droid "App Inclusion".

```text
fastlane/
├── metadata/
│   ├── android/fr-FR/          # lu par `fastlane supply` et par F-Droid
│   │   ├── title.txt
│   │   ├── short_description.txt   (≤ 80 car.)
│   │   ├── full_description.txt
│   │   ├── changelogs/<versionCode>.txt
│   │   └── images/
│   │       ├── icon.png
│   │       └── phoneScreenshots/1.png…5.png
│   └── fr-FR/                  # lu par `fastlane deliver` (App Store)
│       ├── name.txt                (≤ 30 car.)
│       ├── subtitle.txt            (≤ 30 car.)
│       ├── promotional_text.txt    (≤ 170 car.)
│       ├── keywords.txt            (≤ 100 car., séparés par virgules)
│       ├── description.txt
│       ├── release_notes.txt
│       ├── privacy_url.txt
│       ├── marketing_url.txt
│       └── support_url.txt
└── screenshots/fr-FR/           # captures App Store (6.9" requis, 6.1" bonus)
```

## À tenir à jour à chaque version

- **`android/fr-FR/changelogs/<versionCode>.txt`** : nouveau fichier à chaque
  release (le nom = `versionCode` de `app/android/app/build.gradle`, pas
  `versionName`).
- **`fr-FR/release_notes.txt`** : remplacer par les mêmes notes (App Store
  n'a qu'une seule version "courante", pas d'historique par versionCode).
- **`android/fr-FR/full_description.txt`** / **`fr-FR/description.txt`** :
  dupliquées volontairement (formats/limites différents entre stores), à
  garder synchronisées si le texte change.

## Pas encore fait

- **`android/fr-FR/images/featureGraphic.png`** (bannière 1024×500 Play
  Store) : pas ajoutée ici faute de version confirmée à jour parmi les
  fichiers disponibles (`E:\Serein\Assets\feature-graphic.jpg` date de
  juin, à vérifier avant de la copier).
- Pas de `Fastfile`/CI qui pousse automatiquement ces métadonnées vers les
  stores — pour l'instant c'est une source de vérité versionnée, l'upload
  reste manuel (Play Console / App Store Connect) ou via le MR F-Droid.
