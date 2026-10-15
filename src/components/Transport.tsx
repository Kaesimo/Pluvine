/**
 * Transport band: the one playback control, what is playing, and the master
 * volume — the three global controls, in one row, always visible.
 */

import type { PlaybackState } from '../utils/soundEngine';
import type React from 'react';
import { IconPause, IconPlay } from './icons';

interface Props {
  state: PlaybackState;
  error: string | null;
  mixName: string;
  masterVolume: number;
  onTogglePlayback: () => void;
  onMasterVolume: (v: number) => void;
}

const STATUS_TEXT: Record<PlaybackState, string> = {
  playing: 'Playing',
  starting: 'Starting…',
  paused: 'Paused',
  stopped: 'Stopped',
  error: 'Audio unavailable',
};

export function Transport({
  state,
  error,
  mixName,
  masterVolume,
  onTogglePlayback,
  onMasterVolume,
}: Props) {
  const isOn = state === 'playing' || state === 'starting';

  return (
    <section className="pl-band flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-5 sm:px-5">
      <button
        type="button"
        className={`pl-play shrink-0 ${isOn ? 'is-on' : ''}`}
        onClick={onTogglePlayback}
        aria-label={isOn ? 'Pause playback' : 'Start playback'}
      >
        {isOn ? <IconPause size={26} /> : <IconPlay size={26} />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[19px] font-medium leading-tight tracking-tight text-text">
          {mixName}
        </div>
        <div
          className={`mt-1 text-[13px] leading-tight ${
            state === 'error' ? 'text-alert' : 'text-dim'
          }`}
          role="status"
          aria-live="polite"
        >
          {STATUS_TEXT[state]}
          {state === 'error' && error ? ` — ${error}` : ''}
        </div>
      </div>

      <div className="flex w-full items-center gap-4 sm:w-auto">
        <label
          htmlFor="pl-master"
          className="w-12 shrink-0 text-[13px] font-medium text-dim"
        >
          Master
        </label>
        <input
          id="pl-master"
          type="range"
          className="pl-range min-w-0 flex-1 sm:w-36 sm:flex-none"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          style={{ '--fill': `${Math.round(masterVolume * 100)}%` } as React.CSSProperties}
          onChange={(e) => onMasterVolume(parseFloat(e.target.value))}
          aria-label="Master volume"
        />
        <span className="pl-num w-10 shrink-0 text-right text-[13px] text-dim">
          {Math.round(masterVolume * 100)}
        </span>
      </div>
    </section>
  );
}
