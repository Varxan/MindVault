'use strict';

const { app, BrowserWindow, shell, Menu, dialog, ipcMain, Notification } = require('electron');
const { fork, execSync, spawn } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');

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

// Make a simple HTTPS POST to Supabase REST API (no npm module needed here)
function supabaseRequest(method, table, body, matchParams) {
  return new Promise((resolve, reject) => {
    const supabaseUrl = process.env.SUPABASE_URL || loadEnvVar('SUPABASE_URL');
    const supabaseKey = process.env.SUPABASE_KEY || loadEnvVar('SUPABASE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      return reject(new Error('Supabase credentials not found'));
    }

    let urlPath = `/rest/v1/${table}`;
    if (matchParams) urlPath += `?${matchParams}`;

    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: new URL(supabaseUrl).hostname,
      port: 443,
      path: urlPath,
      method,
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (_) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// Read a single env var from the backend .env file (fallback when not in process.env)
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

  // Start 30-day trial
  ipcMain.handle('activation:startTrial', async (_, email) => {
    try {
      const crypto = require('crypto');
      const deviceId = crypto.randomUUID();

      // Register in Supabase (upsert by email — reinstall won't reset trial)
      const existing = await supabaseRequest('GET', 'users', {}, `email=eq.${encodeURIComponent(email)}&select=*`);
      let trialStartedAt;

      if (existing.status === 200 && Array.isArray(existing.data) && existing.data.length > 0) {
        // User already exists — keep original trial date, update device_id
        trialStartedAt = existing.data[0].trial_started_at;
        await supabaseRequest('PATCH', 'users', { device_id: deviceId }, `email=eq.${encodeURIComponent(email)}`);
        log(`[Activation] Existing user found, trial started ${trialStartedAt}`);
      } else {
        // New user
        trialStartedAt = new Date().toISOString();
        await supabaseRequest('POST', 'users', {
          email,
          device_id: deviceId,
          trial_started_at: trialStartedAt,
          is_licensed: false,
        });
        log(`[Activation] New trial started for ${email}`);
      }

      // Save locally
      saveUserConfig({
        email,
        deviceId,
        trialStartedAt,
        isLicensed: false,
      });

      return { success: true };
    } catch (err) {
      log('[Activation] startTrial error: ' + err.message);
      return { success: false, error: 'Connection error. Please check your internet connection.' };
    }
  });

  // Activate with license key (new user or from license screen)
  ipcMain.handle('activation:activateLicense', async (_, email, key) => {
    return activateLicenseKey(email, key);
  });

  // Activate with license key (expired trial — email already stored)
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
    // Check if key exists and has activations remaining
    const res = await supabaseRequest('GET', 'licenses', {}, `key=eq.${encodeURIComponent(key)}&select=*`);
    if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) {
      return { success: false, error: 'License key not found.' };
    }
    const license = res.data[0];
    if (license.activation_count >= license.max_activations) {
      return { success: false, error: `Maximum activations (${license.max_activations}) reached.` };
    }

    // Increment activation count
    await supabaseRequest('PATCH', 'licenses', {
      activation_count: license.activation_count + 1,
    }, `key=eq.${encodeURIComponent(key)}`);

    // Update user in Supabase
    const crypto   = require('crypto');
    const config   = loadUserConfig();
    const deviceId = config?.deviceId || crypto.randomUUID();

    const existingUser = await supabaseRequest('GET', 'users', {}, `email=eq.${encodeURIComponent(email)}&select=*`);
    if (existingUser.status === 200 && Array.isArray(existingUser.data) && existingUser.data.length > 0) {
      await supabaseRequest('PATCH', 'users', {
        license_key:   key,
        is_licensed:   true,
        activated_at:  new Date().toISOString(),
        device_id:     deviceId,
      }, `email=eq.${encodeURIComponent(email)}`);
    } else {
      await supabaseRequest('POST', 'users', {
        email,
        license_key:       key,
        device_id:         deviceId,
        trial_started_at:  new Date().toISOString(),
        is_licensed:       true,
        activated_at:      new Date().toISOString(),
      });
    }

    // Save locally
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
  // Always use userData — same DB in dev and production, no more split data
  DATA_PATH = path.join(app.getPath('userData'), 'data');

  initLog();
  log(`[Electron] Starting MindVault (${isDev ? 'dev' : 'production'})…`);
  log(`[Electron] Electron version: ${process.versions.electron}`);
  log(`[Electron] Node version: ${process.versions.node}`);
  log(`[Electron] Resources path: ${isDev ? 'n/a (dev)' : process.resourcesPath}`);
  log(`[Electron] Data path: ${DATA_PATH}`);

  // Register activation IPC handlers before any window opens
  registerActivationHandlers();

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

// ── Auto-install CLIP on first launch ────────────────────────────────────────
// Runs setup-clip.sh silently in the background the first time the app
// starts without CLIP installed. User sees a macOS notification.

function isClipInstalled() {
  const candidates = [
    path.join(os.homedir(), 'Library', 'Application Support', 'MindVault', 'clip-env', 'bin', 'python3'),
    path.join(os.homedir(), 'Library', 'Application Support', 'mindvault', 'clip-env', 'bin', 'python3'),
  ];
  return candidates.some(p => fs.existsSync(p));
}

function runClipSetupIfNeeded() {
  if (isClipInstalled()) return; // already installed — nothing to do

  const setupScript = isDev
    ? path.join(__dirname, '..', 'backend', 'scripts', 'setup-clip.sh')
    : path.join(process.resourcesPath, 'backend', 'scripts', 'setup-clip.sh');

  if (!fs.existsSync(setupScript)) {
    log('[CLIP Setup] setup-clip.sh not found — skipping auto-install');
    return;
  }

  log('[CLIP Setup] CLIP not installed — running setup-clip.sh in background…');

  // Show macOS notification: setup is starting
  if (Notification.isSupported()) {
    new Notification({
      title: 'MindVault — AI Engine',
      body: 'Installing AI engine for the first time. This takes a few minutes…',
      silent: true,
    }).show();
  }

  const proc = spawn('bash', [setupScript], {
    env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}` },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  proc.stdout?.on('data', d => log('[CLIP Setup] ' + d.toString().trim()));
  proc.stderr?.on('data', d => log('[CLIP Setup ERR] ' + d.toString().trim()));

  proc.on('close', (code) => {
    if (code === 0) {
      log('[CLIP Setup] ✅ CLIP installed successfully.');
      if (Notification.isSupported()) {
        new Notification({
          title: 'MindVault — AI Engine Ready',
          body: 'AI engine installed. New links will now be analysed with CLIP.',
          silent: false,
        }).show();
      }
    } else {
      log(`[CLIP Setup] ❌ setup-clip.sh exited with code ${code}`);
      if (Notification.isSupported()) {
        new Notification({
          title: 'MindVault — AI Setup Failed',
          body: 'Could not install AI engine. Open Terminal and run: bash backend/scripts/setup-clip.sh',
          silent: false,
        }).show();
      }
    }
  });

  proc.on('error', (err) => {
    log(`[CLIP Setup] ❌ Failed to start setup: ${err.message}`);
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
