/**
 * Pluvine — ambient rain mixer.
 *
 * One screen: transport (play + master), the layer mixer, presets, and a
 * sleep timer in the header. All audio state flows one way — the engine owns
 * it, this component mirrors it through engine callbacks and renders controls
 * that only ever call intent-level engine methods.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { soundEngine, type AssetFailure, type PlaybackState } from './utils/soundEngine';
import {
  DEFAULT_PRESETS,
  type Preset,
  type SoundLayerConfig,
  mixMatchesPreset,
  snapshotMix,
} from './types/soundscape';
import {
  loadCustomPresets,
  loadKeepTimerVisible,
  loadMasterVolume,
  saveCustomPresets,
  saveKeepTimerVisible,
  saveMasterVolume,
} from './utils/presets';
import { RainField, type LightningFlash } from './components/RainField';
import { Transport } from './components/Transport';
import { Mixer } from './components/Mixer';
import { PresetBar } from './components/PresetBar';
import { SleepTimer } from './components/SleepTimer';
import { SaveMixDialog } from './components/SaveMixDialog';
import { IconMark } from './components/icons';

/** Idle time before the chrome drifts back out during sleep mode. */
const SLEEP_UI_IDLE_MS = 3500;

export default function App() {
  // --- mirrored engine state ------------------------------------------------
  const [playbackState, setPlaybackState] = useState<PlaybackState>(
    soundEngine.getState()
  );
  const [layers, setLayers] = useState<SoundLayerConfig[]>(soundEngine.getLayers());
  const [masterVolume, setMasterVolume] = useState<number>(
    soundEngine.getMasterVolume()
  );
  const [sleepRemaining, setSleepRemaining] = useState<number>(0);
  const [uiAwake, setUiAwake] = useState(true);
  const [rainOnly, setRainOnly] = useState(false);
  const [rainOnlyAwake, setRainOnlyAwake] = useState(true);
  const [keepTimerVisible, setKeepTimerVisible] = useState(() =>
    loadKeepTimerVisible(true)
  );
  const [assetFailures, setAssetFailures] = useState<AssetFailure[]>([]);
  const [flash, setFlash] = useState<LightningFlash>({ seq: 0, intensity: 0 });

  // --- presets --------------------------------------------------------------
  const [presets, setPresets] = useState<Preset[]>(() => [
    ...DEFAULT_PRESETS,
    ...loadCustomPresets(),
  ]);
  const [activePresetId, setActivePresetId] = useState<string | null>(
    DEFAULT_PRESETS[0].id
  );
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  // --- engine wiring --------------------------------------------------------
  useEffect(() => {
    soundEngine.setOnStateChange(setPlaybackState);
    soundEngine.setOnLayersUpdated(setLayers);
    soundEngine.setOnSleepTimerChange(setSleepRemaining);
    soundEngine.setOnAssetStatusesChange(() =>
      setAssetFailures(soundEngine.getAssetFailures())
    );
    soundEngine.setOnThunderStrike((intensity) =>
      setFlash((prev) => ({ seq: prev.seq + 1, intensity }))
    );

    // Restored settings (session start only).
    const persistedVolume = loadMasterVolume(soundEngine.getMasterVolume());
    soundEngine.setMasterVolume(persistedVolume);
    setMasterVolume(persistedVolume);
    soundEngine.applyPreset(DEFAULT_PRESETS[0].layerStates);
    setAssetFailures(soundEngine.getAssetFailures());

    return () => {
      soundEngine.setOnStateChange(() => {});
      soundEngine.setOnLayersUpdated(() => {});
      soundEngine.setOnSleepTimerChange(() => {});
      soundEngine.setOnAssetStatusesChange(() => {});
      soundEngine.setOnThunderStrike(() => {});
    };
  }, []);

  // --- derived view state ---------------------------------------------------
  const activePreset = useMemo(
    () => presets.find((p) => p.id === activePresetId),
    [presets, activePresetId]
  );
  const edited =
    !activePreset || !mixMatchesPreset(layers, activePreset.layerStates);
  const mixName = activePreset && !edited ? activePreset.name : 'Custom mix';
  const isPlaying = playbackState === 'playing' || playbackState === 'starting';

  // --- sleep mode: chrome fades to the rain, the timer stays ------------------
  // While the timer runs, the interface quietly leaves the screen. Any pointer
  // or key activity brings it back immediately; it drifts out again after a
  // short idle. The timer button itself never fades (it is the countdown).
  const sleepMode = sleepRemaining > 0;
  useEffect(() => {
    // In rain-only mode the chrome stays hidden even on pointer activity —
    // only the Rain-only button wakes (its own effect below).
    if (!sleepMode || rainOnly) {
      setUiAwake(true);
      return;
    }
    let idle: ReturnType<typeof setTimeout>;
    const wake = () => {
      setUiAwake(true);
      clearTimeout(idle);
      idle = setTimeout(() => setUiAwake(false), SLEEP_UI_IDLE_MS);
    };
    idle = setTimeout(() => setUiAwake(false), SLEEP_UI_IDLE_MS);
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    window.addEventListener('focusin', wake);
    return () => {
      clearTimeout(idle);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('focusin', wake);
    };
  }, [sleepMode, rainOnly]);

  // Rain-only mode: the whole interface (including the sleep timer) is gone;
  // only the Rain-only button itself wakes on pointer/key activity so you can
  // find it and click it again. Escape also exits.
  useEffect(() => {
    if (!rainOnly) {
      setRainOnlyAwake(true);
      return;
    }
    let idle: ReturnType<typeof setTimeout>;
    const wake = () => {
      setRainOnlyAwake(true);
      clearTimeout(idle);
      idle = setTimeout(() => setRainOnlyAwake(false), SLEEP_UI_IDLE_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRainOnly(false);
        return;
      }
      wake();
    };
    idle = setTimeout(() => setRainOnlyAwake(false), SLEEP_UI_IDLE_MS);
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', onKey);
    window.addEventListener('focusin', wake);
    return () => {
      clearTimeout(idle);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('focusin', wake);
    };
  }, [rainOnly]);

  // --- handlers -------------------------------------------------------------
  const handleTogglePlayback = useCallback(() => {
    if (isPlaying) soundEngine.pause();
    else void soundEngine.play();
  }, [isPlaying]);

  const handleToggleLayer = useCallback((layerId: string, enabled: boolean) => {
    soundEngine.setLayerEnabled(layerId, enabled);
  }, []);

  const handleLayerVolume = useCallback((layerId: string, volume: number) => {
    soundEngine.setLayerVolume(layerId, volume);
  }, []);

  const handleMasterVolume = useCallback((volume: number) => {
    soundEngine.setMasterVolume(volume);
    setMasterVolume(volume);
    saveMasterVolume(volume);
  }, []);

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      const preset = presets.find((p) => p.id === presetId);
      if (!preset) return;
      soundEngine.applyPreset(preset.layerStates);
      setActivePresetId(presetId);
      // Choosing a preset is an explicit wish to hear it.
      if (playbackState !== 'playing' && playbackState !== 'starting') {
        void soundEngine.play();
      }
    },
    [presets, playbackState]
  );

  const handleDeletePreset = useCallback(
    (presetId: string) => {
      const next = presets.filter((p) => p.id !== presetId);
      setPresets(next);
      saveCustomPresets(next);
      if (activePresetId === presetId) setActivePresetId(null);
    },
    [presets, activePresetId]
  );

  const handleSaveMix = useCallback(
    (name: string) => {
      const states = snapshotMix(layers);
      const normalizedName = name.toLowerCase();

      // Same name (case-insensitive) updates that mix in place.
      const existingCustom = presets.find(
        (p) => p.isCustom && p.name.toLowerCase() === normalizedName
      );
      const saved: Preset = existingCustom
        ? { ...existingCustom, layerStates: states }
        : { id: `custom-${Date.now()}`, name, isCustom: true, layerStates: states };

      const next = existingCustom
        ? presets.map((p) => (p.id === existingCustom.id ? saved : p))
        : [...presets, saved];

      setPresets(next);
      saveCustomPresets(next);
      setActivePresetId(saved.id);
      setSaveDialogOpen(false);
    },
    [layers, presets]
  );

  const handleStartTimer = useCallback((minutes: number) => {
    soundEngine.startSleepTimer(minutes * 60);
  }, []);

  const handleAddTimerTime = useCallback((minutes: number) => {
    soundEngine.addSleepTimerTime(minutes * 60);
  }, []);

  const handleCancelTimer = useCallback(() => {
    soundEngine.cancelSleepTimer();
  }, []);

  const handleToggleKeepTimer = useCallback((value: boolean) => {
    setKeepTimerVisible(value);
    saveKeepTimerVisible(value);
  }, []);

  // --- honest failure notice -------------------------------------------------
  const failureNotice = useMemo(() => {
    if (assetFailures.length === 0) return null;
    const names = assetFailures
      .map((f) => layers.find((l) => l.id === f.layerId)?.name ?? f.layerId)
      .slice(0, 3);
    const extra = assetFailures.length - names.length;
    const list = names.join(', ') + (extra > 0 ? ` +${extra}` : '');
    return `${list}: recording unavailable, built-in sound in use.`;
  }, [assetFailures, layers]);

  return (
    <div
      className={[
        'relative min-h-dvh',
        rainOnly ? 'is-rainonly' : '',
        rainOnly && !rainOnlyAwake ? 'is-rainonly-idle' : '',
        !rainOnly && sleepMode && !uiAwake ? 'is-sleeping' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <RainField playing={isPlaying} flash={flash} />

      <div className="relative z-10 flex min-h-dvh flex-col">
        <header className="mx-auto flex h-16 w-full max-w-[880px] items-center justify-between gap-4 px-4 sm:px-5">
          <div className="pl-ui flex items-center gap-2.5 text-rain">
            <IconMark />
            <span className="text-[17px] font-semibold tracking-tight text-text">
              Pluvine
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <SleepTimer
              className={`pl-timerband ${keepTimerVisible ? '' : 'pl-ui'}`}
              keepVisible={keepTimerVisible}
              onToggleKeepVisible={handleToggleKeepTimer}
              remaining={sleepRemaining}
              onStart={handleStartTimer}
              onAdd={handleAddTimerTime}
              onCancel={handleCancelTimer}
            />

            {/* Outside .pl-ui: in rain-only mode this is the one thing that
                wakes on pointer activity, so you can always find and click it. */}
            <button
              type="button"
              className={[
                'pl-btn pl-rainonly',
                rainOnly ? 'is-active' : '',
                rainOnly && rainOnlyAwake ? 'is-awake' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={rainOnly}
              aria-label={rainOnly ? 'Exit rain-only mode' : 'Show rain only'}
              onClick={() => setRainOnly(!rainOnly)}
            >
              Rain only
            </button>
          </div>
        </header>

        <main className="pl-ui flex flex-1 px-4 pb-8 sm:px-5">
          <div className="pl-plate m-auto w-full max-w-[880px]">
            <Transport
              state={playbackState}
              error={soundEngine.getError()}
              mixName={mixName}
              masterVolume={masterVolume}
              onTogglePlayback={handleTogglePlayback}
              onMasterVolume={handleMasterVolume}
            />

            <Mixer
              layers={layers}
              onToggleLayer={handleToggleLayer}
              onLayerVolume={handleLayerVolume}
            />

            <PresetBar
              presets={presets}
              activePresetId={activePresetId}
              edited={edited}
              onSelect={handleSelectPreset}
              onDelete={handleDeletePreset}
              onSaveRequest={() => setSaveDialogOpen(true)}
            />

            {failureNotice && (
              <div className="pl-band px-4 py-2.5 text-[11.5px] leading-snug text-alert sm:px-5">
                {failureNotice}
              </div>
            )}
          </div>
        </main>
      </div>

      {saveDialogOpen && (
        <SaveMixDialog onSave={handleSaveMix} onClose={() => setSaveDialogOpen(false)} />
      )}
    </div>
  );
}
