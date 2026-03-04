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
const VERCEL_URL     = process.env.VERCEL_URL  || 'https://mind-vault-chi.vercel.app';

let supabase   = null;
let deviceId   = null;
let channel    = null;
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
  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;   // anon key — safe to use on desktop

  if (!url || !key) {
    console.log('ℹ️  Share queue realtime disabled (no SUPABASE_URL / SUPABASE_ANON_KEY)');
    return;
  }

  deviceId = getDeviceId();
  supabase = createClient(url, key, { auth: { persistSession: false } });

  // ── Subscribe to INSERT + UPDATE on share_queue for this device ──────────
  channel = supabase
    .channel('share-queue')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'share_queue',
        filter: deviceId ? `user_id=eq.${deviceId}` : undefined },
      (payload) => handleRow(payload.new, 'INSERT'),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'share_queue',
        filter: deviceId ? `user_id=eq.${deviceId}` : undefined },
      (payload) => handleRow(payload.new, 'UPDATE'),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`📡 Realtime connected — device: ${deviceId ? deviceId.slice(0,8) + '…' : 'unknown'}`);
      }
    });

  // ── Check for any unprocessed entries that arrived while offline ─────────
  await checkExisting();
}

function stop() {
  if (channel)  { supabase.removeChannel(channel); channel = null; }
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
      if (!supabase) return;
      const { data } = await supabase
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

// ── On startup: process anything that arrived while the app was closed ────────
async function checkExisting() {
  if (!supabase) return;

  try {
    let query = supabase
      .from('share_queue')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true });

    if (deviceId) query = query.eq('user_id', deviceId);

    const { data, error } = await query;
    if (error || !data?.length) return;

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
        const { data: fresh } = await supabase
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
    await supabase
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
