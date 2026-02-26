require('dotenv').config();

const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { createBot } = require('./bot');
const { runAutoBackup } = require('./backup');
const supabasePoller = require('./supabase-poller');

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

// Start Express server — bind to 0.0.0.0 for local network access
app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const localIP = Object.values(os.networkInterfaces())
    .flat()
    .find(i => i.family === 'IPv4' && !i.internal)?.address || 'localhost';
  console.log(`\n🧠 MindVault Backend running on http://localhost:${PORT}`);
  console.log(`📡 Local network access: http://${localIP}:${PORT}`);
  console.log(`🔗 Share endpoint: POST http://${localIP}:${PORT}/api/share\n`);

  // Auto-backup on startup (non-blocking)
  setImmediate(() => runAutoBackup());

  // Start Supabase share-queue poller (only if env vars are set)
  supabasePoller.init();
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
