/**
 * Packaging step — run AFTER `vite build`, before electron-builder/tar.
 *
 * Transcodes dist/sounds/*.wav to 192k MP3 and removes the WAVs from the
 * BUILD OUTPUT only. The originals in public/sounds/ are never touched.
 * Pair with VITE_SOUND_EXT=mp3 (see the dist:linux / pack:arch scripts) so
 * the asset manifest points at the .mp3 names — src/utils/assets.ts.
 *
 * Why: the recordings are ~87MB; the WAV portion (~32MB) becomes ~4MB and
 * rain/wind noise is ideal MP3 material at 192k. Known tradeoff: MP3 adds a
 * small encoder delay/padding (~25ms) at loop boundaries — inaudible for
 * noise-like loops, but the loops are no longer bit-exact seamless.
 *
 * Requires ffmpeg with libmp3lame (standard on Arch: pacman -S ffmpeg).
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const soundsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'sounds');
if (!existsSync(soundsDir)) {
  console.error(`transcode-sounds: ${soundsDir} missing — run "npm run build" first`);
  process.exit(1);
}

const wavs = readdirSync(soundsDir).filter((f) => f.endsWith('.wav'));
if (wavs.length === 0) {
  console.log('transcode-sounds: no WAV files in dist/sounds — nothing to do');
  process.exit(0);
}

let saved = 0;
for (const wav of wavs) {
  const from = join(soundsDir, wav);
  const to = `${from.slice(0, -4)}.mp3`;
  execFileSync(
    'ffmpeg',
    ['-y', '-hide_banner', '-loglevel', 'error', '-i', from, '-codec:a', 'libmp3lame', '-b:a', '192k', to],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  const inSize = statSync(from).size;
  const outSize = statSync(to).size;
  saved += inSize - outSize;
  console.log(`  ${wav}: ${(inSize / 1048576).toFixed(1)}MB wav → ${(outSize / 1048576).toFixed(1)}MB mp3`);
  rmSync(from);
}
console.log(
  `transcode-sounds: ${wavs.length} files transcoded, ${(saved / 1048576).toFixed(1)}MB saved in dist/sounds`,
);
