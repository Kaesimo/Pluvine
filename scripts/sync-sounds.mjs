/**
 * sounds:sync — build the app's runtime audio from the user's recordings.
 *
 * Reads the labeled originals in ./sounds (never modified) and writes Ogg
 * Opus 96k copies into ./public/sounds (the directory the app and every
 * build actually serve). One file per mixer layer — the eight long rain/
 * wind/AC recordings (capped at 4 hours so loop wraps stay rare) and the
 * two thunder one-shots (no cap: they play once per strike, not on a loop,
 * and are standardized to the same 48kHz Opus as everything else).
 *
 * Why Opus 96k: rain/wind/AC are noise-like content, Opus's best case — at
 * 96k it matches or beats MP3 192k perceptually while halving the bytes.
 * Chromium/Firefox/Electron all play Ogg Opus natively (the loopback server
 * maps .opus -> audio/ogg).
 *
 * Duration caps: the long recordings are cut to CAP_SECONDS so the loop
 * wrap (and its brief head fade) returns at most a couple of times per
 * night instead of once every 8-12h being the only option — 4h keeps wraps
 * rare; recordings already shorter than the cap (wind, AC) are untouched.
 * Set a layer's cap to 0 to keep the full recording.
 *
 * Metadata is stripped (-map_metadata -1): recordings often embed recorder
 * software fields we don't ship.
 *
 * Idempotent: a file whose output exists, is newer than its source, and is
 * already <= ~110kbps is skipped. --force re-encodes everything.
 * Encoding runs in parallel (one ffmpeg per file).
 *
 * Requires ffmpeg with libopus (standard on Arch: pacman -S ffmpeg).
 */
import { existsSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'sounds');
const outDir = join(root, 'public', 'sounds');

const CAP_SECONDS = 4 * 3600;

/** mixer layer id -> [source file in ./sounds, output name, max seconds (0 = full)] */
const LAYERS = [
  ['rain-light-loop', 'Light rain.mp3', 'light-rain.opus', CAP_SECONDS],
  ['rain-window-patter', 'Window rain.mp3', 'window-rain.opus', CAP_SECONDS],
  ['rain-forest-loop', 'forest rain.mp3', 'forest-rain.opus', CAP_SECONDS],
  ['rain-car-glass', 'car rain.mp3', 'car-rain.opus', CAP_SECONDS],
  ['rain-ambient-gentle', 'Steady rain.mp3', 'steady-rain.opus', CAP_SECONDS],
  ['rain-heavy-loop', 'Heavy rain.mp3', 'heavy-rain.opus', CAP_SECONDS],
  ['wind-blowing-ambience', 'wind.mp3', 'wind.opus', 0],
  ['mechanical-air-conditioner', 'AC hum.mp3', 'ac-hum.opus', 0],
  ['thunder-distant-rumble', 'distant-thunder.mp3', 'distant-thunder.opus', 0],
  ['thunder-big-rumble', 'capaholiczsfx-heavy-thunder-405126.mp3', 'heavy-thunder.opus', 0],
];

const TARGET_BITRATE = '96k';
const MAX_ACCEPT_KBPS = 110; // outputs at or under this count as done
const FORCE = process.argv.includes('--force');

async function ffprobe(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,bit_rate',
    '-of', 'csv=p=0',
    file,
  ]);
  const [duration, bitRate] = stdout.trim().split(',').map(Number);
  return { duration, kbps: bitRate / 1000 };
}

function isFresh(src, out) {
  if (!existsSync(out)) return false;
  return statSync(out).mtimeMs >= statSync(src).mtimeMs;
}

async function encode(src, out, capSeconds) {
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...(capSeconds > 0 ? ['-t', String(capSeconds)] : []),
    '-i', src,
    '-map_metadata', '-1',
    '-codec:a', 'libopus', '-b:a', TARGET_BITRATE,
    out,
  ]);
}

const missing = [];
const jobs = [];
for (const [layerId, srcName, outName, cap] of LAYERS) {
  const src = join(srcDir, srcName);
  const out = join(outDir, outName);
  if (!existsSync(src)) {
    missing.push(`${srcName} (layer ${layerId})`);
    continue;
  }
  jobs.push({ layerId, src, out, cap });
}
if (missing.length > 0) {
  console.warn(`sounds:sync: ${missing.length} source(s) missing from ./sounds:`);
  for (const m of missing) console.warn(`  MISSING  ${m}`);
  console.warn('  (those layers keep their existing output / synth fallback)');
}
if (jobs.length === 0) {
  console.error('sounds:sync: no sources found in ./sounds — nothing to do');
  process.exit(1);
}

const results = await Promise.all(
  jobs.map(async ({ layerId, src, out, cap }) => {
    const t0 = Date.now();
    const srcInfo = await ffprobe(src);
    const wantDuration = cap > 0 ? Math.min(srcInfo.duration, cap) : srcInfo.duration;
    if (!FORCE && isFresh(src, out)) {
      const { kbps, duration } = await ffprobe(out);
      if (kbps <= MAX_ACCEPT_KBPS && Math.abs(duration - wantDuration) <= 2.5) {
        return { layerId, src, out, skipped: true, wantDuration, secs: (Date.now() - t0) / 1000 };
      }
    }
    await encode(src, out, cap);
    const o = await ffprobe(out);
    if (Math.abs(o.duration - wantDuration) > 2.5) {
      throw new Error(
        `${out.split('/').pop()}: duration ${o.duration.toFixed(1)}s, expected ${wantDuration.toFixed(1)}s`,
      );
    }
    return { layerId, src, out, skipped: false, wantDuration, kbps: o.kbps, secs: (Date.now() - t0) / 1000 };
  }),
);

const mb = (p) => (statSync(p).size / 1048576).toFixed(1);
let inTotal = 0, outTotal = 0;
for (const r of results) {
  inTotal += statSync(r.src).size;
  outTotal += statSync(r.out).size;
  const dur = r.skipped ? 'up to date' : `${(r.wantDuration / 3600).toFixed(1)}h @ ${r.kbps.toFixed(0)}kbps`;
  console.log(
    `  ${r.layerId.padEnd(26)} ${mb(r.src).padStart(7)}MB -> ${mb(r.out).padStart(7)}MB  ${dur}  (${r.secs.toFixed(0)}s)`,
  );
}
console.log(
  `sounds:sync: ${results.length} layers, ${(inTotal / 1048576).toFixed(0)}MB -> ${(outTotal / 1048576).toFixed(0)}MB in public/sounds`,
);
if (missing.length > 0) {
  console.warn(`sounds:sync: skipped ${missing.length} missing source(s) — see list above`);
}
