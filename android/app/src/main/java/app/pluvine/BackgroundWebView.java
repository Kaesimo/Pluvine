package app.pluvine;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;

import com.getcapacitor.CapacitorWebView;

/**
 * Keeps the WebView "window-visible" while the app is in the background.
 *
 * Android tells a WebView that its window is gone when the app is backgrounded
 * or the screen locks, and Chromium then suspends media playback. The audio
 * engine lives in this WebView, so the renderer must stay alive for sleep
 * playback. PlaybackService keeps the process in the foreground; this keeps the
 * renderer from pausing the audio graph. When the app is visible again the
 * value is already VISIBLE, so the override is a no-op.
 */
public class BackgroundWebView extends CapacitorWebView {

    public BackgroundWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public void dispatchWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(View.VISIBLE);
    }
}
