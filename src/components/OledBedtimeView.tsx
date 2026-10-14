import React, { useState, useEffect } from 'react';
import { X, Play, Pause, Volume2 } from 'lucide-react';
import { Soundscape } from '../types/soundscape';
import { soundEngine } from '../utils/soundEngine';

interface OledBedtimeViewProps {
  currentSoundscape: Soundscape;
  isPlaying: boolean;
  onTogglePlay: () => void;
  timerRemainingFormatted: string | null;
  fadeFactor: number;
  onClose: () => void;
}

export const OledBedtimeView: React.FC<OledBedtimeViewProps> = ({
  currentSoundscape,
  isPlaying,
  onTogglePlay,
  timerRemainingFormatted,
  fadeFactor,
  onClose,
}) => {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#020305] text-zinc-400 flex flex-col justify-between items-center p-6 sm:p-10 select-none overflow-hidden">
      {/* Top Header: Simple Exit affordance */}
      <div className="w-full max-w-xl flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest text-zinc-600 font-mono">
          Bedside Mode
        </span>

        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Exit Bedside Mode"
        >
          <X className="w-3.5 h-3.5" />
          <span>Exit</span>
        </button>
      </div>

      {/* Centerpiece: Restrained Dim Clock & Current Soundscape */}
      <div className="flex flex-col items-center justify-center my-auto text-center">
        <div className="text-7xl sm:text-8xl md:text-9xl font-extralight tracking-tight text-zinc-400/80 font-mono mb-4">
          {timeStr}
        </div>

        <h2 className="text-base sm:text-lg font-medium text-zinc-300 tracking-wide mb-1">
          {currentSoundscape.name}
        </h2>
        <p className="text-xs text-zinc-600 mb-8">
          {currentSoundscape.acousticSurface}
        </p>

        {/* Essential Single Play / Pause Button */}
        <button
          onClick={onTogglePlay}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer border ${
            isPlaying
              ? 'bg-zinc-900/80 border-zinc-800 text-zinc-200 hover:bg-zinc-850'
              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current ml-0.5" />
          )}
        </button>
      </div>

      {/* Bottom Bar: Timer Remaining & Volume Fade status */}
      <div className="w-full max-w-md flex flex-col items-center gap-2 text-xs text-zinc-500">
        {timerRemainingFormatted && (
          <span className="font-mono text-zinc-400">
            Shutoff in {timerRemainingFormatted}
          </span>
        )}

        {fadeFactor < 1.0 && (
          <div className="flex items-center gap-1.5 text-zinc-400 font-mono">
            <Volume2 className="w-3 h-3" />
            <span>Fading ({Math.round(fadeFactor * 100)}%)</span>
          </div>
        )}
      </div>
    </div>
  );
};
