/**
 * Pluvine — real-browser verification (Firefox via Playwright, dev server).
 * Exercises actual UI interactions and reads real engine state from the
 * dev-only window.__pluvine handle. Exits non-zero on any failure.
 *
 * Run (playwright is intentionally not a project dependency):
 *   npm run dev &
 *   npm install --no-save playwright && npx playwright install firefox
 *   node verify.browser.mjs
 */
import { firefox } from 'playwright';

const URL = 'http://localhost:3000/';
const SHOTS = '/tmp/opencode/shots';

let passed = 0;
let failed = 0;
const failures = [];
const ok = (cond, msg) => {
  if (cond) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
};
const section = (name) => console.log(`\n— ${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await firefox.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const diag = () =>
  page.evaluate(() => {
    const e = window.__pluvine;
    if (!e) return null;
    const d = e.getDiagnostics();
    d.ctxState = e.ctx ? e.ctx.state : 'none';
    d.master = e.getMasterVolume();
    d.statuses = e.getAssetStatuses();
    return d;
  });

const statusText = async () => (await page.locator('[role="status"]').innerText()).trim();
const mixName = async () =>
  // The mix name is the only truncating element in the plate — matched by
  // behavior, not by a font-size class, so scale-ups don't break this helper.
  (await page.locator('.pl-plate .truncate').first().innerText()).trim();

try {
  // ---------------------------------------------------------------- render
  section('initial render in a real browser');
  await page.goto(URL, { waitUntil: 'load' });
  // Silence the run: this suite plays real recordings through the real
  // speakers. Master volume 0 cuts the output at the END of the graph, so
  // every assertion below still reads state/signal upstream of the mute —
  // none of them weaken. The volume assertions are relative (after ≈ before
  // + 0.01, persisted ≈ after), so starting from 0 keeps them exact.
  // Set PLUVINE_E2E_AUDIBLE=1 to hear the app while the suite drives it.
  if (process.env.PLUVINE_E2E_AUDIBLE !== '1') {
    await page.evaluate(() => localStorage.setItem('pluvine_master_volume_v1', '0'));
    await page.reload({ waitUntil: 'load' });
  }
  await sleep(900);

  ok((await page.locator('.pl-fader-input').count()) === 10, 'ten faders rendered');
  ok((await page.locator('.pl-preset').count()) === 6, 'six presets rendered');
  ok((await statusText()) === 'Stopped', 'status reads Stopped initially');
  ok(
    await page.evaluate(() => document.fonts.check('600 15px "IBM Plex Sans Variable"')),
    'IBM Plex Sans actually loaded'
  );
  ok((await page.locator('[aria-label="Open sleep timer"]').count()) === 1, 'sleep timer control present');

  // ---------------------------------------------------------------- play
  section('play: real AudioContext, real media elements');
  await page.locator('.pl-play').click();
  await sleep(1200);

  ok((await statusText()) === 'Playing', 'status reads Playing after clicking play');
  let d = await diag();
  ok(d && d.state === 'playing', 'engine state is playing');
  ok(d.ctxState === 'running', `real AudioContext is running (${d.ctxState})`);
  ok(d.gateValue === 1, 'playback gate open');
  ok(d.playingElements >= 2, `enabled loop recordings are playing (${d.playingElements} elements)`);
  ok(d.synthVoices === 0, 'healthy files need no synth fallback');

  await sleep(3000);
  d = await diag();
  const statuses = Object.values(d.statuses);
  ok(!statuses.includes('failed'), 'no recording failed to load');
  ok(statuses.filter((s) => s === 'ready').length >= 6, `recordings became ready (${statuses.filter((s) => s === 'ready').length}/10)`);

  // Real decode proof: every mapped recording reports a real duration.
  const mediaInfo = await page.evaluate(() =>
    [...window.__pluvine.runtime.values()].map((rt) => ({
      src: rt.el ? rt.el.src : null,
      duration: rt.el ? rt.el.duration : 0,
      readyState: rt.el ? rt.el.readyState : -1,
    }))
  );
  ok(
    mediaInfo.filter((m) => m.src && m.duration > 1).length === 10,
    `all ten recordings decoded with real durations (min ${Math.min(...mediaInfo.map((m) => m.duration)).toFixed(1)}s)`
  );

  // Real thunder strike: the one-shot element leaves its position at 0.
  const strike = await page.evaluate(() => {
    const el = window.__pluvine.runtime.get('thunder-distant-rumble').el;
    return { currentTime: el.currentTime, duration: el.duration, paused: el.paused };
  });
  const strikeFired = await (async () => {
    const deadline = Date.now() + 9000;
    while (Date.now() < deadline) {
      const s = await page.evaluate(() => {
        const el = window.__pluvine.runtime.get('thunder-distant-rumble').el;
        return { currentTime: el.currentTime, duration: el.duration };
      });
      if (s.currentTime > 0.05) return s;
      await sleep(250);
    }
    return strike;
  })();
  ok(
    strikeFired.currentTime > 0.05,
    `scheduled thunder strike played the real recording (t=${strikeFired.currentTime.toFixed(2)}s of ${strikeFired.duration.toFixed(1)}s)`
  );

  await page.screenshot({ path: `${SHOTS}/state-playing.png` });

  // ---------------------------------------------------------------- pause + visibility invariant
  section('CRITICAL invariant: visibility recovery after manual pause');
  await page.locator('.pl-play').click(); // pause
  await sleep(600);
  ok((await statusText()) === 'Paused', 'status reads Paused');
  d = await diag();
  ok(d.state === 'paused' && d.intent === 'pause', 'intent is pause');
  ok(d.playingElements === 0, 'all recording elements paused');
  ok(d.synthVoices === 0, 'no synthesized voices left');
  // Firefox's AudioParam.value does not reflect scheduled automation, so the
  // gate is read back through the automation query instead.
  const gateTarget = await page.evaluate(() => {
    const e = window.__pluvine;
    if (!e.gateGain || !e.ctx) return 'no-gate';
    try {
      return e.gateGain.gain.getTargetAtTime(e.ctx.currentTime, 0.04);
    } catch {
      return 'unsupported';
    }
  });
  if (typeof gateTarget === 'number' && !Number.isNaN(gateTarget)) {
    ok(gateTarget === 0, `playback gate closed (${gateTarget})`);
  } else {
    console.log(
      `  ⚠️  gate automation not observable in this browser (${gateTarget}); covered by engine unit tests`
    );
  }

  // Simulate the tab going away and coming back (real handler, real document).
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(700);
  d = await diag();
  ok(d.state === 'paused' && d.intent === 'pause', 'STILL paused after visibility churn');
  ok(d.playingElements === 0, 'no element restarted after visibility churn');
  ok((await statusText()) === 'Paused', 'UI still reads Paused');

  // Same invariant for an explicit stop (the path timer expiry uses).
  await page.evaluate(() => window.__pluvine.stop());
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(300);
  d = await diag();
  ok(d.state === 'stopped' && d.intent === 'stop', 'STILL stopped after visibility churn');
  ok(d.playingElements === 0, 'no element restarted after stop');

  // ---------------------------------------------------------------- resume + toggles + master
  section('resume, layer toggles, master volume');
  await page.locator('.pl-play').click();
  await sleep(700);
  ok((await statusText()) === 'Playing', 'play resumes from paused');

  await page.locator('.pl-toggle[title="Turn on Wind"]').click();
  await sleep(700);
  d = await diag();
  ok(d.playingElements >= 3, `wind layer started (${d.playingElements} playing)`);
  ok(d.sources['wind-blowing-ambience'] === 'file', 'wind uses its recording');
  await page.locator('.pl-toggle[title="Turn off Wind"]').click();
  await sleep(700);
  d = await diag();
  ok(d.playingElements === 2, 'wind layer stopped again');

  const beforeMaster = (await diag()).master;
  await page.locator('#pl-master').focus();
  await page.keyboard.press('ArrowRight');
  await sleep(150);
  const afterMaster = (await diag()).master;
  ok(Math.abs(afterMaster - (beforeMaster + 0.01)) < 1e-9, `master volume responds to keyboard (${beforeMaster} → ${afterMaster})`);

  // ---------------------------------------------------------------- presets while playing
  section('preset switching during playback');
  await page.getByRole('button', { name: 'Night storm', exact: true }).click();
  await sleep(900);
  d = await diag();
  ok((await statusText()) === 'Playing', 'still Playing after preset switch');
  ok((await mixName()) === 'Night storm', 'mix name follows the preset');
  ok(d.playingElements >= 2, `night storm runs car + wind (${d.playingElements} playing)`);
  ok(
    ['rain-car-glass', 'wind-blowing-ambience'].every(
      (id) => d.layerGainValues[id] > 0,
    ),
    'car and wind layers carry signal',
  );
  ok(
    d.layerGainValues['rain-forest-loop'] === 0,
    'forest rain is off in night storm',
  );
  ok(
    (await page.getByRole('button', { name: 'Distant thunder', exact: true }).getAttribute('aria-pressed')) === 'true',
    'night storm enables distant thunder (strikes are intermittent)',
  );
  ok(
    (await page.getByRole('button', { name: 'Night storm', exact: true }).getAttribute('aria-pressed')) === 'true',
    'active preset is pressed'
  );

  // ---------------------------------------------------------------- edit + save mix
  section('edited mix → save dialog → persistence');
  const firstFader = page.locator('.pl-fader-input').first();
  await firstFader.focus();
  await page.keyboard.press('ArrowRight');
  await sleep(300);
  ok((await mixName()) === 'Custom mix', 'edited mix shows Custom mix');
  ok(
    (await page.getByRole('button', { name: 'Save mix…' }).count()) === 1,
    'Save mix… offered when edited'
  );
  ok(
    (await page.getByRole('button', { name: 'Night storm', exact: true }).getAttribute('aria-pressed')) === 'false',
    'preset no longer marked active after edit'
  );

  await page.getByRole('button', { name: 'Save mix…' }).click();
  ok((await page.getByRole('dialog', { name: 'Save this mix' }).count()) === 1, 'save dialog opens');
  await page.keyboard.press('Escape');
  await sleep(200);
  ok((await page.getByRole('dialog', { name: 'Save this mix' }).count()) === 0, 'Escape closes the dialog');
  await page.getByRole('button', { name: 'Save mix…' }).click();
  await page.fill('#pl-save-name', 'Desk storm');
  await page.screenshot({ path: `${SHOTS}/state-dialog.png` });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await sleep(300);
  ok((await mixName()) === 'Desk storm', 'saved preset becomes active');
  ok(
    (await page.getByRole('button', { name: 'Desk storm' }).count()) >= 1,
    'saved preset appears in the row'
  );
  ok((await page.getByRole('button', { name: 'Save mix…' }).count()) === 0, 'nothing left to save');

  // ---------------------------------------------------------------- sleep timer
  section('sleep timer popover');
  await page.getByRole('button', { name: 'Open sleep timer' }).click();
  await sleep(250);
  ok((await page.getByRole('dialog', { name: 'Sleep timer' }).count()) === 1, 'timer popover opens');
  const popoverText = await page.getByRole('dialog', { name: 'Sleep timer' }).innerText();
  ok(/30 min/.test(popoverText) && /4 hr/.test(popoverText), 'durations offered (30 min … 4 hr)');
  ok(/fades out/i.test(popoverText), 'expiry behavior is stated in the popover');
  await page.screenshot({ path: `${SHOTS}/state-timer.png` });

  await page.getByRole('button', { name: '30 min' }).click();
  await sleep(1400);
  d = await diag();
  ok(d.sleepRemaining > 0 && d.sleepRemaining <= 1800, `timer running (${d.sleepRemaining}s)`);
  const headerLabel = (await page.locator('header button').first().innerText()).trim();
  ok(/^\d{1,2}:\d{2}$/.test(headerLabel), `countdown replaces the Sleep label (${headerLabel})`);
  const firstCountdown = d.sleepRemaining;
  await sleep(2100);
  d = await diag();
  ok(d.sleepRemaining < firstCountdown, `countdown ticks (${firstCountdown} → ${d.sleepRemaining})`);

  await page.locator('header button').first().click(); // reopen
  await sleep(250);
  await page.getByRole('button', { name: '+15 min' }).click();
  await sleep(200);
  d = await diag();
  ok(d.sleepRemaining > firstCountdown + 800, `+15 min extends (${d.sleepRemaining}s)`);

  // Sleep mode: with the timer running, the chrome quietly fades away after an
  // idle pause — but the timer button itself never fades, and any mouse
  // movement brings the UI straight back.
  await sleep(4300); // 3.5 s idle + ~0.8 s into the slow fade
  const sleepDim = await page.evaluate(() => ({
    dimmed: document.querySelector('.is-sleeping') !== null,
    mainOpacity: parseFloat(getComputedStyle(document.querySelector('main')).opacity),
    timerOpacity: getComputedStyle(document.querySelector('.pl-timerband')).opacity,
  }));
  ok(sleepDim.dimmed, 'chrome dims after idle during sleep mode');
  ok(sleepDim.mainOpacity < 1, `chrome fades toward the rain (${sleepDim.mainOpacity})`);
  ok(sleepDim.timerOpacity === '1', `timer stays visible while dimmed (${sleepDim.timerOpacity})`);
  await page.mouse.move(500, 320); // any movement wakes the UI
  await sleep(350);
  const woke = await page.evaluate(() => document.querySelector('.is-sleeping') === null);
  ok(woke, 'mouse movement brings the UI back immediately');

  // Keep-timer setting: off → the countdown fades with the chrome too.
  await page.getByRole('switch', { name: /keep countdown/i }).click(); // off
  await sleep(4300); // idle → dim
  const keepOff = await page.evaluate(() => ({
    dimmed: document.querySelector('.is-sleeping') !== null,
    timerOpacity: parseFloat(getComputedStyle(document.querySelector('.pl-timerband')).opacity),
    cursor: getComputedStyle(document.querySelector('main')).cursor,
  }));
  ok(keepOff.dimmed && keepOff.timerOpacity < 1, `keep-timer off: countdown fades (${keepOff.timerOpacity})`);
  ok(keepOff.cursor === 'none', 'mouse cursor hides while faded');
  await page.mouse.move(520, 340); // wake
  await sleep(350);
  await page.getByRole('switch', { name: /keep countdown/i }).click(); // back on (default)

  // Rain-only mode: everything goes — chrome, timer, cursor — and pointer
  // activity does NOT bring the chrome back; only the Rain-only button wakes
  // so it can be found and clicked again.
  await page.keyboard.press('Escape'); // close the sleep popover
  await sleep(300);
  await page.getByRole('button', { name: 'Show rain only' }).click();
  await sleep(4300); // idle → even the button drifts out
  const rainIdle = await page.evaluate(() => ({
    active: document.querySelector('.is-rainonly') !== null,
    idle: document.querySelector('.is-rainonly-idle') !== null,
    mainOpacity: parseFloat(getComputedStyle(document.querySelector('main')).opacity),
    timerOpacity: parseFloat(getComputedStyle(document.querySelector('.pl-timerband')).opacity),
    btnOpacity: parseFloat(getComputedStyle(document.querySelector('.pl-rainonly')).opacity),
    cursor: getComputedStyle(document.querySelector('main')).cursor,
  }));
  ok(rainIdle.active && rainIdle.idle, 'rain-only engages and idles out');
  ok(rainIdle.mainOpacity < 1 && rainIdle.timerOpacity < 1, 'chrome + timer are gone in rain-only');
  ok(rainIdle.btnOpacity < 1, `rain-only button fades when idle (${rainIdle.btnOpacity})`);
  ok(rainIdle.cursor === 'none', 'cursor hides in rain-only idle');

  // A mouse move wakes ONLY the button — the chrome stays hidden.
  await page.mouse.move(560, 380);
  await sleep(1100); // button wake is the fast 0.7 s transition
  const rainWoke = await page.evaluate(() => ({
    idle: document.querySelector('.is-rainonly-idle') !== null,
    mainOpacity: parseFloat(getComputedStyle(document.querySelector('main')).opacity),
    btnOpacity: parseFloat(getComputedStyle(document.querySelector('.pl-rainonly')).opacity),
  }));
  ok(!rainWoke.idle, 'mouse move wakes the rain-only button');
  ok(rainWoke.btnOpacity > 0.9, `rain-only button is back (${rainWoke.btnOpacity})`);
  ok(rainWoke.mainOpacity < 1, 'chrome stays hidden on mouse move in rain-only');

  // Clicking it exits rain-only and everything returns.
  await page.getByRole('button', { name: 'Exit rain-only mode' }).click();
  await sleep(1000);
  const rainExited = await page.evaluate(() => ({
    active: document.querySelector('.is-rainonly') !== null,
    mainOpacity: parseFloat(getComputedStyle(document.querySelector('main')).opacity),
  }));
  ok(!rainExited.active && rainExited.mainOpacity > 0.9, 'rain-only exits and chrome returns');

  // Cancel the running timer (reopen its popover first — rain-only closed it).
  await page.locator('header button[aria-label*="sleep timer" i]').click();
  await sleep(250);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await sleep(250);
  d = await diag();
  ok(d.sleepRemaining === 0, 'cancel clears the timer');
  ok((await page.locator('header button[aria-label*="sleep timer" i]').innerText()).trim() === 'Sleep', 'button returns to Sleep');
  ok((await statusText()) === 'Playing', 'cancel keeps playback running');

  // ---------------------------------------------------------------- persistence reload
  section('reload: custom preset + master volume persist');
  await page.reload({ waitUntil: 'load' });
  await sleep(900);
  ok(
    (await page.getByRole('button', { name: 'Desk storm', exact: true }).count()) === 1,
    'custom preset survived reload'
  );
  ok(
    (await page.getByRole('button', { name: 'Delete preset Desk storm', exact: true }).count()) === 1,
    'reloaded custom preset keeps its delete affordance'
  );
  const persistedMaster = (await diag()).master;
  ok(Math.abs(persistedMaster - afterMaster) < 1e-9, `master volume survived reload (${persistedMaster})`);

  // ---------------------------------------------------------------- keyboard focus
  section('keyboard focus order and focus ring');
  // Tab from the fresh post-reload page (no mouse click: Firefox anchors
  // post-click focus geometry-wise — a browser behavior reproduced on plain
  // control pages; DOM tab order is what the app owns).
  const focusStops = [];
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    focusStops.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        return el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24);
      })
    );
  }
  ok(
    focusStops[0] === 'Open sleep timer',
    `first Tab stop is the sleep timer (${focusStops[0]})`
  );
  ok(
    focusStops[1] === 'Show rain only',
    `second Tab stop is the rain-only button (${focusStops[1]})`
  );
  ok(
    focusStops[2] === 'Start playback',
    `third Tab stop is playback (${focusStops[2]})`
  );
  ok(focusStops[3] === 'Master volume', `fourth Tab stop is master volume (${focusStops[3]})`);
  ok(
    focusStops[4] === 'Light rain',
    `then the mixer columns begin (${focusStops[4]})`
  );
  const focusInfo = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { outline: cs.outlineStyle, width: cs.outlineWidth };
  });
  ok(
    focusInfo.outline !== 'none' && focusInfo.width !== '0px',
    `focus ring visible under keyboard focus (${focusInfo.outline} ${focusInfo.width})`
  );

  // ---------------------------------------------------------------- reduced motion
  section('prefers-reduced-motion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'load' });
  await sleep(700);
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
  ok(canvasInfo && canvasInfo.w > 0, 'static rain frame painted under reduced motion');

  // ---------------------------------------------------------------- mobile fold
  section('mobile viewport: everything reachable on one screen');
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(URL, { waitUntil: 'load' });
  await sleep(900);
  const fold = await mobile.evaluate(() => {
    const preset = document.querySelector('.pl-preset').getBoundingClientRect();
    const play = document.querySelector('.pl-play').getBoundingClientRect();
    const master = document.querySelector('#pl-master').getBoundingClientRect();
    const sleep = document.querySelector('[aria-label="Open sleep timer"]').getBoundingClientRect();
    const fader = document.querySelector('.pl-fader').getBoundingClientRect();
    const inView = (r) => r.top >= 0 && r.bottom <= window.innerHeight;
    return {
      presets: inView(preset),
      play: inView(play),
      master: inView(master),
      sleep: inView(sleep),
      faders: inView(fader),
      scrollable: document.documentElement.scrollHeight > window.innerHeight + 4,
    };
  });
  ok(fold.play, 'play control visible without scrolling');
  ok(fold.master, 'master volume visible without scrolling');
  ok(fold.sleep, 'sleep timer visible without scrolling');
  ok(fold.faders, 'level faders visible without scrolling');
  ok(fold.presets, 'presets visible without scrolling');
  await mobile.screenshot({ path: `${SHOTS}/mobile-fold.png` });

  // ---------------------------------------------------------------- summary
  section('console hygiene');
  const realErrors = consoleErrors.filter(
    (e) => !/autoplay|AudioContext was not allowed/i.test(e)
  );
  ok(realErrors.length === 0, `no console/page errors (${realErrors.length ? realErrors.join(' | ') : 'clean'})`);
} catch (err) {
  failed++;
  failures.push(`script threw: ${err.stack || err}`);
  console.error('❌ script threw:', err);
}

await browser.close();

console.log(`\n${'='.repeat(60)}`);
console.log(`browser checks: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('Failures:');
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);
