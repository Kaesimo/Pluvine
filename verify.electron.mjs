/**
 * Electron end-to-end verification for Pluvine.
 *
 * Complements verify.browser.mjs: that script proves the app inside a normal
 * browser; this one proves the app inside real Electron — its own Chromium,
 * its own loopback server (electron/main.cjs) — including the Web Audio
 * media-element path, which a mis-configured setup mutes SILENTLY (no error,
 * no DOM trace), so it needs an actual signal measurement.
 *
 * Prereqs:  npm run build && npm i --no-save playwright
 * Run:      node verify.electron.mjs
 */
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('[electron] launching main process…');
// --ozone-platform=headless: render offscreen so the test never steals the
// user's desktop. Drop it to watch the app run while the test drives it.
// PLUVINE_E2E_EXEC=/path/to/pluvine runs the suite against a PACKAGED
// build (e.g. release/linux-unpacked/pluvine) instead of the source tree.
const packagedExec = process.env.PLUVINE_E2E_EXEC;
const app = packagedExec
  ? await electron.launch({ executablePath: packagedExec, args: ['--ozone-platform=headless'] })
  : await electron.launch({ args: ['.', '--ozone-platform=headless'] });
console.log(`[electron] target: ${packagedExec ?? 'source tree (electron .)'}`);
const page = await app.firstWindow();

const badResponses = [];
const pageErrors = [];
const consoleErrors = [];
// The audio proof below fetches one real recording by name; if that exact
// fetch ever 404s it must be reported, so exempt exactly that probe.
const PROOF_PROBE = 'light-rain.opus';
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().includes(PROOF_PROBE)) badResponses.push(`${r.status()} ${r.url()}`);
});
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  // Chromium logs failed resources without the URL in the text — check the
  // message location too, or the deliberate probe 404 would slip through.
  const loc = m.location()?.url ?? '';
  if (m.type() === 'error' && !m.text().includes(PROOF_PROBE) && !loc.includes(PROOF_PROBE)) {
    consoleErrors.push(m.text());
  }
});

await page.waitForSelector('.pl-play', { timeout: 20000 });

// Silence the run: this suite plays real rain through the real speakers.
// Master volume 0 mutes app playback at the END of the graph, so every
// assertion still reads state/signal upstream of the mute. (The proof below
// has its own AudioContext and is muted separately, right after its analyser.)
// Set PLUVINE_E2E_AUDIBLE=1 to hear the app while the suite drives it.
if (process.env.PLUVINE_E2E_AUDIBLE !== '1') {
  await page.evaluate(() => localStorage.setItem('pluvine_master_volume_v1', '0'));
  await page.reload();
  await page.waitForSelector('.pl-play', { timeout: 20000 });
}

// ── shell ────────────────────────────────────────────────────────────────
check('title', (await page.title()).includes('Pluvine'));
const winCount = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
check('exactly one window', winCount === 1, `got ${winCount}`);
const version = await app.evaluate(({ app: a }) => a.getVersion());
check('app version 1.0.2', version === '1.0.2', version);

// ── playback ─────────────────────────────────────────────────────────────
await page.click('.pl-play');
await page.waitForFunction(
  () => document.querySelector('[role="status"]')?.textContent?.trim().startsWith('Playing'),
  null,
  { timeout: 15000 },
);
check('click play → status "Playing"', true);

// The critical Electron-specific proof: same-origin file → <audio> →
// createMediaElementSource → AnalyserNode must carry real signal. Origin
// mistakes here produce silence without any error, so assert on the data.
const proof = await page.evaluate(async () => {
  // Fetch one real recording (runtime audio is Ogg Opus 96k from sounds:sync)
  // and prove the media → Web Audio path is live on the file://-free origin.
  const res = await fetch('/sounds/light-rain.opus');
  if (!res.ok) return { error: `fetch ${res.status}` };
  const type = res.headers.get('content-type') ?? 'audio/ogg';
  const buf = await res.arrayBuffer();
  const el = document.createElement('audio');
  el.src = URL.createObjectURL(new Blob([buf], { type }));
  const ctx = new AudioContext();
  const src = ctx.createMediaElementSource(el);
  const analyser = ctx.createAnalyser();
  src.connect(analyser);
  // Muted AFTER the analyser: the peak assertion below reads what flows into
  // the analyser (upstream of this gain), so it measures exactly what it did
  // before — but gain 0 stops the samples reaching the speakers. Without this
  // the proof blasts real rain at the developer for 1.5s on every run.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  analyser.connect(mute);
  mute.connect(ctx.destination);
  await ctx.resume();
  await el.play();
  await new Promise((r) => setTimeout(r, 1500));
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const result = { peak, readyState: el.readyState, ctxState: ctx.state };
  el.pause();
  await ctx.close();
  return result;
});
check('media element loaded (readyState ≥ 3)', (proof.readyState ?? 0) >= 3, JSON.stringify(proof));
check('AudioContext running', proof.ctxState === 'running', proof.ctxState);
check('MediaElementSource output is NOT silent', (proof.peak ?? 0) > 0.001, JSON.stringify(proof));

await page.click('.pl-play');
await page.waitForFunction(
  () => document.querySelector('[role="status"]')?.textContent?.trim() === 'Paused',
  null,
  { timeout: 5000 },
);
check('click pause → status "Paused"', true);

// ── mixer ────────────────────────────────────────────────────────────────
const toggle = page.locator('.pl-toggle').first();
const before = await toggle.getAttribute('aria-pressed');
await toggle.click();
const after = await toggle.getAttribute('aria-pressed');
check('layer toggle flips aria-pressed', before !== after, `${before} → ${after}`);
await toggle.click();

const fader = page.locator('input.pl-fader-input').first();
await fader.focus();
await page.keyboard.press('ArrowUp');
check('edited mix offers "Save mix…"', await page.locator('text=Save mix…').isVisible());

// ── save / persistence ───────────────────────────────────────────────────
await page.click('text=Save mix…');
await page.waitForSelector('#pl-save-name');
await page.fill('#pl-save-name', 'E2E mix');
await page.click('.pl-pop button[type="submit"]');
await page.waitForSelector('.pl-preset:has-text("E2E mix")', { timeout: 5000 });
check('saved preset appears in preset bar', true);
const stored = await page.evaluate(() => localStorage.getItem('pluvine_custom_presets_v2'));
check('custom preset written to localStorage', (stored ?? '').includes('E2E mix'));

await page.reload();
await page.waitForSelector('.pl-play', { timeout: 15000 });
check('preset survives reload', await page.locator('.pl-preset:has-text("E2E mix")').isVisible());
check(
  'status "Stopped" after reload (intent is not persisted)',
  (await page.locator('[role="status"]').textContent()).trim() === 'Stopped',
);

// ── sleep timer ──────────────────────────────────────────────────────────
await page.click('button[aria-label="Open sleep timer"]');
await page.waitForSelector('[role="dialog"][aria-label="Sleep timer"]');
await page.click('[role="dialog"] button:has-text("30 min")');
await page.waitForFunction(
  () => document.querySelector('[role="status"]')?.textContent?.trim() === 'Playing',
  null,
  { timeout: 15000 },
);
check('starting the timer auto-starts playback', true);
// Case-insensitive: matches both "Open sleep timer" and "Sleep timer: … left".
const sleepBtn = page.locator('button[aria-label*="sleep timer" i]');
check('timer button shows countdown', /\d\d:\d\d/.test((await sleepBtn.textContent()).trim()));
await sleepBtn.click();
await page.click('[role="dialog"] button:has-text("+15 min")');
const afterAdd = (await sleepBtn.textContent()).trim();
check('+15 min extends the countdown', /^(44|45):/.test(afterAdd), afterAdd);
// The popover stays open after +15 (no close on add) — Cancel is right there.
await page.click('[role="dialog"] button:has-text("Cancel")');
check('cancel returns label to "Sleep"', (await sleepBtn.textContent()).trim() === 'Sleep');
check(
  'cancelling the timer leaves playback on',
  (await page.locator('[role="status"]').textContent()).trim() === 'Playing',
);

// ── preset switching during playback ─────────────────────────────────────
await page.locator('.pl-preset').first().click();
await page.waitForFunction(
  () => document.querySelector('[role="status"]')?.textContent?.trim() === 'Playing',
  null,
  { timeout: 5000 },
);
check('preset switch during playback keeps playing', true);

// ── cleanup: remove the e2e preset so the profile is pristine ────────────
await page.click('button[aria-label="Delete preset E2E mix"]');
check('e2e preset deleted', !(await page.locator('.pl-preset:has-text("E2E mix")').isVisible()));

// ── hygiene ──────────────────────────────────────────────────────────────
await page.waitForTimeout(500);
check('no failed network responses', badResponses.length === 0, badResponses.join(', '));
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));

await app.close();

console.log(`\n[electron] ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
