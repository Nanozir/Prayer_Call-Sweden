package se.salahkalender.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Small native helpers the web part cannot do itself. Needs no extra permissions:
 * it only reads status and opens the relevant system settings screens.
 */
@CapacitorPlugin(name = "SalahNative")
public class SalahNativePlugin extends Plugin {

    /** Whether the system may pause the app to save battery (can delay notifications). */
    @PluginMethod
    public void batteryStatus(PluginCall call) {
        Context ctx = getContext();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        JSObject ret = new JSObject();
        ret.put("unrestricted", pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        ret.put("manufacturer", Build.MANUFACTURER);
        call.resolve(ret);
    }

    /** Opens the battery optimisation list where the user can set the app to "unrestricted". */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        startSettings(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), call);
    }

    /** Opens this app's notification settings. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        startSettings(intent, call);
    }

    private void startSettings(Intent intent, PluginCall call) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            // Fallback: the app's own details page always exists.
            Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null));
            details.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(details);
        }
        call.resolve();
    }
}
