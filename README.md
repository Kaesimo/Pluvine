# Pluvine

An ambient rain mixer for Linux and Android. One window with ten sound layers — rain, wind,
thunder, and air-conditioner hum — each with its own on/off switch and level.
There are presets, a sleep timer, master volume, and lightning in the
background. No accounts, no streaming, no internet connection needed.

![Pluvine](docs/shots/state-playing.png)

## Install (Arch Linux)

```bash
cd packaging/aur-bin && makepkg -si
```

The tarball comes from the releases page with a sha256 check, and the
package uses the system `electron` package. The AUR package `pluvine-bin`
is prepared but not published yet.

For other setups, build an AppImage or a pacman package with
`npm run dist:linux`.

## Android

The Capacitor shell lives in `android/`. Build a debug APK with:

```bash
npm run android:apk
```

The build uses a JDK and Android SDK from `.android/jdk` and `.android/sdk`
when they exist; otherwise set `JAVA_HOME` and `ANDROID_HOME`.
The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk` and
is debug-signed for sideloading. A release build needs your own keystore.
The mobile package uses 20-minute Opus copies of the long rain layers; both
thunder recordings stay byte-for-byte verbatim. A foreground service keeps
playback alive when the screen is off or the app is in the background.

## Run from source

```bash
npm install
npm run dev        # http://localhost:3000
```

## Checks

```bash
npm run lint            # TypeScript check
npm test                # engine tests (29 tests)
npm run build           # production bundle
node verify.browser.mjs # 85 checks in Firefox
node verify.electron.mjs # 24 checks in the desktop app
```

More detail: `docs/electron-arch.md` (packaging), `docs/audio-engine.md`
(engine), `sounds/README.md` (recordings).

## License

No license file is shipped. The package metadata uses `LicenseRef-Proprietary`.
