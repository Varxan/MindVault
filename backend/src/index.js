require('dotenv').config();

const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { createBot } = require('./bot');
const { runAutoBackup } = require('./backup');
const supabasePoller = require('./supabase-poller');
const librarySync    = require('./library-sync');

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// CORS — allow Electron (localhost), local WiFi network, and configured cloud origins
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Electron / curl / no-origin
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    const isLAN = origin.match(/^https?:\/\/192\.168\./) ||
                  origin.match(/^https?:\/\/10\./) ||
                  origin.match(/^https?:\/\/172\.(1[6-9]|2\d|3[01])\./);
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    if (isLocalhost || isLAN || isAllowed) return callback(null, true);
    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Device info — used by the PWA QR section in Electron
app.get('/api/device-info', (req, res) => {
  const fs   = require('fs');
  const path = require('path');

  // Build a list of candidate paths for user.json, in priority order:
  //   1. DATA_PATH/../user.json  (production: userData/data/../user.json = userData/user.json)
  //   2. MINDVAULT_DEVICE_ID from env (dev mode: Electron sets this directly)
  const candidatePaths = [];
  if (process.env.DATA_PATH) {
    candidatePaths.push(path.join(process.env.DATA_PATH, '..', 'user.json'));
  }
  // Also try reading from the env device ID as last resort (handled in catch)

  let config = null;
  for (const p of candidatePaths) {
    try {
      config = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (config?.deviceId) break;
    } catch (_) {}
  }

  if (config?.deviceId) {
    const TRIAL_DAYS    = 30;
    const trialStarted  = new Date(config.trialStartedAt || Date.now()).getTime();
    const daysUsed      = Math.floor((Date.now() - trialStarted) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, TRIAL_DAYS - daysUsed);

    res.json({
      deviceId: config.deviceId,
      email:    config.email,
      trialInfo: {
        isLicensed:    config.isLicensed || false,
        daysRemaining,
        daysUsed,
        trialStartedAt: config.trialStartedAt,
      },
    });
  } else {
    // Fallback: Electron sets MINDVAULT_DEVICE_ID directly via env in dev mode
    const devId = process.env.MINDVAULT_DEVICE_ID || null;
    res.json({
      deviceId:  devId,
      email:     null,
      trialInfo: devId ? { isLicensed: true, daysRemaining: 30, daysUsed: 0 } : null,
    });
  }
});

// Start Express server — bind to 0.0.0.0 for local network access
app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const localIP = Object.values(os.networkInterfaces())
    .flat()
    .find(i => i.family === 'IPv4' && !i.internal)?.address || 'localhost';
  console.log(`\n🧠 MindVault Backend running on http://localhost:${PORT}`);
  console.log(`📡 Local network access: http://${localIP}:${PORT}`);
  console.log(`🔗 Share endpoint: POST http://${localIP}:${PORT}/api/share\n`);

  // One-time migration: remove deleted movement tags from custom_preferred_tags
  setImmediate(() => {
    try {
      const { getSetting, setSetting } = require('./database');
      const REMOVED_TAGS = [
        'Static / Locked Off','Handheld','Steadicam','Gimbal','Dolly',
        'Crane / Jib','Drone','Whip Pan','Push In','Pull Out',
        'Tracking (Lateral)','Circular / Orbit','Zoom','Long Take / Oner',
      ];
      const row = getSetting.get('custom_preferred_tags');
      if (row && row.value) {
        const before = row.value.split(',').map(t => t.trim()).filter(Boolean);
        const after  = before.filter(t => !REMOVED_TAGS.includes(t));
        if (after.length !== before.length) {
          setSetting.run({ key: 'custom_preferred_tags', value: after.join(',') });
          console.log(`[Migration] Removed ${before.length - after.length} movement tags from preferred tags (${after.length} remaining)`);
        }
      }
    } catch (e) {
      console.warn('[Migration] preferred-tags cleanup skipped:', e.message);
    }
  });

  // Auto-backup on startup (non-blocking)
  setImmediate(() => runAutoBackup());

  // Start Supabase share-queue poller (only if env vars are set)
  supabasePoller.init();

  // Sync library snapshot to Supabase on startup
  librarySync.init();
});

// Start Telegram Bot (DB setting takes priority over .env)
const { getSetting } = require('./database');
function getTelegramToken() {
  const dbVal = getSetting.get('telegram_bot_token');
  if (dbVal && dbVal.value && dbVal.value.length > 0) return dbVal.value;
  return process.env.TELEGRAM_BOT_TOKEN;
}

const BOT_TOKEN = getTelegramToken();

if (BOT_TOKEN && BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  const bot = createBot(BOT_TOKEN);
  bot.launch();
  console.log('🤖 Telegram Bot started!\n');

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
} else {
  console.log('⚠️  No Telegram Bot Token set.');
  console.log('   Set your token in Settings or backend/.env to start the bot.\n');
}

// Global error handlers — prevent crashes from unhandled errors in async routes
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️  Unhandled Promise Rejection:', reason);
  // Do NOT exit — keep server running
});

process.on('uncaughtException', (err) => {
  console.error('⚠️  Uncaught Exception:', err.message, err.stack);
  // Do NOT exit — keep server running
});
