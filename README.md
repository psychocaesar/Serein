# Serein

**Serein** est un projet d'appliction de méditation en français conçu comme une alternative éthique, open source et respectueuse de la vie privée des applications de méditation grand public.

L’objectif est simple : aider les personnes à respirer, dormir et se recentrer grâce à des audios guidés en français, sans publicité, sans paywall agressif et sans tracking tiers.

## Vision

Serein traite la méditation comme un **bien public numérique**.

Nous pensons qu’un produit destiné au calme, au sommeil ou à l’anxiété ne devrait pas se reposer sur l’extraction d’attention, le profilage comportemental ou une monétisation manipulatrice.

Nous voulons construire une expérience de méditation qui soit :
- librement accessible ;
- open source au niveau de l’application ;
- respectueuse de la vie privée par défaut ;
- compréhensible par des utilisateurs non techniques ;
- suffisamment simple pour lancer, et utile pour faire une vraie différence.

## Principes produit

- Pas de publicité.
- Pas de vente de données personnelles.
- Pas de trackers marketing tiers.
- Pas de compte obligatoire au lancement.
- Minimisation des données par défaut.
- Langage clair dans les explications de confidentialité et sur le produit.
- Licence séparée pour le code et pour les contenus audio.
- Gouvernance progressive à mesure que de nouveaux contributeurs rejoignent.

## Périmètre du MVP

Objectif de MVP initial :
- 30 séances audio en français.
- 5 parcours guidés : débuter, stress, sommeil, respiration, gestion de l’anxiété.
- Lecture hors ligne.
- PWA installable comme premier format de publication.
- Manifeste public et politique de confidentialité simple.

## Pourquoi ce projet

Les observateurs de la vie privée ont régulièrement mis en lumière les faiblesses des applications de santé mentale et de bien-être, tandis que des autorités de protection des données, comme la CNIL, insistent sur la transparence, la minimisation des données et une information claire pour les utilisateurs dans les applications mobiles.[web:40][web:87][web:36][web:103]

Serein existe pour explorer un autre modèle : une application de méditation utile, qui gagne la confiance par sa conception.

## Structure du dépôt

Structure suggérée :

```text
.
├── app/
│   ├── pwa/
│   └── mobile/
├── content/
│   ├── scripts/
│   ├── audio/
│   └── metadata/
├── docs/
│   ├── manifesto.md
│   ├── privacy.md
│   ├── roadmap.md
│   └── editorial-guidelines.md
├── LICENSE
├── CONTRIBUTING.md
└── README.md
```

## Démarrer avec le projet

### Pour les développeurs

1. Clonez le dépôt.
2. Ouvrez le prototype PWA actuel.
3. Lisez le manifeste, les principes de confidentialité et le périmètre du MVP.
4. Choisissez un domaine de contribution : produit, code, montage audio, écriture de scripts, UX writing ou documentation.

### Pour les contributeurs non techniques

Vous pouvez aider sur :
- l’écriture de scripts ;
- l’enregistrement de voix de méditation ;
- la relecture et la correction en français ;
- des revues d’accessibilité ;
- des revues de confidentialité ;
- le contrôle de qualité éditoriale.

## Contribution

Les contributions sont les bienvenues, mais Serein doit rester cohérent avec sa mission.

Avant de proposer une contribution importante :
- lisez le manifeste ;
- vérifiez si le changement ajoute une complexité inutile ;
- évitez d’ajouter par défaut des SDK tiers ;
- privilégiez les motifs “local-first” quand c’est possible ;
- expliquez comment la proposition affecte la confidentialité, l’utilisabilité et la maintenance.

Premières contributions intéressantes :
- améliorer les textes et la documentation ;
- affiner le parcours de découverte (onboarding) ;
- ajouter des métadonnées pour les séances audio ;
- améliorer le comportement hors ligne ;
- améliorer l’accessibilité ;
- traduire les textes produits.

## Approche de licence

### Code

Recommandation par défaut : **MIT** pour une réutilisation large, ou **AGPLv3** si le projet décide plus tard que les modifications côté serveur doivent également rester ouvertes.

### Contenus audio

Les contenus audio doivent être licensed séparément de la base de code.

Options possibles :
- **CC BY 4.0** pour une large réutilisation avec attribution ;
- **CC BY-NC 4.0** si la réutilisation commerciale doit être restreinte ;
- accords personnalisés pour des contributeurs invités ou payés.

## Position sur la vie privée

Serein vise à éviter :
- les SDK d’analyse tiers ;
- les pixels publicitaires ;
- les permissions inutiles ;
- la collecte de données cachée ;
- les modèles de consentement manipulatoires (dark patterns).

Si une mesure technique devait un jour s’avérer nécessaire, elle doit rester minimale, documentée et compréhensible.

## Feuille de route

- Publication du manifeste et de la landing page.
- Lancement d’une version alpha PWA installable.
- Remplacement des audios de démonstration par des sessions originales en français.
- Recrutement de premiers utilisateurs bêta.
- Ajout de la documentation de contribution.
- Évaluation de la gouvernance et de la structure juridique à long terme.

## Statut du projet

Serein est actuellement un projet précoce, piloté par un seul fondateur, en phase d’exploration.

## Contact

Si vous souhaitez contribuer, tester le produit ou participer à la définition de la ligne éditoriale, ouvrez une issue ou commencez par la documentation.
