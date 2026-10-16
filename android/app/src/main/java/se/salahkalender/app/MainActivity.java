package se.salahkalender.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SalahNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
