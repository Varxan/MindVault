/**
 * Supabase Share Queue Poller
 *
 * Polls the Supabase `share_queue` table every 10 seconds.
 * New (unprocessed) entries are imported into the local SQLite DB,
 * then marked as processed so they won't be picked up again.
 *
 * Requires env vars:
 *   SUPABASE_URL  — your Supabase project URL
 *   SUPABASE_KEY  — anon or service_role key
 */

const { createClient }       = require('@supabase/supabase-js');
const { insertLink, updateLink } = require('./database');
const { detectSource, fetchSmartMetadata } = require('./metadata');
const { analyzeContent }     = require('./ai');

const POLL_INTERVAL_MS = 10_000; // 10 seconds

let supabase = null;
let pollTimer = null;

function init() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    console.log('ℹ️  Supabase poller disabled (SUPABASE_URL / SUPABASE_SERVICE_KEY not set)');
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

    console.log(`📥 ${data.length} new shared link(s) from phone — importing…`);

    for (const entry of data) {
      await importEntry(entry);
    }

  } catch (err) {
    console.warn('⚠️  Supabase poller exception:', err.message);
  }
}

async function importEntry(entry) {
  try {
    // Fetch metadata (title, description, image)
    let metadata = {};
    try {
      metadata = await fetchSmartMetadata(entry.url);
    } catch (e) {
      console.warn(`⚠️  Metadata fetch failed for ${entry.url}:`, e.message);
    }

    const title  = entry.title || metadata.title || entry.url;
    const desc   = metadata.description || entry.text || '';
    const source = detectSource(entry.url);
    const now    = new Date().toISOString();

    // Insert into local SQLite
    const result = insertLink.run({
      url:         entry.url,
      title,
      description: desc,
      image:       metadata.image || null,
      source:      source || 'mobile-share',
      tags:        JSON.stringify(['mobile-share']),
      created_at:  now,
      updated_at:  now,
    });

    const linkId = result.lastInsertRowid;
    console.log(`✅ Imported shared link [${linkId}]: ${title}`);

    // Mark as processed in Supabase
    await supabase
      .from('share_queue')
      .update({ processed: true })
      .eq('id', entry.id);

    // AI auto-tagging in background (non-blocking)
    setImmediate(async () => {
      try {
        const link = { id: linkId, url: entry.url, title, description: desc };
        const tags = await analyzeContent(link);
        if (tags && tags.length > 0) {
          updateLink.run({ tags: JSON.stringify(tags), id: linkId });
          console.log(`🏷️  Auto-tagged [${linkId}]: ${tags.join(', ')}`);
        }
      } catch (e) {
        console.warn('⚠️  Auto-tag failed:', e.message);
      }
    });

  } catch (err) {
    console.error(`❌ Failed to import ${entry.url}:`, err.message);
    // Don't mark as processed — will retry on next poll
  }
}

module.exports = { init, stop };
