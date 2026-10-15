/**
 * Pluvine — preset persistence.
 *
 * Custom presets live in localStorage under the original `..._v2` key so any
 * presets saved by earlier builds survive this one. Older entries carried extra
 * fields (tagline, description, category); they are read leniently and written
 * back in the minimal shape `{ id, name, isCustom, layerStates }`.
 */

import { LayerStates, Preset, SoundLayerConfig, mixMatchesPreset, snapshotMix } from '../types/soundscape';

export const STORAGE_KEY = 'pluvine_custom_presets_v2';
export const MASTER_VOLUME_KEY = 'pluvine_master_volume_v1';
export const KEEP_TIMER_KEY = 'pluvine_keep_timer_v1';

export function loadCustomPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const out: Preset[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const id = typeof item.id === 'string' ? item.id : null;
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const states = normalizeStates(item.layerStates);
      if (!id || !name || !states) continue;
      out.push({ id, name, isCustom: true, layerStates: states });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: Preset[]): void {
  try {
    const minimal = presets
      .filter((p) => p.isCustom)
      .map((p) => ({
        id: p.id,
        name: p.name,
        isCustom: true,
        layerStates: p.layerStates,
      }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
  } catch {
    /* storage full or unavailable: presets stay in memory for this session */
  }
}

export function loadMasterVolume(fallback: number): number {
  try {
    const raw = localStorage.getItem(MASTER_VOLUME_KEY);
    if (raw === null) return fallback;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
  } catch {
    return fallback;
  }
}

export function saveMasterVolume(volume: number): void {
  try {
    localStorage.setItem(MASTER_VOLUME_KEY, String(volume));
  } catch {
    /* ignore */
  }
}

/** Keep the countdown on screen while the chrome fades away? (sleep mode) */
export function loadKeepTimerVisible(fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(KEEP_TIMER_KEY);
    if (raw === null) return fallback;
    return raw === '1';
  } catch {
    return fallback;
  }
}

export function saveKeepTimerVisible(keep: boolean): void {
  try {
    localStorage.setItem(KEEP_TIMER_KEY, keep ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Rebuilds a layer-state map from unknown JSON, or returns null if unusable. */
function normalizeStates(value: unknown): LayerStates | null {
  if (!value || typeof value !== 'object') return null;
  const out: LayerStates = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as { enabled?: unknown; volume?: unknown };
    out[id] = {
      // Strict: only a real `true` means enabled — a legacy string must not
      // silently turn a layer on.
      enabled: s.enabled === true,
      volume:
        typeof s.volume === 'number' && Number.isFinite(s.volume)
          ? Math.max(0, Math.min(1, s.volume))
          : 0,
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Is the live mix still identical to the given preset? */
export function matchesPreset(
  layers: SoundLayerConfig[],
  preset: Preset | undefined
): boolean {
  if (!preset) return false;
  return mixMatchesPreset(layers, preset.layerStates);
}

export { snapshotMix };
