package fr.sereinapp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/** Logique du widget d'écran d'accueil (./gradlew :app:testDebugUnitTest). */
public class WidgetContenuTest {

    private static final List<WidgetContenu.Seance> SEANCES = Arrays.asList(
            new WidgetContenu.Seance("s1", "Première respiration consciente", 5),
            new WidgetContenu.Seance("s2", "S'asseoir, ne rien faire", 10),
            new WidgetContenu.Seance("s3", "Cohérence cardiaque", null));

    private static WidgetContenu.Programme programme(String derniereDate, boolean termine) {
        return new WidgetContenu.Programme("7 jours pour débuter", 3, 7, "Le corps comme point d'appui", 8, derniereDate, termine);
    }

    @Test
    public void jourDeProgrammeDisponible() {
        WidgetContenu c = WidgetContenu.calculer(programme("2026-11-06", false), SEANCES, "2026-11-07", 20399);
        assertEquals("Ton programme · Jour 3/7", c.surtitre);
        assertEquals("Le corps comme point d'appui", c.titre);
        assertEquals("8 min", c.detail);
        assertFalse(c.faitAujourdhui);
        assertEquals("serein://programme", c.lien);
    }

    @Test
    public void jourDejaFaitAujourdhui_laSuiteDemain_sansPression() {
        WidgetContenu c = WidgetContenu.calculer(programme("2026-11-07", false), SEANCES, "2026-11-07", 20399);
        assertEquals("La suite demain", c.titre);
        assertTrue(c.faitAujourdhui);
        assertEquals("serein://programme", c.lien);
    }

    @Test
    public void lendemain_sansRouvrirLApp_leJourRedevientDisponible() {
        WidgetContenu c = WidgetContenu.calculer(programme("2026-11-07", false), SEANCES, "2026-11-08", 20400);
        assertFalse(c.faitAujourdhui);
        assertEquals("Le corps comme point d'appui", c.titre);
    }

    @Test
    public void sansProgramme_seanceDuJour_memeTirageQueLAccueil() {
        // Accueil : pool[Math.floor(Date.now() / 86400000) % pool.length]
        WidgetContenu c = WidgetContenu.calculer(null, SEANCES, "2026-11-07", 20399);
        assertEquals(SEANCES.get((int) (20399 % 3)).titre, c.titre);
        assertEquals("Séance du jour", c.surtitre);
        assertEquals("serein://seance/" + SEANCES.get((int) (20399 % 3)).id, c.lien);
    }

    @Test
    public void programmeTermine_revientALaSeanceDuJour() {
        WidgetContenu c = WidgetContenu.calculer(programme(null, true), SEANCES, "2026-11-07", 20400);
        assertEquals("Séance du jour", c.surtitre);
    }

    @Test
    public void dureeInconnue_ligneMasquee() {
        WidgetContenu c = WidgetContenu.calculer(null, SEANCES, "2026-11-07", 2); // s3, durée nulle
        assertEquals("", c.detail);
    }

    @Test
    public void aucuneDonnee_contenuParDefaut() {
        WidgetContenu c = WidgetContenu.calculer(null, Collections.<WidgetContenu.Seance>emptyList(), "2026-11-07", 20399);
        assertEquals("Prendre un moment", c.titre);
        assertEquals("serein://accueil", c.lien);
    }

    @Test
    public void descriptionPourTalkBack() {
        WidgetContenu c = WidgetContenu.calculer(programme("2026-11-06", false), SEANCES, "2026-11-07", 20399);
        assertEquals("Ton programme · Jour 3/7. Le corps comme point d'appui. 8 min. Ouvrir Serein.", c.description);
    }
}
