# Roadmap Serein

Statut (juin 2026) : **v1.3.0 en préparation** (mise à jour iOS 27), versionnage aligné sur les trois plateformes. Versions publiées : Google Play 1.2.1, [App Store](https://apps.apple.com/fr/app/serein-meditation-guidee/id6780955764) 1.0 — la 1.3.0 réaligne tout le monde. Disponible sur l'[App Store](https://apps.apple.com/fr/app/serein-meditation-guidee/id6780955764) et [Google Play](https://play.google.com/store/apps/details?id=fr.sereinapp.app). Landing statique en production sur [sereinapp.fr](https://sereinapp.fr).

## Court terme — stabilisation post-lancement

- [ ] Finaliser Search Console : vérification du domaine + soumission du sitemap
- [ ] Inscription Bing Webmaster Tools
- [ ] Renseigner le champ **Site web** (Play Console → Présence sur le Store → Coordonnées) et **URL marketing** (App Store Connect) vers `https://sereinapp.fr`
- [ ] Backlinks de lancement : annuaires d'apps (AlternativeTo, Product Hunt), bio Instagram/GitHub à jour
- [ ] Surveiller les premiers avis stores et y répondre
- [ ] Surveiller les crashs (Android Vitals dans Play Console, Xcode Organizer / App Store Connect pour iOS)
- [ ] Confirmer la purge du cache Cloudflare sur `sereinapp.fr` (bascule PWA → landing)

## Moyen terme — cadence de versions

- [ ] Définir un rythme de mise à jour régulier (signal de qualité pour le ranking stores, même pour des correctifs mineurs)
- [ ] Rédiger un changelog orienté utilisateur ("Nouveautés") à chaque soumission, distinct des messages de commit
- [ ] Page/contenu SEO additionnel ciblant des requêtes longues (ex. "méditation pour dormir gratuite", "exercice TCC anxiété")
- [ ] Revue d'accessibilité (VoiceOver / TalkBack) sur le parcours guide + player
- [ ] *(à compléter : idées de fonctionnalités côté catalogue/séances)*

## Veille continue — risques opérationnels

- [ ] **Keystore Android** : vérifier qu'une sauvegarde existe hors Codemagic (perte = impossible de publier des mises à jour sur la fiche existante)
- [ ] **Certificats Apple** : renouvellement annuel du certificat de distribution + provisioning profile
- [ ] Suivre les évolutions des règles Apple/Google (privacy labels, Data Safety form) si une fonctionnalité change la collecte de données
- [ ] Revue annuelle du `manifesto.md` (actuellement "à rédiger")

## Vision long terme

- Rester financé uniquement par les dons, sans SDK tiers, conformément au [README](README.md)
- Garder le catalogue (`sessions.json`) comme seule source de vérité, ouvert aux contributions
