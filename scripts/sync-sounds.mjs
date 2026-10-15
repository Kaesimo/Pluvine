/**
 * sounds:sync — build the app's runtime audio from the user's recordings.
 *
 * Reads the labeled originals in ./sounds (never modified) and writes 192k
 * MP3 copies into ./public/sounds (the directory the app and every build
 * actually serve). One file per mixer layer; the two thunder one-shots are
 * already small/processed and live permanently in public/sounds untouched.
 *
 * Why 192k: the recordings are 320k MP3 (~8.2GB total). Rain/wind/AC are
 * noise-like content — MP3's best case — and 192k is transparent here while
 * cutting the shipped audio to ~60%. One quality generation is lost
 * (320k -> 192k re-encode); inaudible for this material, and the originals
 * stay in ./sounds so the step is always re-runnable.
 *
 * Metadata is stripped (-map_metadata -1): recordings often embed recorder
 * software fields we don't ship.
 *
 * Idempotent: a file whose output exists, is newer than its source, and is
 * already <= ~200kbps is skipped. --force re-encodes everything.
 * Encoding runs in parallel (one ffmpeg per file).
 *
 * Requires ffmpeg with libmp3lame (pacman -S ffmpeg).
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

/** mixer layer id -> [source file in ./sounds, output name in public/sounds] */
const LAYERS = [
  ['rain-light-loop', 'Light rain.mp3', 'light-rain.mp3'],
  ['rain-window-patter', 'Window rain.mp3', 'window-rain.mp3'],
  ['rain-forest-loop', 'forest rain.mp3', 'forest-rain.mp3'],
  ['rain-car-glass', 'car rain.mp3', 'car-rain.mp3'],
  ['rain-ambient-gentle', 'Steady rain.mp3', 'steady-rain.mp3'],
  ['rain-heavy-loop', 'Heavy rain.mp3', 'heavy-rain.mp3'],
  ['wind-blowing-ambience', 'wind.mp3', 'wind.mp3'],
  ['mechanical-air-conditioner', 'AC hum.mp3', 'ac-hum.mp3'],
];

const TARGET_BITRATE = '192k';
const MAX_ACCEPT_KBPS = 210; // outputs at or under this count as done
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
  if (statSync(out).mtimeMs < statSync(src).mtimeMs) return false;
  return true; // bitrate checked by caller via ffprobe
}

async function encode(src, out) {
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', src,
    '-map_metadata', '-1',
    '-codec:a', 'libmp3lame', '-b:a', TARGET_BITRATE,
    out,
  ]);
}

const jobs = [];
for (const [layerId, srcName, outName] of LAYERS) {
  const src = join(srcDir, srcName);
  const out = join(outDir, outName);
  if (!existsSync(src)) {
    console.error(`sounds:sync: missing source ${src}`);
    process.exit(1);
  }
  jobs.push({ layerId, src, out });
}

const results = await Promise.all(
  jobs.map(async ({ layerId, src, out }) => {
    const t0 = Date.now();
    if (!FORCE && isFresh(src, out)) {
      const { kbps } = await ffprobe(out);
      if (kbps <= MAX_ACCEPT_KBPS) {
        return { layerId, out, skipped: true, src, secs: (Date.now() - t0) / 1000 };
      }
    }
    await encode(src, out);
    const s = await ffprobe(src);
    const o = await ffprobe(out);
    if (Math.abs(s.duration - o.duration) > 2.5) {
      throw new Error(
        `${outNameSafe(out)}: duration drifted ${s.duration.toFixed(1)}s -> ${o.duration.toFixed(1)}s`,
      );
    }
    return { layerId, out, skipped: false, src, srcDur: s.duration, kbps: o.kbps, secs: (Date.now() - t0) / 1000 };
  }),
);

function outNameSafe(p) { return p.split('/').pop(); }

const mb = (p) => (statSync(p).size / 1048576).toFixed(1);
let inTotal = 0, outTotal = 0;
for (const r of results) {
  inTotal += statSync(r.src).size;
  outTotal += statSync(r.out).size;
  const dur = r.skipped ? 'up to date' : `${(r.srcDur / 3600).toFixed(1)}h @ ${r.kbps.toFixed(0)}kbps`;
  console.log(
    `  ${r.layerId.padEnd(26)} ${mb(r.src).padStart(7)}MB -> ${mb(r.out).padStart(7)}MB  ${dur}  (${r.secs.toFixed(0)}s)`,
  );
}
console.log(
  `sounds:sync: ${results.length} layers, ${(inTotal / 1048576).toFixed(0)}MB -> ${(outTotal / 1048576).toFixed(0)}MB in public/sounds`,
);
