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
 * All runtime recordings are Ogg Opus 96k, built by `npm run sounds:sync`
 * from the originals in sounds/ (rain layers, wind, AC, and thunder alike).
 * The packaging-time WAV swap below is a legacy safety net: it only rewrites
 * .wav entries when a build ships WAV sources — with this manifest it is a
 * no-op.
 */
const PACKAGED_EXT: string = import.meta.env?.VITE_SOUND_EXT ?? 'wav';
const resolveAsset = (file: string): string =>
  file.endsWith('.wav') ? `${file.slice(0, -4)}.${PACKAGED_EXT}` : file;

const RAW_ASSETS: Record<string, string> = {
  'rain-light-loop': 'light-rain.opus',
  'rain-window-patter': 'window-rain.opus',
  'rain-forest-loop': 'forest-rain.opus',
  'rain-car-glass': 'car-rain.opus',
  'rain-ambient-gentle': 'steady-rain.opus',
  'rain-heavy-loop': 'heavy-rain.opus',
  'wind-blowing-ambience': 'wind.opus',
  'thunder-distant-rumble': 'distant-thunder.opus',
  'thunder-big-rumble': 'heavy-thunder.opus',
  'mechanical-air-conditioner': 'ac-hum.opus',
};

export const LAYER_ASSETS: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_ASSETS).map(([id, file]) => [id, resolveAsset(file)]),
);
