# Pluvine

A desktop ambient rain mixer. One window with ten sound layers — rain, wind,
thunder, and air-conditioner hum — each with its own on/off switch and level.
There are presets, a sleep timer, master volume, and lightning in the
background. No accounts, no streaming, no internet connection needed.

![Pluvine](docs/shots/state-playing.png)

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build
npm start          # serves dist/
```

## Checks

```bash
npm run lint                 # TypeScript check (tsc --noEmit)
npm test                     # engine tests: 30 tests, 197 assertions
npm run build                # production bundle
node verify.browser.mjs      # 84 checks in Firefox (needs Playwright)
node verify.electron.mjs     # 24 checks in the packaged Electron app
```

The test suites are silent by default. Set `PLUVINE_E2E_AUDIBLE=1` to hear
them while they run.

## Desktop app (Electron)

Pluvine runs as a Linux desktop app. `electron/main.cjs` serves `dist/` from
a local-only address (the page and the recordings are same-origin, so the
browser does not block Web Audio) and opens a window on it. The full
walkthrough is in `docs/electron-arch.md`.

```bash
npm run electron     # build + run the desktop app
npm run dist:linux   # → release/Pluvine-*.AppImage + release/pluvine-*.pacman
npm run pack:arch    # → packaging/pluvine-<version>.tar.gz (input for the PKGBUILD)
```

Two ways to install on Arch:

```bash
# 1. electron-builder package (bundles its own Chromium)
sudo pacman -U release/pluvine-1.0.2.pacman

# 2. PKGBUILD in packaging/ (uses the system electron package)
cd packaging && makepkg -si
```

The AppImage needs no installation:
`chmod +x Pluvine-1.0.2.AppImage && ./Pluvine-1.0.2.AppImage`.

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
  index.css                palette, type, fader and button styles
  types/soundscape.ts      layer + preset definitions (single source of truth)
  utils/soundEngine.ts     the audio engine — see docs/audio-engine.md
  utils/assets.ts          layer id → recording file manifest
  utils/presets.ts         custom preset + master volume persistence
public/sounds/             the recordings the app plays (built, not in git)
sounds/                    the original recordings (source, not in git)
test/soundEngine.test.ts   engine tests (no UI, no real audio device)
```

## Sound assets

The recordings are not stored in this repository (each long one is over
1 GB, far beyond the git limit). `npm run sounds:sync` encodes the originals
from `sounds/` into `public/sounds/` as Ogg Opus 96k, capped at 4 hours per
layer; the two thunder recordings go through the same command. The file
`sounds/README.md` lists the expected file names.

If a recording is missing or fails to load, the engine shows a notice under
the mixer and synthesizes that layer instead, so the app keeps working.

## Design notes

- One accent color (pale blue) marks active sound, brass marks the sleep
  timer, red marks errors. No gradients or glass effects.
- Each layer is a vertical fader; the fill shows the current level. Faders
  are standard range inputs turned on their side, so keyboard, touch, and
  screen readers work normally.
- With `prefers-reduced-motion` the rain is drawn as a single still frame.
- Pause and stop are final: coming back to a visible tab never restarts the
  audio (see `docs/audio-engine.md`).

## License

No license file is shipped. The package metadata uses `LicenseRef-Proprietary`.
