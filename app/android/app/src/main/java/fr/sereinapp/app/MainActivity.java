package fr.sereinapp.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlaybackStatePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStop() {
        super.onStop();
        // Service de premier plan uniquement si une lecture est en cours,
        // sinon notification "Lecture en cours…" fantôme à chaque sortie.
        PlaybackStatePlugin.setAppBackgrounded(this, true);
    }

    @Override
    public void onStart() {
        super.onStart();
        PlaybackStatePlugin.setAppBackgrounded(this, false);
    }
}
