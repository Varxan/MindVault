/**
 * Supabase Share Queue Poller
 *
 * Polls the Supabase `share_queue` table every 10 seconds.
 * Imports links by calling the SAME ENDPOINT as the desktop "Add Link" button.
 *
 * A row is ready to import when:
 *   - tags_ready = true  (user submitted or skipped the tag step), OR
 *   - created_at is older than TAG_TIMEOUT_MS (user never interacted — use AI tags)
 *
 * Requires env vars:
 *   SUPABASE_URL  — your Supabase project URL
 *   SUPABASE_KEY  — anon or service_role key
 */

const { createClient } = require('@supabase/supabase-js');

const POLL_INTERVAL_MS = 10_000;   // 10 seconds
const TAG_TIMEOUT_MS   = 120_000;  // 2 minutes — import even if user never added tags
const BACKEND_URL      = process.env.BACKEND_URL || 'http://localhost:3001';

let supabase   = null;
let pollTimer  = null;

function init() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    console.log('ℹ️  Supabase poller disabled (SUPABASE_URL / SUPABASE_KEY not set)');
    return;
  }

  supabase = createClient(url, key);
  console.log('📡 Supabase poller started — checking every 10s for new shared links');
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
  if (!supabase) return;

  try {
    // Fetch all unprocessed entries
    const { data, error } = await supabase
      .from('share_queue')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('⚠️  Supabase poll error:', error.message);
      return;
    }

    if (!data || data.length === 0) return;

    const cutoff = Date.now() - TAG_TIMEOUT_MS;

    // Only import rows that are ready:
    // - user clicked "Add" or "Skip" (tags_ready = true), OR
    // - row is older than 2 minutes (timeout, import with AI tags)
    const ready = data.filter(entry =>
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

    // Mark as processed in Supabase
    await supabase
      .from('share_queue')
      .update({ processed: true })
      .eq('id', entry.id);

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
