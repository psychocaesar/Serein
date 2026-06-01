package fr.sereinapp.app

import android.content.Intent
import android.os.Build
import android.os.Bundle
import com.getcapacitor.BridgeActivity

/**
 * MainActivity — Serein
 *
 * Point d'entrée Android de l'application.
 * Étend BridgeActivity (Capacitor) qui gère la WebView.
 *
 * Responsabilités ajoutées ici :
 *   - Démarrer AudioPlaybackService quand l'app passe en arrière-plan
 *     pendant une lecture (onStop)
 *   - L'arrêter quand l'app revient au premier plan (onStart)
 *
 * Note : la détection "est-ce qu'un audio est en cours ?" se fait
 * côté JS via un flag global. On expose deux méthodes appelables
 * depuis app.js via Capacitor.
 */
class MainActivity : BridgeActivity() {

    private var playbackServiceRunning = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }

    // ── Cycle de vie ─────────────────────────────────────────────────

    override fun onStop() {
        super.onStop()
        // L'app passe en arrière-plan.
        // On démarre le service pour maintenir la lecture active.
        startPlaybackService()
    }

    override fun onStart() {
        super.onStart()
        // L'app revient au premier plan.
        // Le service n'est plus nécessaire — on l'arrête pour
        // ne pas laisser de notification orpheline.
        stopPlaybackService()
    }

    // ── Contrôle du service ──────────────────────────────────────────

    private fun startPlaybackService() {
        if (playbackServiceRunning) return
        val intent = Intent(this, AudioPlaybackService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        playbackServiceRunning = true
    }

    private fun stopPlaybackService() {
        if (!playbackServiceRunning) return
        stopService(Intent(this, AudioPlaybackService::class.java))
        playbackServiceRunning = false
    }
}
