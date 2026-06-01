package fr.sereinapp.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private boolean playbackServiceRunning = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStop() {
        super.onStop();
        startPlaybackService();
    }

    @Override
    public void onStart() {
        super.onStart();
        stopPlaybackService();
    }

    private void startPlaybackService() {
        if (playbackServiceRunning) return;
        Intent intent = new Intent(this, AudioPlaybackService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
        playbackServiceRunning = true;
    }

    private void stopPlaybackService() {
        if (!playbackServiceRunning) return;
        stopService(new Intent(this, AudioPlaybackService.class));
        playbackServiceRunning = false;
    }
}
