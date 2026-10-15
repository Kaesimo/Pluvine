/**
 * Mixer band: one column per sound layer, arranged as a bank of gauge
 * columns. Each column is [channel on/off] over [level fader]; the fill height
 * is the fader's real value. Faders are standard range inputs rotated -90°, so
 * keyboard, touch, and screen-reader behavior stay native.
 *
 * Touching the fader of an off channel turns the channel on at that level —
 * the response you hear always matches what you just moved.
 */

import type React from 'react';
import type { SoundLayerConfig } from '../types/soundscape';
import { IconCheck } from './icons';

interface Props {
  layers: SoundLayerConfig[];
  onToggleLayer: (layerId: string, enabled: boolean) => void;
  onLayerVolume: (layerId: string, volume: number) => void;
}

export function Mixer({ layers, onToggleLayer, onLayerVolume }: Props) {
  return (
    <section
      className="pl-band px-4 py-5 sm:px-5"
      aria-label="Sound mixer"
    >
      <div className="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-5 lg:grid-cols-10">
        {layers.map((layer) => (
          <Channel
            key={layer.id}
            layer={layer}
            onToggle={onToggleLayer}
            onVolume={onLayerVolume}
          />
        ))}
      </div>
    </section>
  );
}

interface ChannelProps {
  layer: SoundLayerConfig;
  onToggle: (layerId: string, enabled: boolean) => void;
  onVolume: (layerId: string, volume: number) => void;
}

function Channel({ layer, onToggle, onVolume }: ChannelProps) {
  const on = layer.enabled;

  return (
    <div className="pl-channel">
      <button
        type="button"
        className="pl-toggle"
        aria-pressed={on}
        title={on ? `Turn off ${layer.name}` : `Turn on ${layer.name}`}
        onClick={() => onToggle(layer.id, !on)}
      >
        <span className="box">{on && <IconCheck />}</span>
        <span className="label">{layer.name}</span>
      </button>

      <div className={`pl-fader ${on ? '' : 'is-off'}`}>
        <input
          type="range"
          className="pl-fader-input"
          min={0}
          max={1}
          step={0.01}
          value={layer.volume}
          style={{ '--fill': `${Math.round(layer.volume * 100)}%` } as React.CSSProperties}
          aria-label={`${layer.name} level`}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            onVolume(layer.id, value);
            if (!on) onToggle(layer.id, true);
          }}
        />
      </div>
    </div>
  );
}
