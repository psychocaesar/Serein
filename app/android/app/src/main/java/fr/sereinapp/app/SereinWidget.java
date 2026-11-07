package fr.sereinapp.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Widget d'écran d'accueil : le jour du programme en cours (ou la séance du
 * jour), et un bouton Respirer. Chaque toucher ouvre un lien serein://, routé
 * par ouvrirLienProfond() dans app.js.
 *
 * Données : l'état publié par l'app (publierEtatWidget) dans Capacitor
 * Preferences, c'est-à-dire les SharedPreferences « CapacitorStorage ».
 * Rafraîchi quand l'app passe en arrière-plan (MainActivity.onStop) et toutes
 * les 30 minutes (changement de jour). Rien ne quitte l'appareil.
 */
public class SereinWidget extends AppWidgetProvider {

    private static final String PREFERENCES = "CapacitorStorage";
    private static final String CLE = "serein-widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, construire(context));
        }
    }

    /** Appelé quand l'app passe en arrière-plan : le widget suit tout de suite. */
    static void rafraichir(Context context) {
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, SereinWidget.class));
            if (ids == null || ids.length == 0) return;
            RemoteViews vue = construire(context);
            for (int id : ids) manager.updateAppWidget(id, vue);
        } catch (Exception ignored) {
            // Un widget qui ne se met pas à jour ne doit jamais faire planter l'app.
        }
    }

    static RemoteViews construire(Context context) {
        WidgetContenu c = lireContenu(context);
        RemoteViews vue = new RemoteViews(context.getPackageName(), R.layout.widget_serein);
        vue.setTextViewText(R.id.widget_surtitre, c.surtitre);
        vue.setTextViewText(R.id.widget_titre, c.titre);
        vue.setTextViewText(R.id.widget_detail, c.detail);
        vue.setViewVisibility(R.id.widget_detail, c.detail.isEmpty() ? View.GONE : View.VISIBLE);
        vue.setImageViewResource(R.id.widget_icone, c.faitAujourdhui ? R.drawable.widget_fait : R.drawable.widget_lecture);
        vue.setContentDescription(R.id.widget_principal, c.description);
        vue.setOnClickPendingIntent(R.id.widget_principal, lien(context, c.lien, 1));
        vue.setOnClickPendingIntent(R.id.widget_respirer, lien(context, "serein://respirer", 2));
        return vue;
    }

    private static PendingIntent lien(Context context, String url, int code) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, code, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static WidgetContenu lireContenu(Context context) {
        WidgetContenu.Programme programme = null;
        List<WidgetContenu.Seance> seances = new ArrayList<>();
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
            String brut = prefs.getString(CLE, null);
            if (brut != null) {
                JSONObject etat = new JSONObject(brut);
                JSONObject p = etat.optJSONObject("programme");
                if (p != null) {
                    programme = new WidgetContenu.Programme(
                            p.optString("nom", ""),
                            p.optInt("jour", 1),
                            p.optInt("total", 1),
                            p.optString("titre", ""),
                            p.isNull("duree") ? null : p.optInt("duree"),
                            p.isNull("derniereDate") ? null : p.optString("derniereDate", null),
                            p.optBoolean("termine", false));
                }
                JSONArray liste = etat.optJSONArray("seances");
                if (liste != null) {
                    for (int i = 0; i < liste.length(); i++) {
                        JSONObject s = liste.optJSONObject(i);
                        if (s == null || s.optString("id", "").isEmpty()) continue;
                        seances.add(new WidgetContenu.Seance(s.optString("id"), s.optString("t", ""),
                                s.isNull("d") ? null : s.optInt("d")));
                    }
                }
            }
        } catch (Exception ignored) {
            // État illisible : contenu par défaut (« Prendre un moment »).
        }
        String aujourdhui = new SimpleDateFormat("yyyy-MM-dd", Locale.FRANCE).format(new Date());
        long jourEpoch = Math.floorDiv(System.currentTimeMillis(), 86400000L);
        return WidgetContenu.calculer(programme, seances, aujourdhui, jourEpoch);
    }
}
