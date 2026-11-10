/**
 * Mobile packaging step — run AFTER `vite build`, before `cap sync android`.
 *
 * The desktop recordings are 4-hour Opus 96k files (~1.2 GB total), which makes
 * an APK impractical. The seamless loop crossfade added to the engine means a
 * shorter loop no longer creates an audible hole, so the Android build ships
 * 20-minute, 48k Opus copies of the rain/wind/AC layers.
 *
 * Thunder is deliberately untouched: `distant-thunder.opus` and
 * `heavy-thunder.opus` are copied byte-for-byte. The originals in
 * `public/sounds/` are never modified; only `dist/sounds/` is rewritten.
 *
 * Requires ffmpeg with libopus (standard on Arch: pacman -S ffmpeg).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'public', 'sounds');
const outDir = join(root, 'dist', 'sounds');
const CAP_SECONDS = 20 * 60;
const BITRATE = '48k';

/** Thunder recordings are never re-encoded or trimmed. */
const KEEP_VERBATIM = new Set(['distant-thunder.opus', 'heavy-thunder.opus']);

if (!existsSync(srcDir)) {
  console.error(`prepare-mobile-sounds: ${srcDir} missing — run "npm run sounds:sync" first`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => f.endsWith('.opus')).sort();
if (files.length === 0) {
  console.error('prepare-mobile-sounds: no Opus recordings found');
  process.exit(1);
}

let before = 0;
let after = 0;
for (const file of files) {
  const from = join(srcDir, file);
  const to = join(outDir, file);
  before += statSync(from).size;

  if (KEEP_VERBATIM.has(file)) {
    copyFileSync(from, to);
    console.log(`  ${file}: kept verbatim (${(statSync(to).size / 1048576).toFixed(1)}MB)`);
  } else {
    execFileSync(
      'ffmpeg',
      [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', from,
        '-t', String(CAP_SECONDS),
        '-c:a', 'libopus',
        '-b:a', BITRATE,
        '-map_metadata', '-1',
        to,
      ],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    console.log(
      `  ${file}: ${(statSync(from).size / 1048576).toFixed(1)}MB → ` +
        `${(statSync(to).size / 1048576).toFixed(1)}MB (${CAP_SECONDS / 60}min, ${BITRATE})`,
    );
  }
  after += statSync(to).size;
}

console.log(
  `prepare-mobile-sounds: ${files.length} files, ` +
    `${(before / 1048576).toFixed(1)}MB → ${(after / 1048576).toFixed(1)}MB`,
);
