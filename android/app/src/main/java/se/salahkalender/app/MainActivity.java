package se.salahkalender.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SalahNativePlugin.class);
        super.onCreate(savedInstanceState);
    }

    // Opening the app while an alarm rings goes straight to the screen with "Stäng av".
    @Override
    public void onResume() {
        super.onResume();
        if (AlarmService.ringing && !AlarmService.stopRequested) {
            startActivity(new Intent(this, AlarmActivity.class)
                .putExtra("title", AlarmService.ringingTitle).putExtra("body", AlarmService.ringingBody)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
        }
    }
}
