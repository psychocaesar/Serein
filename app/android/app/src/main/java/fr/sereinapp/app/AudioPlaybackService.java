package fr.sereinapp.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

public class AudioPlaybackService extends Service {

    private static final String CHANNEL_ID = "serein_playback_channel";
    private static final int NOTIFICATION_ID = 1001;

    /**
     * Démarre le service. Depuis Android 12, le système peut refuser le
     * démarrage d'un service de premier plan lancé depuis l'arrière-plan
     * (ForegroundServiceStartNotAllowedException) : on dégrade alors
     * silencieusement — la lecture continue sans service, au risque d'être
     * coupée par le système — plutôt que de laisser l'exception crasher l'app
     * depuis onStop() ou depuis un callback JS.
     */
    static void start(Context context) {
        try {
            Intent intent = new Intent(context, AudioPlaybackService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {
        }
    }

    /** Sans effet si le service ne tourne pas — pas besoin de suivre son état. */
    static void stop(Context context) {
        try {
            context.stopService(new Intent(context, AudioPlaybackService.class));
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // NOT_STICKY : rien à reprendre tout seul ici (c'est la WebView qui
        // joue, pas ce service). Avec START_STICKY, un service tué par le
        // système était relancé avec un intent nul et réaffichait la
        // notification "Lecture en cours…" alors que plus rien ne jouait.
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    private Notification buildNotification() {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Serein")
            .setContentText("Lecture en cours…")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build();
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Lecture Serein",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Indique qu'une méditation est en cours de lecture");
        channel.setShowBadge(false);
        channel.enableLights(false);
        channel.enableVibration(false);

        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }
}
