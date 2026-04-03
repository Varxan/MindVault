'use strict';

const { app, BrowserWindow, shell, Menu, dialog, ipcMain, Notification, session: electronSession } = require('electron');
const { fork, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');

// ── Sentry (Main Process) ─────────────────────────────────────────────────────
// Lightweight error reporting using built-in https — no extra npm package needed.
// Reads SENTRY_DSN from backend/.env at runtime. Silently skipped in dev mode
// or when DSN is not configured.

function parseSentryDsn(dsn) {
  try {
    const url = new URL(dsn);
    return { publicKey: url.username, projectId: url.pathname.replace('/', '') };
  } catch (_) { return null; }
}

function sentryReport(error, extra = {}) {
  const dsn = loadEnvVar('SENTRY_DSN');
  if (!dsn || isDev) return;
  const parsed = parseSentryDsn(dsn);
  if (!parsed) return;

  try {
    const { randomUUID } = require('crypto');
    const frames = (error.stack || '').split('\n').slice(1).map(line => {
      const m = line.trim().match(/at (.+) \((.+):(\d+):(\d+)\)/) ||
                line.trim().match(/at (.+):(\d+):(\d+)/);
      if (!m) return null;
      return { function: m[1], filename: m[2] || m[1], lineno: parseInt(m[3] || m[2]) };
    }).filter(Boolean).reverse();

    const body = JSON.stringify({
      event_id:    randomUUID().replace(/-/g, ''),
      timestamp:   new Date().toISOString(),
      platform:    'node',
      level:       'error',
      release:     `mindvault@${app.getVersion?.() || '1.0.0'}`,
      environment: 'production',
      exception:   { values: [{ type: error.name || 'Error', value: error.message, stacktrace: { frames } }] },
      extra,
    });

    const req = https.request(`https://sentry.io/api/${parsed.projectId}/store/`, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Sentry-Auth':  `Sentry sentry_version=7, sentry_client=mindvault/1.0, sentry_key=${parsed.publicKey}`,
      },
    });
    req.on('error', () => {}); // never crash from error reporting
    req.write(body);
    req.end();
    log(`[Sentry] Reported: ${error.message}`);
  } catch (_) {}
}

function initSentry() {
  const dsn = loadEnvVar('SENTRY_DSN');
  if (!dsn || isDev) return;
  process.on('uncaughtException',  (err) => { log(`[Crash] ${err.message}`); sentryReport(err, { source: 'uncaughtException' }); });
  process.on('unhandledRejection', (err) => { log(`[Crash] ${err?.message || err}`); sentryReport(err instanceof Error ? err : new Error(String(err)), { source: 'unhandledRejection' }); });
  log('[Sentry] Main process error monitoring active');
}

// ── Kill any process occupying our ports before starting servers ──────────────
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
const APP_URL       = `http://127.0.0.1:${FRONTEND_PORT}/app`;
const BACKEND_URL   = `http://127.0.0.1:${BACKEND_PORT}`;

// DATA_PATH is resolved inside app.whenReady() to guarantee app.getPath()
// returns the correct absolute path. At module level, getPath('userData')
// may return an empty string on some Electron versions before ready fires,
// which would cause the backend to use a relative 'data/' path (wrong).
let DATA_PATH = null;

// ── Child Process References ─────────────────────────────────────────────────

let backendProcess      = null;
let frontendProcess     = null;
let mainWindow          = null;
let activationWindow    = null;
let isStartingUp        = true; // prevents double-window if dock icon clicked during startup

// ── Activation / License Helpers ─────────────────────────────────────────────

const TRIAL_DAYS = 30;

function getUserConfigPath() {
  return path.join(app.getPath('userData'), 'user.json');
}

function loadUserConfig() {
  try {
    const raw = fs.readFileSync(getUserConfigPath(), 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function saveUserConfig(config) {
  const configPath = getUserConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function trialDaysRemaining(config) {
  if (!config || !config.trialStartedAt) return 0;
  const started  = new Date(config.trialStartedAt).getTime();
  const elapsed  = Date.now() - started;
  const daysUsed = Math.floor(elapsed / (1000 * 60 * 60 * 24));
  return Math.max(0, TRIAL_DAYS - daysUsed);
}

function isActivated(config) {
  return config && config.isLicensed === true;
}

// ── Activation API client ─────────────────────────────────────────────────────
// All activation calls go through our Cloudflare Worker (api.mindvault.ch).
// The Supabase service role key NEVER lives in the DMG — it is stored as a
// secret in the Worker only.

const ACTIVATION_API = 'https://api.mindvault.ch';

// Shared secret between Electron app and the Worker.
// This is NOT the Supabase key — it only gates access to our own API endpoint.
// Rotate via: update APP_SECRET constant here + `wrangler secret put APP_SECRET`
const APP_SECRET = 'mv-api-v1-2026';

function activationApiRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const url = new URL(`${ACTIVATION_API}${endpoint}`);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${APP_SECRET}`,
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 300, status: res.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ ok: false, status: res.statusCode, data: {} }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// Read a single env var from the backend .env file (used by the local backend
// server for library-sync etc. — NOT used for activation any more).
function loadEnvVar(key) {
  try {
    const envPath = isDev
      ? path.join(__dirname, '..', 'backend', '.env')
      : path.join(process.resourcesPath, 'backend', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const match   = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return match ? match[1].trim() : null;
  } catch (_) {
    return null;
  }
}

// ── Activation IPC Handlers ───────────────────────────────────────────────────

function registerActivationHandlers() {
  // Return which screen to show
  ipcMain.handle('activation:getState', () => {
    const config = loadUserConfig();
    if (!config) return { screen: 'register' };
    if (isActivated(config)) return { screen: 'none' }; // should not happen
    const remaining = trialDaysRemaining(config);
    if (remaining <= 0) {
      const started  = new Date(config.trialStartedAt).getTime();
      const daysUsed = Math.floor((Date.now() - started) / (1000 * 60 * 60 * 24));
      return { screen: 'expired', daysUsed };
    }
    return { screen: 'register' }; // still in trial
  });

  // Start 30-day trial — proxied through api.mindvault.ch Worker
  ipcMain.handle('activation:startTrial', async (_, email, password) => {
    try {
      const { randomUUID } = require('crypto');
      const deviceId = randomUUID();

      const res = await activationApiRequest('/activation/trial', { email, password, deviceId });
      if (!res.ok || !res.data?.success) {
        return { success: false, error: res.data?.error || 'Could not start trial. Please check your connection.' };
      }

      saveUserConfig({
        email,
        deviceId,
        trialStartedAt: res.data.trialStartedAt,
        isLicensed:     false,
        authUserId:     res.data.authUserId || null,
      });
      log(`[Activation] Trial started for ${email}`);
      return { success: true };
    } catch (err) {
      log('[Activation] startTrial error: ' + err.message);
      return { success: false, error: 'Connection error. Please check your internet connection.' };
    }
  });

  // Sign in (returning user / second device) — proxied through api.mindvault.ch Worker
  ipcMain.handle('activation:signIn', async (_, email, password) => {
    try {
      const { randomUUID } = require('crypto');

      const res = await activationApiRequest('/activation/signin', { email, password });
      if (!res.ok || !res.data?.success) {
        return { success: false, error: res.data?.error || 'Invalid email or password.' };
      }

      const existingConfig = loadUserConfig();
      saveUserConfig({
        email,
        deviceId:       existingConfig?.deviceId || randomUUID(),
        authUserId:     res.data.authUserId || null,
        trialStartedAt: res.data.trialStartedAt,
        isLicensed:     res.data.isLicensed === true,
        licenseKey:     res.data.licenseKey || null,
      });
      log(`[Activation] Sign in successful for ${email}`);
      return { success: true };
    } catch (err) {
      log('[Activation] signIn error: ' + err.message);
      return { success: false, error: 'Connection error. Please check your internet connection.' };
    }
  });

  // Activate with license key — proxied through api.mindvault.ch Worker
  ipcMain.handle('activation:activateLicense', async (_, email, key) => {
    return activateLicenseKey(email, key);
  });

  // Activate with license key (expired trial — email already stored locally)
  ipcMain.handle('activation:activateLicenseExpired', async (_, key) => {
    const config = loadUserConfig();
    const email  = config?.email;
    if (!email) return { success: false, error: 'Email not found. Please re-register.' };
    return activateLicenseKey(email, key);
  });

  // Launch main app after successful activation
  ipcMain.on('activation:launch', () => {
    if (activationWindow) {
      activationWindow.close();
      activationWindow = null;
    }
    launchMainApp();
  });
}

async function activateLicenseKey(email, key) {
  try {
    const { randomUUID } = require('crypto');
    const config   = loadUserConfig();
    const deviceId = config?.deviceId || randomUUID();

    const res = await activationApiRequest('/activation/activate', { email, key, deviceId });
    if (!res.ok || !res.data?.success) {
      return { success: false, error: res.data?.error || 'Invalid license key.' };
    }

    saveUserConfig({
      ...(config || {}),
      email,
      deviceId,
      licenseKey:  key,
      isLicensed:  true,
      activatedAt: new Date().toISOString(),
    });
    log(`[Activation] License activated for ${email} with key ${key}`);
    return { success: true };
  } catch (err) {
    log('[Activation] activateLicense error: ' + err.message);
    return { success: false, error: 'Connection error. Please check your internet connection.' };
  }
}

// ── Check if activation required ─────────────────────────────────────────────

function needsActivation() {
  const config = loadUserConfig();
  if (!config) return true;               // First launch
  if (isActivated(config)) return false;  // Licensed
  return trialDaysRemaining(config) <= 0; // Trial expired
}

function isFirstLaunch() {
  return !loadUserConfig();
}

// ── Show Activation Window ────────────────────────────────────────────────────

function showActivationWindow() {
  activationWindow = new BrowserWindow({
    width:           480,
    height:          580,
    resizable:       false,
    titleBarStyle:   'hiddenInset',
    vibrancy:        'under-window',
    backgroundColor: '#0e0e0e',
    title:           'MindVault',
    webPreferences: {
      preload:          path.join(__dirname, 'preload-activation.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  activationWindow.loadFile(path.join(__dirname, 'activation.html'));
  Menu.setApplicationMenu(null);

  activationWindow.on('closed', () => {
    activationWindow = null;
  });
}

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

  // Bundled binaries (ffmpeg, ffprobe, yt-dlp) ship inside the app package
  const bundledBinPath = isDev
    ? path.join(__dirname, '..', 'bin', 'mac-arm64')
    : path.join(process.resourcesPath, 'bin');

  // Extend PATH — bundled bin dir comes first so it takes priority over system installs
  const extraPaths = [
    bundledBinPath,
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
      PATH:             fullPath,
      PORT:             String(BACKEND_PORT),
      FRONTEND_URL:     FRONTEND_URL,
      DATA_PATH:        DATA_PATH,
      NODE_ENV:         'production',
      NODE_PATH:        path.join(backendRoot, 'node_modules'),
      BUNDLED_BIN_PATH: bundledBinPath,
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
            `Backend process crashed immediately (exit code ${code}).\n\n` +
            `Likely cause: native modules (better-sqlite3) were not compiled for Electron.\n` +
            `Fix: Run "npm run rebuild:native && npm run dist" in the project folder.\n\n` +
            `Log file: ${logPath}`
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

  // Load the app (at /app — root / is the public landing page)
  mainWindow.loadURL(APP_URL);

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

  // Build native macOS application menu
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'License…',
          click: () => showLicenseDialog(),
        },
        {
          label: 'Setup Wizard',
          click: () => mainWindow?.webContents.executeJavaScript(
            'window.dispatchEvent(new CustomEvent("mv:show-onboarding"));'
          ).catch(() => {}),
        },
        { type: 'separator' },
        {
          label: 'Privacy Policy',
          click: () => shell.openExternal('https://mindvault.ch/privacy'),
        },
        {
          label: 'Terms of Service',
          click: () => shell.openExternal('https://mindvault.ch/terms'),
        },
        {
          label: 'Open Source Licenses',
          click: () => shell.openExternal('https://mindvault.ch/licenses'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' }, // Copy / Paste / Undo in text fields
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Download Folder Preference ────────────────────────────────────────────────
// Persists the user's preferred download folder in userData/download-prefs.json
// Falls back to ~/Downloads if not set.

function getDownloadPrefsPath() {
  return path.join(app.getPath('userData'), 'download-prefs.json');
}

function loadDownloadFolder() {
  try {
    const raw = fs.readFileSync(getDownloadPrefsPath(), 'utf-8');
    const prefs = JSON.parse(raw);
    if (prefs.folder && fs.existsSync(prefs.folder)) return prefs.folder;
  } catch (_) {}
  return path.join(os.homedir(), 'Downloads');
}

function saveDownloadFolder(folder) {
  fs.writeFileSync(getDownloadPrefsPath(), JSON.stringify({ folder }), 'utf-8');
}

// Register IPC handlers for download folder
function registerDownloadHandlers() {
  ipcMain.handle('download:getFolder', () => loadDownloadFolder());
}

// ── Media Storage Path — folder picker IPC ───────────────────────────────────
// Called by the Settings UI when the user clicks "Choose Folder".
// Returns the selected path, or null if the user cancelled.
ipcMain.handle('settings:pickFolder', async (event, { title = 'Choose Folder' } = {}) => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title,
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Select Folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Set up the will-download handler.
// Detects Save As mode by checking for ?saveAs=1 in the download URL —
// no preload IPC needed, works regardless of preload version.
// Normal download: auto-saves directly to the configured folder (no dialog).
// Save As:  shows native macOS Save dialog, user picks location.
function setupAutoDownload(session) {
  session.on('will-download', (event, item) => {
    const downloadUrl = item.getURL();
    const isSaveAs    = downloadUrl.includes('saveAs=1');

    if (isSaveAs) {
      log(`[Download] Save As mode — showing native Save dialog`);
      // Suggest a sensible default path; user can change folder + filename
      item.setSaveDialogOptions({
        title:       'Save As',
        defaultPath: path.join(loadDownloadFolder(), item.getFilename()),
        buttonLabel: 'Save',
      });
      // Do NOT call setSavePath() — Electron shows the dialog automatically
      item.on('done', (_, state) => {
        if (state === 'completed') {
          const savedPath = item.getSavePath();
          log(`[Download] Save As completed: ${savedPath}`);
          mainWindow?.webContents.executeJavaScript(
            `window.dispatchEvent(new CustomEvent('mv:download-done', { detail: ${JSON.stringify({ path: savedPath, filename: path.basename(savedPath) })} }));`
          ).catch(() => {});
        }
      });
      return;
    }

    // Normal download: auto-save to configured folder, no dialog
    const folder   = loadDownloadFolder();
    const filename = item.getFilename();
    let finalPath  = path.join(folder, filename);
    let counter    = 1;
    const ext      = path.extname(filename);
    const base     = path.basename(filename, ext);
    while (fs.existsSync(finalPath)) {
      finalPath = path.join(folder, `${base}_${counter}${ext}`);
      counter++;
    }

    item.setSavePath(finalPath);

    item.on('done', (_, state) => {
      if (state === 'completed') {
        log(`[Download] Auto-saved: ${finalPath}`);
        mainWindow?.webContents.executeJavaScript(
          `window.dispatchEvent(new CustomEvent('mv:download-done', { detail: ${JSON.stringify({ path: finalPath, filename: path.basename(finalPath) })} }));`
        ).catch(() => {});
      }
    });
  });
}

// ── License Dialog ────────────────────────────────────────────────────────────

function showLicenseDialog() {
  const config = loadUserConfig();
  const win    = mainWindow;

  if (!config) {
    dialog.showMessageBox(win, {
      type:    'info',
      title:   'License',
      message: 'No account found.',
      detail:  'Please restart MindVault and sign in or start a trial.',
      buttons: ['OK'],
    });
    return;
  }

  if (config.isLicensed) {
    // Licensed — show status
    dialog.showMessageBox(win, {
      type:    'info',
      title:   'License',
      message: '✓ License active',
      detail:  `Registered to: ${config.email || 'unknown'}\n\nThank you for supporting MindVault.`,
      buttons: ['OK'],
    });
  } else {
    // Trial — show days remaining and offer to enter key
    const days = trialDaysRemaining(config);
    const { response } = dialog.showMessageBoxSync(win, {
      type:    'info',
      title:   'License',
      message: days > 0 ? `Trial — ${days} day${days !== 1 ? 's' : ''} remaining` : 'Trial expired',
      detail:  'Enter your license key to unlock MindVault.\nGet a license at mindvault.ch',
      buttons: ['Enter License Key', 'Buy a License', 'Cancel'],
      defaultId: 0,
      cancelId:  1,
    });
    if (response === 0) {
      mainWindow?.webContents.executeJavaScript(
        'window.dispatchEvent(new CustomEvent("mv:show-license-activation"));'
      ).catch(() => {});
    } else if (response === 1) {
      shell.openExternal('https://mind-vault.lemonsqueezy.com/checkout/buy/f07a3606-960c-4a05-9881-28586b688e99');
    }
  }
}

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Resolve DATA_PATH here — app.getPath() is guaranteed correct after ready
  // Always use userData — same DB in dev and production, no more split data
  DATA_PATH = path.join(app.getPath('userData'), 'data');

  initLog();
  initSentry();
  log(`[Electron] Starting MindVault (${isDev ? 'dev' : 'production'})…`);
  log(`[Electron] Electron version: ${process.versions.electron}`);
  log(`[Electron] Node version: ${process.versions.node}`);
  log(`[Electron] Resources path: ${isDev ? 'n/a (dev)' : process.resourcesPath}`);
  log(`[Electron] Data path: ${DATA_PATH}`);

  // Register activation IPC handlers before any window opens
  registerActivationHandlers();

  // Register download IPC handlers and hook auto-save behavior
  registerDownloadHandlers();
  setupAutoDownload(electronSession.defaultSession);

  // ── Activation check ──────────────────────────────────────────────────────
  // In dev mode, skip activation (so you can work without a license)
  if (!isDev && (isFirstLaunch() || needsActivation())) {
    log('[Electron] Activation required — showing activation window.');
    isStartingUp = false;
    showActivationWindow();
    return; // launchMainApp() will be called by IPC after successful activation
  }

  // All good — launch app normally
  await launchMainApp();
});

// ── CLIP availability check ───────────────────────────────────────────────────
// CLIP is bundled inside the app (backend/clip-env/ via build-clip-bundle.sh).
// This function just logs whether the bundled venv is present — useful for
// diagnosing a DMG that was built without running build-clip-bundle.sh first.

function runClipSetupIfNeeded() {
  const bundledPython = isDev
    ? path.join(__dirname, '..', 'backend', 'python-standalone', 'bin', 'python3')
    : path.join(process.resourcesPath, 'backend', 'python-standalone', 'bin', 'python3');

  if (fs.existsSync(bundledPython)) {
    log('[CLIP] Bundled python-standalone found — CLIP + Whisper ready.');
  } else {
    log('[CLIP] Bundled python-standalone NOT found. Was build-clip-bundle.sh run before npm run dist?');
    // Non-fatal: backend will fall back to userData clip-env or system python if available
  }
}

// ── Update Checker ────────────────────────────────────────────────────────────
// Fetches the latest GitHub Release and notifies the renderer if a newer
// version is available. Uses only Node's built-in https — no extra deps.
// Only runs in production; dev mode always skips.

const GITHUB_OWNER = 'Varxan';
const GITHUB_REPO  = 'MindVault-releases'; // public repo — source stays private

function parseVersion(v) {
  return (v || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
}

function isNewer(latest, current) {
  const [la, lb, lc] = parseVersion(latest);
  const [ca, cb, cc] = parseVersion(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

function checkForUpdates() {
  if (isDev) return; // skip in dev — version from package.json is always "old"

  const currentVersion = app.getVersion();
  log(`[Updater] Checking for updates (current: v${currentVersion})…`);

  const options = {
    hostname: 'api.github.com',
    // /releases?per_page=1 returns the most recent release including prereleases,
    // unlike /releases/latest which only returns stable (non-prerelease) releases.
    // This allows beta users to receive prerelease update notifications.
    path:     `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=1`,
    headers:  { 'User-Agent': `MindVault/${currentVersion}` },
  };

  https.get(options, (res) => {
    let raw = '';
    res.on('data', chunk => { raw += chunk; });
    res.on('end', () => {
      try {
        const releases = JSON.parse(raw);
        const release = Array.isArray(releases) ? releases[0] : null;
        if (!release) return; // no releases published yet — silent
        const latestTag = release.tag_name;
        if (!latestTag) return;
        const latestVersion = latestTag.replace(/^v/, '');

        log(`[Updater] Latest release: v${latestVersion}`);

        if (!isNewer(latestVersion, currentVersion)) {
          log('[Updater] App is up to date.');
          return;
        }

        log(`[Updater] Update available: v${latestVersion}`);

        // Dispatch into renderer via executeJavaScript (same pattern as wizard/license)
        const detail = JSON.stringify({
          version:  latestVersion,
          url:      release.html_url,
          name:     release.name || `MindVault v${latestVersion}`,
        });
        mainWindow?.webContents.executeJavaScript(
          `window.dispatchEvent(new CustomEvent('mv:update-available', { detail: ${detail} }));`
        ).catch(() => {});
      } catch (err) {
        log(`[Updater] Parse error: ${err.message}`);
      }
    });
  }).on('error', (err) => {
    log(`[Updater] Network error: ${err.message}`);
  });
}

// ── Launch main app (called after activation or directly on startup) ──────────

async function launchMainApp() {
  try {
    // Free ports first — prevents EADDRINUSE if previous instance didn't quit cleanly
    log('[Electron] Freeing ports 3000 and 3001…');
    freePort(FRONTEND_PORT);
    freePort(BACKEND_PORT);

    // Pass user's device_id to backend via env var for Supabase isolation
    // In dev mode: auto-create a user.json with a stable dev device ID if none exists
    let config = loadUserConfig();
    if (!config) {
      const crypto = require('crypto');
      config = {
        email:          'dev@mindvault.local',
        deviceId:       crypto.randomUUID(),
        trialStartedAt: new Date().toISOString(),
        isLicensed:     true,  // dev mode is always "licensed"
      };
      saveUserConfig(config);
      log(`[Electron] Dev mode: created user.json with device ID ${config.deviceId}`);
    }
    if (config.deviceId) {
      process.env.MINDVAULT_DEVICE_ID = config.deviceId;
      log(`[Electron] Device ID: ${config.deviceId.slice(0, 8)}…`);
    }

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
    runClipSetupIfNeeded(); // Auto-install CLIP on first launch if not present
    // Check for updates 6s after launch so UI is fully settled
    setTimeout(checkForUpdates, 6000);

  } catch (err) {
    log('[Electron] STARTUP FAILED: ' + err.message);

    // Show a user-friendly error dialog instead of silent crash
    dialog.showErrorBox(
      'MindVault could not start',
      err.message
    );

    app.quit();
  }
}

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
