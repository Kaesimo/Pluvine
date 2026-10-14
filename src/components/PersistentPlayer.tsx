import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Timer, 
  SlidersHorizontal 
} from 'lucide-react';
import { Soundscape } from '../types/soundscape';
import { soundEngine } from '../utils/soundEngine';

interface PersistentPlayerProps {
  currentSoundscape: Soundscape;
  isPlaying: boolean;
  onTogglePlay: () => void;
  masterVolume: number;
  onVolumeChange: (vol: number) => void;
  onOpenTimer: () => void;
  onOpenMixer: () => void;
  timerRemainingFormatted: string | null;
  timerIsActive: boolean;
}

export const PersistentPlayer: React.FC<PersistentPlayerProps> = ({
  currentSoundscape,
  isPlaying,
  onTogglePlay,
  masterVolume,
  onVolumeChange,
  onOpenTimer,
  onOpenMixer,
  timerRemainingFormatted,
  timerIsActive,
}) => {
  const [previousVolume, setPreviousVolume] = useState<number>(0.8);
  const [barHeights, setBarHeights] = useState<number[]>([3, 5, 7, 4]);
  const animRef = useRef<number | null>(null);

  const toggleMute = () => {
    if (masterVolume > 0) {
      setPreviousVolume(masterVolume);
      onVolumeChange(0);
    } else {
      onVolumeChange(previousVolume > 0 ? previousVolume : 0.85);
    }
  };

  useEffect(() => {
    if (!isPlaying) {
      setBarHeights([2, 2, 2, 2]);
      return;
    }

    const freqData = new Uint8Array(16);
    const updateBars = () => {
      soundEngine.getByteFrequencyData(freqData);
      const b0 = Math.max(3, Math.min(13, Math.floor((freqData[1] / 255) * 13)));
      const b1 = Math.max(4, Math.min(15, Math.floor((freqData[3] / 255) * 15)));
      const b2 = Math.max(3, Math.min(14, Math.floor((freqData[5] / 255) * 14)));
      const b3 = Math.max(3, Math.min(11, Math.floor((freqData[7] / 255) * 11)));
      setBarHeights([b0, b1, b2, b3]);
      animRef.current = requestAnimationFrame(updateBars);
    };

    animRef.current = requestAnimationFrame(updateBars);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying]);

  return (
    <aside
      aria-label="Audio playback controls"
      className="fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-2xl border-t border-slate-800 px-4 sm:px-6 py-3 shadow-2xl"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Play/Pause button, Soundscape Title & Visualizer */}
        <div className="flex items-center gap-3.5 min-w-0">
          <button
            onClick={onTogglePlay}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-lg active:scale-95 ${
              isPlaying
                ? 'bg-white text-slate-950 hover:bg-slate-100 shadow-white/10'
                : 'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700'
            }`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100 truncate">
                {currentSoundscape.name}
              </h3>

              {isPlaying && (
                <div className="flex items-end gap-0.5 h-3.5 w-3.5 shrink-0 pb-0.5" aria-hidden="true">
                  {barHeights.map((h, i) => (
                    <span
                      key={i}
                      className="w-0.5 rounded-full bg-slate-300 transition-all duration-75"
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 truncate">
              {currentSoundscape.acousticSurface}
            </p>
          </div>
        </div>

        {/* Right: Mixer Drawer, Master Volume, Sleep Timer */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Mixer Trigger */}
          <button
            onClick={onOpenMixer}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Adjust sound layers"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mixer</span>
          </button>

          {/* Master Volume Control */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={toggleMute}
              className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              aria-label={masterVolume === 0 ? 'Unmute' : 'Mute'}
            >
              {masterVolume === 0 ? (
                <VolumeX className="w-4 h-4 text-slate-500" />
              ) : (
                <Volume2 className="w-4 h-4 text-slate-300" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterVolume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-16 sm:w-20 accent-slate-100 cursor-pointer h-1 bg-slate-800 rounded-lg"
              aria-label="Master Volume"
            />
          </div>

          {/* Sleep Timer Trigger */}
          <button
            onClick={onOpenTimer}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
              timerIsActive
                ? 'bg-amber-950/50 border-amber-500/60 text-amber-200'
                : 'bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Set Sleep Timer"
          >
            <Timer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {timerIsActive && timerRemainingFormatted ? timerRemainingFormatted : 'Timer'}
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
};
