# Pluvine — full project context (chat resume)

> Purpose: this file survives a PC format and a lost chat session. It captures the
> whole project state and every standing rule from the conversations that led to
> v1.0.3. Last updated: 2026-10-19 (right after the v1.0.3 release).
> Read this first after a fresh clone; it tells you everything, where it lives,
> what is pending, and what went wrong along the way.

## 1. What this is

- **Pluvine** (internal codename: Rainfocus) — a desktop ambient rain mixer for Linux.
- Public repo: https://github.com/Kaesimo/Pluvine — public, branch `main`.
- Stack: React 19 + TypeScript + Vite 8 + Tailwind v4 frontend, Electron 44 shell
  (system `electron` dependency, no bundled copy), Web Audio engine.
- One window, ten sound layers (light / window / forest / car / steady heavy rain,
  wind, distant thunder, heavy thunder, AC hum), presets, sleep timer, master
  volume, animated rain + lightning background. No accounts, no network at runtime.

## 2. Hard rules (never violate these)

1. **The user's personal email must NEVER be disclosed anywhere** — not in code,
   commits, docs, AUR, gists, or this file. The only identity allowed in public is
   author/committer `Kaesimo <kaesimo@users.noreply.github.com>`. Never write the
   user's real name anywhere; author = "Kaesimo" only. (The git identity is set as
   LOCAL repo config — see §10 after a re-clone.)
2. Never source, generate, or download audio myself — all recordings are the user's
   own. Both thunder recordings are kept, always.
3. Thunder recordings are never altered (no pitch/rate/offset/loop-point edits).
   All thunder complexity lives in *when* strikes play (the scheduler), not in the audio.
4. Design language: dark atmosphere, animated rain, lightning, presets, sleep timer,
   main screen fits without scrolling, accessible (focus states, ARIA,
   prefers-reduced-motion). No music-streaming / generic-AI / SaaS aesthetics: no
   glassmorphism, no gradients, no fake visualizers, no emoji.
5. Engine honesty: correct play/pause/resume/stop; preset switching mid-playback;
   no duplicate sources; a visible tab never restarts audio after manual pause/stop;
   honest error handling (failure notice + synth fallback where a recipe exists);
   engine testable independent of the UI.
6. Every claim in a report must match actual code/commands. lint + tests + builds
   run before anything is called green. Teaching flow: state initial steps before
   working, report every problem at the end of the report.
7. README stays plain and short (currently 45 lines): "don't make it quirky or
   vibecoded".
8. Tests are silent by default; `PLUVINE_E2E_AUDIBLE=1` makes the e2e audible.
9. AUR rules followed exactly: `-bin` suffix, Maintainer line, license field, real
   sha256 in `.SRCINFO`, single package, `master` branch, name must be free
   (verified via AUR RPC + `pacman -Ss`, resultcount 0).

## 3. Release state (as of this writing)

| item | value |
|---|---|
| latest release | **v1.0.3** — https://github.com/Kaesimo/Pluvine/releases/tag/v1.0.3 |
| tag → commit | `v1.0.3` (annotated) → `1a33588` "Release 1.0.3…" |
| tarball | `pluvine-1.0.3.tar.gz`, 1,236,008,114 bytes, sha256 `2f0861ace519dde157b4d1567404414da1609f7071ffbb01adcdb9491d912f40` |
| digest proof | GitHub's computed asset digest equals the pinned sha256 byte-for-byte; public download URL answers HTTP 200 |
| previous release | v1.0.2 (kept, honestly tags the old code), tarball 1,129,616,652 bytes, sha256 `3562605d3e2696ef0725fd7eead2da2dcf9fcc53be781c0531d39e42f240277a` |
| commits before that | `364a921` thunder switch, `9896957` README shortening — all commits use the noreply identity (author AND committer) |
| local package | `packaging/pluvine-1.0.3-1-x86_64.pkg.tar.zst` built + content-verified (version 1.0.3 inside, all 10 recordings, launcher, desktop) |
| installed on user's PC | `pluvine 1.0.2-1` (install line for 1.0.3 handed over; needs the user's sudo password) |

**Verification state at v1.0.3 — all green:**

- `npm run lint` (tsc) ✓
- `npm test` → **29/29 tests, 203 assertions, 0 failed** (was 30 tests; the
  pairing test was dropped — see §7)
- `node verify.browser.mjs` → **85/85** (Firefox/Playwright; strike proof
  `t=0.09s of 19.8s` on a real strike voice)
- `npm run build` ✓
- `node verify.electron.mjs` → **24/24** (asserts `app version 1.0.3`)

## 4. The thunder design (latest major change — the user's design correction)

The user's rule: **distant thunder = continuous looping rumble bed; heavy thunder =
the strike.**

- `src/types/soundscape.ts`: `thunder-distant-rumble` → `playbackMode: 'loop'`
  (it loops its long recording as a bed); `thunder-big-rumble` stays `'intermittent'`
  and is now the ONLY strike candidate.
- Pairing feature is dormant (one candidate can never pair) — the old pairing test
  was removed for exactly that reason. `STRIKE_PROFILES` keeps the dormant distant
  entry; no scheduler changes were needed for the switch
  (`reconcile()` ends with `syncThunderSchedule(true)`, so enabling/disabling the
  strike layer mid-play arms/cancels synchronously).
- **Strike fade-in**: `STRIKE_FADE_IN = 0.6` in `src/utils/soundEngine.ts` — strike
  gain ramps 0 → 1 (element volume carries intensity; attacks never jump).
- Strikes always play on throwaway "strike voices"; the strike layer's main element
  stays parked as a readiness probe. Recordings are played exactly as recorded.
- The user's new file: **`sounds/distant-thunder.mp3` — a 3-hour recording**
  (10800.012 s, 48 kHz stereo, 320 kbps, 432 MB). They first dropped it into
  `dist/sounds/` (their habit: edit dist as a working area) and said "use it".
  It was moved to `sounds/`, the sync table points at it, and it encodes to
  `public/sounds/distant-thunder.opus` = **102 MB, 3.0 h @ 79 kbps** (encode ~72 s).
  Loop wrap only every 3 hours — same rationale as the rain layers' 4 h caps.
- Old original `sounds/capaholiczsfx-distant-thunder-405128.mp3` is superseded but
  kept on disk (and recoverable from git history — it was tracked in
  `public/sounds/` before the standardization commit).
- `.gitignore`: only `public/sounds/heavy-thunder.opus` (~200 KB) stays tracked.
  The 102 MB distant opus is UNTRACKED (`git rm --cached` done) because GitHub
  hard-rejects >100 MB pushes. Consequence: a fresh clone has only heavy thunder
  until `npm run sounds:sync` runs (documented honestly in `sounds/README.md`).

Defaults: distant enabled, heavy disabled; **Night storm preset** enables both
(plays the bed + schedules strikes). Heavy = 19.77 s recording, intensity window
0.65–1.0; distant = 3 h bed, volume 0.4.

## 5. Audio pipeline (source of truth chain)

```
sounds/            originals, NEVER touched (git-ignored; sounds/README.md tracked,
                   table maps file name → mixer layer)
   │  npm run sounds:sync   (scripts/sync-sounds.mjs: ffmpeg → 48 kHz Opus 96k,
   │                         4 h duration cap per layer, tolerant of MISSING
   │                         sources — skips and warns; exits 1 only if zero found)
   ▼
public/sounds/*.opus   10 files (the runtime recordings; build serves these)
   │  vite build copies public/ → dist/
   ▼
dist/sounds/*.opus     what dev/electron/installed app plays
```

- The user sometimes edits `dist/sounds/` directly — always reconcile such files
  back into `sounds/` + the sync table (this is how the 3-hour file arrived).
- `pack:arch` runs `VITE_SOUND_EXT=mp3 vite build` but the manifest
  (`src/utils/assets.ts`) only rewrites `.wav` entries — with the opus manifest it
  is a NO-OP, so packaged builds correctly serve `.opus`. `scripts/transcode-sounds.mjs`
  (wav→mp3) is a legacy step that reports "no WAV files" and exits 0. Not a bug.
- npm cache/desktop-file/rsvg notes: icon built into `build/icon.png`; desktop file
  `packaging/pluvine.desktop`.

## 6. Engine architecture (`src/utils/soundEngine.ts`, ~1600 lines)

- **One path**: every mutation funnels into idempotent `reconcile()` (play/pause/
  stop, setLayerEnabled, applyPreset, asset status, visibility, statechange);
  pause/stop close the gain gate and tear sources down behind it (no clicks).
- Per-layer `HTMLAudioElement` (streamed, never full PCM), routed through
  `createMediaElementSource`; loop layers use `el.loop`.
- **Thunder scheduler**: single `thunderTimer`; first strike quick 3–6 s after play
  (or when a strike layer enables), then 18–42 s skewed-short gaps; rolling bursts;
  overlap cap `MAX_CONCURRENT_STRIKES` (oldest voice fades out, never hard-stopped).
  Cleared on pause/stop/destroy and when no strike layer is enabled; fader moves
  never restart it.
- **Synth fallback**: failed recording → layer marked `failed` → visible notice +
  procedural recipe where one exists (`HAS_SYNTH_RECIPE`). Distant thunder has NO
  continuous recipe: when its file is missing it reports `sources = 'none'`
  (silent + notice) — strikes had a synth fallback when the layer was intermittent.
- Diagnostics: `getDiagnostics()` exposes state/intent/gate/sleep/gains/sources/
  `playingElements` (counts only layer main elements, NEVER strike voices)/
  `activeStrikes`/`pendingThunder`. `getStrikeElements()` returns live strike
  voices (used by e2e proofs).
- Sleep timer: auto-starts playback,1 Hz countdown, fade, expiry stops; pause keeps
  counting; manual stop cancels; +15 min extends.

## 7. Tests (the model to preserve)

- `npm test` = `tsx test/soundEngine.test.ts` — 29 tests, 203 assertions, silent
  default output, pass/fail summary at the end.
- Mocks: `MockAudioContext` (records `param.calls`), `MockAudioParam`,
  `MockGainNode.instances`, `MockAudioElement.instances` (creation-order scoped via
  `elementBases`), scripted `rng` draw sequences.
- Helpers: `makeEngine(opts)` (defaults) and **`makeEngineWithStrike(opts)`**
  (creates + enables `thunder-big-rumble`) — every strike test uses the latter,
  because distant thunder is a loop and no longer a strike candidate.
- `TEST_OPTS`: `gateFadeMs 2, disposeDelayMs 1, strikeWindowMs 5`; tests that need
  strikes pass `quickStrikeDelay: [10, 20]`. Production quick delay is 3–6 s
  (browser e2e polls 9 s for the strike).
- Unit default playing set after `play()` = **2 elements** (light rain + distant
  bed). Browser e2e default playing = **3** (app default preset adds a layer).
  Do not cross-apply these numbers.
- Key behavioral asserts (regression tripwires): visible tab never restarts after
  manual stop; pause cancels the schedule; sleep expiry clears the timer; destroy
  leaves nothing; strike intensity window 0.65–1 for heavy; the bed's main element
  plays exactly once as a loop while the strike layer's main element never plays.
- The pairing test was removed when distant became a loop (impossible by design).

## 8. Packaging & release flow (worked end-to-end for 1.0.3)

1. Bump version everywhere: `package.json`, `package-lock.json` (only the two ROOT
   `version` fields — never the dependency ones), `verify.electron.mjs`
   (`check('app version X.Y.Z'…)`), `packaging/PKGBUILD` (`pkgver`),
   `packaging/aur-bin/PKGBUILD` (`pkgver`).
2. `npm run lint && npm test` sanity.
3. `npm run pack:arch` → `packaging/pluvine-X.Y.Z.tar.gz` (contents: `package.json`,
   `electron/`, `dist/`, `build/` — ~1.15 GB with all recordings).
4. `sha256sum` the tarball → paste into `packaging/aur-bin/PKGBUILD` `sha256sums`
   (first entry; second entry = sha256 of `pluvine.desktop`, stable) →
   `cd packaging/aur-bin && makepkg --printsrcinfo > .SRCINFO`.
5. `git add -A && git commit` (LOCAL identity must be noreply — §10),
   `git tag -a vX.Y.Z -m "…"`, `git push origin HEAD vX.Y.Z`
   (create the tag BEFORE pushing it — pushing a nonexistent refspec fails).
6. `gh release create vX.Y.Z packaging/pluvine-X.Y.Z.tar.gz --title … --notes …`
   (background it; ~1 GB upload takes minutes).
7. Verify: `gh api repos/Kaesimo/Pluvine/releases/tags/vX.Y.Z --jq '.assets[] |
   {name, size, digest}'` — the `digest` must equal your pinned sha256 — plus
   `curl -sIL` the public download URL (HTTP 200).
8. Local package: `cd packaging && makepkg -Cf` → `pluvine-X.Y.Z-1-x86_64.pkg.tar.zst`
   (content-check: `pacman -Qp … --list`, version via
   `bsdtar -xOf … opt/pluvine/package.json`). Install needs the USER's sudo
   password — hand them the one-liner, do not attempt non-interactive sudo.
9. README check counts must be updated when they change (currently: 29 tests,
   85 browser checks, 24 electron checks).

## 9. Pending / open items

1. **AUR publish** — everything is ready (`packaging/aur-bin/`: PKGBUILD pinned to
   the v1.0.3 tarball sha, valid `.SRCINFO`, desktop file, README checklist; name
   `pluvine-bin` confirmed free). Blocked only by the AUR registration bot wall
   ("Making sure you're not a bot!"). Plan agreed: user registers the account and
   adds an SSH key; THEN the assistant pushes with one command and adds the
   `yay -S pluvine-bin` line to the README (currently the README honestly says the
   package is prepared but not published).
   - SSH prep from the old machine: key `~/.ssh/aur` + `~/.ssh/config` entry +
     known_hosts — these DIE with the format. Since the AUR account does not exist
     yet, simply generate a fresh keypair AFTER the format and add its pubkey when
     registering. Staging dir `/tmp/opencode/aur-push` also dies — recreate from
     the repo copy with the noreply identity before pushing.
2. **User's install of 1.0.3** — line handed over:
   `cd ~/Projects/rainfocus/packaging && sudo pacman -U pluvine-1.0.3-1-x86_64.pkg.tar.zst`
   (confirm whether they ran it after the format; the package file is local-only
   and dies with the disk — rebuild with `makepkg -Cf` if needed, tarball is
   re-downloadable from the release).
3. **Acoustics unverified** — everything was verified structurally/numerically;
   nobody has LISTENED (headless). Ask the user how the bed level and strike
   timing feel; adjust volumes only if they ask.
4. **Placeholders the user deferred** ("idk"): license = `LicenseRef-Proprietary`
   (no LICENSE file shipped), maintainer email = `kaesimo@localhost`. If they ever
   pick a real license, update both PKGBUILDs + `.SRCINFO` + README.
5. **`npm run release X.Y.Z`** convenience script was offered, never answered.
6. `docs/electron-arch.md` still shows 1.0.2-era artifact names in historical
   examples — intentional (narrative record), not stale drift.

## 10. Environment, identity, and post-format recovery

**Git identity (critical):** local repo config is
`Kaesimo <kaesimo@users.noreply.github.com>` (author AND committer verified via
`gh api`). Global config was deliberately LEFT UNTOUCHED (other projects). A
re-clone does NOT carry local config → after format, run inside the repo:
```bash
git config user.name "Kaesimo"
git config user.email "kaesimo@users.noreply.github.com"
```
and verify `git log --format='%an <%ae> | %cn <%ce>' -1` after the first new commit.

**Recovery checklist after formatting:**
1. Install Node, git, ffmpeg, electron (`pacman -S electron`), Playwright firefox,
   `gh` CLI (`gh auth login` as Kaesimo).
2. `git clone https://github.com/Kaesimo/Pluvine.git` (this `context.md` is in it).
3. Set the local git identity (above). Generate a new AUR SSH keypair if/when the
   user registers on AUR.
4. `npm install` → `npm run lint && npm test` (expect 29/29) →
   `node verify.browser.mjs` (85/85) → `npm run build` → `node verify.electron.mjs`
   (24/24).
5. Sounds: a fresh clone has only `heavy-thunder.opus`. The other 9 originals are
   NOT in git — the user must provide them again into `sounds/` (table in
   `sounds/README.md`), then `npm run sounds:sync`. Until then the app runs on
   synth fallbacks with honest notices.
6. Dev: `npm run dev` → http://localhost:3000 (stop a stray server with
   `llof -ti:3000 | xargs -r kill`). Desktop app: `npm run electron`.
7. Big local files (tarball, built pkg) are gitignored and will be gone — rebuild
   with `npm run pack:arch` / `makepkg -Cf`, or download the tarball from the
   release URL.

**Gotchas learned the hard way:**
- `/tmp` is a **7.8 GB tmpfs** on this machine — a 5.3 GB AUR test build filled it
  to 100% and caused `ENOSPC` screenshot failures + flaky font errors in e2e.
  Never park large build dirs in `/tmp`; screenshots go to `/tmp/opencode/shots`.
- Real disk hogs to clean when needed: `packaging/*.tar.gz|*.pkg.tar.zst`,
  `packaging/{src,pkg}`, `release/` — all regenerable; the release tarball is
  re-downloadable from GitHub.
- `gh` fails inside an AUR-staging dir (remote points at the AUR host) → pass
  `-R Kaesimo/Pluvine`.
- Wiki/search tools are bot-blocked; `curl` with a browser UA works for AUR pages.
- Unit-test `rng` draw sequences are valid only for a SINGLE strike candidate.
- Playwright runs firefox only (`--no-save`).
- Past mysteries already solved: tag push "Everything up-to-date" happened because
  the tag was never created before pushing; an early `pacman` invocation used a
  wrong flag; the README's earlier v1.0.2-era promise of AUR install was removed
  when registration got blocked.

## 11. Standing instructions for future sessions

- Address the user directly; they expect the teaching flow (initial steps up
  front, every problem listed in the final report).
- Their habit: they edit `dist/` directly — reconcile, never scold.
- They may hand over new/renamed sound files at any time; wire them through
  `sounds/` + `scripts/sync-sounds.mjs` + `npm run sounds:sync`, never commit
  large binaries.
- Keep releases honest: tag only what was tested, keep old releases, pin AUR shas
  to GitHub's computed digest when possible.
