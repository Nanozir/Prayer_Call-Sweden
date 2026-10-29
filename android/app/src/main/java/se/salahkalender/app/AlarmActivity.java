package se.salahkalender.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.content.ContextCompat;

/** Full-screen alarm over the lock screen: prayer name and time with "Stäng av" and "Snooza 5 min". */
public class AlarmActivity extends Activity {
    private TextView titleView;
    private TextView bodyView;
    private final BroadcastReceiver stopped = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            finish();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#0d1a14"));
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad, pad, pad);

        titleView = text(34, true);
        bodyView = text(20, false);
        root.addView(titleView);
        root.addView(bodyView);

        root.addView(button("Stäng av", "#1f8a5b", AlarmService.ACTION_DISMISS, 72), buttonParams(pad * 2));
        root.addView(button("Snooza 5 min", "#2a3a33", AlarmService.ACTION_SNOOZE, 56), buttonParams(pad / 2));
        setContentView(root);
        show(getIntent());

        ContextCompat.registerReceiver(this, stopped, new IntentFilter(AlarmService.ACTION_STOPPED), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        show(intent);
    }

    @Override
    protected void onStart() {
        super.onStart();
        // Opened later from an old notification, after the alarm already ended.
        if (!AlarmService.ringing) finish();
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(stopped);
        super.onDestroy();
    }

    private void show(Intent intent) {
        String title = intent.getStringExtra("title");
        titleView.setText(title == null || title.isEmpty() ? "Alarm" : title);
        bodyView.setText(intent.getStringExtra("body"));
    }

    private TextView text(int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setTextColor(Color.WHITE);
        t.setTextSize(sp);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private Button button(String label, String color, String action, int heightDp) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextSize(22);
        b.setTextColor(Color.WHITE);
        b.setAllCaps(false);
        b.setBackgroundColor(Color.parseColor(color));
        b.setMinimumHeight((int) (heightDp * getResources().getDisplayMetrics().density));
        b.setOnClickListener((View v) -> {
            startService(new Intent(this, AlarmService.class).setAction(action));
            finish();
        });
        return b;
    }

    private LinearLayout.LayoutParams buttonParams(int topMargin) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = topMargin;
        return lp;
    }
}
