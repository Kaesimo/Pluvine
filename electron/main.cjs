'use strict';
/**
 * Pluvine — Electron main process.
 *
 * This file runs in Node.js (the "main" process), NOT in the page. It owns
 * two things:
 *
 *   1. A dependency-free static file server that serves the built web app
 *      (dist/) from a loopback-only origin, and
 *   2. The BrowserWindow that loads it.
 *
 * Why serve over http://127.0.0.1 instead of opening dist/index.html as a
 * file:// URL?
 *
 *   Web Audio silences media whose origin doesn't match the page: audio that
 *   crosses an origin boundary on its way into createMediaElementSource() is
 *   intentionally muted by Chromium's security rules. A file:// page loading
 *   file:// media is treated as an origin mismatch, which would mute all nine
 *   rain layers. Serving page + sounds from ONE loopback origin keeps them
 *   same-origin — the exact model the browser verification already proved —
 *   so no CORS and no silence trap. It also keeps every absolute path
 *   (/sounds/...) working unchanged.
 *
 * Written with only Node built-ins on purpose: the packaged app then needs
 * no node_modules at all, which lets the Arch package depend on the system
 * electron binary instead of bundling 100+ MB of copies.
 */
const { app, BrowserWindow, Menu, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

/** Extension → Content-Type. Media types matter: wrong types break playback. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

/**
 * Map a URL path to a file inside root, or null.
 * Blocks path traversal: after normalization the result must stay in root.
 */
function resolveFile(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded.includes('\0')) return null;
  const candidate = path.normalize(path.join(root, decoded));
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
  let stat;
  try {
    stat = fs.statSync(candidate);
  } catch {
    return null;
  }
  if (stat.isDirectory()) {
    const index = path.join(candidate, 'index.html');
    try {
      return { file: index, stat: fs.statSync(index) };
    } catch {
      return null;
    }
  }
  return { file: candidate, stat };
}

/** Cache only content-hashed files; never cache HTML or recordings. */
function cacheHeader(file) {
  // Vite emits content-hashed filenames under dist/assets/ — safe to cache forever.
  if (file.includes(`${path.sep}assets${path.sep}`)) {
    return 'public, max-age=31536000, immutable';
  }
  // App shell + recordings: always revalidate (they live on disk anyway).
  return 'no-cache';
}

/**
 * Stream a file with HTTP Range support (RFC 7233).
 * Media elements issue Range requests for seeking and some loop behaviours;
 * a server that answers only 200 can make playback subtly unreliable.
 */
function sendFile(req, res, file, stat, urlPath) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const base = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheHeader(file),
  };

  const range = typeof req.headers.range === 'string' ? req.headers.range.trim() : '';
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m && (m[1] !== '' || m[2] !== '')) {
    let start;
    let end;
    if (m[1] === '') {
      // Suffix range: bytes=-500 → last 500 bytes
      const suffix = Number(m[2]);
      start = Math.max(0, stat.size - suffix);
      end = stat.size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === '' ? stat.size - 1 : Math.min(Number(m[2]), stat.size - 1);
    }
    if (start > end || start >= stat.size) {
      res.writeHead(416, { ...base, 'Content-Range': `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      ...base,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file, { start, end })
      .on('error', () => res.destroy())
      .pipe(res);
    return;
  }

  res.writeHead(200, { ...base, 'Content-Length': stat.size });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
}

function handleRequest(root, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const urlPath = (req.url || '/').split('?')[0];
  let found = resolveFile(root, urlPath);
  // SPA fallback: extension-less unknown routes render the app shell.
  // Missing real assets (has an extension) stay honest 404s.
  if (!found && !path.extname(urlPath)) {
    found = resolveFile(root, '/index.html');
  }
  if (!found) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  sendFile(req, res, found.file, found.stat, urlPath);
}

/** Loopback-only server on an OS-assigned port (listen(0) → no conflicts). */
function startServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        handleRequest(root, req, res);
      } catch (err) {
        console.error('[pluvine] request failed:', err);
        if (!res.headersSent) res.writeHead(500);
        res.end('Internal error');
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function createWindow(appUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#06090c', // never flash white before the dark UI paints
    show: false, // reveal only once the first frame is ready
    webPreferences: {
      // The renderer is a plain web app; it gets no Node access, no preload
      // bridge, and a sandboxed context. Least privilege by default.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  void win.loadURL(appUrl);
  // The app has no external UI, but if a link ever appears, open the system
  // browser instead of navigating this window away from the instrument.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}

function installShortcuts(win) {
  // No menu bar: this is an instrument, not a document editor — no permanent
  // "Pluvine · Edit · View · Window" strip over the rain. The handful of
  // accelerators that menu carried are wired directly instead. (Copy/paste
  // inside the save dialog needs no menu: Chromium handles those natively in
  // editable fields, exactly as it does on a normal browser page.)
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key.toLowerCase();
    if (key === 'f5' || (ctrl && key === 'r' && !input.shift)) {
      win.webContents.reload();
      event.preventDefault();
    } else if (ctrl && input.shift && key === 'r') {
      win.webContents.reloadIgnoringCache();
      event.preventDefault();
    } else if (ctrl && (key === '+' || key === '=')) {
      win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
      event.preventDefault();
    } else if (ctrl && key === '-') {
      win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
      event.preventDefault();
    } else if (ctrl && key === '0') {
      win.webContents.setZoomLevel(0);
      event.preventDefault();
    } else if ((ctrl && input.shift && key === 'i') || key === 'f12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    } else if (ctrl && key === 'q') {
      app.quit();
      event.preventDefault();
    } else if (ctrl && key === 'w') {
      win.close();
      event.preventDefault();
    }
  });
}

let server = null;
let win = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(
    async () => {
      let appUrl = process.env.PLUVINE_URL; // dev override: point at vite dev server
      if (appUrl) {
        console.log(`[pluvine] loading dev url ${appUrl}`);
      } else {
        // Resolve dist/ relative to THIS file: electron/main.cjs → ../dist.
        // Correct unpackaged (project root), packaged (inside app.asar —
        // Electron's patched fs reads through it transparently), and however
        // the binary is invoked. (app.getAppPath() would be wrong here: it
        // returns the entry script's folder — electron/ — when launched as
        // `electron electron/main.cjs`.)
        const root = path.join(__dirname, '..', 'dist');
        if (!fs.existsSync(path.join(root, 'index.html'))) {
          console.error(`[pluvine] no build found at ${root} — run "npm run build" first`);
          app.exit(1);
          return;
        }
        server = await startServer(root);
        const { port } = server.address();
        appUrl = `http://127.0.0.1:${port}/`;
        console.log(`[pluvine] serving ${root} on ${appUrl}`);
      }
      win = createWindow(appUrl);
      installShortcuts(win);
    },
    (err) => {
      console.error('[pluvine] startup failed:', err);
      app.exit(1);
    },
  );

  app.on('window-all-closed', () => {
    // Linux/Windows convention: last window closed → quit. (Not macOS.)
    if (server) server.close();
    app.quit();
  });
}
