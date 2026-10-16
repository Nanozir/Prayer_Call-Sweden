package se.salahkalender.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget: the next prayer with a live countdown. The app stores the
 * coming prayer times (SalahNativePlugin.updateWidget); the widget reads them,
 * so it works offline and without the app running. No permissions needed.
 */
public class NextPrayerWidget extends AppWidgetProvider {
    static final String PREFS = "salah_widget";
    static final String KEY = "prayers";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context, manager, ids);
    }

    /** Redraws every placed widget. */
    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, NextPrayerWidget.class));
        if (ids.length > 0) updateAll(context, manager, ids);
    }

    private static void updateAll(Context context, AppWidgetManager manager, int[] ids) {
        long now = System.currentTimeMillis();
        JSONObject next = null;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray prayers = new JSONArray(prefs.getString(KEY, "[]"));
            for (int i = 0; i < prayers.length(); i++) {
                JSONObject p = prayers.getJSONObject(i);
                if (p.getLong("at") > now) { next = p; break; }
            }
        } catch (Exception ignored) {
            next = null;
        }

        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_next_prayer);
            views.setOnClickPendingIntent(R.id.widget_root, openApp(context));
            if (next == null) {
                views.setTextViewText(R.id.widget_label, context.getString(R.string.widget_label));
                views.setTextViewText(R.id.widget_name, context.getString(R.string.widget_no_schedule));
                views.setTextViewText(R.id.widget_time, "");
                views.setViewVisibility(R.id.widget_countdown, View.GONE);
            } else {
                long at = next.optLong("at");
                String label = context.getString(next.optBoolean("estimated")
                    ? R.string.widget_label_estimated : R.string.widget_label);
                views.setTextViewText(R.id.widget_label, label);
                views.setTextViewText(R.id.widget_name, next.optString("name"));
                views.setTextViewText(R.id.widget_time, next.optString("time"));
                views.setViewVisibility(R.id.widget_countdown, View.VISIBLE);
                // Chronometer counts down by itself – no wake-ups needed for the ticking.
                views.setChronometer(R.id.widget_countdown, SystemClock.elapsedRealtime() + (at - now),
                    context.getString(R.string.widget_countdown_format), true);
                views.setChronometerCountDown(R.id.widget_countdown, true);
            }
            manager.updateAppWidget(id, views);
        }
        if (next != null) scheduleRefresh(context, next.optLong("at") + 1000);
    }

    private static PendingIntent openApp(Context context) {
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Wakes the widget just after the prayer time so it moves on to the next one. */
    private static void scheduleRefresh(Context context, long when) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        Intent intent = new Intent(context, NextPrayerWidget.class)
            .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, AppWidgetManager.getInstance(context)
                .getAppWidgetIds(new ComponentName(context, NextPrayerWidget.class)));
        PendingIntent pi = PendingIntent.getBroadcast(context, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // Inexact alarm: needs no permission; a minute's delay only affects the widget.
        alarms.setAndAllowWhileIdle(AlarmManager.RTC, when, pi);
    }
}
