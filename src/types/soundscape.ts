/**
 * Pluvine — sound layer and preset definitions.
 *
 * A layer is one continuous sound source in the mixer. `playbackMode` is the
 * only scheduling hint the engine needs:
 *   - 'loop'         → one continuously running voice (rain, wind, hum)
 *   - 'intermittent' → no continuous voice; the engine schedules isolated
 *                      strikes for these layers (thunder).
 *
 * Presets are plain layer-state maps: enabling/disabling a layer and its
 * volume. They contain no copy beyond a short literal name.
 */

export type PlaybackMode = 'loop' | 'intermittent';

export interface SoundLayerConfig {
  id: string;
  name: string;
  enabled: boolean;
  /** 0..1 */
  volume: number;
  playbackMode: PlaybackMode;
}

export type LayerStates = Record<string, { enabled: boolean; volume: number }>;

export interface Preset {
  id: string;
  name: string;
  isCustom?: boolean;
  layerStates: LayerStates;
}

/** Default mixer configuration: light rain + distant thunder. */
export const DEFAULT_SOUND_LAYERS: SoundLayerConfig[] = [
  {
    id: 'rain-light-loop',
    name: 'Light rain',
    enabled: true,
    volume: 0.85,
    playbackMode: 'loop',
  },
  {
    id: 'rain-window-patter',
    name: 'Window rain',
    enabled: false,
    volume: 0.5,
    playbackMode: 'loop',
  },
  {
    id: 'rain-forest-loop',
    name: 'Forest rain',
    enabled: false,
    volume: 0.8,
    playbackMode: 'loop',
  },
  {
    id: 'rain-car-glass',
    name: 'Car rain',
    enabled: false,
    volume: 0.85,
    playbackMode: 'loop',
  },
  {
    id: 'rain-ambient-gentle',
    name: 'Steady rain',
    enabled: false,
    volume: 0.8,
    playbackMode: 'loop',
  },
  {
    id: 'rain-heavy-loop',
    name: 'Heavy rain',
    enabled: false,
    volume: 0.85,
    playbackMode: 'loop',
  },
  {
    id: 'wind-blowing-ambience',
    name: 'Wind',
    enabled: false,
    volume: 0.35,
    playbackMode: 'loop',
  },
  {
    id: 'thunder-distant-rumble',
    name: 'Distant thunder',
    enabled: true,
    volume: 0.4,
    playbackMode: 'loop',
  },
  {
    id: 'thunder-big-rumble',
    name: 'Heavy thunder',
    enabled: false,
    volume: 0.55,
    playbackMode: 'intermittent',
  },
  {
    id: 'mechanical-air-conditioner',
    name: 'AC hum',
    enabled: false,
    volume: 0.35,
    playbackMode: 'loop',
  },
];

/**
 * Starter presets. Ids are stable (stored custom presets reference them).
 *
 * Disabled layers keep their nominal level rather than 0: switching a layer
 * on from a preset always produces sound at a sensible level, and the live mix
 * compares cleanly against the preset it came from.
 */
export const DEFAULT_PRESETS: Preset[] = [
  {
    id: 'preset-gentle-sleep',
    name: 'Gentle rain',
    layerStates: {
      'rain-light-loop': { enabled: true, volume: 0.85 },
      'rain-window-patter': { enabled: true, volume: 0.45 },
      'rain-forest-loop': { enabled: false, volume: 0.8 },
      'rain-car-glass': { enabled: false, volume: 0.85 },
      'rain-ambient-gentle': { enabled: false, volume: 0.8 },
      'rain-heavy-loop': { enabled: false, volume: 0.85 },
      'wind-blowing-ambience': { enabled: false, volume: 0.35 },
      'thunder-distant-rumble': { enabled: true, volume: 0.35 },
      'thunder-big-rumble': { enabled: false, volume: 0.55 },
      'mechanical-air-conditioner': { enabled: false, volume: 0.35 },
    },
  },
  {
    id: 'preset-deep-storm',
    name: 'Night storm',
    layerStates: {
      'rain-light-loop': { enabled: false, volume: 0.85 },
      'rain-window-patter': { enabled: false, volume: 0.5 },
      'rain-forest-loop': { enabled: false, volume: 0.7 },
      'rain-car-glass': { enabled: true, volume: 0.6 },
      'rain-ambient-gentle': { enabled: false, volume: 0.8 },
      'rain-heavy-loop': { enabled: false, volume: 0.85 },
      'wind-blowing-ambience': { enabled: true, volume: 0.35 },
      'thunder-distant-rumble': { enabled: true, volume: 0.5 },
      'thunder-big-rumble': { enabled: true, volume: 0.5 },
      'mechanical-air-conditioner': { enabled: false, volume: 0.35 },
    },
  },
  {
    id: 'preset-deep-focus',
    name: 'Rain and hum',
    layerStates: {
      'rain-light-loop': { enabled: false, volume: 0.85 },
      'rain-window-patter': { enabled: false, volume: 0.5 },
      'rain-forest-loop': { enabled: false, volume: 0.8 },
      'rain-car-glass': { enabled: false, volume: 0.85 },
      'rain-ambient-gentle': { enabled: true, volume: 0.8 },
      'rain-heavy-loop': { enabled: false, volume: 0.85 },
      'wind-blowing-ambience': { enabled: false, volume: 0.35 },
      'thunder-distant-rumble': { enabled: false, volume: 0.4 },
      'thunder-big-rumble': { enabled: false, volume: 0.55 },
      'mechanical-air-conditioner': { enabled: true, volume: 0.4 },
    },
  },
  {
    id: 'preset-cabin-window',
    name: 'Window and wind',
    layerStates: {
      'rain-light-loop': { enabled: true, volume: 0.4 },
      'rain-window-patter': { enabled: true, volume: 0.85 },
      'rain-forest-loop': { enabled: false, volume: 0.8 },
      'rain-car-glass': { enabled: false, volume: 0.85 },
      'rain-ambient-gentle': { enabled: false, volume: 0.8 },
      'rain-heavy-loop': { enabled: false, volume: 0.85 },
      'wind-blowing-ambience': { enabled: true, volume: 0.3 },
      'thunder-distant-rumble': { enabled: false, volume: 0.4 },
      'thunder-big-rumble': { enabled: false, volume: 0.55 },
      'mechanical-air-conditioner': { enabled: false, volume: 0.35 },
    },
  },
  {
    id: 'preset-car-shelter',
    name: 'Car rain',
    layerStates: {
      'rain-light-loop': { enabled: false, volume: 0.85 },
      'rain-window-patter': { enabled: false, volume: 0.5 },
      'rain-forest-loop': { enabled: false, volume: 0.8 },
      'rain-car-glass': { enabled: true, volume: 0.9 },
      'rain-ambient-gentle': { enabled: false, volume: 0.8 },
      'rain-heavy-loop': { enabled: false, volume: 0.85 },
      'wind-blowing-ambience': { enabled: true, volume: 0.2 },
      'thunder-distant-rumble': { enabled: true, volume: 0.3 },
      'thunder-big-rumble': { enabled: false, volume: 0.55 },
      'mechanical-air-conditioner': { enabled: false, volume: 0.35 },
    },
  },
  {
    id: 'preset-forest-sanctuary',
    name: 'Forest rain',
    layerStates: {
      'rain-light-loop': { enabled: false, volume: 0.85 },
      'rain-window-patter': { enabled: false, volume: 0.5 },
      'rain-forest-loop': { enabled: true, volume: 0.85 },
      'rain-car-glass': { enabled: false, volume: 0.85 },
      'rain-ambient-gentle': { enabled: false, volume: 0.8 },
      'rain-heavy-loop': { enabled: false, volume: 0.85 },
      'wind-blowing-ambience': { enabled: true, volume: 0.25 },
      'thunder-distant-rumble': { enabled: true, volume: 0.25 },
      'thunder-big-rumble': { enabled: false, volume: 0.55 },
      'mechanical-air-conditioner': { enabled: false, volume: 0.35 },
    },
  },
];

/** True when a layer list exactly matches a preset's states. */
export function mixMatchesPreset(
  layers: SoundLayerConfig[],
  states: LayerStates
): boolean {
  return layers.every((layer) => {
    const want = states[layer.id];
    if (!want) return !layer.enabled;
    return (
      layer.enabled === want.enabled &&
      Math.abs(layer.volume - clamp01(want.volume)) < 0.001
    );
  });
}

/** Snapshot the current mixer as a layer-state map (for saving presets). */
export function snapshotMix(layers: SoundLayerConfig[]): LayerStates {
  const states: LayerStates = {};
  for (const layer of layers) {
    states[layer.id] = { enabled: layer.enabled, volume: layer.volume };
  }
  return states;
}

function clamp01(v: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.max(0, Math.min(1, v))
    : 0;
}
