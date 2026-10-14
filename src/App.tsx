/**
 * Rainfocus — Rain-First Ambient Listening Experience
 * 
 * Rebuilt for immediate, high-fidelity listening:
 * - Authentic, licensed nature recordings (Window, Roof, Downpour, Forest Mist, Steady Rain, Distant Thunder)
 * - Seamless dual-buffer crossfaded looping with zero seams or dropouts
 * - Single-purpose, consolidated UI: zero duplicate play buttons, zero redundant text
 * - Discoverable acoustic balance mixer
 * - Minimalist OLED bedtime nightstand mode
 */

import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Moon, 
  Zap, 
  Wind, 
  SlidersHorizontal,
  ShieldCheck
} from 'lucide-react';
import { soundEngine, SoundMixerState, DEFAULT_MIXER } from './utils/soundEngine';
import { SOUNDSCAPES, Soundscape } from './types/soundscape';
import { AtmosphericCanvas } from './components/AtmosphericCanvas';
import { SoundscapeCard } from './components/SoundscapeCard';
import { PersistentPlayer } from './components/PersistentPlayer';
import { SoundscapeLayersPanel } from './components/SoundscapeLayersPanel';
import { TimerModal } from './components/TimerModal';
import { OledBedtimeView } from './components/OledBedtimeView';
import { AttributionModal } from './components/AttributionModal';

export default function App() {
  // Playback & Soundscape State
  const [currentSoundscape, setCurrentSoundscape] = useState<Soundscape>(SOUNDSCAPES[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [masterVolume, setMasterVolume] = useState<number>(0.85);
  const [mixer, setMixer] = useState<SoundMixerState>({
    ...DEFAULT_MIXER,
    ...SOUNDSCAPES[0].mixer,
  });
  const [lightningFlash, setLightningFlash] = useState<number>(0);

  // Modals & Panels
  const [isMixerOpen, setIsMixerOpen] = useState<boolean>(false);
  const [isTimerOpen, setIsTimerOpen] = useState<boolean>(false);
  const [isOledBedtimeOpen, setIsOledBedtimeOpen] = useState<boolean>(false);
  const [isAttributionOpen, setIsAttributionOpen] = useState<boolean>(false);

  // Sleep Timer State
  const [timerIsActive, setTimerIsActive] = useState<boolean>(false);
  const [timerTotalMinutes, setTimerTotalMinutes] = useState<number>(60);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number>(60 * 60);
  const [timerFadeSeconds, setTimerFadeSeconds] = useState<number>(0);
  const [isContinuous, setIsContinuous] = useState<boolean>(false);

  // Audio Engine Lifecycle
  useEffect(() => {
    soundEngine.setOnStateChange((playing) => {
      setIsPlaying(playing);
    });

    soundEngine.setOnThunderStrike((intensity) => {
      setLightningFlash(intensity);
      setTimeout(() => setLightningFlash(0), 140);
    });
  }, []);

  // Sleep Timer Countdown Tick
  useEffect(() => {
    if (!timerIsActive) return;

    const interval = setInterval(() => {
      setTimerRemainingSeconds((current) => {
        if (current <= 1) {
          soundEngine.setFadeFactor(0.0);
          soundEngine.pause();
          setTimerIsActive(false);
          return 0;
        }

        const next = current - 1;

        if (timerFadeSeconds > 0 && next <= timerFadeSeconds) {
          const factor = next / timerFadeSeconds;
          soundEngine.setFadeFactor(factor);
        } else {
          soundEngine.setFadeFactor(1.0);
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerIsActive, timerFadeSeconds]);

  // Master Play / Pause
  const handleTogglePlay = () => {
    if (isPlaying) {
      soundEngine.pause();
    } else {
      soundEngine.play();
    }
  };

  // Immediate Soundscape Selection
  const handleSelectSoundscape = (soundscape: Soundscape) => {
    setCurrentSoundscape(soundscape);

    const newMixer: SoundMixerState = {
      ...DEFAULT_MIXER,
      ...soundscape.mixer,
      masterVolume,
    };
    setMixer(newMixer);
    soundEngine.crossfadeTo(newMixer, 0.8);

    if (!isPlaying) {
      soundEngine.play();
    }
  };

  // Master Volume Change
  const handleVolumeChange = (vol: number) => {
    setMasterVolume(vol);
    setMixer((prev) => ({ ...prev, masterVolume: vol }));
    soundEngine.updateMixer({ masterVolume: vol });
  };

  // Granular Mixer Updates
  const handleUpdateMixer = (updates: Partial<SoundMixerState>) => {
    const updated = { ...mixer, ...updates };
    setMixer(updated);
    soundEngine.updateMixer(updates);
  };

  // Reset to Current Soundscape Defaults
  const handleResetDefaults = () => {
    const defaults: SoundMixerState = {
      ...DEFAULT_MIXER,
      ...currentSoundscape.mixer,
      masterVolume,
    };
    setMixer(defaults);
    soundEngine.crossfadeTo(defaults, 0.6);
  };

  // Manual Thunderstrike
  const handleTriggerThunder = () => {
    if (!isPlaying) {
      soundEngine.play();
    }
    soundEngine.triggerThunder(0.85);
  };

  // Timer Controls
  const handleStartTimer = (mins: number, fadeSecs: number) => {
    const secs = mins * 60;
    setTimerTotalMinutes(mins);
    setTimerFadeSeconds(fadeSecs);
    setTimerRemainingSeconds(secs);
    setTimerIsActive(true);
    setIsContinuous(false);
    soundEngine.setFadeFactor(1.0);

    if (!isPlaying) {
      soundEngine.play();
    }
    setIsTimerOpen(false);
  };

  const handleCancelTimer = () => {
    setTimerIsActive(false);
    setIsContinuous(false);
    soundEngine.setFadeFactor(1.0);
  };

  const handleAddTime = (mins: number) => {
    setTimerRemainingSeconds((prev) => prev + mins * 60);
    soundEngine.setFadeFactor(1.0);
  };

  const handleEnableContinuous = () => {
    setTimerIsActive(false);
    setIsContinuous(true);
    soundEngine.setFadeFactor(1.0);
    if (!isPlaying) {
      soundEngine.play();
    }
    setIsTimerOpen(false);
  };

  const formatRemainingTimer = () => {
    if (!timerIsActive) return null;
    const mins = Math.floor(timerRemainingSeconds / 60);
    const secs = timerRemainingSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#06080e] text-slate-100 flex flex-col justify-between selection:bg-slate-700 relative overflow-x-hidden font-sans">
      {/* Animated Multi-Plane Night Rain Canvas */}
      <AtmosphericCanvas
        isPlaying={isPlaying}
        lightningFlash={lightningFlash}
        rainType={mixer.rainEnvironment === 'roof' ? 'heavy' : mixer.rainEnvironment === 'steady' ? 'medium' : mixer.rainEnvironment === 'storm' ? 'heavy' : mixer.rainEnvironment}
        rainIntensity={mixer.rainEnabled ? mixer.rainVolume : 0.3}
      />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-36">
        {/* Top Header: Uncluttered wordmark + essential secondary triggers */}
        <header className="flex items-center justify-between pb-5 mb-8 border-b border-slate-800/80">
          <a
            href="/"
            className="text-lg font-bold tracking-tight text-white hover:text-slate-200 transition-colors"
          >
            Rainfocus
          </a>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsAttributionOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="View recording sources and licenses"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Licenses</span>
            </button>

            <button
              onClick={() => setIsOledBedtimeOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Open dark bedside clock"
            >
              <Moon className="w-3.5 h-3.5 text-amber-400" />
              <span>Bedside Mode</span>
            </button>
          </div>
        </header>

        {/* Hero Atmosphere Stage (Focused centerpiece without redundant buttons) */}
        <section
          aria-label="Current atmosphere"
          className="relative rounded-3xl overflow-hidden border border-slate-800 mb-10 shadow-2xl bg-slate-950"
        >
          {/* Backdrop Image with Scrim */}
          <div className="absolute inset-0 z-0">
            <img
              src={currentSoundscape.imagePath}
              alt={currentSoundscape.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-40 scale-105 transition-all duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/50" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
          </div>

          {/* Hero Content */}
          <div className="relative z-10 p-6 sm:p-8 lg:p-10 flex flex-col justify-between min-h-[290px]">
            {/* Top metadata line */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="text-slate-300 font-medium">
                {currentSoundscape.acousticSurface}
              </span>

              <span className="text-[11px] font-mono text-slate-500">
                {currentSoundscape.recordingSource}
              </span>
            </div>

            {/* Central Title & Description */}
            <div className="my-6 max-w-2xl">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-2">
                {currentSoundscape.name}
              </h1>
              <p className="text-sm sm:text-base text-slate-300 font-medium mb-1">
                {currentSoundscape.tagline}
              </p>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-xl">
                {currentSoundscape.description}
              </p>
            </div>

            {/* Bottom Actions: Play Trigger & Direct Ambient Layer Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/60">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTogglePlay}
                  className="px-5 py-3 rounded-2xl font-semibold text-xs tracking-wide flex items-center gap-2.5 transition-all cursor-pointer shadow-lg active:scale-95 bg-white text-slate-950 hover:bg-slate-100"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" />
                      <span>Pause Soundscape</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                      <span>Start Listening</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setIsMixerOpen(true)}
                  className="px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Acoustic Balance</span>
                </button>
              </div>

              {/* Quick Environmental Toggles (Direct & Uncluttered) */}
              <div className="flex items-center gap-2">
                {/* Thunder Quick Toggle */}
                <button
                  onClick={() => handleUpdateMixer({ 
                    thunderEnabled: !mixer.thunderEnabled,
                    thunderFrequency: !mixer.thunderEnabled ? 'occasional' : 'off',
                    thunderVolume: !mixer.thunderEnabled ? 0.45 : 0.0
                  })}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    mixer.thunderEnabled
                      ? 'bg-amber-950/50 border-amber-500/60 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Toggle distant thunder"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Thunder {mixer.thunderEnabled ? 'On' : 'Off'}</span>
                </button>

                {/* Thunder Strike button if thunder enabled */}
                {mixer.thunderEnabled && (
                  <button
                    onClick={handleTriggerThunder}
                    className="px-2.5 py-2 rounded-xl bg-amber-950/60 hover:bg-amber-900 border border-amber-700/80 text-amber-200 text-xs font-medium cursor-pointer transition-colors"
                    title="Trigger immediate thunder rumble"
                  >
                    Rumble
                  </button>
                )}

                {/* Wind Quick Toggle */}
                <button
                  onClick={() => handleUpdateMixer({ 
                    windEnabled: !mixer.windEnabled,
                    windVolume: !mixer.windEnabled ? 0.16 : 0.0
                  })}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    mixer.windEnabled
                      ? 'bg-teal-950/50 border-teal-500/60 text-teal-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Toggle night wind"
                >
                  <Wind className="w-3.5 h-3.5" />
                  <span>Wind {mixer.windEnabled ? 'On' : 'Off'}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Curated Soundscape Environments Grid */}
        <section aria-label="Curated Rain Environments" className="mb-8">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Rain Environments
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Authentic field recordings · Click to listen immediately
              </p>
            </div>

            <span className="text-[11px] font-mono text-slate-500">
              6 distinct soundscapes
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {SOUNDSCAPES.map((soundscape) => (
              <SoundscapeCard
                key={soundscape.id}
                soundscape={soundscape}
                isSelected={currentSoundscape.id === soundscape.id}
                isPlaying={isPlaying}
                onSelect={() => handleSelectSoundscape(soundscape)}
              />
            ))}
          </div>
        </section>

        {/* Quiet Footer */}
        <footer className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">Rainfocus</span>
            <span aria-hidden="true">·</span>
            <span>Natural rain acoustics for sleep, focus, and calm</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsAttributionOpen(true)}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Audio Licenses
            </button>
            <button
              onClick={() => setIsTimerOpen(true)}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Sleep Timer
            </button>
            <button
              onClick={() => setIsOledBedtimeOpen(true)}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Bedside Mode
            </button>
          </div>
        </footer>
      </div>

      {/* Single Persistent Audio Player Bar */}
      <PersistentPlayer
        currentSoundscape={currentSoundscape}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        masterVolume={masterVolume}
        onVolumeChange={handleVolumeChange}
        onOpenTimer={() => setIsTimerOpen(true)}
        onOpenMixer={() => setIsMixerOpen(true)}
        timerRemainingFormatted={formatRemainingTimer()}
        timerIsActive={timerIsActive}
      />

      {/* Acoustic Layer Mixer Modal */}
      <SoundscapeLayersPanel
        isOpen={isMixerOpen}
        onClose={() => setIsMixerOpen(false)}
        mixer={mixer}
        onUpdateMixer={handleUpdateMixer}
        onResetDefaults={handleResetDefaults}
        onTriggerThunder={handleTriggerThunder}
        soundscapeName={currentSoundscape.name}
      />

      {/* Sleep Timer Modal */}
      <TimerModal
        isOpen={isTimerOpen}
        onClose={() => setIsTimerOpen(false)}
        isActive={timerIsActive}
        remainingSeconds={timerRemainingSeconds}
        totalMinutes={timerTotalMinutes}
        fadeSeconds={timerFadeSeconds}
        onStartTimer={handleStartTimer}
        onCancelTimer={handleCancelTimer}
        onAddTime={handleAddTime}
        onSetFadeSeconds={(secs) => setTimerFadeSeconds(secs)}
        onEnableContinuous={handleEnableContinuous}
        isContinuous={isContinuous}
      />

      {/* Minimal Bedside Mode */}
      {isOledBedtimeOpen && (
        <OledBedtimeView
          currentSoundscape={currentSoundscape}
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
          timerRemainingFormatted={formatRemainingTimer()}
          fadeFactor={soundEngine.getFadeFactor()}
          onClose={() => setIsOledBedtimeOpen(false)}
        />
      )}

      {/* Audio Licenses & Attribution Modal */}
      <AttributionModal
        isOpen={isAttributionOpen}
        onClose={() => setIsAttributionOpen(false)}
      />
    </div>
  );
}
