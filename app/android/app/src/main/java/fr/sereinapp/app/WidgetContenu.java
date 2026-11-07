package fr.sereinapp.app;

import java.util.List;

/**
 * Ce qu'affiche le widget d'écran d'accueil, calculé sans Android (testable
 * sur la JVM : WidgetContenuTest). Les données viennent de l'app (état publié
 * par publierEtatWidget dans app.js) ; la date du jour est recalculée ici pour
 * rester juste même si l'app n'a pas été rouverte depuis la veille.
 *
 * Pas de série, pas de compteur qui culpabilise : un jour de programme déjà
 * fait affiche « La suite demain », rien de plus.
 */
final class WidgetContenu {

    static final class Programme {
        final String nom;
        final int jour;          // prochain jour à faire (1-based)
        final int total;
        final String titre;      // séance de ce prochain jour
        final Integer duree;     // minutes, peut être nul
        final String derniereDate; // AAAA-MM-JJ du dernier jour fait, peut être nul
        final boolean termine;

        Programme(String nom, int jour, int total, String titre, Integer duree, String derniereDate, boolean termine) {
            this.nom = nom; this.jour = jour; this.total = total; this.titre = titre;
            this.duree = duree; this.derniereDate = derniereDate; this.termine = termine;
        }
    }

    static final class Seance {
        final String id;
        final String titre;
        final Integer duree;

        Seance(String id, String titre, Integer duree) {
            this.id = id; this.titre = titre; this.duree = duree;
        }
    }

    final String surtitre;
    final String titre;
    final String detail;     // vide : ligne masquée
    final boolean faitAujourdhui;
    final String lien;       // serein://…
    final String description; // lue par TalkBack

    private WidgetContenu(String surtitre, String titre, String detail, boolean faitAujourdhui, String lien) {
        this.surtitre = surtitre;
        this.titre = titre;
        this.detail = detail;
        this.faitAujourdhui = faitAujourdhui;
        this.lien = lien;
        this.description = surtitre + ". " + titre + (detail.isEmpty() ? "" : ". " + detail) + ". Ouvrir Serein.";
    }

    /**
     * @param aujourdhui date locale AAAA-MM-JJ (même format que l'app)
     * @param jourEpoch  jours UTC depuis 1970 : même tirage que la séance du
     *                   jour de l'accueil (Math.floor(Date.now() / 86400000))
     */
    static WidgetContenu calculer(Programme p, List<Seance> seances, String aujourdhui, long jourEpoch) {
        if (p != null && !p.termine && p.titre != null && !p.titre.isEmpty()) {
            if (aujourdhui.equals(p.derniereDate)) {
                return new WidgetContenu("Ton programme", "La suite demain",
                        "Jour " + p.jour + "/" + p.total + " · " + p.titre, true, "serein://programme");
            }
            return new WidgetContenu("Ton programme · Jour " + p.jour + "/" + p.total, p.titre,
                    minutes(p.duree), false, "serein://programme");
        }
        if (seances != null && !seances.isEmpty()) {
            Seance s = seances.get((int) (Math.floorMod(jourEpoch, (long) seances.size())));
            return new WidgetContenu("Séance du jour", s.titre, minutes(s.duree), false, "serein://seance/" + s.id);
        }
        return new WidgetContenu("Serein", "Prendre un moment", "", false, "serein://accueil");
    }

    private static String minutes(Integer duree) {
        return duree == null || duree <= 0 ? "" : duree + " min";
    }
}
