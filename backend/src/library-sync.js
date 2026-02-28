/**
 * MindVault Library Sync
 *
 * On app start: pushes a snapshot of all links to Supabase library_cache.
 * Thumbnail strategy per source:
 *
 *   YouTube   → permanent img.youtube.com URL (never expires)
 *   Vimeo     → fresh URL via Vimeo oEmbed API (fetched at sync time)
 *   Instagram → local thumbnail resized to 160×90 via sips (macOS built-in),
 *               embedded as base64 data URI — no CDN expiry, no extra cost
 *   Others    → stored thumbnail_url as-is
 */

const { createClient } = require('@supabase/supabase-js');
const { getAllLinks }   = require('./database');
const fetch            = require('node-fetch');
const fs               = require('fs');
const path             = require('path');
const os               = require('os');
const { execFile }     = require('child_process');

const DATA_ROOT  = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
const THUMB_DIR  = path.join(DATA_ROOT, 'thumbnails');

let supabase = null;
let deviceId = null;  // UUID for data isolation

function getDeviceId() {
  // 1. From env (set by Electron main process)
  if (process.env.MINDVAULT_DEVICE_ID) return process.env.MINDVAULT_DEVICE_ID;
  // 2. From user.json
  try {
    const path       = require('path');
    const fs         = require('fs');
    const dataDir    = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
    const configPath = path.join(dataDir, '..', 'user.json');
    const config     = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.deviceId || null;
  } catch (_) {
    return null;
  }
}

async function init() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    console.log('ℹ️  Library sync disabled (no Supabase credentials)');
    return;
  }

  deviceId = getDeviceId();
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

    // Delete existing row then insert fresh (avoids needing UNIQUE constraint for ON CONFLICT)
    if (deviceId) {
      await supabase.from('library_cache').delete().eq('user_id', deviceId);
      var { error } = await supabase
        .from('library_cache')
        .insert({ user_id: deviceId, links, updated_at: new Date().toISOString() });
    } else {
      await supabase.from('library_cache').delete().eq('singleton_id', 1);
      var { error } = await supabase
        .from('library_cache')
        .insert({ singleton_id: 1, links, updated_at: new Date().toISOString() });
    }

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

  // ── Instagram — embed local thumbnail as base64 (CDN links expire) ────────
  if (source === 'instagram' || url.includes('instagram.com')) {
    const b64 = await localThumbnailToBase64(link.local_thumbnail);
    if (b64) return b64;
  }

  // ── All other sources — use stored thumbnail_url as-is ───────────────────
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

/**
 * Resize a local thumbnail to 160×90 using ffmpeg (cross-platform).
 * Returns a base64 data URI. ~5KB per image instead of ~175KB.
 */
async function localThumbnailToBase64(localThumbFilename) {
  if (!localThumbFilename) return null;
  const srcPath = path.join(THUMB_DIR, localThumbFilename);
  if (!fs.existsSync(srcPath)) return null;

  const tmpPath = path.join(os.tmpdir(), `mv_thumb_${Date.now()}.jpg`);

  try {
    // Resize with ffmpeg — already installed for video features, cross-platform
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', [
        '-y',
        '-i', srcPath,
        '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
        '-q:v', '6',   // JPEG quality (2=best, 31=worst) — 6 is ~80% quality
        tmpPath,
      ], { timeout: 8000 }, (err) => err ? reject(err) : resolve());
    });

    const buffer = fs.readFileSync(tmpPath);
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch {
    // ffmpeg failed — return null, show placeholder
    return null;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
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
