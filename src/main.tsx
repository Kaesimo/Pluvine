import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { soundEngine } from './utils/soundEngine';

// Dev-only diagnostics handle: lets automated browser checks read real engine
// state (elements, gate, timers) against the real AudioContext. Absent from
// production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pluvine = soundEngine;
}

createRoot(document.getElementById('root')!).render(<App />);
