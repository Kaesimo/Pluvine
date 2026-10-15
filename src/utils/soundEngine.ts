/**
 * Pluvine — Sound Engine
 * =============================================================================
 *
 * Owns every audio resource in the app: the AudioContext, the output graph,
 * per-layer sources, the thunder scheduler, and the sleep timer. The UI never
 * touches Web Audio directly; it calls intent-level methods (play/pause/stop,
 * setLayerEnabled, applyPreset, …) and mirrors state through callbacks.
 *
 * -----------------------------------------------------------------------------
 * Output graph
 * -----------------------------------------------------------------------------
 *
 *   per-layer source ──┐
 *     (media element,  │          layerGain[id]          masterGain
 *      or synth voice) ├────────►  (enabled ? vol : 0) ──► (user volume)
 *   per-layer source ──┘                    │                   │
 *                                           │            sleepGain (timer fade)
 *                                           │                   │
 *                                           │            gateGain (1 while
 *                                           │                     playing)
 *                                           └──────────► limiter ─► destination
 *
 *   gateGain   – playback gate. Ramps to 0 on pause/stop so every source can
 *                be torn down behind a closed gate (no clicks). Never touched
 *                by the sleep timer.
 *   sleepGain  – sleep-timer fade only. Independent node so timer fades and
 *                pause/stop gating cannot fight over one param.
 *   limiter    – one DynamicsCompressor, threshold -1.5 dB: justified because
 *                nine layers can sum past 0 dBFS. Nothing else does DSP.
 *
 * -----------------------------------------------------------------------------
 * Playback state ownership (the critical invariant)
 * -----------------------------------------------------------------------------
 *
 *   intent  : 'play' | 'pause' | 'stop'   ← only explicit user actions change it
 *   state   : 'stopped' | 'starting' | 'playing' | 'paused' | 'error'
 *
 * `intent` is the authority for recovery logic. Browser lifecycle events
 * (visibilitychange, context interruption) may only *advance* an intent that is
 * still 'play'; they can never set it. Returning to a visible tab therefore
 * never restarts audio the user deliberately paused or stopped:
 *
 *   on visible → if intent !== 'play' → return untouched
 *
 * `opToken` invalidates in-flight async play() work: pause()/stop() bump it, so
 * a play() awaiting AudioContext.resume() aborts instead of clobbering a newer
 * pause (the classic "pause gets overridden by the pending play" race).
 *
 * -----------------------------------------------------------------------------
 * Sources
 * -----------------------------------------------------------------------------
 *
 * File path (primary): each layer owns one HTMLAudioElement created in the
 * constructor and routed through createMediaElementSource() the first time the
 * context exists. Recordings stream (no full PCM in memory), loop layers use
 * el.loop, thunder layers are retriggered from 0 with a per-strike intensity.
 *
 * Synth path (fallback): if a layer's recording fails (missing file, unsupported
 * format, network error, play() rejection), the engine marks the layer failed,
 * reports it through onAssetStatuses, and synthesizes the sound procedurally so
 * the mixer keeps working. Nothing pretends the recording loaded: the failure
 * stays visible in the UI notice.
 *
 * One layer never runs both paths at once; `activeSource` records which.
 *
 * -----------------------------------------------------------------------------
 * Scheduling & cancellation
 * -----------------------------------------------------------------------------
 *
 *   - thunderTimer : a single setTimeout for the next strike (or burst
 *     member). Timing carries all of thunder's variety: base gaps are skewed
 *     short within the configured window (storms stay at least as frequent as
 *     a flat draw, never rarer), strikes can chain into rolling bursts a few
 *     seconds apart, and with both thunder layers enabled they alternate and
 *     occasionally pair near-simultaneously. The recordings themselves are
 *     never altered — every strike plays the file as recorded, from 0, with a
 *     random intensity.
 *     Rescheduled only when it is absent or playback stops — moving a fader
 *     never restarts it. Cleared on pause, stop, and when no thunder layer is
 *     enabled; a cleared schedule also forgets any rolling burst.
 *   - sleepTimer   : a single setInterval owned by the engine (see below).
 *   - elementPause : one deferred timer that pauses elements *after* the gate
 *     has closed on pause/stop, guarded so a fast resume can't be clobbered.
 *
 * Every timer id is stored and cleared; destroy() clears all of them.
 *
 * -----------------------------------------------------------------------------
 * Sleep timer
 * -----------------------------------------------------------------------------
 *
 * startSleepTimer(seconds) → auto-starts playback (setting a timer is an
 * explicit wish to listen), ticks down once per second, and applies the final
 * `fadeSeconds` window as a smooth sleepGain fade. Expiration calls stop():
 * intent becomes 'stop', so a visible tab afterwards does nothing.
 * Manual stop also cancels the timer; manual pause keeps it counting.
 * Cancel restores sleepGain smoothly (play() restores it if it hit 0).
 *
 * -----------------------------------------------------------------------------
 * Persistence
 * -----------------------------------------------------------------------------
 *
 * The engine persists nothing. Presets and master volume live in App/localStorage
 * (see utils/presets.ts). The sleep timer is session-scoped on purpose: a reload
 * starts with no timer rather than a phantom countdown.
 */

import {
  SoundLayerConfig,
  DEFAULT_SOUND_LAYERS,
  LayerStates,
} from '../types/soundscape';
import { LAYER_ASSETS, ASSET_BASE } from './assets';

export type PlaybackState = 'stopped' | 'starting' | 'playing' | 'paused' | 'error';
export type PlaybackIntent = 'play' | 'pause' | 'stop';
export type AssetStatus = 'loading' | 'ready' | 'failed';
export type LayerSourceKind = 'file' | 'synth';

/** Records why an asset failed so the UI can say something honest. */
export interface AssetFailure {
  layerId: string;
  reason: string;
}

const GAIN_SMOOTHING = 0.05; // seconds (setTargetAtTime τ)
const GATE_FADE = 0.12; // pause/stop close time
const VOICE_FADE = 0.12; // synth voice teardown time
const ELEMENT_PAUSE_DELAY = 220; // > GATE_FADE·3: elements pause behind a closed gate
const DEFAULT_SLEEP_FADE = 60;

// ---------------------------------------------------------------------------
// Synth fallback voices
// ---------------------------------------------------------------------------

/**
 * Collects every node a fallback voice creates so teardown is exhaustive.
 * `out` is the voice's own gain (fades the voice in/out); it connects to the
 * layer gain, which the mixer controls independently.
 */
class VoiceBuilder {
  readonly nodes: AudioNode[] = [];
  readonly sources: AudioScheduledSourceNode[] = [];

  constructor(
    readonly ctx: AudioContext,
    readonly out: GainNode,
    readonly pink: AudioBuffer,
    readonly brown: AudioBuffer
  ) {}

  node<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  source<T extends AudioScheduledSourceNode>(n: T): T {
    this.node(n);
    this.sources.push(n);
    return n;
  }

  gain(value: number): GainNode {
    const g = this.node(this.ctx.createGain());
    g.gain.setValueAtTime(value, this.ctx.currentTime);
    return g;
  }

  noise(buffer: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return this.source(src);
  }
}

type SynthRecipe = (b: VoiceBuilder) => void;

/**
 * Procedural recipes keyed by layer id. Used only when the layer's recording
 * is unavailable (see "Sources" above).
 */
const SYNTH_RECIPES: Record<string, SynthRecipe> = {
  'rain-light-loop': (b) => {
    const bp = b.node(b.ctx.createBiquadFilter());
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2600, b.ctx.currentTime);
    bp.Q.setValueAtTime(0.7, b.ctx.currentTime);
    const hs = b.node(b.ctx.createBiquadFilter());
    hs.type = 'highshelf';
    hs.frequency.setValueAtTime(5500, b.ctx.currentTime);
    hs.gain.setValueAtTime(-4, b.ctx.currentTime);
    const voice = b.gain(0.88);
    const am = b.source(b.ctx.createOscillator());
    am.type = 'sine';
    am.frequency.setValueAtTime(9.5, b.ctx.currentTime);
    const amG = b.gain(0.12);
    am.connect(amG);
    amG.connect(voice.gain);
    b.noise(b.pink).connect(bp);
    bp.connect(hs);
    hs.connect(voice);
    voice.connect(b.out);
    b.source(am);
    am.start();
    b.sources[0].start();
  },
  'rain-window-patter': (b) => {
    const lp = b.node(b.ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, b.ctx.currentTime);
    lp.Q.setValueAtTime(1.8, b.ctx.currentTime);
    const hp = b.node(b.ctx.createBiquadFilter());
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(140, b.ctx.currentTime);
    b.noise(b.brown).connect(lp);
    lp.connect(hp);
    hp.connect(b.out);
    b.sources[0].start();
  },
  'rain-forest-loop': (b) => {
    const bp = b.node(b.ctx.createBiquadFilter());
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, b.ctx.currentTime);
    bp.Q.setValueAtTime(0.85, b.ctx.currentTime);
    const lp = b.node(b.ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, b.ctx.currentTime);
    b.noise(b.pink).connect(bp);
    bp.connect(lp);
    lp.connect(b.out);
    b.sources[0].start();
  },
  'rain-car-glass': (b) => {
    const lp = b.node(b.ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(950, b.ctx.currentTime);
    lp.Q.setValueAtTime(2.2, b.ctx.currentTime);
    b.noise(b.brown).connect(lp);
    lp.connect(b.out);
    b.sources[0].start();
  },
  'rain-ambient-gentle': (b) => {
    const hp = b.node(b.ctx.createBiquadFilter());
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(150, b.ctx.currentTime);
    const lp = b.node(b.ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, b.ctx.currentTime);
    b.noise(b.pink).connect(hp);
    hp.connect(lp);
    lp.connect(b.out);
    b.sources[0].start();
  },
  'wind-blowing-ambience': (b) => {
    const bp = b.node(b.ctx.createBiquadFilter());
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(420, b.ctx.currentTime);
    bp.Q.setValueAtTime(1.8, b.ctx.currentTime);
    const lfo = b.source(b.ctx.createOscillator());
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.09, b.ctx.currentTime);
    const lfoG = b.gain(180);
    lfo.connect(lfoG);
    lfoG.connect(bp.frequency);
    b.noise(b.brown).connect(bp);
    bp.connect(b.out);
    b.sources[0].start();
    lfo.start();
  },
  'mechanical-air-conditioner': (b) => {
    const humG = b.gain(0.22);
    const h60 = b.source(b.ctx.createOscillator());
    h60.type = 'sine';
    h60.frequency.setValueAtTime(60, b.ctx.currentTime);
    const h120 = b.source(b.ctx.createOscillator());
    h120.type = 'sine';
    h120.frequency.setValueAtTime(120, b.ctx.currentTime);
    h60.connect(humG);
    h120.connect(humG);
    const lp = b.node(b.ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(280, b.ctx.currentTime);
    const airG = b.gain(0.45);
    b.noise(b.pink).connect(lp);
    lp.connect(airG);
    humG.connect(b.out);
    airG.connect(b.out);
    h60.start();
    h120.start();
    b.sources[0].start();
  },
};

/** Which synth recipes exist (a layer without one is silent when its file fails). */
const HAS_SYNTH_RECIPE = new Set(Object.keys(SYNTH_RECIPES));

interface StrikeProfile {
  intensity: [number, number]; // random range for strike gain
  subHz: number;
  cutoffHz: number;
}

const STRIKE_PROFILES: Record<string, StrikeProfile> = {
  'thunder-distant-rumble': { intensity: [0.35, 0.6], subHz: 42, cutoffHz: 140 },
  'thunder-big-rumble': { intensity: [0.65, 1], subHz: 55, cutoffHz: 220 },
};

/**
 * Thunder's complexity lives entirely in *when* strikes happen — the
 * recordings always play as recorded (from 0, unaltered pitch/rate/offset);
 * only timing and intensity vary:
 *   - base gaps are skewed short inside the strikeDelay window (storms stay
 *     at least as frequent as a flat draw, never rarer),
 *   - a strike can open a rolling burst of follow-ups a few seconds apart,
 *   - with both thunder layers enabled, strikes alternate between them and
 *     occasionally pair near-simultaneously.
 */
const BURST_CHANCE = 0.35; // does a strike open a rolling burst?
const BURST_COUNT_MAX = 3; // follow-ups per burst = 1 + floor(rng * 3)
const PAIR_CHANCE = 0.18; // does a strike pair the other thunder layer?
const BASE_GAP_SKEW = 1.7; // >1 biases base gaps toward the short end

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface LayerRuntime {
  el: HTMLAudioElement | null; // null when document.createElement is unavailable
  routed: boolean; // MediaElementSource created
  status: AssetStatus;
  activeSource: LayerSourceKind | 'none';
  /** Bumped by every intended play so stale deferred pauses become no-ops. */
  pauseSeq: number;
}

interface SynthVoice {
  out: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  disposed: boolean;
}

/**
 * Injectable timing, for tests only. Production code uses the defaults — the
 * engine must be exercisable deterministically (strike scheduling, the
 * sleep-timer countdown, deferred element pauses) without multi-second waits.
 */
export interface SoundEngineOptions {
  /** delay window for the first strike after playback starts: [min, max] ms */
  quickStrikeDelay?: [number, number];
  /** delay window between strikes: [min, max] ms */
  strikeDelay?: [number, number];
  /** delay window between rolling-burst strikes: [min, max] ms */
  burstDelay?: [number, number];
  /** injectable randomness for deterministic tests (default Math.random) */
  rng?: () => number;
  /** sleep-timer countdown interval in ms */
  sleepTickMs?: number;
  /** pause elements this long after the gate closes on pause/stop, ms */
  elementPauseDelay?: number;
}

export class SoundEngine {
  // -- core state ----------------------------------------------------------
  private ctx: AudioContext | null = null;
  private state: PlaybackState = 'stopped';
  private intent: PlaybackIntent = 'stop';
  private opToken = 0;
  private lastError: string | null = null;

  // -- graph ---------------------------------------------------------------
  private gateGain: GainNode | null = null;
  private sleepGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private layerGains: Map<string, GainNode> = new Map();

  // -- sources -------------------------------------------------------------
  private layers: SoundLayerConfig[] = DEFAULT_SOUND_LAYERS.map((l) => ({ ...l }));
  private runtime: Map<string, LayerRuntime> = new Map();
  private synthVoices: Map<string, SynthVoice> = new Map();
  private pinkNoise: AudioBuffer | null = null;
  private brownNoise: AudioBuffer | null = null;
  private synthContextReady = false;

  // -- timers (all ids stored, all cleared on destroy) ---------------------
  private thunderTimer: ReturnType<typeof setTimeout> | null = null;
  /** Remaining follow-up strikes in the current rolling burst. */
  private burstLeft = 0;
  /** Delay of the pending strike (ms); null when nothing is scheduled. */
  private thunderDelayMs: number | null = null;
  /** Layer the last strike came from (bursts avoid immediate repeats). */
  private lastStrikeLayerId: string | null = null;
  private elementPauseTimer: ReturnType<typeof setTimeout> | null = null;
  private sleepInterval: ReturnType<typeof setInterval> | null = null;
  private sleepRemaining = 0;
  private sleepFadeSeconds = DEFAULT_SLEEP_FADE;
  /** Short-lived cleanup/defer timers; all cleared on destroy(). */
  private transientTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private lastFailureReasons: Map<string, string> = new Map();

  // -- settings ------------------------------------------------------------
  private masterVolume = 0.85;

  // -- callbacks -----------------------------------------------------------
  private onStateChange: ((s: PlaybackState) => void) | null = null;
  private onLayersUpdated: ((l: SoundLayerConfig[]) => void) | null = null;
  private onThunderStrike: ((intensity: number) => void) | null = null;
  private onSleepTimerChange: ((remainingSeconds: number) => void) | null = null;
  private onAssetStatusesChange: ((s: Record<string, AssetStatus>) => void) | null =
    null;

  private boundVisibility: (() => void) | null = null;
  private destroyed = false;

  private readonly opts: Required<SoundEngineOptions>;

  constructor(options: SoundEngineOptions = {}) {
    this.opts = {
      quickStrikeDelay: options.quickStrikeDelay ?? [3000, 6000],
      strikeDelay: options.strikeDelay ?? [18000, 42000],
      burstDelay: options.burstDelay ?? [2500, 6500],
      rng: options.rng ?? Math.random,
      sleepTickMs: options.sleepTickMs ?? 1000,
      elementPauseDelay: options.elementPauseDelay ?? ELEMENT_PAUSE_DELAY,
    };
    // Elements are created up front so metadata is available immediately and
    // the first play() starts without construction latency; the recordings
    // themselves stream on demand (they are too large to pre-buffer).
    // They produce no sound until routed through the context on first play().
    for (const layer of this.layers) {
      this.runtime.set(layer.id, this.createLayerRuntime(layer));
    }
    this.attachVisibilityListener();
  }

  // =========================================================================
  // Listeners
  // =========================================================================

  setOnStateChange(cb: (s: PlaybackState) => void): void {
    this.onStateChange = cb;
  }

  setOnLayersUpdated(cb: (l: SoundLayerConfig[]) => void): void {
    this.onLayersUpdated = cb;
  }

  setOnThunderStrike(cb: (i: number) => void): void {
    this.onThunderStrike = cb;
  }

  setOnSleepTimerChange(cb: (remaining: number) => void): void {
    this.onSleepTimerChange = cb;
  }

  setOnAssetStatusesChange(cb: (s: Record<string, AssetStatus>) => void): void {
    this.onAssetStatusesChange = cb;
  }

  // =========================================================================
  // Playback lifecycle
  // =========================================================================

  async play(): Promise<void> {
    if (this.destroyed) return;
    // Already heading there or there: no token churn, no duplicate work.
    if (this.intent === 'play' && (this.state === 'playing' || this.state === 'starting')) {
      return;
    }

    const token = ++this.opToken;
    this.intent = 'play';
    this.lastError = null;

    try {
      const ctx = this.ensureContext(); // throws if Web Audio is unavailable
      if (ctx.state !== 'running') {
        this.setState('starting');
        await ctx.resume();
      }
      // A pause/stop issued during the await supersedes this play.
      if (token !== this.opToken || this.intent !== 'play') return;

      this.setState('playing');
      this.reconcile();
    } catch (err) {
      if (token !== this.opToken) return;
      this.lastError = describeError(err);
      this.setState('error');
    }
  }

  resume(): Promise<void> {
    return this.play();
  }

  pause(): void {
    if (this.destroyed) return;
    if (this.intent === 'pause' && this.state === 'paused') return;

    this.opToken++; // invalidate any in-flight play()
    this.intent = 'pause';

    this.closeGate();
    this.retireAllSynthVoices();
    this.clearThunderTimer();
    this.scheduleElementPause();
    this.setState('paused');
  }

  stop(): void {
    if (this.destroyed) return;
    if (this.intent === 'stop' && this.state === 'stopped') return;

    this.opToken++;
    this.intent = 'stop';

    this.closeGate();
    this.retireAllSynthVoices();
    this.clearThunderTimer();
    this.clearSleepTimer(/* restoreOutput */ false);
    this.scheduleElementPause();
    this.setState('stopped');
  }

  // =========================================================================
  // Mixer
  // =========================================================================

  setLayerEnabled(layerId: string, enabled: boolean): void {
    const layer = this.getLayer(layerId);
    if (!layer || layer.enabled === enabled) return;
    layer.enabled = enabled;
    this.syncLayerGain(layer);
    if (this.state === 'playing') this.reconcile();
    this.notifyLayers();
  }

  setLayerVolume(layerId: string, volume: number): void {
    const layer = this.getLayer(layerId);
    if (!layer) return;
    layer.volume = clamp01(volume);
    this.syncLayerGain(layer);
    this.notifyLayers();
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = clamp01(volume);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.masterVolume,
        this.ctx.currentTime,
        GAIN_SMOOTHING
      );
    }
  }

  /** Applies a full mix. Absent layers are disabled (a preset defines everything). */
  applyPreset(states: LayerStates): void {
    for (const layer of this.layers) {
      const want = states[layer.id];
      layer.enabled = want ? !!want.enabled : false;
      if (want) layer.volume = clamp01(want.volume);
      this.syncLayerGain(layer);
    }
    if (this.state === 'playing') this.reconcile();
    this.notifyLayers();
  }

  // =========================================================================
  // Sleep timer
  // =========================================================================

  /**
   * Starts (or restarts) the timer. Auto-starts playback: choosing a duration
   * is an explicit wish to listen until it expires.
   */
  startSleepTimer(totalSeconds: number, fadeSeconds = DEFAULT_SLEEP_FADE): void {
    if (this.destroyed) return;
    this.clearSleepTimer(true);
    this.sleepRemaining = Math.max(1, Math.round(totalSeconds));
    this.sleepFadeSeconds = Math.max(0, Math.round(fadeSeconds));
    this.applySleepFade();
    // Interval must exist before the first report: getSleepTimerRemaining()
    // returns 0 while no interval is armed.
    this.sleepInterval = setInterval(() => this.tickSleepTimer(), this.opts.sleepTickMs);

    if (this.intent !== 'play') void this.play();

    this.notifySleepTimer();
  }

  addSleepTimerTime(seconds: number): void {
    if (this.sleepInterval === null) return;
    this.sleepRemaining = Math.max(0, this.sleepRemaining + Math.round(seconds));
    this.applySleepFade();
    this.notifySleepTimer();
  }

  cancelSleepTimer(): void {
    if (this.sleepInterval === null) return;
    this.clearSleepTimer(true);
    this.notifySleepTimer();
  }

  getSleepTimerRemaining(): number {
    return this.sleepInterval === null ? 0 : this.sleepRemaining;
  }

  private tickSleepTimer(): void {
    if (this.sleepInterval === null) return;
    this.sleepRemaining = Math.max(0, this.sleepRemaining - 1);
    this.applySleepFade();
    this.notifySleepTimer();

    if (this.sleepRemaining <= 0) {
      // Expiration always ends playback. stop() clears the timer itself and
      // leaves sleepGain at 0; the next play() restores it.
      this.stop();
    }
  }

  /** Maps remaining time onto the final fade window. */
  private applySleepFade(): void {
    if (!this.sleepGain || !this.ctx) return;
    let factor = 1;
    if (this.sleepFadeSeconds > 0 && this.sleepRemaining <= this.sleepFadeSeconds) {
      factor = Math.max(0, this.sleepRemaining / this.sleepFadeSeconds);
    }
    this.sleepGain.gain.setTargetAtTime(
      Math.pow(factor, 1.3),
      this.ctx.currentTime,
      0.2
    );
    if (factor <= 0 && this.intent === 'play') this.stop();
  }

  private clearSleepTimer(restoreOutput: boolean): void {
    if (this.sleepInterval !== null) {
      clearInterval(this.sleepInterval);
      this.sleepInterval = null;
    }
    this.sleepRemaining = 0;
    if (restoreOutput) {
      this.setSleepOutput(1);
    }
  }

  private setSleepOutput(value: number): void {
    if (!this.sleepGain || !this.ctx) return;
    this.sleepGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.15);
  }

  private notifySleepTimer(): void {
    this.onSleepTimerChange?.(this.getSleepTimerRemaining());
  }

  // =========================================================================
  // Context & graph
  // =========================================================================

  private ensureContext(): AudioContext {
    if (this.ctx && this.ctx.state !== 'closed') return this.ctx;

    const Ctor: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? window.AudioContext ?? (window as any).webkitAudioContext
        : undefined;
    if (!Ctor) throw new Error('Web Audio is not supported in this browser');

    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    const sleep = ctx.createGain();
    const gate = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();

    // One limiter: nine layers can sum past 0 dBFS. Threshold/ratio chosen so
    // it only engages on peaks, not on normal listening levels.
    limiter.threshold.setValueAtTime(-1.5, ctx.currentTime);
    limiter.knee.setValueAtTime(6, ctx.currentTime);
    limiter.ratio.setValueAtTime(8, ctx.currentTime);
    limiter.attack.setValueAtTime(0.003, ctx.currentTime);
    limiter.release.setValueAtTime(0.15, ctx.currentTime);

    master.gain.setValueAtTime(this.masterVolume, ctx.currentTime);
    sleep.gain.setValueAtTime(1, ctx.currentTime);
    gate.gain.setValueAtTime(this.state === 'paused' || this.state === 'stopped' ? 0 : 1, ctx.currentTime);

    master.connect(sleep);
    sleep.connect(gate);
    gate.connect(limiter);
    limiter.connect(ctx.destination);

    this.masterGain = master;
    this.sleepGain = sleep;
    this.gateGain = gate;
    this.limiter = limiter;

    this.layerGains.clear();
    for (const layer of this.layers) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(layer.enabled ? layer.volume : 0, ctx.currentTime);
      g.connect(master);
      this.layerGains.set(layer.id, g);
    }

    this.prepareNoiseBuffers(ctx); // (re)generates noise + sets synthContextReady

    // Route every recording element once. Elements that failed stay silent.
    for (const layer of this.layers) {
      const rt = this.runtime.get(layer.id);
      if (rt?.el && !rt.routed) {
        try {
          const src = ctx.createMediaElementSource(rt.el);
          src.connect(this.layerGains.get(layer.id)!);
          rt.routed = true;
        } catch (err) {
          this.markAssetFailed(layer.id, describeError(err));
        }
      }
    }

    ctx.addEventListener?.('statechange', () => this.handleContextStateChange());
    return ctx;
  }

  private prepareNoiseBuffers(ctx: AudioContext): void {
    const length = Math.floor(ctx.sampleRate * 5);
    const pink = ctx.createBuffer(1, length, ctx.sampleRate);
    const pd = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    const brown = ctx.createBuffer(1, length, ctx.sampleRate);
    const bd = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      bd[i] = last * 3.5;
    }
    this.pinkNoise = pink;
    this.brownNoise = brown;
    this.synthContextReady = true;
  }

  private layerGain(layerId: string): GainNode | null {
    return this.layerGains.get(layerId) ?? null;
  }

  private syncLayerGain(layer: SoundLayerConfig): void {
    const g = this.layerGain(layer.id);
    if (!g || !this.ctx) return;
    g.gain.setTargetAtTime(
      layer.enabled ? layer.volume : 0,
      this.ctx.currentTime,
      GAIN_SMOOTHING
    );
  }

  private closeGate(): void {
    if (this.gateGain && this.ctx) {
      this.gateGain.gain.setTargetAtTime(0, this.ctx.currentTime, GATE_FADE / 3);
    }
  }

  private openGate(): void {
    if (this.gateGain && this.ctx) {
      this.gateGain.gain.setTargetAtTime(1, this.ctx.currentTime, GAIN_SMOOTHING);
    }
  }

  // =========================================================================
  // Reconciliation: one idempotent path that makes audio match state
  // =========================================================================

  private reconcile(): void {
    if (this.state !== 'playing' || !this.ctx) {
      for (const layer of this.layers) this.stopLayerSource(layer.id, VOICE_FADE);
      this.clearThunderTimer();
      return;
    }

    this.openGate();

    if (this.sleepInterval === null) this.setSleepOutput(1);

    for (const layer of this.layers) {
      if (layer.enabled) this.startLayerSource(layer.id);
      else this.stopLayerSource(layer.id, VOICE_FADE);
      this.syncLayerGain(layer);
    }

    this.syncThunderSchedule(true); // quick first strike at playback start
  }

  private startLayerSource(layerId: string): void {
    const layer = this.getLayer(layerId);
    const rt = this.runtime.get(layerId);
    if (!layer || !rt) return;

    const wantsFile = rt.status !== 'failed';
    const current: LayerSourceKind | 'none' = this.synthVoices.has(layerId)
      ? 'synth'
      : rt.activeSource === 'file'
        ? 'file'
        : 'none';

    // Path change: tear the other path down first (never both at once).
    // A failure switch is instant — the file is silent or broken anyway.
    if (current === 'synth' && wantsFile) this.retireSynthVoice(layerId, VOICE_FADE);
    if (current === 'file' && !wantsFile && rt.el) this.safeElementPause(rt.el);

    if (wantsFile) {
      rt.activeSource = 'file';
      // Only loop layers are (re)started by reconciliation. Intermittent
      // layers fire exclusively from the strike scheduler — otherwise every
      // reconcile (a fader nudge, resume…) would re-trigger a finished
      // thunder recording.
      if (layer.playbackMode === 'loop') this.playElement(layerId);
    } else if (HAS_SYNTH_RECIPE.has(layerId)) {
      rt.activeSource = 'synth';
      this.startSynthVoice(layerId);
    } else {
      rt.activeSource = 'none';
    }
  }

  private stopLayerSource(layerId: string, fade: number): void {
    const rt = this.runtime.get(layerId);
    this.retireSynthVoice(layerId, fade);
    if (!rt) return;
    // The layer gain ramps to 0 underneath; pause the element only after that
    // ramp has landed so the cut is inaudible.
    if (rt.activeSource === 'file') this.scheduleLayerPause(layerId, this.opts.elementPauseDelay);
    rt.activeSource = 'none';
  }

  // -- file sources --------------------------------------------------------

  private playElement(layerId: string): void {
    const rt = this.runtime.get(layerId);
    if (!rt?.el || !this.ctx || this.ctx.state === 'closed') return;
    if (!rt.routed) return; // never audible outside the graph
    const el = rt.el;
    rt.pauseSeq++; // invalidate any deferred pause for this layer
    if (!el.paused && !el.ended) return;
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        if (this.state === 'playing' && this.intent === 'play') {
          // Autoplay/media refusal: fall back so the layer still sounds.
          this.markAssetFailed(layerId, 'playback was blocked');
        }
      });
    }
  }

  /**
   * Pauses a layer's element after `delayMs`, but only if the layer has not
   * been re-enabled and playback has not resumed in the meantime (seq guard).
   */
  private scheduleLayerPause(layerId: string, delayMs: number): void {
    const rt = this.runtime.get(layerId);
    if (!rt?.el || delayMs <= 0) {
      if (rt?.el) this.safeElementPause(rt.el);
      return;
    }
    const seq = rt.pauseSeq;
    this.later(() => {
      if (rt.pauseSeq !== seq) return; // superseded by an intended play
      const layer = this.getLayer(layerId);
      if (this.state === 'playing' && layer?.enabled) return; // legitimately active
      this.safeElementPause(rt.el!);
    }, delayMs);
  }

  private safeElementPause(el: HTMLAudioElement): void {
    try {
      if (!el.paused) el.pause();
    } catch {
      /* element already gone */
    }
  }

  /** Pauses all recording elements once the gate has closed on pause/stop. */
  private scheduleElementPause(): void {
    if (this.elementPauseTimer !== null) clearTimeout(this.elementPauseTimer);
    this.elementPauseTimer = setTimeout(() => {
      this.elementPauseTimer = null;
      if (this.state === 'playing') return; // resumed in the meantime
      for (const rt of this.runtime.values()) {
        if (rt.el) this.safeElementPause(rt.el);
      }
    }, this.opts.elementPauseDelay);
  }

  // -- synth fallback voices ------------------------------------------------

  private startSynthVoice(layerId: string): void {
    if (this.synthVoices.has(layerId)) return;
    if (!this.ctx || !this.synthContextReady || !this.pinkNoise || !this.brownNoise) return;
    const gain = this.layerGain(layerId);
    const recipe = SYNTH_RECIPES[layerId];
    if (!gain || !recipe) return;

    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0, this.ctx.currentTime);
    out.connect(gain);

    const b = new VoiceBuilder(this.ctx, out, this.pinkNoise, this.brownNoise);
    try {
      recipe(b);
    } catch {
      cleanupNodes(b.nodes);
      try {
        out.disconnect();
      } catch { /* already gone */ }
      return;
    }
    out.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05);

    const voice: SynthVoice = { out, sources: b.sources, nodes: b.nodes, disposed: false };
    this.synthVoices.set(layerId, voice);
  }

  private retireSynthVoice(layerId: string, fade: number): void {
    const voice = this.synthVoices.get(layerId);
    if (!voice || voice.disposed) return;
    this.synthVoices.delete(layerId);
    this.disposeVoice(voice, fade);
  }

  private retireAllSynthVoices(): void {
    for (const layerId of [...this.synthVoices.keys()]) {
      this.retireSynthVoice(layerId, VOICE_FADE);
    }
  }

  private disposeVoice(voice: SynthVoice, fade: number): void {
    voice.disposed = true;
    const dispose = () => {
      try {
        voice.out.disconnect();
      } catch { /* already gone */ }
      cleanupNodes(voice.nodes);
    };

    if (!this.ctx || this.ctx.state === 'closed' || fade <= 0) {
      dispose();
      return;
    }

    const now = this.ctx.currentTime;
    voice.out.gain.cancelScheduledValues(now);
    voice.out.gain.setTargetAtTime(0, now, fade / 3);
    const stopAt = now + fade;
    let ended = false;
    for (const src of voice.sources) {
      try {
        src.stop(stopAt);
      } catch {
        /* never started or already stopped */
      }
    }
    const first = voice.sources[0] as any;
    const onEnded = () => {
      if (ended) return;
      ended = true;
      dispose();
    };
    if (first && typeof first.addEventListener === 'function') {
      first.addEventListener('ended', onEnded, { once: true });
    } else if (first) {
      first.onended = onEnded;
    } else {
      dispose();
    }
    // Safety net for contexts that never fire 'ended'.
    this.later(dispose, fade * 1000 + 250);
  }

  /** Tracked one-shot timer: cleared automatically by destroy(). */
  private later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      this.transientTimers.delete(id);
      fn();
    }, ms);
    this.transientTimers.add(id);
    return id;
  }

  // =========================================================================
  // Thunder scheduler
  // =========================================================================

  private thunderCandidates(): SoundLayerConfig[] {
    return this.layers.filter(
      (l) => l.playbackMode === 'intermittent' && l.enabled
    );
  }

  private syncThunderSchedule(quickFirst = false): void {
    if (this.state !== 'playing' || this.thunderCandidates().length === 0) {
      this.clearThunderTimer();
      return;
    }
    if (this.thunderTimer !== null) return; // keep the pending strike

    const delay = quickFirst ? this.quickStrikeDelayMs() : this.nextStrikeDelayMs();
    this.thunderDelayMs = delay;

    this.thunderTimer = setTimeout(() => {
      this.thunderTimer = null;
      this.thunderDelayMs = null;
      if (this.state !== 'playing') return;
      const candidates = this.thunderCandidates();
      if (candidates.length === 0) return;
      this.fireStrikeSequence(candidates);
      this.syncThunderSchedule();
    }, delay);
  }

  /** First strike after play/resume: uniform inside the quick window. */
  private quickStrikeDelayMs(): number {
    const [qMin, qMax] = this.opts.quickStrikeDelay;
    return qMin + this.opts.rng() * Math.max(0, qMax - qMin);
  }

  /**
   * Gap to the next strike. Inside a rolling burst the gaps are short; at the
   * base level the uniform draw is skewed short (pow > 1) so storms read
   * denser than flat-random — and never rarer — within the configured window.
   */
  private nextStrikeDelayMs(): number {
    if (this.burstLeft > 0) {
      this.burstLeft--;
      const [bMin, bMax] = this.opts.burstDelay;
      return bMin + this.opts.rng() * Math.max(0, bMax - bMin);
    }
    const [dMin, dMax] = this.opts.strikeDelay;
    const skew = Math.pow(this.opts.rng(), BASE_GAP_SKEW);
    return dMin + skew * Math.max(0, dMax - dMin);
  }

  /**
   * One scheduled moment can yield more than one strike: with both thunder
   * layers enabled a strike may pair the other one near-simultaneously, and
   * a strike can open a rolling burst (never nested: only a non-burst strike
   * opens one).
   */
  private fireStrikeSequence(candidates: SoundLayerConfig[]): void {
    const main = this.pickStrikeLayer(candidates);
    this.fireStrike(main);

    if (candidates.length > 1 && this.opts.rng() < PAIR_CHANCE) {
      const other = candidates.find((c) => c.id !== main.id);
      if (other) this.fireStrike(other);
    }

    if (this.burstLeft === 0 && this.opts.rng() < BURST_CHANCE) {
      this.burstLeft = 1 + Math.floor(this.opts.rng() * BURST_COUNT_MAX);
    }
  }

  /** Random candidate, biased away from the previous strike's layer. */
  private pickStrikeLayer(candidates: SoundLayerConfig[]): SoundLayerConfig {
    const pool =
      candidates.length > 1 && this.lastStrikeLayerId !== null
        ? candidates.filter((c) => c.id !== this.lastStrikeLayerId)
        : candidates;
    const pick = pool[Math.floor(this.opts.rng() * pool.length)];
    this.lastStrikeLayerId = pick.id;
    return pick;
  }

  private clearThunderTimer(): void {
    if (this.thunderTimer !== null) {
      clearTimeout(this.thunderTimer);
      this.thunderTimer = null;
    }
    this.thunderDelayMs = null;
    this.burstLeft = 0; // a cleared schedule forgets any rolling burst
  }

  private fireStrike(layer: SoundLayerConfig): void {
    const profile = STRIKE_PROFILES[layer.id] ?? {
      intensity: [0.6, 1],
      subHz: 50,
      cutoffHz: 200,
    };
    const intensity =
      profile.intensity[0] +
      Math.random() * (profile.intensity[1] - profile.intensity[0]);

    this.onThunderStrike?.(intensity);

    const rt = this.runtime.get(layer.id);
    if (rt && rt.status !== 'failed' && rt.el && rt.routed) {
      const el = rt.el;
      rt.pauseSeq++; // a strike is an intended play: cancel pending pauses
      try {
        el.currentTime = 0;
      } catch { /* metadata not seekable yet */ }
      el.volume = intensity;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => this.markAssetFailed(layer.id, 'playback was blocked'));
      return;
    }

    // Synth fallback strike.
    if (!this.ctx || !this.synthContextReady || !this.brownNoise) return;
    const gain = this.layerGain(layer.id);
    if (!gain) return;
    const now = this.ctx.currentTime;

    const out = this.ctx.createGain();
    out.gain.setValueAtTime(1, now);
    out.connect(gain);

    const sub = this.ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(profile.subHz, now);
    sub.frequency.exponentialRampToValueAtTime(profile.subHz * 0.55, now + 1.8);
    const subG = this.ctx.createGain();
    subG.gain.setValueAtTime(intensity * 0.8, now);
    subG.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.brownNoise;
    noise.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(profile.cutoffHz, now);
    const nG = this.ctx.createGain();
    nG.gain.setValueAtTime(intensity * 0.6, now);
    nG.gain.exponentialRampToValueAtTime(0.001, now + 3.2);

    sub.connect(subG);
    subG.connect(out);
    noise.connect(lp);
    lp.connect(nG);
    nG.connect(out);

    sub.start(now);
    sub.stop(now + 2.8);
    noise.start(now);
    noise.stop(now + 3.5);

    const nodes: AudioNode[] = [out, sub, subG, noise, lp, nG];
    const cleanupTimer = this.later(() => {
      try {
        sub.disconnect();
      } catch { /* gone */ }
      cleanupNodes(nodes);
    }, 3600);
    const first = sub as any;
    if (typeof first.addEventListener === 'function') {
      first.addEventListener(
        'ended',
        () => {
          clearTimeout(cleanupTimer);
          this.transientTimers.delete(cleanupTimer);
        },
        { once: true }
      );
    }
  }

  // =========================================================================
  // Asset loading (file path)
  // =========================================================================

  private createLayerRuntime(layer: SoundLayerConfig): LayerRuntime {
    const file = LAYER_ASSETS[layer.id];
    let el: HTMLAudioElement | null = null;
    try {
      if (file && typeof document !== 'undefined' && document.createElement) {
        el = document.createElement('audio');
        // Metadata only: the recordings are multi-hour files. preload='auto'
        // would buffer gigabytes before the page's load event (and stall
        // startup); playback streams on demand from the loopback server.
        el.preload = 'metadata';
        el.loop = layer.playbackMode === 'loop';
        el.src = ASSET_BASE + file;
        el.addEventListener?.('error', () =>
          this.markAssetFailed(layer.id, 'recording could not be loaded')
        );
        el.addEventListener?.('canplay', () => this.markAssetReady(layer.id));
      }
    } catch {
      el = null;
    }

    // Record construction-time failures before the runtime is registered.
    if (!el || !file) {
      const reason = file ? 'audio element unavailable' : 'no recording mapped';
      this.lastFailureReasons.set(layer.id, reason);
    }

    return {
      el,
      routed: false,
      status: !el || !file ? 'failed' : 'loading',
      activeSource: 'none',
      pauseSeq: 0,
    };
  }

  private markAssetReady(layerId: string): void {
    const rt = this.runtime.get(layerId);
    if (!rt || rt.status === 'ready') return;
    rt.status = 'ready';
    this.notifyAssetStatuses();
    if (this.state === 'playing' && this.getLayer(layerId)?.enabled) this.reconcile();
  }

  private markAssetFailed(layerId: string, reason: string): void {
    const rt = this.runtime.get(layerId);
    if (!rt || rt.status === 'failed') return;
    rt.status = 'failed';
    this.lastFailureReasons.set(layerId, reason);
    this.notifyAssetStatuses();
    if (this.state === 'playing' && this.getLayer(layerId)?.enabled) {
      this.reconcile(); // engage the synth fallback for this layer
    }
  }

  /** Layer id → reason, for every failed recording. */
  getAssetFailures(): AssetFailure[] {
    const out: AssetFailure[] = [];
    for (const [layerId, reason] of this.lastFailureReasons) {
      out.push({ layerId, reason });
    }
    return out;
  }

  getAssetStatuses(): Record<string, AssetStatus> {
    const out: Record<string, AssetStatus> = {};
    for (const [id, rt] of this.runtime) out[id] = rt.status;
    return out;
  }

  private notifyAssetStatuses(): void {
    this.onAssetStatusesChange?.(this.getAssetStatuses());
  }

  // =========================================================================
  // Browser lifecycle recovery (never overrides user intent)
  // =========================================================================

  private attachVisibilityListener(): void {
    if (typeof document === 'undefined' || this.boundVisibility) return;
    this.boundVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // INVARIANT: intent is only ever changed by explicit user actions.
      if (this.intent !== 'play') return;

      if (this.state === 'playing') {
        const ctx = this.ctx;
        if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
          ctx.resume().catch((err) => {
            this.lastError = describeError(err);
            this.setState('error');
          });
        }
        this.reconcile();
      } else if (this.state === 'error' || this.state === 'starting') {
        void this.play(); // retry initialization; still user intent 'play'
      }
    };
    document.addEventListener('visibilitychange', this.boundVisibility);
  }

  private handleContextStateChange(): void {
    if (!this.ctx || this.destroyed) return;
    if (this.ctx.state === 'running') {
      if (this.intent === 'play' && this.state === 'playing') this.reconcile();
      return;
    }
    // Browser suspended/interrupted us (OS audio session, background tab).
    // Resume only if the user still wants playback.
    if (this.intent !== 'play' || this.state !== 'playing') return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    this.ctx.resume().catch((err) => {
      this.lastError = describeError(err);
      this.setState('error');
    });
  }

  // =========================================================================
  // Getters
  // =========================================================================

  getState(): PlaybackState {
    return this.state;
  }

  getIntent(): PlaybackIntent {
    return this.intent;
  }

  getError(): string | null {
    return this.lastError;
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getLayers(): SoundLayerConfig[] {
    return this.layers.map((l) => ({ ...l }));
  }

  /** Snapshot for tests and diagnostics. */
  getDiagnostics(): {
    state: PlaybackState;
    intent: PlaybackIntent;
    synthVoices: number;
    playingElements: number;
    pendingThunder: boolean;
    /** Delay of the pending strike in ms, null when none is scheduled. */
    nextThunderDelayMs: number | null;
    sleepRemaining: number;
    routedElements: number;
    gateValue: number;
    sleepFactor: number;
    masterGainValue: number;
    layerGainValues: Record<string, number>;
    sources: Record<string, LayerSourceKind | 'none'>;
  } {
    let playingElements = 0;
    let routedElements = 0;
    for (const rt of this.runtime.values()) {
      if (rt.routed) routedElements++;
      if (rt.el && !rt.el.paused) playingElements++;
    }
    const sources: Record<string, LayerSourceKind | 'none'> = {};
    for (const [id, rt] of this.runtime) {
      sources[id] = this.synthVoices.has(id) ? 'synth' : rt.activeSource;
    }
    const layerGainValues: Record<string, number> = {};
    for (const [id, g] of this.layerGains) layerGainValues[id] = g.gain.value;
    return {
      state: this.state,
      intent: this.intent,
      synthVoices: this.synthVoices.size,
      playingElements,
      pendingThunder: this.thunderTimer !== null,
      nextThunderDelayMs: this.thunderDelayMs,
      sleepRemaining: this.getSleepTimerRemaining(),
      routedElements,
      gateValue: this.gateGain ? this.gateGain.gain.value : 1,
      sleepFactor: this.sleepGain ? this.sleepGain.gain.value : 1,
      masterGainValue: this.masterGain ? this.masterGain.gain.value : this.masterVolume,
      layerGainValues,
      sources,
    };
  }

  // =========================================================================
  // Teardown
  // =========================================================================

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.opToken++;

    this.clearThunderTimer();
    this.clearSleepTimer(false);
    if (this.elementPauseTimer !== null) {
      clearTimeout(this.elementPauseTimer);
      this.elementPauseTimer = null;
    }
    for (const id of this.transientTimers) clearTimeout(id);
    this.transientTimers.clear();

    for (const voice of [...this.synthVoices.values()]) {
      this.disposeVoice(voice, 0);
    }
    this.synthVoices.clear();

    for (const rt of this.runtime.values()) {
      if (!rt.el) continue;
      try {
        rt.el.pause();
        rt.el.removeAttribute?.('src');
        rt.el.load?.();
      } catch { /* teardown best effort */ }
      rt.routed = false;
      rt.activeSource = 'none';
    }

    this.layerGains.clear();
    this.masterGain = null;
    this.sleepGain = null;
    this.gateGain = null;
    this.limiter = null;

    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== 'closed') {
      try {
        void ctx.close();
      } catch { /* already closing */ }
    }

    if (this.boundVisibility && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibility);
      this.boundVisibility = null;
    }

    this.intent = 'stop';
    this.state = 'stopped';
  }

  // =========================================================================
  // Internals
  // =========================================================================

  private getLayer(layerId: string): SoundLayerConfig | undefined {
    return this.layers.find((l) => l.id === layerId);
  }

  private setState(next: PlaybackState): void {
    if (this.state === next) return;
    this.state = next;
    this.onStateChange?.(next);
  }

  private notifyLayers(): void {
    this.onLayersUpdated?.(this.getLayers());
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function cleanupNodes(nodes: AudioNode[]): void {
  for (const n of nodes) {
    try {
      n.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err ?? 'unknown audio error');
}

/** App-wide instance. Tests construct their own SoundEngine. */
export const soundEngine = new SoundEngine();
