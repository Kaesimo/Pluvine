import { Capacitor, registerPlugin } from '@capacitor/core';

interface PlaybackServicePlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const PlaybackService = registerPlugin<PlaybackServicePlugin>('PlaybackService');

let active = false;

/**
 * Android keeps the WebView process alive through a mediaPlayback foreground
 * service while rain is playing. Without it the system freezes the app after a
 * few minutes in the background and the audio graph dies. On the web (and in
 * Electron) this is a no-op.
 */
export function setBackgroundPlayback(shouldRun: boolean): void {
  if (!Capacitor.isNativePlatform()) return;
  if (shouldRun === active) return;

  active = shouldRun;
  const call = shouldRun ? PlaybackService.start() : PlaybackService.stop();
  void call.catch(() => {
    // Best-effort: a service failure must never stop the actual playback.
    active = !shouldRun;
  });
}
