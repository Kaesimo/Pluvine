import { createRoot } from 'react-dom/client';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import App from './App.tsx';
import './index.css';
import { soundEngine } from './utils/soundEngine';

// The Android shell is edge-to-edge behind the status bar. Keep the system
// icons light so they stay readable over the dark rain field.
if (Capacitor.isNativePlatform()) {
  void StatusBar.setOverlaysWebView({ overlay: true });
  void StatusBar.setStyle({ style: Style.Light });
  // The rain canvas is expensive; let it sleep with the app instead of
  // painting at full speed behind a locked screen.
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    window.dispatchEvent(new CustomEvent('pluvine:appstate', { detail: isActive }));
  });
}

// Dev-only diagnostics handle: lets automated browser checks read real engine
// state (elements, gate, timers) against the real AudioContext. Absent from
// production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pluvine = soundEngine;
}

createRoot(document.getElementById('root')!).render(<App />);
