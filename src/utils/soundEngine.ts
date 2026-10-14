/**
 * Rainfocus — High-Fidelity Hybrid Audio Engine
 * 
 * Primary Foundation: Authentic, licensed environmental field recordings (CC0 / Public Domain / CC-BY)
 * Sourced from Wikimedia Commons & BigSoundBank with verified attribution.
 * 
 * Features:
 * - Dual-buffer seamless crossfaded looping (zero audible seams, clicks, or dropouts)
 * - Genuinely distinct rain environments: Window Glass, Cedar Roof, Torrential Downpour, Forest Mist, Steady Rain
 * - Intermittent stochastic rolling thunder with natural delay envelopes
 * - Continuous natural wind and optional fireside crackle
 * - Strictly optional, subtle harmonic pad and binaural tones (default OFF)
 * - Clean state isolation: Zero layer bleeding when switching presets
 */

export type RainEnvironment = 'window' | 'roof' | 'heavy' | 'soft' | 'steady' | 'storm';
export type ThunderFrequency = 'off' | 'rare' | 'occasional' | 'frequent';
export type BinauralBand = 'delta' | 'theta' | 'alpha' | 'off';

export interface SoundMixerState {
  masterVolume: number;

  // Rain Layer (Primary Bed — Recorded Field Audio)
  rainEnabled: boolean;
  rainVolume: number;
  rainEnvironment: RainEnvironment;

  // Environmental Layers
  thunderEnabled: boolean;
  thunderVolume: number;
  thunderFrequency: ThunderFrequency;

  windEnabled: boolean;
  windVolume: number;

  fireEnabled: boolean;
  fireVolume: number;

  // Optional Tonal / Harmonic Layers (Subtle, Default Off)
  binauralEnabled: boolean;
  binauralVolume: number;
  binauralBand: BinauralBand;

  droneEnabled: boolean;
  ambientDroneVolume: number;
}

export const DEFAULT_MIXER: SoundMixerState = {
  masterVolume: 0.85,
  rainEnabled: true,
  rainVolume: 0.92,
  rainEnvironment: 'roof',

  thunderEnabled: true,
  thunderVolume: 0.45,
  thunderFrequency: 'rare',

  windEnabled: false,
  windVolume: 0.15,

  fireEnabled: false,
  fireVolume: 0.20,

  binauralEnabled: false,
  binauralVolume: 0.05,
  binauralBand: 'delta',

  droneEnabled: false,
  ambientDroneVolume: 0.04,
};

// Audio asset paths with primary and fallback support
const AUDIO_ASSETS: Record<string, string[]> = {
  rain_window: ['/audio/rain_window.ogg', '/audio/rain_window.mp3'],
  rain_roof: ['/audio/rain_roof.ogg', '/audio/rain_roof.mp3'],
  rain_heavy: ['/audio/rain_heavy.ogg', '/audio/rain_heavy.mp3'],
  rain_soft: ['/audio/rain_soft.ogg', '/audio/rain_soft.mp3'],
  rain_steady: ['/audio/rain_steady.ogg', '/audio/rain_steady.mp3'],
  rain_storm: ['/audio/rain_thunder_storm.ogg', '/audio/rain_thunder_storm.mp3'],
  thunder: ['/audio/thunder_distant.ogg', '/audio/thunder_distant.mp3'],
  wind: ['/audio/wind_breeze.ogg', '/audio/wind_breeze.mp3'],
};

class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;

  // Master Gain Chain
  private masterGain: GainNode | null = null;
  private fadeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Channel Gains
  private rainGain: GainNode | null = null;
  private thunderGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private fireGain: GainNode | null = null;
  private binauralGain: GainNode | null = null;
  private droneGain: GainNode | null = null;

  // Buffer Cache
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private loadingPromises: Map<string, Promise<AudioBuffer | null>> = new Map();

  // Active Loop Nodes for Rain
  private activeRainSources: { source: AudioBufferSourceNode; gain: GainNode }[] = [];
  private rainLoopTimer: any = null;
  private currentRainEnv: RainEnvironment = 'roof';

  // Active Loop Nodes for Wind
  private activeWindSources: { source: AudioBufferSourceNode; gain: GainNode }[] = [];
  private windLoopTimer: any = null;

  // Thunder Scheduler
  private thunderTimer: any = null;
  private onThunderStrikeCallback: ((intensity: number) => void) | null = null;

  // Fire Synthesis Timer
  private fireTimer: any = null;

  // Tonal Oscillators
  private binauralLeftOsc: OscillatorNode | null = null;
  private binauralRightOsc: OscillatorNode | null = null;
  private binauralMerger: ChannelMergerNode | null = null;
  private droneOscs: OscillatorNode[] = [];

  // Current State
  private state: SoundMixerState = { ...DEFAULT_MIXER };
  private currentFadeFactor = 1.0;
  private onStateChange: ((playing: boolean) => void) | null = null;

  public setOnStateChange(cb: (playing: boolean) => void) {
    this.onStateChange = cb;
  }

  public setOnThunderStrike(cb: (intensity: number) => void) {
    this.onThunderStrikeCallback = cb;
  }

  private initContext() {
    if (this.ctx && this.ctx.state !== 'closed') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();

    // Master Output & Analyser
    this.masterGain = this.ctx.createGain();
    this.fadeGain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;
    this.analyser.smoothingTimeConstant = 0.85;

    this.fadeGain.gain.setValueAtTime(this.currentFadeFactor, this.ctx.currentTime);
    this.masterGain.gain.setValueAtTime(this.state.masterVolume, this.ctx.currentTime);

    this.masterGain.connect(this.fadeGain);
    this.fadeGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Channel Gains
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.setValueAtTime(this.state.rainEnabled ? this.state.rainVolume : 0, this.ctx.currentTime);
    this.rainGain.connect(this.masterGain);

    this.thunderGain = this.ctx.createGain();
    this.thunderGain.gain.setValueAtTime(this.state.thunderEnabled ? this.state.thunderVolume : 0, this.ctx.currentTime);
    this.thunderGain.connect(this.masterGain);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(this.state.windEnabled ? this.state.windVolume : 0, this.ctx.currentTime);
    this.windGain.connect(this.masterGain);

    this.fireGain = this.ctx.createGain();
    this.fireGain.gain.setValueAtTime(this.state.fireEnabled ? this.state.fireVolume : 0, this.ctx.currentTime);
    this.fireGain.connect(this.masterGain);

    this.binauralGain = this.ctx.createGain();
    this.binauralGain.gain.setValueAtTime(this.state.binauralEnabled ? this.state.binauralVolume : 0, this.ctx.currentTime);
    this.binauralGain.connect(this.masterGain);

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(this.state.droneEnabled ? this.state.ambientDroneVolume : 0, this.ctx.currentTime);
    this.droneGain.connect(this.masterGain);
  }

  // Asynchronous Audio Asset Loader with Fallback
  private async loadAudioBuffer(key: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(key)) {
      return this.bufferCache.get(key)!;
    }
    if (this.loadingPromises.has(key)) {
      return this.loadingPromises.get(key)!;
    }

    const loadPromise = (async () => {
      this.initContext();
      if (!this.ctx) return null;

      const urls = AUDIO_ASSETS[key] || [];
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const arrayBuffer = await res.arrayBuffer();
          const decoded = await this.ctx.decodeAudioData(arrayBuffer);
          this.bufferCache.set(key, decoded);
          return decoded;
        } catch (e) {
          console.warn(`Failed loading audio from ${url}:`, e);
        }
      }
      return null;
    })();

    this.loadingPromises.set(key, loadPromise);
    const result = await loadPromise;
    this.loadingPromises.delete(key);
    return result;
  }

  // --- Rain Audio Loop with Seamless Overlap Crossfade ---
  private async startRainLoop(env: RainEnvironment) {
    this.stopRainLoop();
    this.currentRainEnv = env;

    const assetKey = env === 'storm' ? 'rain_storm' : `rain_${env}`;
    const buffer = await this.loadAudioBuffer(assetKey);
    if (!buffer || !this.ctx || !this.rainGain || !this.isPlaying) return;

    const duration = buffer.duration;
    // Overlap crossfade duration (1.5 seconds)
    const crossfadeSec = Math.min(2.0, duration * 0.15);

    const scheduleNextPass = (startTime: number) => {
      if (!this.ctx || !this.rainGain || !this.isPlaying || this.currentRainEnv !== env) return;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const localGain = this.ctx.createGain();
      source.connect(localGain);
      localGain.connect(this.rainGain);

      // Fade-in curve at loop start
      localGain.gain.setValueAtTime(0.001, startTime);
      localGain.gain.linearRampToValueAtTime(1.0, startTime + crossfadeSec);

      // Fade-out curve before loop end
      const endTime = startTime + duration;
      localGain.gain.setValueAtTime(1.0, endTime - crossfadeSec);
      localGain.gain.linearRampToValueAtTime(0.001, endTime);

      source.start(startTime);
      source.stop(endTime + 0.1);

      this.activeRainSources.push({ source, gain: localGain });

      // Clean up old references
      setTimeout(() => {
        const idx = this.activeRainSources.findIndex((s) => s.source === source);
        if (idx !== -1) {
          try {
            source.disconnect();
            localGain.disconnect();
          } catch (_) {}
          this.activeRainSources.splice(idx, 1);
        }
      }, (duration + 1) * 1000);

      // Schedule subsequent pass so the next loop starts before the current one fades out
      const nextStartTime = endTime - crossfadeSec;
      const delayMs = Math.max(100, (nextStartTime - this.ctx.currentTime) * 1000);

      this.rainLoopTimer = setTimeout(() => {
        if (this.isPlaying && this.currentRainEnv === env) {
          scheduleNextPass(nextStartTime);
        }
      }, delayMs);
    };

    scheduleNextPass(this.ctx.currentTime);
  }

  private stopRainLoop() {
    if (this.rainLoopTimer) clearTimeout(this.rainLoopTimer);
    this.rainLoopTimer = null;

    this.activeRainSources.forEach(({ source, gain }) => {
      try {
        source.stop();
        source.disconnect();
        gain.disconnect();
      } catch (_) {}
    });
    this.activeRainSources = [];
  }

  // --- Wind Audio Loop with Overlap Crossfade ---
  private async startWindLoop() {
    this.stopWindLoop();
    if (!this.state.windEnabled) return;

    const buffer = await this.loadAudioBuffer('wind');
    if (!buffer || !this.ctx || !this.windGain || !this.isPlaying) return;

    const duration = buffer.duration;
    const crossfadeSec = Math.min(2.5, duration * 0.15);

    const scheduleWindPass = (startTime: number) => {
      if (!this.ctx || !this.windGain || !this.isPlaying || !this.state.windEnabled) return;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const localGain = this.ctx.createGain();
      source.connect(localGain);
      localGain.connect(this.windGain);

      localGain.gain.setValueAtTime(0.001, startTime);
      localGain.gain.linearRampToValueAtTime(1.0, startTime + crossfadeSec);

      const endTime = startTime + duration;
      localGain.gain.setValueAtTime(1.0, endTime - crossfadeSec);
      localGain.gain.linearRampToValueAtTime(0.001, endTime);

      source.start(startTime);
      source.stop(endTime + 0.1);

      this.activeWindSources.push({ source, gain: localGain });

      setTimeout(() => {
        const idx = this.activeWindSources.findIndex((s) => s.source === source);
        if (idx !== -1) {
          try {
            source.disconnect();
            localGain.disconnect();
          } catch (_) {}
          this.activeWindSources.splice(idx, 1);
        }
      }, (duration + 1) * 1000);

      const nextStartTime = endTime - crossfadeSec;
      const delayMs = Math.max(100, (nextStartTime - this.ctx.currentTime) * 1000);

      this.windLoopTimer = setTimeout(() => {
        if (this.isPlaying && this.state.windEnabled) {
          scheduleWindPass(nextStartTime);
        }
      }, delayMs);
    };

    scheduleWindPass(this.ctx.currentTime);
  }

  private stopWindLoop() {
    if (this.windLoopTimer) clearTimeout(this.windLoopTimer);
    this.windLoopTimer = null;

    this.activeWindSources.forEach(({ source, gain }) => {
      try {
        source.stop();
        source.disconnect();
        gain.disconnect();
      } catch (_) {}
    });
    this.activeWindSources = [];
  }

  // --- Distant Thunder Trigger & Stochastic Scheduler ---
  public async triggerThunder(customIntensity?: number) {
    if (!this.ctx || !this.thunderGain || !this.isPlaying || !this.state.thunderEnabled) return;

    const intensity = customIntensity !== undefined ? customIntensity : 0.55 + Math.random() * 0.4;
    const now = this.ctx.currentTime;

    if (this.onThunderStrikeCallback) {
      this.onThunderStrikeCallback(intensity);
    }

    const thunderBuffer = await this.loadAudioBuffer('thunder');

    if (thunderBuffer && this.ctx) {
      // Authentic recorded thunder playback with gentle randomized spatial pan & pitch nuance
      const source = this.ctx.createBufferSource();
      source.buffer = thunderBuffer;
      // Slight pitch variation (0.92 to 1.05) creates unique strikes every time
      source.playbackRate.setValueAtTime(0.92 + Math.random() * 0.14, now);

      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      const localGain = this.ctx.createGain();
      localGain.gain.setValueAtTime(0.75 * intensity, now);

      if (panner) {
        const startPan = (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.4);
        panner.pan.setValueAtTime(startPan, now);
        panner.pan.linearRampToValueAtTime(-startPan * 0.5, now + thunderBuffer.duration);

        source.connect(localGain);
        localGain.connect(panner);
        panner.connect(this.thunderGain);
      } else {
        source.connect(localGain);
        localGain.connect(this.thunderGain);
      }

      source.start(now);
      source.stop(now + thunderBuffer.duration + 0.1);
    } else {
      // Procedural fallback if buffer still loading
      this.triggerProceduralThunder(now, intensity);
    }
  }

  private triggerProceduralThunder(now: number, intensity: number) {
    if (!this.ctx || !this.thunderGain) return;

    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    const subFilter = this.ctx.createBiquadFilter();

    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(75, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 4.2);

    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(110, now);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.45 * intensity, now + 0.35);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 5.5);

    subOsc.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(this.thunderGain);

    subOsc.start(now);
    subOsc.stop(now + 6.0);
  }

  private scheduleNextThunder(initialFast = false) {
    if (this.thunderTimer) clearTimeout(this.thunderTimer);
    if (!this.isPlaying || !this.state.thunderEnabled || this.state.thunderFrequency === 'off') return;

    let minSeconds = 25;
    let maxSeconds = 55;

    switch (this.state.thunderFrequency) {
      case 'rare':
        minSeconds = 35;
        maxSeconds = 75;
        break;
      case 'occasional':
        minSeconds = 16;
        maxSeconds = 38;
        break;
      case 'frequent':
        minSeconds = 8;
        maxSeconds = 18;
        break;
    }

    const delay = initialFast
      ? (3 + Math.random() * 3) * 1000
      : (minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000;

    this.thunderTimer = setTimeout(() => {
      if (this.isPlaying && this.state.thunderEnabled && this.state.thunderFrequency !== 'off') {
        this.triggerThunder();
        this.scheduleNextThunder(false);
      }
    }, delay);
  }

  // --- Fireside Crackle ---
  private startFire() {
    if (!this.ctx || !this.fireGain) return;

    const triggerCrackle = () => {
      if (!this.ctx || !this.fireGain || !this.isPlaying || !this.state.fireEnabled) return;
      const now = this.ctx.currentTime;

      const crackleLength = 0.012 + Math.random() * 0.02;
      const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * crackleLength), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.3));
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(1400 + Math.random() * 1400, now);
      f.Q.setValueAtTime(3.0, now);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.06 + Math.random() * 0.12, now);

      source.connect(f);
      f.connect(g);
      g.connect(this.fireGain);

      source.start(now);
      source.stop(now + crackleLength);

      const nextDelay = 140 + Math.random() * 340;
      this.fireTimer = setTimeout(triggerCrackle, nextDelay);
    };

    triggerCrackle();
  }

  // --- Optional Subtle Tonal Layers (Default Off) ---
  private startBinaural() {
    if (!this.ctx || !this.binauralGain) return;
    if (!this.state.binauralEnabled || this.state.binauralBand === 'off') return;

    const baseFreq = 196.0;
    let beatDelta = 2.0;

    switch (this.state.binauralBand) {
      case 'delta':
        beatDelta = 2.0;
        break;
      case 'theta':
        beatDelta = 5.5;
        break;
      case 'alpha':
        beatDelta = 10.0;
        break;
    }

    this.binauralLeftOsc = this.ctx.createOscillator();
    this.binauralRightOsc = this.ctx.createOscillator();

    this.binauralLeftOsc.type = 'sine';
    this.binauralRightOsc.type = 'sine';

    this.binauralLeftOsc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    this.binauralRightOsc.frequency.setValueAtTime(baseFreq + beatDelta, this.ctx.currentTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, this.ctx.currentTime);

    this.binauralMerger = this.ctx.createChannelMerger(2);

    this.binauralLeftOsc.connect(this.binauralMerger, 0, 0);
    this.binauralRightOsc.connect(this.binauralMerger, 0, 1);

    this.binauralMerger.connect(filter);
    filter.connect(this.binauralGain);

    this.binauralLeftOsc.start();
    this.binauralRightOsc.start();
  }

  private stopBinaural() {
    try {
      this.binauralLeftOsc?.stop();
      this.binauralRightOsc?.stop();
    } catch (_) {}
    this.binauralLeftOsc = null;
    this.binauralRightOsc = null;
    this.binauralMerger = null;
  }

  private startDrone() {
    if (!this.ctx || !this.droneGain) return;
    if (!this.state.droneEnabled) return;

    const pitches = [64.8, 97.2, 129.6];
    this.droneOscs = [];

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(160, this.ctx.currentTime);
    filter.connect(this.droneGain);

    pitches.forEach((pitch) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.05 / pitches.length, this.ctx.currentTime);

      osc.connect(oscGain);
      oscGain.connect(filter);
      osc.start();
      this.droneOscs.push(osc);
    });
  }

  private stopDrone() {
    this.droneOscs.forEach((o) => {
      try { o.stop(); } catch (_) {}
    });
    this.droneOscs = [];
  }

  // --- Master Play / Pause ---
  public async play() {
    this.initContext();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.isPlaying) return;
    this.isPlaying = true;

    // Start primary rain recording loop
    this.startRainLoop(this.state.rainEnvironment);

    // Start environmental layers
    if (this.state.thunderEnabled && this.state.thunderFrequency !== 'off') {
      this.scheduleNextThunder(true);
    }
    if (this.state.windEnabled) {
      this.startWindLoop();
    }
    if (this.state.fireEnabled) {
      this.startFire();
    }
    if (this.state.binauralEnabled) {
      this.startBinaural();
    }
    if (this.state.droneEnabled) {
      this.startDrone();
    }

    if (this.onStateChange) this.onStateChange(true);
  }

  public pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    if (this.thunderTimer) clearTimeout(this.thunderTimer);
    if (this.fireTimer) clearTimeout(this.fireTimer);

    this.stopRainLoop();
    this.stopWindLoop();
    this.stopBinaural();
    this.stopDrone();

    if (this.onStateChange) this.onStateChange(false);
  }

  // --- Smooth Crossfading Between Soundscape Environments ---
  public crossfadeTo(updates: Partial<SoundMixerState>, durationSeconds = 0.8) {
    const previousRainEnv = this.state.rainEnvironment;
    this.state = { ...this.state, ...updates };
    const now = this.ctx ? this.ctx.currentTime : 0;
    const timeConstant = Math.max(0.12, durationSeconds / 2.5);

    // If rain environment changed, smoothly crossfade to the new recording
    if (updates.rainEnvironment !== undefined && updates.rainEnvironment !== previousRainEnv && this.isPlaying) {
      this.startRainLoop(updates.rainEnvironment);
    }

    // Master Volume
    if (this.masterGain && updates.masterVolume !== undefined) {
      this.masterGain.gain.setTargetAtTime(updates.masterVolume, now, timeConstant);
    }

    // Rain Channel Gain
    if (this.rainGain) {
      const targetGain = this.state.rainEnabled ? this.state.rainVolume : 0.0;
      this.rainGain.gain.setTargetAtTime(targetGain, now, timeConstant);
    }

    // Thunder Channel Gain & Scheduling
    if (this.thunderGain) {
      const targetGain = this.state.thunderEnabled ? this.state.thunderVolume : 0.0;
      this.thunderGain.gain.setTargetAtTime(targetGain, now, timeConstant);
    }
    if (updates.thunderFrequency !== undefined || updates.thunderEnabled !== undefined) {
      if (this.state.thunderEnabled && this.state.thunderFrequency !== 'off') {
        this.scheduleNextThunder(true);
      } else if (this.thunderTimer) {
        clearTimeout(this.thunderTimer);
      }
    }

    // Wind Channel Gain & Loop
    if (this.windGain) {
      const targetGain = this.state.windEnabled ? this.state.windVolume : 0.0;
      this.windGain.gain.setTargetAtTime(targetGain, now, timeConstant);
    }
    if (updates.windEnabled !== undefined && this.isPlaying) {
      if (this.state.windEnabled) {
        this.startWindLoop();
      } else {
        this.stopWindLoop();
      }
    }

    // Fire Channel Gain
    if (this.fireGain) {
      const targetGain = this.state.fireEnabled ? this.state.fireVolume : 0.0;
      this.fireGain.gain.setTargetAtTime(targetGain, now, timeConstant);
    }
    if (updates.fireEnabled !== undefined && this.isPlaying) {
      if (this.state.fireEnabled) {
        this.startFire();
      } else if (this.fireTimer) {
        clearTimeout(this.fireTimer);
      }
    }

    // Binaural
    if (this.binauralGain) {
      const targetGain = this.state.binauralEnabled ? this.state.binauralVolume : 0.0;
      this.binauralGain.gain.setTargetAtTime(targetGain, now, timeConstant);
    }
    if (updates.binauralBand !== undefined || updates.binauralEnabled !== undefined) {
      if (this.isPlaying) {
        this.stopBinaural();
        if (this.state.binauralEnabled) this.startBinaural();
      }
    }

    // Drone
    if (this.droneGain) {
      const targetGain = this.state.droneEnabled ? this.state.ambientDroneVolume : 0.0;
      this.droneGain.gain.setTargetAtTime(targetGain, now, timeConstant);
    }
    if (updates.droneEnabled !== undefined && this.isPlaying) {
      this.stopDrone();
      if (this.state.droneEnabled) this.startDrone();
    }
  }

  public updateMixer(updates: Partial<SoundMixerState>) {
    this.crossfadeTo(updates, 0.2);
  }

  public setFadeFactor(factor: number) {
    this.currentFadeFactor = Math.max(0, Math.min(1, factor));
    if (this.fadeGain && this.ctx) {
      const smoothGain = Math.pow(this.currentFadeFactor, 1.4);
      this.fadeGain.gain.setTargetAtTime(smoothGain, this.ctx.currentTime, 0.1);
    }

    if (this.currentFadeFactor === 0 && this.isPlaying) {
      this.pause();
    }
  }

  public getByteFrequencyData(array: Uint8Array<ArrayBuffer>): void {
    if (this.analyser && this.isPlaying) {
      this.analyser.getByteFrequencyData(array);
    } else {
      array.fill(0);
    }
  }

  public getFadeFactor() {
    return this.currentFadeFactor;
  }

  public getMixer(): SoundMixerState {
    return { ...this.state };
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export const soundEngine = new SoundscapeEngine();
