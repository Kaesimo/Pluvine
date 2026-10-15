/**
 * Pluvine — audio asset manifest.
 *
 * Maps each mixer layer to the recording file it plays, served from
 * `public/sounds/`. The engine never hardcodes file names; a missing or
 * unreadable file is reported through its asset status and the layer falls
 * back to its built-in procedural voice where one exists.
 */

export const ASSET_BASE = `${import.meta.env?.BASE_URL ?? '/'}sounds/`;

/**
 * Packaging builds set VITE_SOUND_EXT=mp3: the packaging step transcodes the
 * WAV recordings in dist/sounds/ to 192k MP3 (originals in public/sounds/
 * stay untouched) and this swaps the manifest's .wav entries to match.
 * Recordings that are already MP3 ship unchanged.
 */
const PACKAGED_EXT: string = import.meta.env?.VITE_SOUND_EXT ?? 'wav';
const resolveAsset = (file: string): string =>
  file.endsWith('.wav') ? `${file.slice(0, -4)}.${PACKAGED_EXT}` : file;

const RAW_ASSETS: Record<string, string> = {
  'rain-light-loop': 'light-rain.mp3',
  'rain-window-patter': 'window-rain.mp3',
  'rain-forest-loop': 'forest-rain.mp3',
  'rain-car-glass': 'car-rain.mp3',
  'rain-ambient-gentle': 'steady-rain.mp3',
  'rain-heavy-loop': 'heavy-rain.mp3',
  'wind-blowing-ambience': 'wind.mp3',
  'thunder-distant-rumble': 'capaholiczsfx-distant-thunder-405128.mp3',
  'thunder-big-rumble': 'capaholiczsfx-heavy-thunder-405126.mp3',
  'mechanical-air-conditioner': 'ac-hum.mp3',
};

export const LAYER_ASSETS: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_ASSETS).map(([id, file]) => [id, resolveAsset(file)]),
);
