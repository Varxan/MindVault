/**
 * MindVault Library Sync
 *
 * On app start: pushes a snapshot of all links to Supabase library_cache.
 * Thumbnail URLs are resolved per-source for maximum reliability on mobile:
 *
 *   YouTube  → permanent img.youtube.com URL (never expires)
 *   Vimeo    → fresh URL via Vimeo oEmbed API (fetched at sync time)
 *   Others   → stored thumbnail_url as-is (may expire; shows placeholder if broken)
 */

const { createClient } = require('@supabase/supabase-js');
const { getAllLinks }   = require('./database');
const fetch            = require('node-fetch');

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
    console.log(`[Library Sync] Resolving thumbnails for ${allLinks.length} links…`);

    const links = await Promise.all(allLinks.map(async (link) => ({
      id:            link.id,
      url:           link.url,
      title:         link.title       || null,
      description:   link.description || null,
      thumbnail_url: await resolveThumbnail(link),
      tags:          safeParseJson(link.tags, []),
      source:        link.source      || 'web',
      created_at:    link.created_at,
    })));

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
      const withThumb = links.filter(l => l.thumbnail_url).length;
      console.log(`[Library Sync] ✅ Synced ${links.length} links (${withThumb} with thumbnails)`);
    }
  } catch (err) {
    console.error('[Library Sync] ❌ Exception:', err.message);
  }
}

/**
 * Resolve the best available thumbnail URL for a link.
 * Returns a URL the phone's browser can load directly, or null.
 */
async function resolveThumbnail(link) {
  const source = link.source || '';
  const url    = link.url    || '';

  // ── YouTube — permanent thumbnail, always works ──────────────────────────
  if (source === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
    const videoId = extractYouTubeId(url);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }

  // ── Vimeo — fresh URL via oEmbed API ─────────────────────────────────────
  if (source === 'vimeo' || url.includes('vimeo.com')) {
    const fresh = await fetchVimeoThumbnail(url);
    if (fresh) return fresh;
  }

  // ── All other sources — use stored thumbnail_url as-is ───────────────────
  // Instagram CDN links expire; they'll gracefully fall back to the
  // SVG placeholder on the phone. No fix possible without server proxy.
  return link.thumbnail_url || null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    return u.searchParams.get('v');
  } catch { return null; }
}

async function fetchVimeoThumbnail(videoUrl) {
  try {
    const apiUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`;
    const res = await fetch(apiUrl, { timeout: 6000 });
    if (!res.ok) return null;
    const data = await res.json();
    // Prefer large thumbnail
    return data.thumbnail_url_with_play_button
      || data.thumbnail_url
      || null;
  } catch { return null; }
}

function safeParseJson(value, fallback) {
  try {
    if (Array.isArray(value)) return value;
    if (!value) return fallback;
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch { return fallback; }
}

module.exports = { init, sync };
