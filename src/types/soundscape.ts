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
    volume: 0.6,
    playbackMode: 'loop',
  },
  {
    id: 'rain-window-patter',
    name: 'Window rain',
    enabled: false,
    volume: 0.55,
    playbackMode: 'loop',
  },
  {
    id: 'rain-forest-loop',
    name: 'Forest rain',
    enabled: false,
    volume: 0.65,
    playbackMode: 'loop',
  },
  {
    id: 'rain-car-glass',
    name: 'Car rain',
    enabled: false,
    volume: 0.65,
    playbackMode: 'loop',
  },
  {
    id: 'rain-ambient-gentle',
    name: 'Steady rain',
    enabled: false,
    volume: 0.55,
    playbackMode: 'loop',
  },
  {
    id: 'rain-heavy-loop',
    name: 'Heavy rain',
    enabled: false,
    volume: 0.55,
    playbackMode: 'loop',
  },
  {
    id: 'wind-blowing-ambience',
    name: 'Wind',
    enabled: false,
    volume: 0.3,
    playbackMode: 'loop',
  },
  {
    id: 'thunder-distant-rumble',
    name: 'Distant thunder',
    enabled: true,
    volume: 0.35,
    playbackMode: 'loop',
  },
  {
    id: 'thunder-big-rumble',
    name: 'Heavy thunder',
    enabled: false,
    volume: 0.6,
    playbackMode: 'intermittent',
  },
  {
    id: 'mechanical-air-conditioner',
    name: 'AC hum',
    enabled: false,
    volume: 0.5,
    playbackMode: 'loop',
  },
];

/**
 * Starter presets. Ids are stable (stored custom presets reference them).
 *
 * Each preset is deliberately small: one dominant texture plus at most one
 * quiet companion. The old bank stacked three or four loud layers into single
 * presets, which is the opposite of what sleep needs. Levels here are written
 * against the calibrated faders (utils/calibration.ts), so 0.6 really is a
 * medium level on every channel.
 *
 * Disabled layers keep their nominal level rather than 0: switching a layer
 * on from a preset always produces sound at a sensible level, and the live mix
 * compares cleanly against the preset it came from.
 */
const NOMINAL_VOLUME: Record<string, number> = Object.fromEntries(
  DEFAULT_SOUND_LAYERS.map((layer) => [layer.id, layer.volume])
);

/** Builds a complete layer-state map from the layers a preset turns on. */
function preset(
  id: string,
  name: string,
  on: Record<string, number>
): Preset {
  const layerStates: LayerStates = {};
  for (const layer of DEFAULT_SOUND_LAYERS) {
    layerStates[layer.id] = {
      enabled: layer.id in on,
      volume: on[layer.id] ?? NOMINAL_VOLUME[layer.id],
    };
  }
  return { id, name, layerStates };
}

export const DEFAULT_PRESETS: Preset[] = [
  preset('preset-gentle-sleep', 'Gentle rain', {
    'rain-light-loop': 0.6,
    'thunder-distant-rumble': 0.3,
  }),
  preset('preset-window-rain', 'Window rain', {
    'rain-window-patter': 0.65,
    'rain-light-loop': 0.2,
  }),
  preset('preset-forest-sanctuary', 'Forest rain', {
    'rain-forest-loop': 0.75,
    'wind-blowing-ambience': 0.3,
  }),
  preset('preset-heavy-rain', 'Heavy rain', {
    'rain-heavy-loop': 0.6,
    'thunder-distant-rumble': 0.2,
  }),
  preset('preset-deep-storm', 'Night storm', {
    'rain-heavy-loop': 0.55,
    'thunder-distant-rumble': 0.55,
    'thunder-big-rumble': 0.6,
  }),
  preset('preset-car-shelter', 'Car rain', {
    'rain-car-glass': 0.65,
    'wind-blowing-ambience': 0.2,
  }),
  preset('preset-deep-focus', 'Deep hum', {
    'rain-ambient-gentle': 0.6,
    'mechanical-air-conditioner': 0.55,
  }),
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
