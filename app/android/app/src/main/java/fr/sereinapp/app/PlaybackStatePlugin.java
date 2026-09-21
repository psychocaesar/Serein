package fr.sereinapp.app;

import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pont JS → natif : app.js signale si un audio (séance, ambiance ou minuteur)
 * est en cours de lecture. Sert à n'afficher le service de premier plan
 * (notification "Lecture en cours…") que lorsqu'une lecture est réellement
 * active ET que l'app est en arrière-plan.
 */
@CapacitorPlugin(name = "PlaybackState")
public class PlaybackStatePlugin extends Plugin {

    static volatile boolean isPlaying = false;
    private static volatile boolean appBackgrounded = false;

    @PluginMethod
    public void setPlaying(PluginCall call) {
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        isPlaying = playing;

        // La lecture peut s'arrêter (fin de séance, minuterie d'extinction) ou
        // repartir (contrôles de l'écran verrouillé) alors que l'app est déjà
        // en arrière-plan : le service doit suivre ces transitions, sinon la
        // notification restait affichée jusqu'à la réouverture de l'app —
        // toute la nuit dans le cas d'un endormissement.
        Context context = getContext();
        if (context != null && appBackgrounded) {
            if (playing) {
                AudioPlaybackService.start(context);
            } else {
                AudioPlaybackService.stop(context);
            }
        }
        call.resolve();
    }

    /**
     * Appelé par MainActivity à chaque passage premier plan / arrière-plan.
     * Aucun état de service n'est mémorisé ici : start/stop sont idempotents,
     * ce qui évite le bug précédent où un drapeau porté par l'instance
     * d'Activity (détruite pendant que le service, lui, survit) laissait la
     * notification bloquée définitivement.
     */
    static void setAppBackgrounded(Context context, boolean backgrounded) {
        appBackgrounded = backgrounded;
        if (context == null) return;
        if (backgrounded) {
            if (isPlaying) AudioPlaybackService.start(context);
        } else {
            AudioPlaybackService.stop(context);
        }
    }
}
