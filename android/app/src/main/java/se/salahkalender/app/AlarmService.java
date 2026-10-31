package se.salahkalender.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.NotificationCompat;

/**
 * Rings an alarm: looping sound on the alarm stream, vibration and a full-screen notification
 * (AlarmActivity). Stops after 5 minutes, or on dismiss/snooze. Foreground type systemExempted
 * (allowed because the app holds the exact-alarm permission).
 */
public class AlarmService extends Service {
    static final String ACTION_START = "se.salahkalender.app.ALARM_START";
    static final String ACTION_DISMISS = "se.salahkalender.app.ALARM_DISMISS";
    static final String ACTION_SNOOZE = "se.salahkalender.app.ALARM_SNOOZE";
    static final String ACTION_STOPPED = "se.salahkalender.app.ALARM_STOPPED"; // broadcast to AlarmActivity
    static final String CHANNEL = "alarm";
    static final int NOTIFICATION_ID = 2_000_000_060;
    static final long MAX_RING_MS = 5 * 60_000L;
    static final long SNOOZE_MS = 5 * 60_000L;
    static volatile boolean ringing = false;
    static volatile boolean stopRequested = false; // set by AlarmActivity's buttons, so the app doesn't reopen it
    static volatile String ringingTitle = "";
    static volatile String ringingBody = "";

    private MediaPlayer player;
    private Vibrator vibrator;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = this::stopRinging;
    private String title = "";
    private String body = "";

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_SNOOZE.equals(action)) {
            if (ringing) {
                AlarmScheduler.set(this, AlarmScheduler.SNOOZE_ID, System.currentTimeMillis() + SNOOZE_MS, title, body);
            }
            stopRinging();
        } else if (ACTION_DISMISS.equals(action)) {
            stopRinging();
        } else if (ACTION_START.equals(action)) {
            title = orEmpty(intent.getStringExtra("title"));
            body = orEmpty(intent.getStringExtra("body"));
            startRinging();
        } else {
            stopRinging();
        }
        return START_NOT_STICKY;
    }

    private void startRinging() {
        createChannel();
        Notification n = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (Exception e) {
            // Without the exact-alarm permission the system refuses the service type; still show the notification.
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, n);
        }
        ringing = true;
        stopRequested = false;
        ringingTitle = title;
        ringingBody = body;
        stopPlayers();
        playSound();
        vibrate();
        showScreen();
        handler.removeCallbacks(timeout);
        handler.postDelayed(timeout, MAX_RING_MS);
    }

    /** Works when the app is visible; otherwise Android only allows the full-screen notification. */
    private void showScreen() {
        try {
            startActivity(new Intent(this, AlarmActivity.class)
                .putExtra("title", title).putExtra("body", body)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
        } catch (Exception ignored) {
            // Notification actions still work.
        }
    }

    private void stopRinging() {
        handler.removeCallbacks(timeout);
        stopPlayers();
        ringing = false;
        sendBroadcast(new Intent(ACTION_STOPPED).setPackage(getPackageName()));
        stopForeground(true);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIFICATION_ID);
        stopSelf();
    }

    private void playSound() {
        try {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
            player = MediaPlayer.create(this, R.raw.salah_adhan, attrs, AudioManager.AUDIO_SESSION_ID_GENERATE);
            if (player == null) return;
            player.setLooping(true);
            player.setWakeMode(this, android.os.PowerManager.PARTIAL_WAKE_LOCK);
            player.start();
        } catch (Exception e) {
            player = null; // vibration and notification still work
        }
    }

    @SuppressWarnings("deprecation")
    private void vibrate() {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator == null || !vibrator.hasVibrator()) return;
            long[] pattern = {0, 800, 600};
            if (Build.VERSION.SDK_INT >= 26) {
                AudioAttributes attrs = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build();
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0), attrs);
            } else {
                vibrator.vibrate(pattern, 0);
            }
        } catch (Exception ignored) {
            // Vibration is a bonus.
        }
    }

    private void stopPlayers() {
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) { /* already stopped */ }
            player.release();
            player = null;
        }
        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, AlarmActivity.class)
            .putExtra("title", title).putExtra("body", body)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_salah)
            .setContentTitle(title.isEmpty() ? "Alarm" : title)
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setDeleteIntent(servicePi(4, ACTION_DISMISS))
            .setContentIntent(openPi)
            .setFullScreenIntent(openPi, true)
            .addAction(0, "Snooza 5 min", servicePi(2, ACTION_SNOOZE))
            .addAction(0, "Stäng av", servicePi(3, ACTION_DISMISS))
            .build();
    }

    private PendingIntent servicePi(int code, String action) {
        Intent i = new Intent(this, AlarmService.class).setAction(action);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Alarm", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Alarm som ringer tills du stänger av dem");
        ch.setSound(null, null); // the service plays the sound itself, on the alarm stream
        ch.enableVibration(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(timeout);
        stopPlayers();
        ringing = false;
        super.onDestroy();
    }
}
