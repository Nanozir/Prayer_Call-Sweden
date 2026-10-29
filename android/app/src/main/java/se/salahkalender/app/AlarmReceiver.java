package se.salahkalender.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

/** An alarm went off: start the ringing service. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!AlarmScheduler.ACTION_FIRE.equals(intent.getAction())) return;
        Intent svc = new Intent(context, AlarmService.class)
            .setAction(AlarmService.ACTION_START)
            .putExtra("title", intent.getStringExtra("title"))
            .putExtra("body", intent.getStringExtra("body"));
        try {
            ContextCompat.startForegroundService(context, svc);
        } catch (Exception ignored) {
            // Not allowed to start a foreground service (should not happen for an alarm clock).
        }
    }
}
