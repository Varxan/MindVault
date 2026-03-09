/**
 * Supabase Share Queue — Realtime Listener
 *
 * Instead of polling Vercel every 10s (8,640 requests/day per user),
 * we subscribe to Supabase Realtime: the desktop receives a push
 * notification the instant the iPhone adds a link. 0 polling = 0 Vercel load.
 *
 * Flow:
 *   iPhone  →  POST /api/share-queue (Vercel, 1 request per share)
 *           →  INSERT into Supabase share_queue
 *           →  Realtime push to desktop  ←  we listen here
 *           →  desktop imports the link
 *           →  PATCH processed=true directly to Supabase (anon key, no Vercel)
 *
 * A row is ready to import when:
 *   - tags_ready = true  (user submitted or skipped the tag step on iPhone), OR
 *   - created_at is older than TAG_TIMEOUT_MS (user never interacted — use AI tags)
 *
 * Requires env vars:
 *   SUPABASE_URL       — e.g. https://xxx.supabase.co
 *   SUPABASE_ANON_KEY  — public anon key (safe on desktop, no secrets)
 */

const { createClient } = require('@supabase/supabase-js');

const TAG_TIMEOUT_MS = 120_000;  // 2 min — import even if user never added tags
const BACKEND_URL    = process.env.BACKEND_URL || 'http://localhost:3001';
// APP_URL points to the deployed web frontend (Cloudflare Pages after migration).
// VERCEL_URL kept as fallback so existing .env files don't break.
const APP_URL = process.env.APP_URL || process.env.VERCEL_URL || 'https://mind-vault-chi.vercel.app';

let supabase      = null;  // anon key — Realtime subscription
let supabaseAdmin = null;  // service_role key — SELECT/UPDATE (bypasses RLS)
let deviceId   = null;
let channel    = null;
let pollTimer  = null;  // fallback polling interval handle
// Track per-entry timeout timers so we don't double-import
const pendingTimers = new Map();

function getDeviceId() {
  if (process.env.MINDVAULT_DEVICE_ID) return process.env.MINDVAULT_DEVICE_ID;
  try {
    const fs   = require('fs');
    const path = require('path');
    const dir  = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
    const cfg  = JSON.parse(fs.readFileSync(path.join(dir, '..', 'user.json'), 'utf8'));
    return cfg.deviceId || null;
  } catch { return null; }
}

async function init() {
  const url      = process.env.SUPABASE_URL;
  const anonKey  = process.env.SUPABASE_ANON_KEY;
  const adminKey = process.env.SUPABASE_KEY;     // service_role — bypasses RLS for SELECT

  if (!url || (!anonKey && !adminKey)) {
    console.log('ℹ️  Share queue realtime disabled (no SUPABASE_URL / keys)');
    return;
  }

  deviceId = getDeviceId();
  console.log(`📡 Supabase poller init — deviceId: ${deviceId ? deviceId.slice(0,8) + '…' : '⚠️ NOT FOUND'}`);

  // Admin client (service_role) for polling — bypasses RLS, always sees all rows
  supabaseAdmin = createClient(url, adminKey || anonKey, { auth: { persistSession: false } });

  // Anon client for Realtime subscription (WebSocket)
  supabase = createClient(url, anonKey || adminKey, { auth: { persistSession: false } });

  // ── Subscribe to INSERT + UPDATE on share_queue (all rows, filter client-side) ──
  // Note: Supabase Realtime filters don't support OR conditions, so we receive
  // all events and filter in handleRow(). This is safe — single-user app.
  channel = supabase
    .channel('share-queue')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'share_queue' },
      (payload) => handleRow(payload.new, 'INSERT'),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'share_queue' },
      (payload) => handleRow(payload.new, 'UPDATE'),
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`📡 Realtime connected — device: ${deviceId ? deviceId.slice(0,8) + '…' : 'unknown'}`);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`❌ Realtime channel error — device: ${deviceId?.slice(0,8)}`, err?.message || err);
      } else if (status === 'TIMED_OUT') {
        console.warn(`⏱️  Realtime timed out — device: ${deviceId?.slice(0,8)}`);
      } else if (status === 'CLOSED') {
        console.warn(`🔌 Realtime channel closed`);
      } else {
        console.log(`📡 Realtime status: ${status}`);
      }
    });

  // ── Check for any unprocessed entries that arrived while offline ─────────
  await checkExisting();

  // ── Polling fallback: re-check every 30s in case Realtime is unreliable ──
  // This ensures links always arrive even if the WebSocket subscription
  // fails silently (e.g. table not in supabase_realtime publication).
  const POLL_INTERVAL_MS = 30_000;
  pollTimer = setInterval(() => checkExisting(true), POLL_INTERVAL_MS);
  console.log(`🔄 Polling fallback active — checking every ${POLL_INTERVAL_MS / 1000}s`);
}

function stop() {
  if (channel)   { supabase.removeChannel(channel); channel = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  for (const t of pendingTimers.values()) clearTimeout(t);
  pendingTimers.clear();
}

// ── Called for every INSERT or UPDATE event ──────────────────────────────────
async function handleRow(entry, event) {
  if (!entry || entry.processed) return;

  // Already scheduled or being imported?
  if (event === 'INSERT' && pendingTimers.has(entry.id)) return;

  if (entry.tags_ready) {
    // Tags confirmed by user — import immediately
    pendingTimers.delete(entry.id);
    await importEntry(entry);
  } else if (event === 'INSERT') {
    // Not ready yet — wait for user to confirm tags OR for 2-min timeout
    const timer = setTimeout(async () => {
      pendingTimers.delete(entry.id);
      // Re-fetch to get latest state (user may have added tags in the meantime)
      if (!supabaseAdmin) return;
      const { data } = await supabaseAdmin
        .from('share_queue')
        .select('*')
        .eq('id', entry.id)
        .single();
      if (data && !data.processed) await importEntry(data);
    }, TAG_TIMEOUT_MS);
    pendingTimers.set(entry.id, timer);
    console.log(`⏳ Waiting for tags on entry ${entry.id} (timeout in 2 min)…`);
  }
  // UPDATE with tags_ready=false is ignored — we're already waiting via timer
}

// ── On startup (and periodic poll): process anything unprocessed ─────────────
// silent=true suppresses the "nothing to do" log line (used by 30s interval)
async function checkExisting(silent = false) {
  if (!supabaseAdmin) return;

  try {
    // Single-user app: process ALL unprocessed entries regardless of user_id.
    // device_id filtering was causing silent drops when PWA/desktop IDs drifted.
    const query = supabaseAdmin
      .from('share_queue')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true });

    const { data, error } = await query;
    if (error) {
      console.error('❌ checkExisting query failed:', error.message, error.code);
      return;
    }
    if (!data?.length) {
      if (!silent) console.log('📭 No pending share queue entries on startup.');
      return;
    }

    const cutoff = Date.now() - TAG_TIMEOUT_MS;
    const ready  = data.filter(e =>
      e.tags_ready === true ||
      new Date(e.created_at).getTime() < cutoff,
    );

    if (ready.length > 0) {
      console.log(`📥 ${ready.length} queued link(s) from while offline…`);
      for (const entry of ready) await importEntry(entry);
    }

    // Schedule timers for rows that are still within the 2-min window
    const waiting = data.filter(e =>
      !e.tags_ready &&
      new Date(e.created_at).getTime() >= cutoff,
    );
    for (const entry of waiting) {
      const elapsed   = Date.now() - new Date(entry.created_at).getTime();
      const remaining = TAG_TIMEOUT_MS - elapsed;
      const timer     = setTimeout(async () => {
        pendingTimers.delete(entry.id);
        const { data: fresh } = await supabaseAdmin
          .from('share_queue').select('*').eq('id', entry.id).single();
        if (fresh && !fresh.processed) await importEntry(fresh);
      }, remaining);
      pendingTimers.set(entry.id, timer);
    }
  } catch (err) {
    console.warn('⚠️  checkExisting failed:', err.message);
  }
}

// ── Import one entry into MindVault ──────────────────────────────────────────
async function importEntry(entry) {
  try {
    console.log(`🔄 Importing: ${entry.url}`);

    const userTags = entry.tags
      ? entry.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    const body = { url: entry.url };
    if (entry.space && ['eye', 'mind'].includes(entry.space)) body.space = entry.space;
    if (userTags.length > 0) { body.tags = userTags; console.log(`🏷️  Tags: ${userTags.join(', ')}`); }

    const res = await fetch(`${BACKEND_URL}/api/links`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

    const result = await res.json();
    console.log(`✅ Imported [${result.id}]: ${result.title}`);

    // Mark as processed — directly via Supabase (no Vercel round-trip)
    await supabaseAdmin
      .from('share_queue')
      .update({ processed: true })
      .eq('id', entry.id);

    // Sync library so new link appears in PWA immediately
    try {
      await require('./library-sync').sync();
    } catch (e) {
      console.log('⚠️  Library sync after import failed:', e.message);
    }

  } catch (err) {
    console.error(`❌ Failed to import ${entry.url}:`, err.message);
    // Don't mark as processed — Realtime UPDATE will retry if tags_ready changes,
    // or checkExisting() will catch it on next restart.
  }
}

module.exports = { init, stop };
