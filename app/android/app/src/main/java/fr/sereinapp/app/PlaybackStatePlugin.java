package fr.sereinapp.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pont JS → natif : app.js signale si un audio (séance, ambiance ou minuteur)
 * est en cours de lecture. MainActivity s'en sert pour ne démarrer le service
 * de premier plan que lorsqu'une lecture est réellement active.
 */
@CapacitorPlugin(name = "PlaybackState")
public class PlaybackStatePlugin extends Plugin {

    static volatile boolean isPlaying = false;

    @PluginMethod
    public void setPlaying(PluginCall call) {
        Boolean playing = call.getBoolean("playing", false);
        isPlaying = Boolean.TRUE.equals(playing);
        call.resolve();
    }
}
