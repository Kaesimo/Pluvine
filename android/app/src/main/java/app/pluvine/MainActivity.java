package app.pluvine;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.res.Resources;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int NOTIFICATION_PERMISSION_REQUEST = 41;

    /**
     * The notification's Pause action is delivered here, not by waking the
     * activity. The WebView is alive (the service keeps the process up), so the
     * event reaches the same engine path as the in-app pause button.
     */
    private final BroadcastReceiver pauseReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (bridge != null) {
                bridge.eval("window.dispatchEvent(new Event('pluvine:pause'))", null);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlaybackServicePlugin.class);
        super.onCreate(savedInstanceState);

        ContextCompat.registerReceiver(
            this,
            pauseReceiver,
            new IntentFilter(PlaybackService.ACTION_PAUSE),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
        requestNotificationPermission();
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            return;
        }
        // Ask once. The foreground service still runs if the user declines;
        // only the notification (and its Pause action) is hidden.
        boolean asked = getPreferences(MODE_PRIVATE).getBoolean("asked_notifications", false);
        if (asked) return;
        getPreferences(MODE_PRIVATE).edit().putBoolean("asked_notifications", true).apply();
        ActivityCompat.requestPermissions(
            this,
            new String[] { Manifest.permission.POST_NOTIFICATIONS },
            NOTIFICATION_PERMISSION_REQUEST
        );
    }

    @Override
    public void onDestroy() {
        try {
            unregisterReceiver(pauseReceiver);
        } catch (IllegalArgumentException ignored) {
            // Activity creation failed before the receiver was registered.
        }
        super.onDestroy();
    }

    /**
     * Capacitor's BridgeActivity installs its own layout, whose WebView cannot
     * keep media alive in the background. Substitute the app layout, which uses
     * BackgroundWebView. The WebView id is the one Capacitor looks up.
     */
    @Override
    public void setContentView(int layoutResID) {
        // Resource names are merged across packages, so compare by name rather
        // than by a generated R field from the Capacitor library.
        String name = null;
        try {
            name = getResources().getResourceEntryName(layoutResID);
        } catch (Resources.NotFoundException ignored) {
            // Not a resource id we know; fall through to the normal path.
        }
        if ("capacitor_bridge_layout_main".equals(name)) {
            super.setContentView(R.layout.activity_main);
        } else {
            super.setContentView(layoutResID);
        }
    }
}
