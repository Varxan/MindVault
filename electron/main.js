'use strict';

const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const { fork, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Kill any process occupying our ports before starting servers
// Prevents EADDRINUSE crashes when a previous MindVault instance didn't exit cleanly
function freePort(port) {
  try {
    execSync(`lsof -ti tcp:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
  } catch (_) { /* ignore — port was already free */ }
}

// ── Environment ─────────────────────────────────────────────────────────────

const isDev = !app.isPackaged;

const BACKEND_PORT = 3001;
const FRONTEND_PORT = 3000;
const FRONTEND_URL  = `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_URL   = `http://127.0.0.1:${BACKEND_PORT}`;

// DATA_PATH is resolved inside app.whenReady() to guarantee app.getPath()
// returns the correct absolute path. At module level, getPath('userData')
// may return an empty string on some Electron versions before ready fires,
// which would cause the backend to use a relative 'data/' path (wrong).
let DATA_PATH = null;

// ── Child Process References ─────────────────────────────────────────────────

let backendProcess  = null;
let frontendProcess = null;
let mainWindow      = null;
let isStartingUp    = true; // prevents double-window if dock icon clicked during startup

// ── Logging ──────────────────────────────────────────────────────────────────

let logPath = null;

function initLog() {
  logPath = path.join(app.getPath('userData'), 'mindvault.log');
  // Keep last 500 KB, rotate if larger
  try {
    const stat = fs.statSync(logPath);
    if (stat.size > 500 * 1024) fs.writeFileSync(logPath, '');
  } catch (_) {
    // File doesn't exist yet — that's fine
  }
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  if (logPath) {
    try { fs.appendFileSync(logPath, line + '\n'); } catch (_) {}
  }
}

// ── Start Backend (Express) ──────────────────────────────────────────────────

function startBackend() {
  // Dev: backend is already started by concurrently (npm run backend:dev)
  if (isDev) return null;

  const backendScript = path.join(process.resourcesPath, 'backend', 'src', 'index.js');

  // Ensure data directory exists in production
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(DATA_PATH, { recursive: true });
  }

  const backendRoot = path.join(process.resourcesPath, 'backend');
  log(`[Electron] Backend root: ${backendRoot}`);

  // Extend PATH so the backend can find system tools (yt-dlp, ffmpeg, etc.)
  // installed via Homebrew, nvm, or the standard macOS locations.
  const extraPaths = [
    '/opt/homebrew/bin',        // Homebrew on Apple Silicon
    '/opt/homebrew/sbin',
    '/usr/local/bin',           // Homebrew on Intel / manual installs
    '/usr/local/sbin',
    '/usr/bin',
    '/usr/sbin',
    '/bin',
    '/sbin',
  ].join(':');
  const fullPath = process.env.PATH
    ? `${extraPaths}:${process.env.PATH}`
    : extraPaths;

  backendProcess = fork(backendScript, [], {
    cwd: backendRoot,  // ← backend/ root so node_modules are found
    env: {
      ...process.env,
      PATH:         fullPath,
      PORT:         String(BACKEND_PORT),
      FRONTEND_URL: FRONTEND_URL,
      DATA_PATH:    DATA_PATH,
      NODE_ENV:     'production',
      NODE_PATH:    path.join(backendRoot, 'node_modules'),
    },
    silent: true,   // ← must be true so we can capture stdout/stderr in log
  });

  backendProcess.stdout?.on('data', d => log('[Backend] ' + d.toString().trim()));
  backendProcess.stderr?.on('data', d => log('[Backend ERR] ' + d.toString().trim()));

  // Return a promise that rejects if the backend exits early (within first 10s)
  return new Promise((resolve, reject) => {
    let settled = false;
    const earlyExitTimeout = setTimeout(() => {
      settled = true;
      resolve(); // Backend survived startup window — hand off to waitForServer
    }, 10_000);

    backendProcess.on('exit', (code, signal) => {
      log(`[Backend] Process exited: code=${code} signal=${signal}`);
      if (!settled) {
        settled = true;
        clearTimeout(earlyExitTimeout);
        if (code !== 0 && code !== null) {
          reject(new Error(
            `Backend-Prozess ist sofort abgestürzt (exit code ${code}).\n\n` +
            `Mögliche Ursache: native Module (better-sqlite3) wurden nicht für Electron kompiliert.\n` +
            `Lösung: Im Projektordner "npm run rebuild:native && npm run dist" ausführen.\n\n` +
            `Log-Datei: ${logPath}`
          ));
        } else {
          resolve();
        }
      }
    });
  });
}

// ── Start Frontend (Next.js standalone) ─────────────────────────────────────

function startFrontend() {
  // Dev: Next.js dev server is already started by electron:dev script
  if (isDev) return;

  const frontendScript = path.join(
    process.resourcesPath, 'frontend-standalone', 'server.js'
  );

  frontendProcess = fork(frontendScript, [], {
    env: {
      ...process.env,
      PORT:     String(FRONTEND_PORT),
      HOSTNAME: '0.0.0.0',
      NODE_ENV: 'production',
      // Tell Next.js where its static assets are (inside extraResources)
      NEXT_SHARP_PATH: path.join(process.resourcesPath, 'frontend-standalone', 'node_modules', 'sharp'),
    },
    cwd:    path.join(process.resourcesPath, 'frontend-standalone'),
    silent: true,
  });

  frontendProcess.stdout?.on('data', d => log('[Frontend] ' + d.toString().trim()));
  frontendProcess.stderr?.on('data', d => log('[Frontend ERR] ' + d.toString().trim()));

  log(`[Electron] Frontend starting on :${FRONTEND_PORT}…`);
}

// ── Wait for HTTP server to be ready ────────────────────────────────────────

function waitForServer(url, retries = 60, delay = 1000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const attempt = () => {
      http.get(url, res => {
        if (res.statusCode < 500) {
          log(`[Electron] Server ready: ${url} (${Date.now() - startTime}ms)`);
          resolve();
        } else {
          log(`[Electron] Server returned ${res.statusCode}, retrying... (${retries} left)`);
          retry();
        }
        res.resume();
      }).on('error', (err) => {
        log(`[Electron] Waiting for ${url}: ${err.message} (${retries} retries left)`);
        retry();
      });
    };

    const retry = () => {
      if (retries-- <= 0) {
        reject(new Error(
          `MindVault server at ${url} did not respond in time.\n\n` +
          `This usually means:\n` +
          `• A previous MindVault process is still running — force quit and retry\n` +
          `• Port 3000 or 3001 is in use by another app\n` +
          `• The app needs a clean rebuild: rm -rf frontend/.next && npm run dist\n\n` +
          `Log file: ${logPath}`
        ));
      } else {
        setTimeout(attempt, delay);
      }
    };

    attempt();
  });
}

// ── Create Main Window ───────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1440,
    height:          900,
    minWidth:        900,
    minHeight:       600,
    title:           'MindVault',
    titleBarStyle:   'hiddenInset',   // macOS: native traffic lights, no title bar chrome
    vibrancy:        'under-window',  // macOS: frosted glass background
    backgroundColor: '#141414',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  // Load the app
  mainWindow.loadURL(FRONTEND_URL);

  // Inject 'is-electron' class after every page load (after React hydration)
  // This is more reliable than the inline script approach since it runs
  // after React is fully settled and won't be removed by reconciliation.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.executeJavaScript(
      'document.documentElement.classList.add("is-electron");'
    ).catch(() => {});
  });

  // Open external links in the system browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('http://localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Remove default menu bar (MindVault has its own UI)
  Menu.setApplicationMenu(null);
}

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Resolve DATA_PATH here — app.getPath() is guaranteed correct after ready
  DATA_PATH = isDev
    ? path.join(__dirname, '..', 'backend', 'data')
    : path.join(app.getPath('userData'), 'data');

  initLog();
  log(`[Electron] Starting MindVault (${isDev ? 'dev' : 'production'})…`);
  log(`[Electron] Electron version: ${process.versions.electron}`);
  log(`[Electron] Node version: ${process.versions.node}`);
  log(`[Electron] Resources path: ${isDev ? 'n/a (dev)' : process.resourcesPath}`);
  log(`[Electron] Data path: ${DATA_PATH}`);

  try {
    // Free ports first — prevents EADDRINUSE if previous instance didn't quit cleanly
    log('[Electron] Freeing ports 3000 and 3001…');
    freePort(FRONTEND_PORT);
    freePort(BACKEND_PORT);

    // Start backend and wait briefly to catch immediate crashes
    const backendReady = startBackend();
    startFrontend();

    if (backendReady) {
      // Wait for early-exit detection window (10s) OR immediate crash
      await backendReady;
    }

    // Now poll until servers respond
    const waitTargets = [waitForServer(FRONTEND_URL)];
    waitTargets.push(waitForServer(`${BACKEND_URL}/health`));

    await Promise.all(waitTargets);

    log('[Electron] All servers ready — opening window.');
    isStartingUp = false;
    createWindow();

  } catch (err) {
    log('[Electron] STARTUP FAILED: ' + err.message);

    // Show a user-friendly error dialog instead of silent crash
    dialog.showErrorBox(
      'MindVault konnte nicht starten',
      err.message
    );

    app.quit();
  }
});

// macOS: re-open window when clicking dock icon
// Guard against double-open during startup (isStartingUp) or if window exists
app.on('activate', () => {
  if (!isStartingUp && BrowserWindow.getAllWindows().length === 0 && mainWindow === null) {
    createWindow();
  }
});

// Quit when all windows closed (except macOS — stays in dock)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Graceful shutdown — kill child processes
app.on('before-quit', () => {
  log('[Electron] Shutting down…');
  if (backendProcess)  { backendProcess.kill();  backendProcess  = null; }
  if (frontendProcess) { frontendProcess.kill(); frontendProcess = null; }
});

// Prevent multiple instances of the app
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
