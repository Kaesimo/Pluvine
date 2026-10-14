import React from 'react';
import { 
  CloudRain, 
  CloudLightning, 
  Wind, 
  Flame, 
  Brain, 
  Waves, 
  RotateCcw,
  Zap,
  SlidersHorizontal,
  Power,
  X
} from 'lucide-react';
import { SoundMixerState, RainEnvironment, ThunderFrequency, BinauralBand } from '../utils/soundEngine';

interface SoundscapeLayersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mixer: SoundMixerState;
  onUpdateMixer: (updates: Partial<SoundMixerState>) => void;
  onResetDefaults: () => void;
  onTriggerThunder: () => void;
  soundscapeName: string;
}

export const SoundscapeLayersPanel: React.FC<SoundscapeLayersPanelProps> = ({
  isOpen,
  onClose,
  mixer,
  onUpdateMixer,
  onResetDefaults,
  onTriggerThunder,
  soundscapeName,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-300" />
              <h2 className="text-base font-semibold text-slate-100">
                Acoustic Balance
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Adjust individual environmental layers for <span className="text-slate-200 font-medium">{soundscapeName}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onResetDefaults}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs transition-colors cursor-pointer"
              title="Reset to soundscape defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Defaults</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Close Mixer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Grid of Sound Layers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Layer 1: Rain Acoustics (Primary Foundation) */}
          <div className={`p-4 rounded-2xl border transition-all ${
            mixer.rainEnabled ? 'bg-slate-950/80 border-slate-700' : 'bg-slate-950/30 border-slate-900 opacity-60'
          }`}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold text-slate-200">Rain Bed</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {mixer.rainEnabled ? `${Math.round(mixer.rainVolume * 100)}%` : 'Muted'}
                </span>
              </div>

              <button
                onClick={() => onUpdateMixer({ rainEnabled: !mixer.rainEnabled })}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  mixer.rainEnabled
                    ? 'bg-indigo-950 text-indigo-300 border border-indigo-700'
                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                }`}
                title={mixer.rainEnabled ? 'Mute rain' : 'Enable rain'}
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            </div>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              disabled={!mixer.rainEnabled}
              value={mixer.rainVolume}
              onChange={(e) => onUpdateMixer({ rainVolume: parseFloat(e.target.value) })}
              className="w-full accent-slate-100 cursor-pointer h-1.5 bg-slate-800 rounded-lg mb-3 disabled:opacity-30"
              aria-label="Rain Volume"
            />

            {/* Environment Recording Switcher */}
            <div className="grid grid-cols-3 gap-1">
              {[
                { env: 'window' as RainEnvironment, label: 'Window' },
                { env: 'roof' as RainEnvironment, label: 'Roof' },
                { env: 'steady' as RainEnvironment, label: 'Steady' },
                { env: 'soft' as RainEnvironment, label: 'Mist' },
                { env: 'heavy' as RainEnvironment, label: 'Downpour' },
                { env: 'storm' as RainEnvironment, label: 'Storm' },
              ].map(({ env, label }) => (
                <button
                  key={env}
                  onClick={() => onUpdateMixer({ rainEnvironment: env })}
                  disabled={!mixer.rainEnabled}
                  className={`py-1 px-1 rounded-lg text-[10px] font-medium transition-all text-center cursor-pointer ${
                    mixer.rainEnvironment === env
                      ? 'bg-slate-800 text-white border border-slate-600 font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Layer 2: Distant Thunder */}
          <div className={`p-4 rounded-2xl border transition-all ${
            mixer.thunderEnabled ? 'bg-slate-950/80 border-slate-700' : 'bg-slate-950/30 border-slate-900 opacity-60'
          }`}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <CloudLightning className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-slate-200">Distant Thunder</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {mixer.thunderEnabled ? `${Math.round(mixer.thunderVolume * 100)}%` : 'Off'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {mixer.thunderEnabled && (
                  <button
                    onClick={onTriggerThunder}
                    className="px-2 py-0.5 rounded-md bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    title="Trigger immediate thunder strike"
                  >
                    <Zap className="w-2.5 h-2.5" />
                    <span>Strike</span>
                  </button>
                )}
                <button
                  onClick={() => onUpdateMixer({ thunderEnabled: !mixer.thunderEnabled })}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                    mixer.thunderEnabled
                      ? 'bg-amber-950 text-amber-300 border border-amber-700'
                      : 'bg-slate-800 text-slate-500 border border-slate-700'
                  }`}
                  title={mixer.thunderEnabled ? 'Disable thunder' : 'Enable thunder'}
                >
                  <Power className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              disabled={!mixer.thunderEnabled}
              value={mixer.thunderVolume}
              onChange={(e) => onUpdateMixer({ thunderVolume: parseFloat(e.target.value) })}
              className="w-full accent-amber-300 cursor-pointer h-1.5 bg-slate-800 rounded-lg mb-3 disabled:opacity-30"
              aria-label="Thunder Volume"
            />

            <div className="grid grid-cols-3 gap-1">
              {(['rare', 'occasional', 'frequent'] as ThunderFrequency[]).map((freq) => (
                <button
                  key={freq}
                  onClick={() => onUpdateMixer({ thunderFrequency: freq })}
                  disabled={!mixer.thunderEnabled}
                  className={`py-1 px-1 rounded-lg text-[10px] font-medium capitalize transition-all cursor-pointer text-center ${
                    mixer.thunderFrequency === freq
                      ? 'bg-slate-800 text-white border border-slate-600 font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {freq}
                </button>
              ))}
            </div>
          </div>

          {/* Layer 3: Night Wind */}
          <div className={`p-4 rounded-2xl border transition-all ${
            mixer.windEnabled ? 'bg-slate-950/80 border-slate-700' : 'bg-slate-950/30 border-slate-900 opacity-60'
          }`}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-semibold text-slate-200">Night Wind</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {mixer.windEnabled ? `${Math.round(mixer.windVolume * 100)}%` : 'Off'}
                </span>
              </div>

              <button
                onClick={() => onUpdateMixer({ windEnabled: !mixer.windEnabled })}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  mixer.windEnabled
                    ? 'bg-teal-950 text-teal-300 border border-teal-700'
                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                }`}
                title={mixer.windEnabled ? 'Disable wind' : 'Enable wind'}
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            </div>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              disabled={!mixer.windEnabled}
              value={mixer.windVolume}
              onChange={(e) => onUpdateMixer({ windVolume: parseFloat(e.target.value) })}
              className="w-full accent-teal-300 cursor-pointer h-1.5 bg-slate-800 rounded-lg disabled:opacity-30"
              aria-label="Wind Volume"
            />
            <p className="text-[10px] text-slate-500 mt-2">
              Continuous natural wind breeze recording
            </p>
          </div>

          {/* Layer 4: Fireside Embers */}
          <div className={`p-4 rounded-2xl border transition-all ${
            mixer.fireEnabled ? 'bg-slate-950/80 border-slate-700' : 'bg-slate-950/30 border-slate-900 opacity-60'
          }`}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-semibold text-slate-200">Hearth Crackle</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {mixer.fireEnabled ? `${Math.round(mixer.fireVolume * 100)}%` : 'Off'}
                </span>
              </div>

              <button
                onClick={() => onUpdateMixer({ fireEnabled: !mixer.fireEnabled })}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  mixer.fireEnabled
                    ? 'bg-orange-950 text-orange-300 border border-orange-700'
                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                }`}
                title={mixer.fireEnabled ? 'Disable hearth' : 'Enable hearth'}
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            </div>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              disabled={!mixer.fireEnabled}
              value={mixer.fireVolume}
              onChange={(e) => onUpdateMixer({ fireVolume: parseFloat(e.target.value) })}
              className="w-full accent-orange-300 cursor-pointer h-1.5 bg-slate-800 rounded-lg disabled:opacity-30"
              aria-label="Hearth Volume"
            />
            <p className="text-[10px] text-slate-500 mt-2">
              Gentle wood ember bursts & warmth
            </p>
          </div>
        </div>

        {/* Optional Secondary Tonal Layers (Subtle) */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mixer.binauralEnabled}
                onChange={(e) => onUpdateMixer({ 
                  binauralEnabled: e.target.checked,
                  binauralBand: e.target.checked ? (mixer.binauralBand === 'off' ? 'delta' : mixer.binauralBand) : 'off',
                  binauralVolume: 0.05
                })}
                className="rounded accent-emerald-400"
              />
              <span className="text-slate-300">Binaural Waves (Subtle)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mixer.droneEnabled}
                onChange={(e) => onUpdateMixer({ 
                  droneEnabled: e.target.checked,
                  ambientDroneVolume: 0.04
                })}
                className="rounded accent-purple-400"
              />
              <span className="text-slate-300">432Hz Drone</span>
            </label>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-white text-slate-950 font-semibold text-xs transition-all cursor-pointer"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
