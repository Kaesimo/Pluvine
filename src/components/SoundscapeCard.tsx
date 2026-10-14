import React from 'react';
import { Volume2 } from 'lucide-react';
import { Soundscape } from '../types/soundscape';

interface SoundscapeCardProps {
  soundscape: Soundscape;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: () => void;
}

export const SoundscapeCard: React.FC<SoundscapeCardProps> = ({
  soundscape,
  isSelected,
  isPlaying,
  onSelect,
}) => {
  const isCurrentActive = isSelected && isPlaying;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative rounded-2xl border text-left transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
        isSelected
          ? 'bg-slate-900/95 border-slate-500/90 shadow-xl'
          : 'bg-slate-950/60 hover:bg-slate-900/70 border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Image Banner */}
      <div className="relative h-28 w-full overflow-hidden bg-slate-900">
        <img
          src={soundscape.imagePath}
          alt={soundscape.name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

        {/* Top unboxed surface label & active indicator */}
        <div className="absolute top-3 inset-x-3.5 flex items-center justify-between">
          <span className="text-xs text-slate-300 font-medium drop-shadow-sm">
            {soundscape.acousticSurface}
          </span>

          {isCurrentActive && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-950 text-[10px] font-semibold tracking-wide shadow-sm">
              <Volume2 className="w-3 h-3" />
              <span>Playing</span>
            </span>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 pt-3 flex-1 flex flex-col justify-between w-full">
        <div>
          <h3 className="text-base font-semibold text-slate-100 tracking-tight group-hover:text-white transition-colors">
            {soundscape.name}
          </h3>

          <p className="text-xs text-slate-400 mt-0.5 mb-2 font-normal">
            {soundscape.tagline}
          </p>

          <p className="text-xs text-slate-400/80 leading-relaxed line-clamp-2">
            {soundscape.description}
          </p>
        </div>

        {/* Bottom Unboxed Source Info */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500 w-full">
          <span className="truncate pr-2">{soundscape.recordingSource}</span>
          <span className="font-mono text-slate-400 shrink-0">
            {soundscape.mixer.thunderEnabled ? 'Thunder' : 'Rain Only'}
          </span>
        </div>
      </div>

      {/* Active Subtle Bottom Bar */}
      {isSelected && (
        <div className="h-0.5 w-full bg-slate-200" />
      )}
    </button>
  );
};
