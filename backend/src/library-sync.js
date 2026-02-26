/**
 * MindVault Library Sync
 *
 * On app start: pushes a snapshot of all links to Supabase library_cache.
 * The PWA reads this to show the full library on mobile (read-only).
 *
 * Only public-safe fields are synced (no local file paths).
 */

const { createClient } = require('@supabase/supabase-js');
const { getAllLinks }   = require('./database');

let supabase = null;

async function init() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    console.log('ℹ️  Library sync disabled (no Supabase credentials)');
    return;
  }

  supabase = createClient(url, key);
  await sync();
}

async function sync() {
  if (!supabase) return;

  try {
    const allLinks = getAllLinks.all();

    // Only send display-relevant fields — no local paths
    const links = allLinks.map(link => ({
      id:            link.id,
      url:           link.url,
      title:         link.title   || null,
      description:   link.description || null,
      thumbnail_url: link.thumbnail_url || null,
      tags:          safeParseJson(link.tags, []),
      source:        link.source  || 'web',
      created_at:    link.created_at,
    }));

    const { error } = await supabase
      .from('library_cache')
      .upsert({
        singleton_id: 1,
        links,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'singleton_id' });

    if (error) {
      console.error('[Library Sync] ❌ Error:', error.message);
    } else {
      console.log(`[Library Sync] ✅ Synced ${links.length} links to Supabase`);
    }
  } catch (err) {
    console.error('[Library Sync] ❌ Exception:', err.message);
  }
}

function safeParseJson(value, fallback) {
  try {
    if (Array.isArray(value)) return value;
    if (!value) return fallback;
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

module.exports = { init, sync };
