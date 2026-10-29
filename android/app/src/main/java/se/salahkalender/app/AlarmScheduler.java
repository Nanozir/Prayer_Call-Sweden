package se.salahkalender.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Prayer alarm clocks. The list sent by the app is kept in SharedPreferences, so
 * AlarmBootReceiver can set them again after a reboot, time change or update without the web part.
 * Uses AlarmManager.setAlarmClock: shown in the status bar and exempt from Doze.
 */
final class AlarmScheduler {
    static final String PREFS = "salah_alarms";
    static final String KEY = "list";
    static final String ACTION_FIRE = "se.salahkalender.app.ALARM_FIRE";
    static final int SNOOZE_ID = 2_000_000_050; // request code of the snooze alarm, apart from the prayer alarm ids

    private AlarmScheduler() {}

    static boolean canScheduleExact(Context ctx) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    /** Cancels everything set earlier, stores the new list and sets the future ones. */
    static void replaceAll(Context ctx, JSONArray alarms) {
        cancelAll(ctx);
        prefs(ctx).edit().putString(KEY, alarms.toString()).apply();
        scheduleStored(ctx);
    }

    static void cancelAll(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            JSONArray list = stored(ctx);
            for (int i = 0; i < list.length(); i++) {
                JSONObject a = list.optJSONObject(i);
                if (a != null) am.cancel(fireIntent(ctx, a.optInt("id"), "", ""));
            }
        }
        prefs(ctx).edit().remove(KEY).apply();
    }

    /** Sets every stored alarm that is still in the future. */
    static void scheduleStored(Context ctx) {
        long now = System.currentTimeMillis();
        JSONArray list = stored(ctx);
        for (int i = 0; i < list.length(); i++) {
            JSONObject a = list.optJSONObject(i);
            if (a == null || a.optLong("at") <= now) continue;
            set(ctx, a.optInt("id"), a.optLong("at"), a.optString("title"), a.optString("body"));
        }
    }

    static void set(Context ctx, int id, long at, String title, String body) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent fire = fireIntent(ctx, id, title, body);
        try {
            if (canScheduleExact(ctx)) {
                PendingIntent show = PendingIntent.getActivity(ctx, 0, new Intent(ctx, MainActivity.class),
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), fire);
            } else {
                // No permission to be exact: better a few minutes late than never.
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
            }
        } catch (SecurityException ignored) {
            // Permission revoked between the check and the call; the app sets them again when opened.
        }
    }

    private static PendingIntent fireIntent(Context ctx, int id, String title, String body) {
        Intent i = new Intent(ctx, AlarmReceiver.class)
            .setAction(ACTION_FIRE)
            .setData(Uri.parse("salah-alarm://" + id))
            .putExtra("id", id)
            .putExtra("title", title)
            .putExtra("body", body);
        return PendingIntent.getBroadcast(ctx, id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static JSONArray stored(Context ctx) {
        try {
            return new JSONArray(prefs(ctx).getString(KEY, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
