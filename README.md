# Pluvine

An ambient rain mixer. One dark instrument plate sits over an animated rain
field: playback control, ten sound layers with individual levels, master
volume, presets, and a sleep timer — all on a single screen.

![stack](https://img.shields.io/badge/stack-React%2019%20%C2%B7%20Vite%208%20%C2%B7%20Web%20Audio-8dbdd2)

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start          # serves dist/
```

## Checks

```bash
npm run lint       # tsc --noEmit
npm test           # engine test suite (26 tests, 169 assertions)
npm run build      # production bundle
node verify.browser.mjs    # 68 in-browser checks (needs playwright, see script header)
node verify.electron.mjs   # 24 checks inside real Electron
```

## Desktop app (Electron)

Pluvine also runs as a Linux desktop app. The Electron main process
(`electron/main.cjs`) serves `dist/` from a loopback-only origin — page and
sounds same-origin, so Web Audio stays unblocked — and opens a window on it.
The full walkthrough, including every gotcha hit on the way, is in
`docs/electron-arch.md`.

```bash
npm run electron     # build + run the desktop app
npm run dist:linux   # → release/Pluvine-*.AppImage + release/pluvine-*.pacman
npm run pack:arch    # → packaging/pluvine-<version>.tar.gz (for the PKGBUILD)
```

Two ways to install on Arch:

```bash
# 1. self-contained package from electron-builder (bundles its own Chromium)
sudo pacman -U release/pluvine-1.0.0.pacman

# 2. Arch-native PKGBUILD: uses the SYSTEM electron package
#    (pacman -S electron provides updates for every Electron app at once)
cd packaging && makepkg -si
```

The AppImage needs no installation: `chmod +x Pluvine-1.0.0.AppImage && ./Pluvine-1.0.0.AppImage`.

To run the Electron checks against a packaged build:

```bash
PLUVINE_E2E_EXEC=release/linux-unpacked/pluvine node verify.electron.mjs
```

## Layout

```
src/
  App.tsx                  screen wiring; mirrors engine state, renders controls
  components/              RainField · Transport · Mixer · PresetBar ·
                           SleepTimer · SaveMixDialog · icons
  index.css                design system (palette, type, fader/button styles)
  types/soundscape.ts      layer + preset definitions (single source of truth)
  utils/soundEngine.ts     the audio engine — see docs/audio-engine.md
  utils/assets.ts          layer id → recording file manifest
  utils/presets.ts         custom preset + master volume persistence
public/sounds/             the runtime recordings each layer plays (built)
sounds/                    the user's original recordings (source, untouched)
test/soundEngine.test.ts   engine tests (mock Web Audio + DOM, no UI)
```

## Sound assets

`npm run sounds:sync` builds the runtime audio: the original recordings in
`sounds/` (kept untouched) are encoded to 192k MP3 into `public/sounds/`,
where the app serves them from (streamed through media elements — no full
decode in memory). The two thunder one-shots live in `public/sounds/`
permanently. The manifest lives in `src/utils/assets.ts`. If a recording is
missing or fails to load, the engine says so (a notice appears under the
mixer) and synthesizes that layer procedurally, so the mixer keeps working
offline.

## Design notes

- One accent (pale rain blue) marks active sound; brass marks the sleep timer
  only; red marks errors only. No gradients, glass, or decorative cards.
- The mixer is a bank of gauge columns: the fader fill is the real level.
  Faders are standard range inputs rotated −90°, so keyboard, touch, and
  screen-reader behavior stay native.
- `prefers-reduced-motion` paints a single static rain frame (no motion, no
  lightning animation).
- Manual pause/stop is final: returning to a visible tab never restarts
  audio (see `docs/audio-engine.md`).
