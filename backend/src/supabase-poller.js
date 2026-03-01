/**
 * Supabase Share Queue Poller
 *
 * Polls the Vercel API every 10 seconds to fetch unprocessed share_queue items.
 * Uses /api/share-queue (server-side, service role key) so no Supabase key
 * is needed on the desktop — RLS is bypassed server-side.
 *
 * A row is ready to import when:
 *   - tags_ready = true  (user submitted or skipped the tag step), OR
 *   - created_at is older than TAG_TIMEOUT_MS (user never interacted — use AI tags)
 *
 * Requires env vars:
 *   VERCEL_URL  — e.g. https://mind-vault-chi.vercel.app
 *                 (falls back to SUPABASE_URL-based detection or hardcoded default)
 */

const POLL_INTERVAL_MS = 10_000;   // 10 seconds
const TAG_TIMEOUT_MS   = 120_000;  // 2 minutes — import even if user never added tags
const BACKEND_URL      = process.env.BACKEND_URL || 'http://localhost:3001';

// Vercel deployment URL — where /api/share-queue lives
const VERCEL_URL = process.env.VERCEL_URL || 'https://mind-vault-chi.vercel.app';

let pollTimer = null;
let deviceId  = null;  // UUID that isolates this user's data

function getDeviceId() {
  if (process.env.MINDVAULT_DEVICE_ID) return process.env.MINDVAULT_DEVICE_ID;
  try {
    const fs         = require('fs');
    const path       = require('path');
    const dataDir    = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
    const configPath = path.join(dataDir, '..', 'user.json');
    const config     = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.deviceId || null;
  } catch (_) {
    return null;
  }
}

function init() {
  deviceId = getDeviceId();

  if (deviceId) {
    console.log(`📡 Supabase poller started — device: ${deviceId.slice(0,8)}… → ${VERCEL_URL}`);
  } else {
    console.log(`📡 Supabase poller started — no device ID → ${VERCEL_URL}`);
  }

  poll(); // immediate first check
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

function stop() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function poll() {
  try {
    // Build URL — filter by device_id if available
    const url = deviceId
      ? `${VERCEL_URL}/api/share-queue?device_id=${encodeURIComponent(deviceId)}`
      : `${VERCEL_URL}/api/share-queue`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`⚠️  Share queue fetch failed: ${res.status}`);
      return;
    }

    const { items } = await res.json();
    if (!items || items.length === 0) return;

    const cutoff = Date.now() - TAG_TIMEOUT_MS;

    // Only import rows that are ready:
    // - user clicked "Add" or "Skip" (tags_ready = true), OR
    // - row is older than 2 minutes (timeout, import with AI tags)
    const ready = items.filter(entry =>
      entry.tags_ready === true ||
      new Date(entry.created_at).getTime() < cutoff
    );

    if (ready.length === 0) return;

    console.log(`📥 ${ready.length} shared link(s) ready to import…`);

    for (const entry of ready) {
      await importEntry(entry);
    }

  } catch (err) {
    console.warn('⚠️  Supabase poller exception:', err.message);
  }
}

async function importEntry(entry) {
  try {
    console.log(`🔄 Importing: ${entry.url}`);

    // Parse user-supplied tags (comma-separated string → array)
    const userTags = entry.tags
      ? entry.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
      : [];

    const body = { url: entry.url };

    // Pass space through (eye | mind), default to eye for old rows without space
    if (entry.space && ['eye', 'mind'].includes(entry.space)) {
      body.space = entry.space;
    }

    // If user added tags, pass them — this skips AI auto-tagging
    if (userTags.length > 0) {
      body.tags = userTags;
      console.log(`🏷️  Using user tags: ${userTags.join(', ')}`);
    }
    // Otherwise omit tags → backend will run AI auto-tagging

    const res = await fetch(`${BACKEND_URL}/api/links`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${res.status} ${errText}`);
    }

    const result = await res.json();
    console.log(`✅ Imported [${result.id}]: ${result.title}`);

    // Mark as processed via Vercel API
    await fetch(`${VERCEL_URL}/api/share-queue`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: entry.id, processed: true }),
    });

    // Sync library so new link appears in PWA immediately
    try {
      const librarySync = require('./library-sync');
      await librarySync.sync();
    } catch (e) {
      console.log('⚠️  Library sync after import failed:', e.message);
    }

  } catch (err) {
    console.error(`❌ Failed to import ${entry.url}:`, err.message);
    // Don't mark as processed — will retry on next poll
  }
}

module.exports = { init, stop };
