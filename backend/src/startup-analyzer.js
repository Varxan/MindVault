'use strict';

/**
 * startup-analyzer.js
 *
 * On every backend start, finds all links that have no AI tags yet and
 * analyzes them one by one in the background — without blocking startup.
 *
 * This handles the common case where links arrive while MindVault was
 * offline (e.g. sent via Telegram / Chrome extension when app was closed).
 *
 * Processing is intentionally slow (2 s delay between items) to avoid
 * overloading CLIP or the API while the user is actively using the app.
 */

const path = require('path');
const fs   = require('fs');

const DELAY_BETWEEN_MS = 2000; // 2 s between each link

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runStartupAnalysis() {
  // Lazy-require to avoid circular deps at module load time
  const { db }            = require('./database');
  const { analyzeContent } = require('./ai');
  const DATA_ROOT          = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
  const THUMB_DIR          = path.join(DATA_ROOT, 'thumbnails');
  const MEDIA_DIR          = path.join(DATA_ROOT, 'media');
  const UPLOAD_DIR         = path.join(DATA_ROOT, 'uploads');

  // Find links with no tags at all
  const untagged = db.prepare(
    `SELECT * FROM links WHERE (tags IS NULL OR tags = '[]' OR tags = '') ORDER BY created_at DESC`
  ).all();

  if (untagged.length === 0) return;

  console.log(`[StartupAnalyzer] ${untagged.length} untagged link(s) found — analyzing in background…`);

  let done = 0;
  let failed = 0;

  for (const link of untagged) {
    try {
      // Resolve best image/video source (same priority as manual /analyze route)
      let imageSource = null;

      if (link.media_path) {
        const p = path.join(MEDIA_DIR, link.media_path);
        if (fs.existsSync(p)) imageSource = p;
      }
      if (!imageSource && link.file_path) {
        const p = path.join(UPLOAD_DIR, link.file_path);
        if (fs.existsSync(p)) imageSource = p;
      }
      if (!imageSource && link.local_thumbnail) {
        const p = path.join(THUMB_DIR, link.local_thumbnail);
        if (fs.existsSync(p)) imageSource = p;
      }
      if (!imageSource && link.thumbnail_url) {
        imageSource = link.thumbnail_url;
      }

      if (!imageSource) {
        console.log(`[StartupAnalyzer] ⚠️  Link ${link.id} — no image source, skipping`);
        failed++;
        continue;
      }

      console.log(`[StartupAnalyzer] Analyzing link ${link.id}: ${link.title?.slice(0, 50) || link.url?.slice(0, 50)}`);

      const aiResult = await analyzeContent(imageSource, {
        title:       link.title,
        description: link.description,
        source:      link.source,
        url:         link.url,
        note:        link.note,
      });

      if (aiResult && aiResult.tags && aiResult.tags.length > 0) {
        // Merge tags (same helper as manual analyze route)
        const current = db.prepare('SELECT tags FROM links WHERE id = ?').get(link.id);
        const existing = (() => { try { return JSON.parse(current?.tags || '[]'); } catch { return []; } })();
        const merged = [...new Set([...existing, ...aiResult.tags])];
        db.prepare('UPDATE links SET tags = ? WHERE id = ?')
          .run(JSON.stringify(merged), link.id);

        if (aiResult.description) {
          db.prepare('UPDATE links SET description = ? WHERE id = ?')
            .run(aiResult.description, link.id);
        }

        console.log(`[StartupAnalyzer] ✅ Link ${link.id} tagged with ${aiResult.tags.length} tags`);
        done++;
      } else {
        console.log(`[StartupAnalyzer] ⚠️  Link ${link.id} — AI returned no tags`);
        failed++;
      }
    } catch (err) {
      console.error(`[StartupAnalyzer] ❌ Link ${link.id} failed: ${err.message}`);
      failed++;
    }

    // Small pause between items so CLIP / API isn't hammered
    await sleep(DELAY_BETWEEN_MS);
  }

  console.log(`[StartupAnalyzer] Done — ${done} tagged, ${failed} skipped/failed`);
}

module.exports = { runStartupAnalysis };
