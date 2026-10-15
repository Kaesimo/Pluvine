# Audio engine architecture

`src/utils/soundEngine.ts` owns every audio resource: the `AudioContext`, the
output graph, per-layer sources, the thunder scheduler, and the sleep timer.
The UI never touches Web Audio; it calls intent-level methods and mirrors
state through single-slot callbacks.

## Playback state ownership

```
intent : 'play' | 'pause' | 'stop'   ← changed ONLY by explicit user actions
state  : 'stopped' | 'starting' | 'playing' | 'paused' | 'error'
```

- `intent` is the authority for recovery. Browser lifecycle events
  (`visibilitychange`, context interruption) may only *advance* an intent that
  is still `'play'`; they can never set it. **Returning to a visible tab never
  restarts audio the user paused or stopped** — the visibility handler returns
  immediately unless `intent === 'play'`.
- `state` describes what is actually happening, including `'starting'` while
  `AudioContext.resume()` is in flight and `'error'` when initialization
  failed (`getError()` carries the reason).
- `opToken` invalidates in-flight async work: `pause()`/`stop()` increment it,
  so a `play()` awaiting `resume()` aborts instead of clobbering a newer pause
  (the classic "pause gets overridden by the pending play" race).
- The context is **never suspended** on pause/stop. Suspend/resume is where
  resume races and autoplay-policy dead-ends come from; gating + source
  teardown gives the same silence with none of that risk.

## Output graph

```
per-layer source ──► layerGain[id] ──► masterGain ──► sleepGain ──► gateGain ──► limiter ──► destination
                     enabled ? vol : 0    user vol      timer fade    1 while
                                                                   playing
```

| node        | role | why it exists |
|-------------|------|---------------|
| `layerGain` | per-layer level (0 when disabled) | `setTargetAtTime` gives click-free fader moves |
| `masterGain`| master volume | independent user control |
| `sleepGain` | sleep-timer fade only | separate node so timer fades and pause/stop gating never fight over one param |
| `gateGain`  | playback gate: ramps to 0 on pause/stop | sources are torn down *behind a closed gate* — no clicks; on resume it re-opens and sources restart underneath |
| `limiter`   | one `DynamicsCompressor` (−1.5 dB, 8:1) | ten layers can sum past 0 dBFS; nothing else does DSP |

## Sources

Each layer owns one `HTMLAudioElement`, created in the constructor (so
recordings buffer at load) and routed through `createMediaElementSource` the
first time the context exists. Streaming means no full PCM ever sits in
memory.

- **file path (primary):** loop layers set `el.loop` and are (re)started by
  reconciliation; thunder layers are one-shots retriggered from `currentTime = 0`
  with a per-strike intensity in `el.volume`.
- **synth path (fallback):** if a recording fails (missing file, decode/`error`
  event, `play()` rejection), the engine marks the layer `failed`, reports it
  via `onAssetStatusesChange`/`getAssetFailures()` — a notice appears in the
  UI — and runs the procedural recipe for that layer instead. Nothing pretends
  the recording loaded.
- A layer runs **one path at a time**; `activeSource` records which, and path
  switches tear the other down first.

## Reconciliation: one scheduling path

`reconcile()` is the single, idempotent function that makes audio match state.
Every mutation funnels into it (or, for pause/stop, into the equally
idempotent gate-close teardown):

```
play/pause/stop · setLayerEnabled · applyPreset · asset status changes
· visibility recovery · context statechange
```

It opens/clears the gate, starts enabled layer sources, stops disabled ones
(layer gain ramps to 0, the element pauses only *after* the ramp lands), and
re-arms the thunder schedule. Repeated calls are no-ops (`play()` while
already playing does nothing; an already-pending strike is not moved).

## Scheduling & cancellation

All timers are stored ids, all cleared on `destroy()`:

| timer | purpose | cancellation |
|-------|---------|--------------|
| `thunderTimer` | next strike: quick 3–6 s after playback starts, then every 18–42 s | cleared on pause/stop and when no thunder layer is enabled; kept (never restarted) across fader moves |
| `sleepInterval` | 1 Hz countdown | cleared by expiry, manual stop, or cancel |
| `elementPauseTimer` | pauses elements once the gate has closed | skipped if playback resumed first |
| per-layer pause (`pauseSeq`) | deferred element pause behind the layer-gain ramp | any intended play bumps `pauseSeq`, making stale pauses no-ops |
| transient cleanup (voice teardown, strike nodes) | exhaustive node disconnect | `destroy()` clears all |

Intermittent (thunder) layers are only ever triggered by the scheduler —
reconcile deliberately does not start them, so a fader nudge can never
re-trigger a finished thunder recording.

## Sleep timer

- `startSleepTimer(seconds, fadeSeconds)` — auto-starts playback (choosing a
  duration is an explicit wish to listen), arms the interval, and reports the
  start value.
- The final `fadeSeconds` window (always 60 s from the UI) maps
  `remaining/fade` through a perceptual curve onto `sleepGain`.
- Expiry calls `stop()`: intent becomes `'stop'`, so a visible tab afterwards
  does nothing. `sleepGain` is restored by the next `play()`.
- Manual **pause** keeps the countdown running; manual **stop** cancels it;
  `cancelSleepTimer()` restores output smoothly. `addSleepTimerTime()` extends
  an active countdown.

## Getters for state mirroring

`getState · getIntent · getError · getLayers · getMasterVolume ·
getAssetStatuses · getAssetFailures · getSleepTimerRemaining`, plus
`getDiagnostics()` (gate/sleep/master values, per-layer gains and sources,
running elements, pending timers) for tests and debugging.

## Persistence

The engine persists **nothing** by design. Presets and master volume live in
App/`localStorage` (`utils/presets.ts`): custom presets under the original
`pluvine_custom_presets_v2` key with tolerant migration (legacy extra fields
dropped, garbage skipped, volumes clamped), master volume under
`pluvine_master_volume_v1`. The sleep timer is session-scoped on purpose —
a reload starts with no phantom countdown.

## Failure handling

- **No Web Audio support / context creation fails** → `state = 'error'`,
  `intent` unchanged; returning to a visible tab retries while intent is
  still `'play'`.
- **Recording missing or blocked** → per-layer `failed` status + UI notice +
  synthesized fallback (honest, never silent-pretend).
- **Context interrupted by the OS/browser** → `statechange`/visibility handlers
  resume it *only* when `intent === 'play'` and the tab is visible.

## Testability

The engine takes optional `SoundEngineOptions` (strike windows, sleep tick,
element-pause delay) so tests run deterministically in milliseconds;
production uses the defaults. `test/soundEngine.test.ts` installs a mock
Web Audio + DOM environment before the module loads and covers: lifecycle,
duplicate-source prevention, the visibility invariant, the pause-during-play
race, toggles/gains/clamping, preset switches mid-playback, missing/blocked
asset fallback, scheduler cancellation, the sleep timer, lifecycle stress,
init-failure recovery, teardown completeness, and storage migration.
