package se.salahkalender.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarms are lost on reboot, update and (for the exact-alarm permission) when it is granted again: set them again from storage. */
public class AlarmBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        AlarmScheduler.scheduleStored(context);
    }
}
