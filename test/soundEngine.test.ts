/**
 * Pluvine — SoundEngine test suite (run with `npm test`).
 *
 * The engine is exercised without any UI: a deterministic mock Web Audio + DOM
 * environment is installed before the engine module loads, and every test
 * drives intent-level methods only.
 *
 * Coverage:
 *  1. initial state, layer defaults, asset mapping
 *  2. play / pause / resume / stop lifecycle incl. gate + element behavior
 *  3. duplicate-source prevention on repeated play()
 *  4. THE CRITICAL INVARIANT: visibility recovery never overrides a manual
 *     pause or stop — and the async race where pause lands during an
 *     in-flight play()
 *  5. layer toggles, gain smoothing values, master volume clamping
 *  6. preset switching during playback (single reconciliation path)
 *  7. missing / failed / blocked recordings → honest failure reporting and
 *     synthesized fallback voices (engine keeps working)
 *  8. thunder scheduler lifecycle: schedule, strikes, bursts, pairing, cancellation
 *  9. sleep timer: auto-start, countdown, fade curve, expiry → stop,
 *     pause keeps it, manual stop cancels it, +time
 * 10. repeated lifecycle stress without leaks; honest init failure + retry;
 *     destroy() teardown completeness
 * 11. persistence helpers: tolerant preset migration, minimal writes
 */

// ===========================================================================
// Mock environment — MUST be installed before the engine module is evaluated
// ===========================================================================

class MockAudioParam {
  value: number;
  constructor(initial = 0) {
    this.value = initial;
  }
  setValueAtTime(val: number) {
    this.value = val;
    return this;
  }
  setTargetAtTime(val: number) {
    this.value = val;
    return this;
  }
  exponentialRampToValueAtTime(val: number) {
    this.value = val;
    return this;
  }
  linearRampToValueAtTime(val: number) {
    this.value = val;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class MockAudioNode {
  outputs: unknown[] = [];
  connect(dest: unknown) {
    this.outputs.push(dest);
    return dest;
  }
  disconnect() {
    this.outputs = [];
  }
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam(1);
}

class MockBiquadFilterNode extends MockAudioNode {
  type = 'lowpass';
  frequency = new MockAudioParam(1000);
  Q = new MockAudioParam(1);
  gain = new MockAudioParam(0);
}

class MockOscillatorNode extends MockAudioNode {
  type = 'sine';
  frequency = new MockAudioParam(440);
  started = false;
  stopped = false;
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}

class MockBufferSourceNode extends MockAudioNode {
  buffer: unknown = null;
  loop = false;
  started = false;
  stopped = false;
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}

class MockDynamicsCompressorNode extends MockAudioNode {
  threshold = new MockAudioParam(-1.5);
  knee = new MockAudioParam(6);
  ratio = new MockAudioParam(8);
  attack = new MockAudioParam(0.003);
  release = new MockAudioParam(0.15);
}

class MockMediaElementSourceNode extends MockAudioNode {
  constructor(readonly el: MockAudioElement) {
    super();
  }
}

class MockAudioBuffer {
  channels: Float32Array[];
  sampleRate: number;
  length: number;
  duration: number;
  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.sampleRate = sampleRate;
    this.length = length;
    this.duration = length / sampleRate;
    this.channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
      this.channels.push(new Float32Array(length));
    }
  }
  getChannelData(channel: number) {
    return this.channels[channel];
  }
}

type Listener = (e?: unknown) => void;

class MockEventTarget {
  protected listeners: Record<string, Listener[]> = {};
  addEventListener(name: string, cb: Listener) {
    (this.listeners[name] ??= []).push(cb);
  }
  removeEventListener(name: string, cb: Listener) {
    this.listeners[name] = (this.listeners[name] ?? []).filter((c) => c !== cb);
  }
  protected emit(name: string) {
    for (const cb of [...(this.listeners[name] ?? [])]) cb();
  }
}

class MockAudioContext extends MockEventTarget {
  static instances: MockAudioContext[] = [];
  static last: MockAudioContext | null = null;
  /** When set, every resume() awaits it (for the in-flight-play race test). */
  static resumeGate: Promise<void> | null = null;

  state: 'suspended' | 'running' | 'closed' = 'suspended'; // like a pre-gesture context
  currentTime = 0;
  sampleRate = 44100;
  destination = new MockAudioNode();
  oscillatorCount = 0;

  constructor() {
    super();
    MockAudioContext.instances.push(this);
    MockAudioContext.last = this;
  }

  createGain() {
    return new MockGainNode();
  }
  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }
  createOscillator() {
    this.oscillatorCount++;
    return new MockOscillatorNode();
  }
  createBufferSource() {
    return new MockBufferSourceNode();
  }
  createDynamicsCompressor() {
    return new MockDynamicsCompressorNode();
  }
  createMediaElementSource(el: MockAudioElement) {
    return new MockMediaElementSourceNode(el);
  }
  createBuffer(channels: number, length: number, rate: number) {
    return new MockAudioBuffer(channels, length, rate);
  }

  async resume() {
    const gate = MockAudioContext.resumeGate;
    if (gate) await gate;
    if (this.state === 'closed') throw new Error('context is closed');
    this.state = 'running';
    this.emit('statechange');
  }
  async suspend() {
    this.state = 'suspended';
    this.emit('statechange');
  }
  async close() {
    this.state = 'closed';
    this.emit('statechange');
  }
}

class MockAudioElement extends MockEventTarget {
  static instances: MockAudioElement[] = [];

  preload = '';
  loop = false;
  src = '';
  volume = 1;
  currentTime = 0;
  paused = true;
  ended = false;
  playCalls = 0;
  pauseCalls = 0;
  /** set by tests: make play() reject like a blocked autoplay would */
  failPlay = false;

  constructor() {
    super();
    MockAudioElement.instances.push(this);
  }

  play(): Promise<void> {
    this.playCalls++;
    if (this.failPlay) return Promise.reject(new Error('playback blocked'));
    this.paused = false;
    this.ended = false;
    return Promise.resolve();
  }
  pause() {
    this.pauseCalls++;
    this.paused = true;
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  load() {
    /* no-op in the mock */
  }
  fire(type: string) {
    this.emit(type);
  }
}

// --- globals ---------------------------------------------------------------

const docListeners: Record<string, Listener[]> = {};
let createElementOverride: ((tag: string) => unknown) | null = null;

(globalThis as any).window = globalThis;
(globalThis as any).AudioContext = MockAudioContext;
(globalThis as any).document = {
  visibilityState: 'visible',
  addEventListener(name: string, cb: Listener) {
    (docListeners[name] ??= []).push(cb);
  },
  removeEventListener(name: string, cb: Listener) {
    docListeners[name] = (docListeners[name] ?? []).filter((c) => c !== cb);
  },
  createElement(tag: string) {
    if (createElementOverride) return createElementOverride(tag);
    if (tag === 'audio') return new MockAudioElement();
    throw new Error(`unexpected createElement(${tag})`);
  },
};

// localStorage stub for persistence tests
const localStorageStore: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in localStorageStore ? localStorageStore[k] : null),
  setItem: (k: string, v: string) => {
    localStorageStore[k] = String(v);
  },
  removeItem: (k: string) => {
    delete localStorageStore[k];
  },
  clear: () => {
    for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
  },
};

// --- imports (engine evaluates NOW, with the mocks in place) ---------------

import { LAYER_ASSETS } from '../src/utils/assets';
import {
  DEFAULT_PRESETS,
  DEFAULT_SOUND_LAYERS,
  mixMatchesPreset,
  snapshotMix,
} from '../src/types/soundscape';
import {
  STORAGE_KEY,
  loadCustomPresets,
  loadMasterVolume,
  saveCustomPresets,
} from '../src/utils/presets';

const { SoundEngine } = await import('../src/utils/soundEngine');
type Engine = InstanceType<typeof SoundEngine>;

// ===========================================================================
// Test helpers
// ===========================================================================

let passed = 0;
let failed = 0;
let testsRun = 0;
let testsFailed = 0;
const failureMessages: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  \u2705 ${message}`);
  } else {
    failed++;
    failureMessages.push(message);
    console.error(`  \u274c ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  assert(
    actual === expected,
    `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`
  );
}

function assertClose(actual: number, expected: number, tolerance: number, message: string): void {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${message} (expected ${expected} \u00b1 ${tolerance}, got ${actual})`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(
  condition: () => boolean,
  timeoutMs = 1000,
  stepMs = 5
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await sleep(stepMs);
  }
  return condition();
}

function fireVisibility(state: 'visible' | 'hidden'): void {
  (globalThis as any).document.visibilityState = state;
  for (const cb of [...(docListeners['visibilitychange'] ?? [])]) cb();
}

function visListenerCount(): number {
  return (docListeners['visibilitychange'] ?? []).length;
}

/** Fast, deterministic timing: no strikes, quick deferred pauses. */
const TEST_OPTS = {
  elementPauseDelay: 30,
  sleepTickMs: 25,
  quickStrikeDelay: [100000, 100001] as [number, number],
  strikeDelay: [100000, 100001] as [number, number],
};

const openEngines: Engine[] = [];
const elementBases = new WeakMap<object, number>();

function makeEngine(
  extra: Partial<ConstructorParameters<typeof SoundEngine>[0]> = {}
): Engine {
  const base = MockAudioElement.instances.length;
  const engine = new SoundEngine({ ...TEST_OPTS, ...extra });
  elementBases.set(engine, base);
  openEngines.push(engine);
  return engine;
}

/** The recording elements created by a given engine (constructor order). */
function engineElements(engine: Engine): MockAudioElement[] {
  const base = elementBases.get(engine) ?? 0;
  return MockAudioElement.instances.slice(base);
}

function elementFor(engine: Engine, layerId: string): MockAudioElement {
  const suffix = LAYER_ASSETS[layerId];
  const el = engineElements(engine).find((e) => e.src.endsWith(suffix));
  if (!el) throw new Error(`no element for layer ${layerId}`);
  return el;
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  testsRun++;
  const failuresBefore = failed;
  console.log(`\n— ${name}`);
  try {
    await fn();
  } catch (err) {
    failed++;
    failureMessages.push(`${name}: threw ${err instanceof Error ? err.stack : err}`);
    console.error(`  \u274c threw: ${err instanceof Error ? err.message : err}`);
  }
  if (failed > failuresBefore) testsFailed++;
  // Per-test isolation: tear every engine down, reset statics.
  for (const engine of openEngines) {
    try {
      engine.destroy();
    } catch {
      /* already destroyed */
    }
  }
  openEngines.length = 0;
  createElementOverride = null;
  MockAudioContext.resumeGate = null;
}

// ===========================================================================
// Tests
// ===========================================================================

async function runTests(): Promise<void> {
  console.log('Pluvine SoundEngine verification\n' + '='.repeat(56));

  await test('initial state, defaults, and asset mapping', () => {
    const engine = makeEngine();
    assertEq(engine.getState(), 'stopped', 'initial state is stopped');
    assertEq(engine.getIntent(), 'stop', 'initial intent is stop');
    const layers = engine.getLayers();
    assertEq(layers.length, 10, 'ten layers');
    assertEq(
      layers.filter((l) => l.enabled).length,
      2,
      'defaults enable light rain + distant thunder only'
    );
    assert(
      layers.every((l) => typeof l.name === 'string' && l.name.length > 0),
      'every layer has a literal name'
    );
    // elements pre-created and mapped to real recordings
    const elements = engineElements(engine);
    assertEq(elements.length, 10, 'one recording element per layer');
    assert(
      elements.every((e) => e.src.startsWith('/sounds/') && e.src.length > 8),
      'every element points at /sounds/…'
    );
    assertEq(
      elementFor(engine, 'rain-light-loop').loop,
      true,
      'loop layers use el.loop'
    );
    assertEq(
      elementFor(engine, 'thunder-distant-rumble').loop,
      false,
      'thunder layers play as one-shots'
    );
    assertEq(engine.getAssetStatuses()['rain-light-loop'], 'loading', 'assets start loading');
  });

  await test('play transitions to playing: gate opens, elements routed', async () => {
    const engine = makeEngine();
    const states: string[] = [];
    engine.setOnStateChange((s) => states.push(s));

    await engine.play();
    const diag = engine.getDiagnostics();
    assertEq(engine.getState(), 'playing', 'state is playing after play()');
    assertEq(engine.getIntent(), 'play', 'intent is play');
    assertEq(states.join('>'), 'starting>playing', 'state callbacks saw starting > playing');
    assertEq(diag.routedElements, 10, 'all ten elements routed through the graph');
    assertEq(diag.gateValue, 1, 'playback gate is open');
    assertEq(diag.playingElements, 1, 'only the enabled loop layer is running');
    assertEq(diag.synthVoices, 0, 'healthy files use the file path, no synth voices');
    assertEq(
      diag.layerGainValues['rain-light-loop'],
      0.85,
      'enabled layer gain equals its level'
    );
    assertEq(diag.layerGainValues['rain-forest-loop'], 0, 'disabled layer gain is 0');
    assertEq(MockAudioContext.last!.state, 'running', 'context resumed to running');
  });

  await test('repeated play() does not duplicate sources', async () => {
    const engine = makeEngine();
    await engine.play();
    await engine.play();
    await engine.play();
    const light = elementFor(engine, 'rain-light-loop');
    assertEq(light.playCalls, 1, 'three play() calls start the element exactly once');
    assertEq(engine.getState(), 'playing', 'still playing, no error');
    assertEq(engine.getDiagnostics().playingElements, 1, 'still exactly one running element');
  });

  await test('pause closes the gate and stops elements behind it', async () => {
    const engine = makeEngine();
    await engine.play();
    engine.pause();

    assertEq(engine.getState(), 'paused', 'state is paused');
    assertEq(engine.getIntent(), 'pause', 'intent is pause');
    assertEq(engine.getDiagnostics().gateValue, 0, 'gate closed immediately (silent teardown)');
    assertEq(
      MockAudioContext.last!.state,
      'running',
      'context is NOT suspended on pause (by design: no resume races)'
    );

    await sleep(80); // elementPauseDelay = 30ms + margin
    assertEq(engine.getDiagnostics().playingElements, 0, 'elements paused behind the closed gate');
    assertEq(engine.getDiagnostics().pendingThunder, false, 'thunder scheduler cancelled on pause');
  });

  await test('resume restores playback without duplicates', async () => {
    const engine = makeEngine();
    await engine.play();
    engine.pause();
    await sleep(60);
    await engine.resume();

    const diag = engine.getDiagnostics();
    assertEq(engine.getState(), 'playing', 'resume returns to playing');
    assertEq(diag.gateValue, 1, 'gate re-opened');
    assertEq(diag.playingElements, 1, 'the enabled loop layer runs again');
    const light = elementFor(engine, 'rain-light-loop');
    assertEq(light.playCalls, 2, 'exactly one additional element start after resume');
    assertEq(diag.synthVoices, 0, 'no stray synth voices after resume');
  });

  await test('INVARIANT: returning to a visible tab after manual PAUSE never restarts audio', async () => {
    const engine = makeEngine();
    await engine.play();
    engine.pause();
    await sleep(60);

    for (let i = 0; i < 3; i++) {
      fireVisibility('hidden');
      fireVisibility('visible');
    }
    await sleep(60);
    assertEq(engine.getState(), 'paused', 'state still paused after visibility churn');
    assertEq(engine.getIntent(), 'pause', 'intent still pause — visibility never rewrites it');
    assertEq(engine.getDiagnostics().playingElements, 0, 'no element restarted');
    assertEq(engine.getDiagnostics().gateValue, 0, 'gate stayed closed');
  });

  await test('INVARIANT: returning to a visible tab after manual STOP never restarts audio', async () => {
    const engine = makeEngine();
    await engine.play();
    engine.stop();
    await sleep(60);

    fireVisibility('hidden');
    fireVisibility('visible');
    await sleep(60);
    assertEq(engine.getState(), 'stopped', 'state still stopped');
    assertEq(engine.getIntent(), 'stop', 'intent still stop');
    assertEq(engine.getDiagnostics().playingElements, 0, 'no element restarted');
    assertEq(engine.getDiagnostics().pendingThunder, false, 'no scheduler resurrection');
  });

  await test('visibility while playing recovers a browser-suspended context', async () => {
    const engine = makeEngine();
    await engine.play();
    const ctx = MockAudioContext.last!;
    ctx.state = 'suspended'; // simulate OS/browser suspension

    fireVisibility('hidden');
    fireVisibility('visible');
    await sleep(20);
    assertEq(ctx.state, 'running', 'suspended context resumed on tab return');
    assertEq(engine.getState(), 'playing', 'playback continues');
    assertEq(engine.getDiagnostics().playingElements, 1, 'voices still running');
  });

  await test('INVARIANT: pause issued during an in-flight play() wins the race', async () => {
    const engine = makeEngine();
    let release!: () => void;
    MockAudioContext.resumeGate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const playPromise = engine.play(); // stuck awaiting ctx.resume()
    await sleep(10);
    assertEq(engine.getState(), 'starting', 'engine reports starting while resume pends');

    engine.pause();
    assertEq(engine.getState(), 'paused', 'pause lands immediately');
    assertEq(engine.getIntent(), 'pause', 'intent is pause');

    release();
    MockAudioContext.resumeGate = null;
    await playPromise;

    assertEq(engine.getState(), 'paused', 'the in-flight play did NOT clobber the pause');
    assertEq(engine.getIntent(), 'pause', 'intent still pause');
    await sleep(80);
    assertEq(engine.getDiagnostics().playingElements, 0, 'no elements left running');
    assertEq(engine.getDiagnostics().gateValue, 0, 'gate stayed closed');
  });

  await test('layer toggles control sources and gains', async () => {
    const engine = makeEngine();
    await engine.play();

    engine.setLayerEnabled('rain-window-patter', true);
    assertEq(engine.getDiagnostics().playingElements, 2, 'enabling a loop layer starts it');
    assertClose(
      engine.getDiagnostics().layerGainValues['rain-window-patter'],
      0.5,
      1e-9,
      'enabled gain equals its level'
    );

    engine.setLayerEnabled('rain-light-loop', false);
    assertEq(
      engine.getDiagnostics().layerGainValues['rain-light-loop'],
      0,
      'disabling zeroes the gain'
    );
    await sleep(80);
    assertEq(
      elementFor(engine, 'rain-light-loop').paused,
      true,
      'disabled layer element paused after the gain ramp'
    );
    assertEq(engine.getDiagnostics().playingElements, 1, 'only window rain keeps running');

    engine.setLayerEnabled('rain-light-loop', true);
    await sleep(10);
    assertEq(engine.getDiagnostics().playingElements, 2, 're-enabling restarts the layer');
    assertEq(elementFor(engine, 'rain-light-loop').playCalls, 2, 'restart is exactly one start');
    assertEq(engine.getState(), 'playing', 'playback uninterrupted by toggles');
  });

  await test('layer and master volume values are applied and clamped', async () => {
    const engine = makeEngine();
    await engine.play();

    engine.setLayerVolume('rain-light-loop', 1.7);
    assertClose(engine.getLayers()[0].volume, 1, 1e-9, 'layer volume clamped to 1');
    assertClose(
      engine.getDiagnostics().layerGainValues['rain-light-loop'],
      1,
      1e-9,
      'clamped value applied to the gain'
    );
    engine.setLayerVolume('rain-light-loop', -0.4);
    assertClose(engine.getLayers()[0].volume, 0, 1e-9, 'layer volume clamped to 0');
    engine.setLayerVolume('rain-light-loop', 0.6);
    assertClose(
      engine.getDiagnostics().layerGainValues['rain-light-loop'],
      0.6,
      1e-9,
      'mid value applied to the gain'
    );

    engine.setMasterVolume(2);
    assertEq(engine.getMasterVolume(), 1, 'master clamped to 1');
    assertEq(engine.getDiagnostics().masterGainValue, 1, 'master gain follows');
    engine.setMasterVolume(-1);
    assertEq(engine.getMasterVolume(), 0, 'master clamped to 0');
    assertEq(engine.getDiagnostics().masterGainValue, 0, 'master gain follows to 0');
    engine.setMasterVolume(0.42);
    assertEq(engine.getDiagnostics().masterGainValue, 0.42, 'master gain set directly');
  });

  await test('preset switching during playback reconciles through one path', async () => {
    const engine = makeEngine();
    await engine.play();
    const nightStorm = DEFAULT_PRESETS.find((p) => p.name === 'Night storm')!;
    engine.applyPreset(nightStorm.layerStates);

    assertEq(engine.getState(), 'playing', 'preset switch never stops playback');
    const diag = engine.getDiagnostics();
    assertEq(diag.synthVoices, 0, 'no synth voices on healthy files');
    assertEq(diag.pendingThunder, true, 'thunder scheduler active for enabled thunder');

    await sleep(80);
    const after = engine.getDiagnostics();
    assertEq(after.playingElements, 2, 'car + wind loops are running (forest is off)');
    assertEq(elementFor(engine, 'rain-light-loop').paused, true, 'previously playing layer stopped');
    assertEq(elementFor(engine, 'rain-window-patter').paused, true, 'other default layer stopped');
    assertEq(
      elementFor(engine, 'thunder-distant-rumble').paused,
      true,
      'intermittent layers wait for the scheduler (reconcile does not retrigger thunder)'
    );

    // Apply a preset that disables everything: sources all stop, no residue.
    engine.applyPreset({});
    await sleep(80);
    assertEq(engine.getDiagnostics().playingElements, 0, 'empty preset stops all sources');
    assertEq(engine.getDiagnostics().synthVoices, 0, 'no leftover voices');
    const layers = engine.getLayers();
    assert(
      layers.every((l) => !l.enabled),
      'absent layers are disabled by applyPreset'
    );
    assert(
      layers.every((l) => engine.getDiagnostics().layerGainValues[l.id] === 0),
      'all gains are 0 after empty preset'
    );
  });

  await test('failed recording: honest failure list + per-layer synth fallback', async () => {
    const engine = makeEngine();
    let statusNotifications = 0;
    engine.setOnAssetStatusesChange(() => statusNotifications++);

    engine.setLayerEnabled('rain-window-patter', true); // the second enabled loop layer
    elementFor(engine, 'rain-window-patter').fire('error');
    assertEq(engine.getAssetFailures().length, 1, 'failure recorded');
    assertEq(engine.getAssetFailures()[0].layerId, 'rain-window-patter', 'failure names the layer');
    assert(
      engine.getAssetFailures()[0].reason.length > 0,
      'failure carries a human-readable reason'
    );
    assertEq(engine.getAssetStatuses()['rain-window-patter'], 'failed', 'status is failed');
    assert(statusNotifications > 0, 'UI is notified of the status change');

    await engine.play();
    const diag = engine.getDiagnostics();
    assertEq(diag.synthVoices, 1, 'failed layer falls back to exactly one synth voice');
    assertEq(diag.sources['rain-window-patter'], 'synth', 'fallback layer uses synth path');
    assertEq(diag.sources['rain-light-loop'], 'file', 'healthy layer stays on the file path');
    assertEq(diag.playingElements, 1, 'healthy file layer still running');
    assertEq(engine.getState(), 'playing', 'engine plays normally despite the failure');
  });

  await test('all recordings missing: engine still plays, everything reported', async () => {
    createElementOverride = () => {
      throw new Error('no DOM');
    };
    const engine = makeEngine();
    createElementOverride = null;

    assertEq(engine.getAssetFailures().length, 10, 'all ten failures reported honestly');
    await engine.play();
    const diag = engine.getDiagnostics();
    assertEq(engine.getState(), 'playing', 'playback still works');
    assertEq(diag.synthVoices, 1, 'the enabled loop layer falls back to a synth voice');
    assertEq(diag.sources['rain-light-loop'], 'synth', 'light rain synthesized');
    assertEq(diag.sources['thunder-distant-rumble'], 'none', 'thunder has no loop voice');
    assertEq(diag.routedElements, 0, 'nothing routed without elements');
  });

  await test('blocked element playback (play rejection) falls back honestly', async () => {
    const engine = makeEngine();
    elementFor(engine, 'rain-light-loop').failPlay = true;

    await engine.play();
    await sleep(30); // rejection is handled on a microtask
    assertEq(engine.getState(), 'playing', 'rejection does not break playback state');
    const failures = engine.getAssetFailures();
    assertEq(failures.length, 1, 'blocked playback reported as a failure');
    assert(
      failures.some((f) => f.layerId === 'rain-light-loop' && f.reason.includes('blocked')),
      'failure says playback was blocked'
    );
    assertEq(engine.getDiagnostics().sources['rain-light-loop'], 'synth', 'layer switched to synth');
    assertEq(engine.getDiagnostics().synthVoices, 1, 'exactly one fallback voice');
  });

  await test("'canplay' reports assets ready", () => {
    const engine = makeEngine();
    let notified: Record<string, string> | null = null;
    engine.setOnAssetStatusesChange((s) => (notified = s));

    elementFor(engine, 'rain-light-loop').fire('canplay');
    assertEq(engine.getAssetStatuses()['rain-light-loop'], 'ready', 'status flips to ready');
    assert(notified !== null, 'UI notified of readiness');
  });

  await test('thunder scheduler: schedules, strikes, and cancels on pause', async () => {
    const engine = makeEngine({ quickStrikeDelay: [10, 20] });
    let strikes = 0;
    engine.setOnThunderStrike(() => strikes++);

    assertEq(engine.getDiagnostics().pendingThunder, false, 'no scheduler before playback');
    await engine.play();
    assertEq(engine.getDiagnostics().pendingThunder, true, 'scheduler armed at playback start');

    const hit = await until(() => strikes >= 1, 1000);
    assert(hit, 'first strike fired within the quick window');
    const distant = elementFor(engine, 'thunder-distant-rumble');
    assert(distant.playCalls >= 1, 'strike played the thunder recording');
    assertEq(distant.currentTime, 0, 'strike starts from the beginning');
    assert(
      distant.volume >= 0.35 && distant.volume <= 0.6,
      `strike intensity within the distant-thunder profile (${distant.volume.toFixed(2)})`
    );
    assertEq(engine.getState(), 'playing', 'a strike never disrupts playback state');

    engine.pause();
    assertEq(engine.getDiagnostics().pendingThunder, false, 'pause clears the pending strike');

    await engine.resume();
    assertEq(engine.getDiagnostics().pendingThunder, true, 'resume re-arms the scheduler');
    const strikesBefore = strikes;
    engine.setLayerEnabled('thunder-distant-rumble', false);
    await sleep(60);
    assertEq(engine.getDiagnostics().pendingThunder, false, 'disabling the thunder layer cancels it');
    assertEq(strikes, strikesBefore, 'no strike after cancellation');
  });

  await test('thunder strike falls back to synthesis when the recording failed', async () => {
    const engine = makeEngine({ quickStrikeDelay: [10, 20] });
    elementFor(engine, 'thunder-distant-rumble').fire('error');
    let strikes = 0;
    engine.setOnThunderStrike(() => strikes++);

    await engine.play();
    const ctx = MockAudioContext.last!;
    const oscillatorsBefore = ctx.oscillatorCount;
    const hit = await until(() => strikes >= 1, 1000);
    assert(hit, 'strike still scheduled with a failed recording');
    assert(
      ctx.oscillatorCount > oscillatorsBefore,
      'synthesized strike created its oscillator voice'
    );
    assertEq(elementFor(engine, 'thunder-distant-rumble').playCalls, 0, 'failed file never plays');
    assertEq(engine.getAssetFailures().length, 1, 'failure remains visible to the UI');
  });

  await test('thunder bursts: rapid follow-ups chain, then base gaps return', async () => {
    // Scripted randomness documents the exact rng draw order:
    // [quick, pick, burst-roll, size, gap, pick, gap, pick, gap, pick, roll, base]
    const draws = [0, 0, 0.1, 0.99, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 1];
    const engine = makeEngine({
      quickStrikeDelay: [10, 20],
      burstDelay: [10, 20],
      rng: () => draws.shift() ?? 1,
    });
    let strikes = 0;
    engine.setOnThunderStrike(() => strikes++);

    await engine.play();
    const burst = await until(() => strikes >= 4, 1000);
    assert(burst, `primary + 3 burst follow-ups fired quickly (got ${strikes})`);
    const distant = elementFor(engine, 'thunder-distant-rumble');
    assert(distant.playCalls >= 4, 'each burst member retriggered the recording');
    assertEq(distant.currentTime, 0, 'every burst strike still starts from 0 (no offset games)');

    const diag = engine.getDiagnostics();
    assertEq(diag.pendingThunder, true, 'base strike still pending after the burst drained');
    assertEq(diag.nextThunderDelayMs, 100001, 'rng=1 lands exactly on the strikeDelay max');

    engine.pause();
    assertEq(engine.getDiagnostics().pendingThunder, false, 'pause clears the pending base strike');
    const afterPause = strikes;
    await sleep(60);
    assertEq(strikes, afterPause, 'no strike sneaks in after the pause');
  });

  await test('thunder pairing: one moment can fire both thunder layers', async () => {
    // [quick, pick, pair-roll -> pair, burst-roll -> none, base]
    const draws = [0, 0, 0.1, 1, 1];
    const engine = makeEngine({
      quickStrikeDelay: [10, 20],
      rng: () => draws.shift() ?? 1,
    });
    engine.setLayerEnabled('thunder-big-rumble', true);
    await engine.play();

    const paired = await until(
      () =>
        elementFor(engine, 'thunder-distant-rumble').playCalls >= 1 &&
        elementFor(engine, 'thunder-big-rumble').playCalls >= 1,
      1000
    );
    assert(paired, 'the paired moment played BOTH thunder recordings');
    const heavy = elementFor(engine, 'thunder-big-rumble');
    assert(
      heavy.volume >= 0.65 && heavy.volume <= 1,
      `paired strike used the heavy profile (${heavy.volume.toFixed(2)})`
    );
    engine.pause();
  });

  await test('thunder gaps: skewed draws stay inside the configured window', async () => {
    const atMin = makeEngine({
      quickStrikeDelay: [10, 20],
      strikeDelay: [18000, 42000],
      rng: (() => { const d = [0, 0, 1, 0]; return () => d.shift() ?? 1; })(),
    });
    await atMin.play();
    const minHit = await until(
      () =>
        elementFor(atMin, 'thunder-distant-rumble').playCalls >= 1 &&
        atMin.getDiagnostics().pendingThunder,
      500
    );
    assert(minHit, 'quick strike fired');
    assertEq(atMin.getDiagnostics().nextThunderDelayMs, 18000, 'skew 0 -> exactly the window min');
    atMin.pause();

    const atMax = makeEngine({
      quickStrikeDelay: [10, 20],
      strikeDelay: [18000, 42000],
      rng: (() => { const d = [0, 0, 1, 1]; return () => d.shift() ?? 1; })(),
    });
    await atMax.play();
    const maxHit = await until(
      () =>
        elementFor(atMax, 'thunder-distant-rumble').playCalls >= 1 &&
        atMax.getDiagnostics().pendingThunder,
      500
    );
    assert(maxHit, 'quick strike fired');
    assertEq(atMax.getDiagnostics().nextThunderDelayMs, 42000, 'skew 1 -> exactly the window max');
    atMax.pause();
  });

  await test('sleep timer: auto-starts playback, fades, expires to stop', async () => {
    const engine = makeEngine();
    let reported = -1;
    engine.setOnSleepTimerChange((remaining) => (reported = remaining));

    engine.startSleepTimer(3, 1);
    assertEq(reported, 3, 'timer reports its start value');
    const started = await until(() => engine.getState() === 'playing', 500);
    assert(started, 'starting a timer auto-starts playback (explicit wish to listen)');

    const expired = await until(() => engine.getState() === 'stopped', 1000);
    assert(expired, 'timer expiry stops playback');
    assertEq(engine.getIntent(), 'stop', 'expiry sets intent to stop (visibility stays inert)');
    assertEq(engine.getSleepTimerRemaining(), 0, 'countdown reached 0');
    assertEq(engine.getDiagnostics().sleepFactor, 0, 'output faded to silence before stopping');
    assertEq(engine.getDiagnostics().pendingThunder, false, 'scheduler cleared on expiry');

    fireVisibility('visible'); // the trap: intent is stop, nothing may restart
    await sleep(40);
    assertEq(engine.getState(), 'stopped', 'tab return after expiry stays stopped');
  });

  await test('sleep timer: fade curve, cancel restores output', async () => {
    const engine = makeEngine();
    await engine.play();
    engine.startSleepTimer(2, 4); // 2s remaining inside a 4s fade → 50%
    assertEq(engine.getSleepTimerRemaining(), 2, 'remaining seconds reported');
    assertClose(
      engine.getDiagnostics().sleepFactor,
      Math.pow(0.5, 1.3),
      1e-9,
      'fade factor maps remaining/fade through the perceptual curve'
    );
    engine.cancelSleepTimer();
    assertEq(engine.getSleepTimerRemaining(), 0, 'cancel clears the countdown');
    assertClose(engine.getDiagnostics().sleepFactor, 1, 1e-9, 'cancel restores full output');
    assertEq(engine.getState(), 'playing', 'cancel keeps playback running');
  });

  await test('sleep timer: pause keeps counting, manual stop cancels, +time extends', async () => {
    const engine = makeEngine();
    await engine.play();
    engine.startSleepTimer(60, 30);
    engine.addSleepTimerTime(900);
    assertEq(engine.getSleepTimerRemaining(), 960, '+15 minutes extends the countdown');

    await sleep(80);
    const running = engine.getSleepTimerRemaining();
    assert(running > 0 && running < 960, 'countdown ticks while playing');

    engine.pause();
    await sleep(80);
    const pausedValue = engine.getSleepTimerRemaining();
    assert(
      pausedValue < running && pausedValue > 0,
      'manual pause KEEPS the timer counting'
    );

    engine.stop();
    assertEq(engine.getSleepTimerRemaining(), 0, 'manual stop cancels the timer');
    await sleep(60);
    assertEq(engine.getSleepTimerRemaining(), 0, 'cancelled timer never ticks again');
  });

  await test('repeated lifecycle stress: no duplicates, no residue', async () => {
    const engine = makeEngine();
    for (let i = 0; i < 12; i++) {
      await engine.play();
      engine.pause();
      await engine.resume();
      engine.stop();
    }
    await sleep(80);
    const diag = engine.getDiagnostics();
    assertEq(engine.getState(), 'stopped', 'ends stopped after stress');
    assertEq(engine.getIntent(), 'stop', 'ends with stop intent');
    assertEq(diag.playingElements, 0, 'no element left playing');
    assertEq(diag.synthVoices, 0, 'no voice left alive');
    assertEq(diag.pendingThunder, false, 'no scheduler left behind');
    assertEq(diag.sleepRemaining, 0, 'no timer left behind');
    assertEq(diag.gateValue, 0, 'gate closed');
  });

  await test('init failure: honest error state, visibility retry recovers', async () => {
    const engine = makeEngine();
    const AudioContextCtor = (globalThis as any).AudioContext;
    delete (globalThis as any).AudioContext;

    await engine.play();
    assertEq(engine.getState(), 'error', 'unavailable Web Audio surfaces as error state');
    assert(engine.getError() !== null && engine.getError()!.length > 0, 'error message available');
    assertEq(engine.getIntent(), 'play', 'failure does not change user intent');

    (globalThis as any).AudioContext = AudioContextCtor;
    fireVisibility('visible'); // recovery: intent still says play
    const recovered = await until(() => engine.getState() === 'playing', 500);
    assert(recovered, 'returning to a visible tab retries init for an intent of play');
    assertEq(engine.getError(), null, 'error clears after successful recovery');
  });

  await test('destroy(): closes context, silences elements, detaches listeners', async () => {
    const listenersBefore = visListenerCount();
    const engine = makeEngine();
    assertEq(visListenerCount(), listenersBefore + 1, 'engine attached its visibility listener');

    await engine.play();
    const ctx = MockAudioContext.last!;
    engine.destroy();

    assertEq(engine.getState(), 'stopped', 'destroyed engine reports stopped');
    assertEq(ctx.state, 'closed', 'AudioContext closed');
    assertEq(visListenerCount(), listenersBefore, 'visibility listener removed');
    assert(
      engineElements(engine).every((e) => e.paused && e.src === ''),
      'all elements paused and released'
    );
    assertEq(engine.getDiagnostics().playingElements, 0, 'nothing playing after destroy');

    engine.play();
    fireVisibility('visible');
    await sleep(40);
    assertEq(engine.getState(), 'stopped', 'destroyed engine is inert (play/visibility no-ops)');
  });

  await test('persistence: tolerant preset migration and minimal writes', () => {
    localStorageStore[STORAGE_KEY] = JSON.stringify([
      {
        id: 'custom-old',
        name: 'Old build mix',
        isCustom: true,
        tagline: 'leftover from an earlier build',
        description: 'ignored',
        category: 'sleep',
        layerStates: { 'rain-light-loop': { enabled: true, volume: 0.7 } },
      },
      { bogus: true },
      null,
      { id: 'custom-2', name: '   ', layerStates: 'not-an-object' },
      { id: 'custom-3', name: 'Kept', layerStates: { x: { enabled: 'yes', volume: 2 } } },
    ]);

    const loaded = loadCustomPresets();
    assertEq(loaded.length, 2, 'valid custom presets survive, garbage is skipped');
    assertEq(loaded[0].name, 'Old build mix', 'legacy entry loads under the minimal shape');
    assertEq(
      Object.keys(loaded[0]).sort().join(','),
      'id,isCustom,layerStates,name',
      'legacy extra fields are dropped'
    );
    assertEq(loaded[1].layerStates['x'].volume, 1, 'out-of-range stored volume is clamped');
    assertEq(loaded[1].layerStates['x'].enabled, false, 'non-boolean enabled is coerced');

    saveCustomPresets([...DEFAULT_PRESETS.slice(0, 1), ...loaded]);
    const written = JSON.parse(localStorageStore[STORAGE_KEY]);
    assertEq(written.length, 2, 'only custom presets are written; built-ins are not');
    assert(
      written.every(
        (p: Record<string, unknown>) =>
          Object.keys(p).sort().join(',') === 'id,isCustom,layerStates,name'
      ),
      'stored shape is minimal (id, name, isCustom, layerStates)'
    );

    localStorageStore['pluvine_master_volume_v1'] = 'garbage';
    assertEq(loadMasterVolume(0.85), 0.85, 'invalid stored master volume falls back');
    localStorageStore['pluvine_master_volume_v1'] = '0.31';
    assertEq(loadMasterVolume(0.85), 0.31, 'valid stored master volume restores');
    delete localStorageStore[STORAGE_KEY];
    delete localStorageStore['pluvine_master_volume_v1'];
  });

  await test('mix comparison: snapshot round-trip and edit detection', () => {
    const engine = makeEngine();
    const layers = engine.getLayers();
    const gentle = DEFAULT_PRESETS.find((p) => p.name === 'Gentle rain')!;

    engine.applyPreset(gentle.layerStates);
    assert(
      mixMatchesPreset(engine.getLayers(), gentle.layerStates),
      'freshly applied preset matches itself'
    );

    const snapshot = snapshotMix(engine.getLayers());
    assert(
      mixMatchesPreset(engine.getLayers(), snapshot),
      'snapshot round-trips against the live mix'
    );

    engine.setLayerVolume('rain-light-loop', 0.5);
    assert(
      !mixMatchesPreset(engine.getLayers(), gentle.layerStates),
      'nudging a fader marks the mix as edited'
    );

    engine.applyPreset(gentle.layerStates);
    assert(
      mixMatchesPreset(engine.getLayers(), gentle.layerStates),
      're-applying the preset restores the match (no Reset button needed)'
    );
    assertEq(layers.length, 10, 'layer list remains complete');
  });

  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(56));
  console.log(`tests: ${testsRun - testsFailed}/${testsRun} passed   assertions: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const message of failureMessages) console.log(`  - ${message}`);
    process.exit(1);
  }
  console.log('\nAll engine tests passed.');
}

runTests().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
