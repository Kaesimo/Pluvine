import React from 'react';
import { X, Timer, Plus, RotateCcw, Volume2 } from 'lucide-react';

interface TimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isActive: boolean;
  remainingSeconds: number;
  totalMinutes: number;
  fadeSeconds: number;
  onStartTimer: (mins: number, fadeSecs: number) => void;
  onCancelTimer: () => void;
  onAddTime: (mins: number) => void;
  onSetFadeSeconds: (fadeSecs: number) => void;
  onEnableContinuous: () => void;
  isContinuous: boolean;
}

export const TimerModal: React.FC<TimerModalProps> = ({
  isOpen,
  onClose,
  isActive,
  remainingSeconds,
  totalMinutes,
  fadeSeconds,
  onStartTimer,
  onCancelTimer,
  onAddTime,
  onSetFadeSeconds,
  onEnableContinuous,
  isContinuous,
}) => {
  if (!isOpen) return null;

  const presets = [
    { label: '15m', mins: 15, hint: 'Power Nap' },
    { label: '30m', mins: 30, hint: 'Quick Rest' },
    { label: '45m', mins: 45, hint: 'Deep Focus' },
    { label: '60m', mins: 60, hint: 'Bedtime 1h' },
    { label: '90m', mins: 90, hint: 'Sleep Cycle' },
  ];

  const fadeChoices = [
    { label: 'No Fade (0s)', secs: 0, desc: 'Constant Sound' },
    { label: '30 sec', secs: 30, desc: 'Quick Taper' },
    { label: '1 min', secs: 60, desc: 'Subtle' },
    { label: '2 min', secs: 120, desc: 'Gentle' },
  ];

  const formatTime = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (hours > 0) {
      return `${hours}h ${mins.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    }
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200">
              <Timer className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Sleep Timer
              </h3>
              <p className="text-xs text-slate-400">
                Automatic shutoff for sleep and focus sessions
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Timer Countdown */}
        {isActive ? (
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 mb-5 text-center">
            <div className="text-4xl font-mono font-light tracking-wider text-slate-100 mb-2">
              {formatTime(remainingSeconds)}
            </div>
            <p className="text-xs text-slate-400 mb-4">
              {fadeSeconds === 0 ? 'Constant volume until shutoff' : `Fading out over last ${fadeSeconds >= 60 ? `${fadeSeconds / 60}m` : `${fadeSeconds}s`}`}
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => onAddTime(15)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                +15 mins
              </button>
              <button
                onClick={onCancelTimer}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/40 text-xs transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Cancel Timer
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Presets Grid */}
            <div className="mb-5">
              <label className="text-xs font-medium text-slate-400 mb-2 block">
                Choose Duration
              </label>
              <div className="grid grid-cols-5 gap-2 mb-2">
                {presets.map((p) => {
                  const isSelected = totalMinutes === p.mins && !isContinuous;
                  return (
                    <button
                      key={p.mins}
                      onClick={() => onStartTimer(p.mins, fadeSeconds)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-100 border-slate-100 text-slate-950 shadow-md font-semibold'
                          : 'bg-slate-950/60 hover:bg-slate-800 border-slate-800 text-slate-300'
                      }`}
                    >
                      <span className="text-xs block font-mono">{p.label}</span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">{p.hint}</span>
                    </button>
                  );
                })}
              </div>

              {/* Continuous option */}
              <button
                onClick={onEnableContinuous}
                className={`w-full py-2.5 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isContinuous
                    ? 'bg-indigo-950/60 border-indigo-500/60 text-indigo-200'
                    : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 text-slate-300'
                }`}
              >
                <span>Continuous All-Night (No Timer, Infinite Play)</span>
              </button>
            </div>

            {/* Fade Out Duration */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 mb-5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                  Fade-Out Curve
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {fadeSeconds === 0 ? 'Instant' : `${fadeSeconds}s`}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">
                Select 0s to keep steady volume with no sudden drops.
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {fadeChoices.map((f) => (
                  <button
                    key={f.secs}
                    onClick={() => onSetFadeSeconds(f.secs)}
                    className={`py-1.5 px-1 rounded-xl text-xs transition-all text-center cursor-pointer border ${
                      fadeSeconds === f.secs
                        ? 'bg-slate-100 text-slate-950 border-slate-100 font-medium shadow-sm'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
                    }`}
                  >
                    <span className="block font-mono text-[11px]">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={() => onStartTimer(totalMinutes, fadeSeconds)}
              className="w-full py-3 rounded-xl bg-slate-100 hover:bg-white text-slate-950 font-semibold text-sm transition-all cursor-pointer shadow-lg active:scale-98"
            >
              Start {totalMinutes}m Sleep Timer
            </button>
          </>
        )}
      </div>
    </div>
  );
};
