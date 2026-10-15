# Pluvine on the desktop: Electron + Arch Linux

How the app became a Linux desktop application, why each decision was made,
and every problem that came up along the way. Commands assume the repo root.

## 1. The big picture

An Electron app is two processes:

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ main process (Node.js)       │        │ renderer (sandboxed Chromium)│
│ electron/main.cjs            │  HTTP  │ your existing web app        │
│  • tiny static file server ──┼──────▶ │ (React + Web Audio engine)   │
│  • BrowserWindow, menu,      │        │ NO Node access, no preload   │
│    single-instance lock      │        │                              │
└──────────────────────────────┘        └──────────────────────────────┘
```

The renderer is the *unmodified* web build (`dist/`). Nothing in `src/` knew
about Electron. The main process is ~250 lines of plain Node built-ins —
no express, no dependencies — which matters in §5.

## 2. Why the main process runs a server (the one decision that matters)

Web Audio silences media that crosses an origin boundary on its way into
`createMediaElementSource()`. Open `dist/index.html` as a `file://` URL and
the page is one opaque origin while the `.wav` files are another — every one
of the ten layers would play **silently**, with no error anywhere. This is
the classic "works in the browser, dead in Electron" trap.

So `electron/main.cjs` serves `dist/` over `http://127.0.0.1:<random port>/`.
Page and sounds then share one origin — the same model the browser
verification already proved — and:

- **port 0**: the OS assigns a free port; nothing to configure, no conflicts;
- **loopback only**: never exposed to the network;
- **absolute paths unchanged**: `/sounds/...` just works;
- **`path.join(__dirname, '..', 'dist')`**: correct unpackaged, inside the
  packaged asar archive (Electron lets Node's `fs` read through asar), and
  however the binary was invoked (see problem 3).

## 3. The static server, piece by piece

| Piece | Why |
|---|---|
| MIME map | Wrong `Content-Type` breaks font/media loading |
| **Range support (206/416)** | Media elements issue Range requests for seeking and some loop behaviours; a 200-only server makes playback subtly unreliable |
| Path traversal guard | `path.normalize` + prefix check keeps `../` requests inside `dist/` |
| SPA fallback | Unknown extension-less routes get the app shell; missing real assets stay honest 404s |
| Cache policy | Only Vite's content-hashed `assets/` get `immutable`; HTML and recordings always revalidate |

The window: `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true` — the renderer gets zero privilege it doesn't use. A dark
`backgroundColor` avoids a white flash; the window shows on `ready-to-show`.
The application menu is not decoration: its edit roles are what make
Ctrl+C/V work in the save-mix dialog on Linux. `window-all-closed` quits
(Linux/Windows convention), and a single-instance lock focuses the existing
window instead of opening a second one.

## 4. Packaging (electron-builder)

`package.json → build` (see the electron-builder docs for every key):

- `files: ["electron/**", "dist/**", "package.json", "!node_modules"]` — the
  renderer was already bundled by Vite and the main process imports only
  Node built-ins, so no `node_modules` ships;
- `asar: true` — app files packed into one `resources/app.asar`;
- `directories.output: "release"` — **required**: electron-builder's default
  output folder is `dist/`, which would collide with Vite's build;
- `directories.buildResources: "build"` — where `icon.png` lives;
- `linux.target: ["AppImage", "pacman"]`, `executableName: "pluvine"`,
  `syncDesktopName: true` so the menu entry links to the running window.

```bash
npm run dist:linux
# release/Pluvine-1.0.0.AppImage   (~179 MB)
# release/pluvine-1.0.0.pacman     (~147 MB, bundles its own Chromium)
#
# Packaging builds run VITE_SOUND_EXT=mp3 + scripts/transcode-sounds.mjs:
# all runtime audio is already 192k MP3 (built by npm run sounds:sync from
# the originals in sounds/), so this step is a no-op safety net unless WAVs
# appear in dist/sounds.
```

## 5. Arch packaging, two ways

**A. electron-builder's pacman target** (above) — self-contained, install
with `sudo pacman -U`. It declares its shared-library dependencies
(gtk3, nss, ffmpeg, …) automatically and bundles Chromium inside `/opt`.

**B. `packaging/PKGBUILD`** — the Arch-native philosophy: depend on the
*system* `electron` package and ship only the app. One Chromium for the
whole system, updated by `pacman -Syu` for every Electron app at once. This
works *because* the main process has zero dependencies: the package is just
`/opt/pluvine/{package.json,electron,dist}` plus a 3-line launcher:

```sh
#!/bin/sh
exec electron /opt/pluvine "$@"
```

```bash
npm run pack:arch          # tarball of the current build
cd packaging
makepkg -si                # builds and installs (asks pacman for electron)
```

The AppImage is the third option: no installation, no integration.

## 6. What was verified (reproduce it yourself)

| Command | Result |
|---|---|
| `npm run lint` / `npm test` / `npm run build` | clean · 26/26 tests (169 assertions) · ok |
| `node verify.browser.mjs` | 68/68 web checks (unchanged web app) |
| `node verify.electron.mjs` | 24/24 inside real Electron, incl. a **non-silent Web Audio proof** (`createMediaElementSource → AnalyserNode`, peak > 0) |
| `PLUVINE_E2E_EXEC=release/linux-unpacked/pluvine node verify.electron.mjs` | 24/24 against the *packaged* binary (asar serving) |
| `pacman -Qp release/pluvine-1.0.0.pacman` + `bsdtar -tf` | metadata, `StartupWMClass`, icon, `/opt/Pluvine/resources/app.asar` |
| extracted `AppRun --appimage-extract` run | serves from asar, index 200, audio 206 |
| `cd packaging && makepkg -d` | Arch package builds; `depend = electron`; layout verified by running the extracted `/opt/pluvine` with an electron binary |
| two concurrent instances | second exits 0 and hands focus over |

## 7. Problems hit, in order

1. **`npm install-scripts approve electron` failed (ENOMATCH)** — the
   allowlist can only approve *installed* packages, so approval must come
   *after* `npm install`. Moot anyway: electron 44 downloads its binary lazily
   on first run instead of via postinstall, so nothing was blocked.
2. **`app.getAppPath()` returned `.../electron/`, not the project root** —
   when launched as `electron electron/main.cjs`, Electron resolves the app
   path from the entry *file's* directory. The app exited with "no build
   found". Fixed by resolving `dist/` relative to `__dirname`, which is also
   the correct path inside the packaged asar.
3. **electron-builder 26 rejected the `linux.desktop` config** — the schema
   changed: entries now go under `desktop.entry`. Found by reading
   `node_modules/app-builder-lib/scheme.json` — the schema is shipped, so
   config questions never need the internet.
4. **FPM refused to build pacman/deb without metadata** — missing
   `description`, `author.email`, `homepage`. Added with clearly-marked
   placeholder contact data (`kaesimo@localhost`, `example.invalid`) —
   the homepage now points at the real repo; the **author email is still a
   placeholder and must be replaced before publishing anything.**
5. **Transient DNS failure** (`ENOTFOUND release-assets.githubusercontent.com`)
   mid-build; resolved itself on retry. Downloads in packaging are retried,
   not debugged, until they stay broken.
6. **`desktopName` warning** — electron-builder wants a top-level
   `desktopName` field for WM_CLASS association; it isn't in the build-config
   schema at all. Falls back to `executableName` (`pluvine`), which the
   generated `.desktop` already declares as `StartupWMClass`, so association
   works either way.
7. **XML nit**: the icon SVG comment contained `--` (`--color-rain`) —
   double hyphens are illegal inside XML comments; `rsvg-convert` refused it.
8. **Test-script bugs** (not app bugs): launching the e2e with a *file* path
   made `app.getVersion()` fall back to Electron's own version; a
   case-sensitive `[aria-label*="Sleep timer"]` selector missed
   "Open sleep timer"; and a stray click closed the timer popover before the
   test clicked its Cancel button. All three fixed in the test.
9. **A knife-edge timing assertion in the web suite** (`playingElements === 3`
   right after switching to Night storm): thunder layers are *intermittent* —
   the strike scheduler (3–6 s random first strike, armed at playback start)
   can begin a strike inside the sampling window, making the count 4. The
   app was always correct; the test now asserts the three continuous layers
   carry signal and that the thunder layer is enabled, instead of pinning a
   momentary count. Found by dumping per-element runtime state via the dev
   handle (`paused`, `currentTime`, gains per layer).
10. **A missing dot in the transcode manifest swap**: `resolveAsset` built
    `…-1253wav` instead of `…-1253.wav`. The server's SPA fallback answered
    the extension-less path with 200 + HTML, the media element rejected it
    (`MEDIA_ERR_SRC_NOT_SUPPORTED`), and the engine honestly fell back to its
    synth voice — a three-layer cascade hiding a one-character bug. Found by
    dumping `el.currentSrc` per layer; a reminder that "200 OK" ≠ "the right
    bytes".
11. **makepkg reused stale build staging**: after swapping a recording, the
    package still contained the deleted file even though the tarball was
    clean — `packaging/src/` and `packaging/pkg/` from the previous build
    survived and were reused. Wiping both and rebuilding fixed it. Clean
    `src/` and `pkg/` between builds (they are gitignored for this reason).

## 8. Honest limitations

- **Windows/macOS not built or tested here.** electron-builder can produce
  NSIS installers, but verifying them needs a Windows machine or CI.
- **No code signing** — distribute to others and Windows SmartScreen/macOS
  Gatekeeper will warn until a certificate is bought.
- **Sizes are desktop-sized**: ~200 MB (Chromium + 87 MB of recordings).
  Transcoding the WAVs to MP3 would roughly halve it, at a quality cost.
- **The PKGBUILD path couples you to the system electron version.** The API
  surface used (`app`, `BrowserWindow`, `Menu`) is tiny and stable, but a
  future Electron release can in principle break it.
- The packaged app was verified headless (structure, serving, Web Audio
  signal levels) — not listened to on speakers.
- `author.email` / `homepage` are placeholders to replace.
