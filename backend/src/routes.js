const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  getAllLinks,
  getLinksPaginated,
  getLinkById,
  updateLink,
  deleteLink,
  searchLinks,
  filterBySource,
  countLinks,
  insertLink,
  db,
  // Collections
  createCollection,
  updateCollection,
  deleteCollection,
  getCollectionById,
  getAllCollections,
  addLinkToCollection,
  removeLinkFromCollection,
  getCollectionLinks,
  getCollectionThumbnails,
  getCollectionsForLink,
  filterByCollection,
  bulkAddLinksToCollection,
  getSetting,
  setSetting,
  getAllSettings,
} = require('./database');
const { detectSource, fetchMetadata, fetchSmartMetadata } = require('./metadata');
const { analyzeContent, getAIStatus, checkClipAvailable } = require('./ai');
const { downloadThumbnail, generateVideoThumbnail, THUMB_DIR } = require('./thumbnails');
const { downloadMedia, getDownloadedFiles, isYtdlpInstalled, getMediaInfo, MEDIA_DIR } = require('./downloader');
const { transcribeMedia, transcribeFromUrl, isWhisperAvailable, isWhisperCompatible } = require('./whisper');
const { embedText, isEmbeddingAvailable, cosineSimilarity, vecToBuffer, bufferToVec, buildEmbedText } = require('./embeddings');
const librarySync = require('./library-sync');

// Debounced sync: waits 5s after last change before pushing to Supabase
// so rapid imports don't hammer the API
let _syncTimer = null;
function scheduleSync() {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    librarySync.sync().catch(() => {});
    _syncTimer = null;
  }, 5000);
}
const { createGif, createClip, createScreenshot, getVideoDuration, getGifsForLink, deleteGif, deleteClip, deleteScreenshot, GIF_DIR, CLIP_DIR, SCREENSHOT_DIR } = require('./gif-creator');

const router = express.Router();

// ── Server-Sent Events (SSE) broadcaster ─────────────────────────────────────
// All connected frontend clients are stored here.
// Call pushEvent(type, data) from anywhere in backend to instantly notify UI.
const _sseClients = new Set();

function pushEvent(type, data = {}) {
  const payload = `data: ${JSON.stringify({ type, ...data })}\n\n`;
  for (const res of _sseClients) {
    try { res.write(payload); } catch {}
  }
}

// GET /api/events – Frontend connects once, receives push notifications forever
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send a heartbeat every 30s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 30_000);

  _sseClients.add(res);
  console.log(`[SSE] Client connected (${_sseClients.size} total)`);

  req.on('close', () => {
    clearInterval(heartbeat);
    _sseClients.delete(res);
    console.log(`[SSE] Client disconnected (${_sseClients.size} remaining)`);
  });
});
// ─────────────────────────────────────────────────────────────────────────────

// === File Upload Setup ===
const os = require('os');
const DEV_DATA_ROOT = path.join(os.homedir(), 'Library', 'Application Support', 'mindvault', 'data');
const DATA_ROOT = process.env.DATA_PATH || DEV_DATA_ROOT;
const UPLOAD_DIR = path.join(DATA_ROOT, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    cb(null, `upload-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|mp4|mov|webm|pdf|svg)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Dateityp nicht erlaubt'));
    }
  },
});

// === Static file serving ===
router.use('/files/thumbnails', express.static(THUMB_DIR));

// ── Helper: merge AI tags with existing user tags (never overwrite) ──────────
// Merge: adds AI tags to existing ones — used on first creation to preserve user-supplied tags
function mergeAITags(linkId, aiTags) {
  if (!aiTags || aiTags.length === 0) return;
  const current = db.prepare('SELECT tags FROM links WHERE id = ?').get(linkId);
  const existing = JSON.parse(current?.tags || '[]');
  // AI tags take priority (listed first), user tags appended after, cap at 15
  const merged = [...new Set([...aiTags, ...existing])].slice(0, 15);
  db.prepare('UPDATE links SET tags = ? WHERE id = ?').run(JSON.stringify(merged), linkId);
  pushEvent('link-updated', { id: linkId });
}

// Replace: overwrites tags entirely with fresh AI analysis — used after download (better source)
function replaceAITags(linkId, aiTags) {
  if (!aiTags || aiTags.length === 0) return;
  db.prepare('UPDATE links SET tags = ? WHERE id = ?').run(JSON.stringify(aiTags.slice(0, 15)), linkId);
  pushEvent('link-updated', { id: linkId });
}

// ── Helper: generate + store semantic embedding for a link (async, fire-and-forget) ──
async function generateAndStoreEmbedding(linkId) {
  try {
    const available = await isEmbeddingAvailable();
    if (!available) return; // sentence-transformers not installed — skip silently

    const link = db.prepare('SELECT * FROM links WHERE id = ?').get(linkId);
    if (!link) return;

    const text = buildEmbedText(link);
    if (!text) return;

    const vec = await embedText(text);
    if (!vec) return;

    db.prepare('UPDATE links SET embedding = ? WHERE id = ?').run(vecToBuffer(vec), linkId);
    console.log(`[Embed] ✅ Embedding stored for link ${linkId}`);
  } catch (err) {
    console.log(`[Embed] ⚠️  Failed for link ${linkId}: ${err.message}`);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Helper: resolve absolute path for a video link (media_path or file_path/upload)
function resolveVideoPath(link) {
  if (link.media_path) return path.join(MEDIA_DIR, link.media_path);
  if (link.file_path) {
    const filename = path.basename(link.file_path);
    const externalSetting = getSetting.get('media_storage_path');
    if (externalSetting?.value) {
      const externalPath = path.join(externalSetting.value, filename);
      if (fs.existsSync(externalPath)) return externalPath;
    }
    return path.join(UPLOAD_DIR, filename);
  }
  return null;
}

// /files/uploads/:filename — serve from external storage first (if configured), else internal UPLOAD_DIR
router.get('/files/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  // Security: reject any path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).send('Invalid filename');
  }
  const externalSetting = getSetting.get('media_storage_path');
  if (externalSetting?.value) {
    const externalPath = path.join(externalSetting.value, filename);
    if (fs.existsSync(externalPath)) return res.sendFile(externalPath);
  }
  const internalPath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(internalPath)) return res.sendFile(internalPath);
  res.status(404).send('File not found');
});
router.use('/files/media', express.static(MEDIA_DIR));
router.use('/files/gifs', express.static(GIF_DIR));
router.use('/files/clips', express.static(CLIP_DIR));
router.use('/files/screenshots', express.static(SCREENSHOT_DIR));

// =============================================
// LINK ENDPOINTS
// =============================================

// GET /api/links – Alle Links
router.get('/links', (req, res) => {
  try {
    const { page, limit: queryLimit, search, source, collection, space } = req.query;
    const spaceFilter = space && ['eye', 'mind'].includes(space) ? space : null;

    if (search) {
      // Split search into individual words – every word must match somewhere
      const words = search.toLowerCase().split(/\s+/).filter(w => w.length > 0);
      if (words.length === 0) {
        const spaceClause = spaceFilter ? `AND space = '${spaceFilter}'` : '';
        const links = db.prepare(`SELECT * FROM links WHERE 1=1 ${spaceClause} ORDER BY created_at DESC`).all();
        return res.json({ links, total: links.length });
      }

      const conditions = words.map((_, i) => `(
        LOWER(COALESCE(url,'')) LIKE @w${i}
        OR LOWER(COALESCE(title,'')) LIKE @w${i}
        OR LOWER(COALESCE(description,'')) LIKE @w${i}
        OR LOWER(COALESCE(tags,'')) LIKE @w${i}
        OR LOWER(COALESCE(note,'')) LIKE @w${i}
        OR LOWER(COALESCE(source,'')) LIKE @w${i}
      )`);

      const spaceClause = spaceFilter ? ` AND space = '${spaceFilter}'` : '';
      const sql = `SELECT * FROM links WHERE ${conditions.join(' AND ')}${spaceClause} ORDER BY created_at DESC`;
      const params = {};
      words.forEach((w, i) => { params[`w${i}`] = `%${w}%`; });

      const links = db.prepare(sql).all(params);
      return res.json({ links, total: links.length });
    }

    if (collection) {
      const links = filterByCollection.all({ collection_id: parseInt(collection, 10) });
      const filtered = spaceFilter ? links.filter(l => l.space === spaceFilter) : links;
      return res.json({ links: filtered, total: filtered.length });
    }

    if (source) {
      const spaceClause = spaceFilter ? ` AND space = '${spaceFilter}'` : '';
      const links = db.prepare(`SELECT * FROM links WHERE source = ?${spaceClause} ORDER BY sort_position ASC, created_at DESC`).all(source);
      return res.json({ links, total: links.length });
    }

    if (page && queryLimit) {
      const limitNum = parseInt(queryLimit, 10) || 20;
      const offset = (parseInt(page, 10) - 1) * limitNum;
      const links = getLinksPaginated.all({ limit: limitNum, offset });
      const { total } = countLinks.get();
      return res.json({ links, total, page: parseInt(page, 10), limit: limitNum });
    }

    const spaceClause = spaceFilter ? `WHERE space = '${spaceFilter}'` : '';
    const links = db.prepare(`SELECT * FROM links ${spaceClause} ORDER BY sort_position ASC, created_at DESC`).all();
    return res.json({ links, total: links.length });
  } catch (err) {
    console.error('Error fetching links:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Links' });
  }
});

// GET /api/links/:id
router.get('/links/:id', (req, res) => {
  try {
    const link = getLinkById.get({ id: req.params.id });
    if (!link) return res.status(404).json({ error: 'Link nicht gefunden' });
    res.json(link);
  } catch (err) {
    console.error('Error fetching link:', err);
    res.status(500).json({ error: 'Fehler beim Laden des Links' });
  }
});

// POST /api/links – Neuen Link erstellen (mit auto-metadata + AI tagging)
router.post('/links', async (req, res) => {
  try {
    const { url, title, description, thumbnail_url, tags, source, note, space } = req.body;

    if (!url) return res.status(400).json({ error: 'URL ist erforderlich' });

    const detectedSource = source || detectSource(url);

    // ── Dedup: return existing link if URL already exists ─────────────────────
    // Prevents ghost Supabase queue entries from re-importing deleted links.
    const existingLink = db.prepare('SELECT * FROM links WHERE url = ?').get(url);
    if (existingLink) {
      console.log(`[Links] URL already exists (id=${existingLink.id}), skipping insert`);
      return res.status(200).json(existingLink);
    }

    // ── Insert immediately with whatever info we have ─────────────────────────
    // Metadata (thumbnail, rich title) is fetched async in the background.
    // This makes the Chrome extension + PWA share feel instant even for Vimeo/
    // YouTube where yt-dlp can take 20s+.
    const result = insertLink.run({
      url,
      source: detectedSource,
      title:       title       || null,
      description: description || null,
      thumbnail_url: thumbnail_url || null,
      tags:  JSON.stringify(tags || []),
      note:  note  || null,
      space: space || 'eye',
    });

    const linkId = result.lastInsertRowid;
    const newLink = getLinkById.get({ id: linkId });

    // Respond immediately — client doesn't have to wait for metadata
    res.status(201).json(newLink);
    scheduleSync(); // push to PWA
    pushEvent('link-added', { id: linkId });

    // ── Background: fetch metadata + thumbnail + AI + embeddings ─────────────
    setImmediate(async () => {
      try {
        // Skip metadata fetch if caller already provided both title and thumbnail
        let meta = { title: null, description: null, thumbnail_url: null, author_url: null };
        if (!title || !thumbnail_url) {
          meta = await fetchSmartMetadata(url, detectedSource);
        }

        const finalThumbUrl = thumbnail_url || meta.thumbnail_url || null;

        // Download thumbnail locally
        let localThumb = null;
        if (finalThumbUrl) {
          localThumb = await downloadThumbnail(finalThumbUrl);
        }

        // Update link with fetched metadata — only fill in fields still empty
        // (re-check current state to avoid overwriting a concurrent update)
        const current = db.prepare('SELECT title, description, thumbnail_url, local_thumbnail, author_url FROM links WHERE id = ?').get(linkId);
        if (!current) return; // link was deleted in the meantime

        // For video platforms, always prefer the metadata title over any share-provided title.
        // iOS share sheets often send Telegram/app notification text as "title" which is wrong.
        const isVideoPlatform = ['youtube', 'vimeo', 'tiktok', 'instagram'].includes(detectedSource);

        const updates = [];
        const params  = [];
        if (meta.title && (!current.title || isVideoPlatform)) { updates.push('title = ?');          params.push(meta.title); }
        if (!current.description && meta.description)          { updates.push('description = ?');    params.push(meta.description); }
        if (!current.thumbnail_url && finalThumbUrl)  { updates.push('thumbnail_url = ?');  params.push(finalThumbUrl); }
        if (!current.local_thumbnail && localThumb)   { updates.push('local_thumbnail = ?'); params.push(localThumb); }
        if (!current.author_url && meta.author_url)   { updates.push('author_url = ?');     params.push(meta.author_url); }
        if (updates.length > 0) {
          params.push(linkId);
          db.prepare(`UPDATE links SET ${updates.join(', ')} WHERE id = ?`).run(...params);
          pushEvent('link-updated', { id: linkId });
          scheduleSync();
        }

        // AI-Analyse (nicht blockierend)
        const aiImageSource = localThumb
          ? path.join(THUMB_DIR, localThumb)
          : finalThumbUrl;
        if (aiImageSource) {
          analyzeContent(aiImageSource, {
            title: title || meta.title,
            description: description || meta.description,
            source: detectedSource,
            url,
          }).then((aiResult) => {
            if (aiResult.tags.length > 0) {
              mergeAITags(linkId, aiResult.tags);
              console.log(`[AI] Tags für Link ${linkId}: ${aiResult.tags.join(', ')}`);
            }
            if (aiResult.description && !description && !meta.description) {
              db.prepare('UPDATE links SET description = ? WHERE id = ?')
                .run(aiResult.description, linkId);
            }
          }).catch(err => {
            console.log(`[AI] Analyse fehlgeschlagen für Link ${linkId}: ${err.message}`);
          }).finally(() => {
            generateAndStoreEmbedding(linkId);
          });
        } else {
          generateAndStoreEmbedding(linkId);
        }
      } catch (bgErr) {
        console.log(`[Metadata] Background fetch failed for ${url}: ${bgErr.message}`);
        // Link already saved — just no metadata. Not critical.
        generateAndStoreEmbedding(linkId);
      }
    });

    // ── Auto-transcription for Mind links (background, invisible to user) ──────
    // Downloads audio-only, transcribes, deletes audio, stores in hidden
    // `transcript` column (NOT in note). Used for AI tagging + semantic search.
    if ((space || 'eye') === 'mind') {
      const capturedLinkId = linkId;
      const capturedUrl    = url;
      setImmediate(async () => {
        try {
          const available = await isWhisperAvailable();
          if (!available) return;

          const transcript = await transcribeFromUrl(capturedUrl, null);
          if (!transcript) return;

          db.prepare('UPDATE links SET transcript = ? WHERE id = ?').run(transcript, capturedLinkId);
          console.log(`[Whisper] 💾 Hidden transcript stored for Mind link ${capturedLinkId}`);

          // Re-embed with transcript for richer semantic search
          generateAndStoreEmbedding(capturedLinkId);
          pushEvent('link-updated', { id: capturedLinkId });
        } catch (err) {
          console.log(`[Whisper] ⚠️  Background transcription failed for ${capturedLinkId}: ${err.message}`);
        }
      });
    }
  } catch (err) {
    console.error('Error creating link:', err);
    res.status(500).json({ error: 'Fehler beim Erstellen des Links' });
  }
});

// PATCH /api/links/:id
router.patch('/links/:id', (req, res) => {
  try {
    const link = getLinkById.get({ id: req.params.id });
    if (!link) return res.status(404).json({ error: 'Link nicht gefunden' });

    const { title, description, thumbnail_url, tags, note, space } = req.body;

    updateLink.run({
      id: req.params.id,
      title: title !== undefined ? title : null,
      description: description !== undefined ? description : null,
      thumbnail_url: thumbnail_url !== undefined ? thumbnail_url : null,
      tags: tags !== undefined ? JSON.stringify(tags) : null,
      note: note !== undefined ? (note || '') : null,
    });

    // Update space separately if provided
    if (space && ['eye', 'mind'].includes(space)) {
      db.prepare('UPDATE links SET space = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(space, req.params.id);

      // ── Auto-transcription when moving to Mind (if no transcript yet) ──────
      // Triggers the same Whisper pipeline as on initial Mind-save,
      // so links moved from Eye to Mind are fully indexed for Fuse search.
      if (space === 'mind' && !link.transcript && link.url) {
        const capturedLinkId = req.params.id;
        const capturedUrl    = link.url;
        setImmediate(async () => {
          try {
            const available = await isWhisperAvailable();
            if (!available) return;

            const transcript = await transcribeFromUrl(capturedUrl, null);
            if (!transcript) return;

            db.prepare('UPDATE links SET transcript = ? WHERE id = ?').run(transcript, capturedLinkId);
            console.log(`[Whisper] 💾 Hidden transcript stored for moved Mind link ${capturedLinkId}`);

            // Re-embed with transcript for richer semantic search
            generateAndStoreEmbedding(capturedLinkId);
            pushEvent('link-updated', { id: capturedLinkId });
          } catch (err) {
            console.log(`[Whisper] ⚠️  Background transcription failed for moved link ${capturedLinkId}: ${err.message}`);
          }
        });
      }
    }

    const updated = getLinkById.get({ id: req.params.id });
    res.json(updated);
  } catch (err) {
    console.error('Error updating link:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Links' });
  }
});

// DELETE /api/links/:id
// Optional query param: ?deleteFile=true — also deletes the local file for imports
router.delete('/links/:id', (req, res) => {
  try {
    const link = getLinkById.get({ id: req.params.id });
    if (!link) return res.status(404).json({ error: 'Link nicht gefunden' });

    // Optionally delete the local file for imported uploads
    let fileDeleted = false;
    if (req.query.deleteFile === 'true' && link.source === 'upload' && link.file_path) {
      const filename = path.basename(link.file_path);
      const externalSetting = getSetting.get('media_storage_path');
      const candidates = [];
      if (externalSetting?.value) candidates.push(path.join(externalSetting.value, filename));
      candidates.push(path.join(UPLOAD_DIR, filename));
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          try { fs.unlinkSync(candidate); fileDeleted = true; console.log(`🗑️  Deleted import file: ${candidate}`); } catch {}
          break;
        }
      }
      // Also delete the generated thumbnail if it differs from the file itself
      if (link.local_thumbnail && link.local_thumbnail !== link.file_path) {
        const thumbPath = path.join(THUMB_DIR, path.basename(link.local_thumbnail));
        if (fs.existsSync(thumbPath)) { try { fs.unlinkSync(thumbPath); } catch {} }
      }
    }

    deleteLink.run({ id: req.params.id });
    res.json({ message: 'Link gelöscht', id: req.params.id, fileDeleted });
    scheduleSync(); // push to PWA
    pushEvent('link-deleted', { id: req.params.id });
  } catch (err) {
    console.error('Error deleting link:', err);
    res.status(500).json({ error: 'Fehler beim Löschen des Links' });
  }
});

// =============================================
// SEMANTIC SEARCH
// =============================================

// GET /api/search/semantic?q=...&space=eye|mind&limit=20
// Returns links sorted by semantic similarity to the query.
// Falls back gracefully if sentence-transformers is not installed.
router.get('/search/semantic', async (req, res) => {
  try {
    const query      = (req.query.q || '').trim();
    const spaceFilter = req.query.space && ['eye', 'mind'].includes(req.query.space)
      ? req.query.space : null;
    const limit      = Math.min(parseInt(req.query.limit) || 20, 100);

    if (!query) return res.status(400).json({ error: 'Query parameter ?q= is required' });

    // Check availability
    const available = await isEmbeddingAvailable();
    if (!available) {
      return res.status(503).json({
        error: 'Semantic search not available — run setup-whisper.sh to install sentence-transformers',
        fallback: true,
      });
    }

    // Embed the query
    const queryVec = await embedText(query);
    if (!queryVec) return res.status(500).json({ error: 'Failed to embed query' });

    // Load all links that have an embedding stored
    const clause = spaceFilter ? `WHERE embedding IS NOT NULL AND space = '${spaceFilter}'` : 'WHERE embedding IS NOT NULL';
    const rows = db.prepare(`SELECT * FROM links ${clause}`).all();

    if (rows.length === 0) {
      return res.json({ links: [], total: 0, message: 'No embeddings found — save some links first' });
    }

    // Score each link
    const scored = rows.map(link => {
      const vec = bufferToVec(link.embedding);
      const score = vec ? cosineSimilarity(queryVec, vec) : 0;
      return { ...link, embedding: undefined, _score: score }; // strip blob from response
    });

    // Sort by score descending, filter by minimum threshold, return top N
    const SEMANTIC_THRESHOLD = 0.20; // below this = not semantically related
    scored.sort((a, b) => b._score - a._score);
    const top = scored.filter(l => l._score >= SEMANTIC_THRESHOLD).slice(0, limit);

    console.log(`[Embed] 🔍 Semantic search "${query}" → top score: ${scored[0]?._score?.toFixed(3)}, ${top.length}/${scored.length} above threshold`);

    res.json({ links: top, total: top.length, query });
  } catch (err) {
    console.error('[Embed] Semantic search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backfill-embeddings – Generate embeddings for all links that don't have one
router.post('/backfill-embeddings', async (req, res) => {
  try {
    const available = await isEmbeddingAvailable();
    if (!available) {
      return res.status(503).json({ error: 'sentence-transformers not installed' });
    }

    const links = db.prepare('SELECT id FROM links WHERE embedding IS NULL').all();
    res.json({ message: `Backfilling ${links.length} links in background…`, count: links.length });

    // Process sequentially in background (avoid hammering CPU)
    (async () => {
      let done = 0;
      for (const { id } of links) {
        await generateAndStoreEmbedding(id);
        done++;
        if (done % 10 === 0) console.log(`[Embed] Backfill progress: ${done}/${links.length}`);
      }
      console.log(`[Embed] ✅ Backfill complete — ${done} links embedded`);
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// REFRESH METADATA
// =============================================

// POST /api/links/:id/refresh-metadata – Re-fetch title, thumbnail, author_url from source
router.post('/links/:id/refresh-metadata', async (req, res) => {
  try {
    const link = getLinkById.get({ id: req.params.id });
    if (!link) return res.status(404).json({ error: 'Link nicht gefunden' });
    if (link.source === 'upload') return res.status(400).json({ error: 'Uploads haben keine Remote-Metadaten' });

    const meta = await fetchSmartMetadata(link.url, link.source);
    if (!meta || (!meta.title && !meta.author_url)) {
      return res.status(400).json({ error: 'Keine Metadaten gefunden' });
    }

    const updates = [];
    const params = [];

    if (meta.title) { updates.push('title = ?'); params.push(meta.title); }
    if (meta.author_url) { updates.push('author_url = ?'); params.push(meta.author_url); }
    if (meta.thumbnail_url) {
      updates.push('thumbnail_url = ?'); params.push(meta.thumbnail_url);
      const localThumb = await downloadThumbnail(meta.thumbnail_url);
      if (localThumb) { updates.push('local_thumbnail = ?'); params.push(localThumb); }
    }

    if (updates.length > 0) {
      params.push(link.id);
      db.prepare(`UPDATE links SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = getLinkById.get({ id: link.id });
    console.log(`[Refresh] Link ${link.id}: title="${updated.title}", author_url="${updated.author_url}"`);
    res.json(updated);
  } catch (err) {
    console.error('Error refreshing metadata:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Metadaten' });
  }
});

// =============================================
// UPLOAD ENDPOINT
// =============================================

// POST /api/upload – Datei hochladen und als Link speichern
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const { note, tags } = req.body;
    const filePath = req.file.filename;
    const originalName = req.file.originalname;
    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(originalName);

    // Create a link entry for the uploaded file
    const fileUrl = `local://${filePath}`;

    const { space: reqSpace } = req.body;
    const result = insertLink.run({
      url: fileUrl,
      source: 'upload',
      title: originalName,
      description: null,
      thumbnail_url: isImage ? filePath : null,
      tags: tags ? JSON.stringify(JSON.parse(tags)) : '[]',
      note: note || null,
      space: (reqSpace === 'mind' ? 'mind' : 'eye'),
    });

    const linkId = result.lastInsertRowid;

    // ── Move to external media storage if the user has configured one ───────────
    // multer always writes to UPLOAD_DIR first (staging); we then move media files
    // (videos + images) to the external path if set. Links from Instagram/Vimeo
    // are downloaded separately via yt-dlp and stay in MEDIA_DIR regardless.
    let finalFilePath = path.join(UPLOAD_DIR, filePath); // default: internal
    const externalStorageSetting = getSetting.get('media_storage_path');
    const externalStorageDir = externalStorageSetting?.value || null;
    if (externalStorageDir) {
      try {
        if (!fs.existsSync(externalStorageDir)) {
          fs.mkdirSync(externalStorageDir, { recursive: true });
        }
        const externalDest = path.join(externalStorageDir, filePath);
        fs.renameSync(finalFilePath, externalDest);
        finalFilePath = externalDest;
        console.log(`📦 Upload moved to external storage: ${externalDest}`);
      } catch (moveErr) {
        console.warn(`⚠️  Could not move upload to external storage (keeping internal): ${moveErr.message}`);
        finalFilePath = path.join(UPLOAD_DIR, filePath); // stay internal on error
      }
    }

    const isVideo = /\.(mp4|mov|webm)$/i.test(originalName);

    // Generate thumbnail for uploaded videos (async, fire-and-forget)
    let thumbName = isImage ? filePath : null;
    if (isVideo) {
      try {
        const generatedThumb = generateVideoThumbnail(finalFilePath);
        if (generatedThumb) {
          thumbName = generatedThumb;
          console.log(`[Upload] 🎬 Video thumbnail generated: ${generatedThumb}`);
        }
      } catch (thumbErr) {
        console.warn(`[Upload] ⚠️  Video thumbnail failed: ${thumbErr.message}`);
      }
    }

    // Save file path + thumbnail
    db.prepare('UPDATE links SET file_path = ?, local_thumbnail = ? WHERE id = ?')
      .run(filePath, thumbName, linkId);

    // AI analysis — images directly, videos via thumbnail frames
    const analyzeTarget = isImage ? finalFilePath : (thumbName ? path.join(THUMB_DIR, thumbName) : null);
    if (analyzeTarget) {
      analyzeContent(analyzeTarget, {
        title: originalName,
        source: 'upload',
      }).then((aiResult) => {
        if (aiResult.tags.length > 0) {
          mergeAITags(linkId, aiResult.tags);
          console.log(`[AI] Tags für Import ${linkId}: ${aiResult.tags.join(', ')}`);
        }
        if (aiResult.description) {
          db.prepare('UPDATE links SET description = ? WHERE id = ?')
            .run(aiResult.description, linkId);
        }
        pushEvent('link-updated', { id: linkId }); // refresh card in UI
      }).catch(err => {
        console.log(`[AI] Analyse fehlgeschlagen für Import ${linkId}: ${err.message}`);
      });
    }

    const newLink = getLinkById.get({ id: linkId });
    res.status(201).json(newLink);
    scheduleSync(); // push to PWA
    pushEvent('link-added', { id: linkId });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: 'Fehler beim Hochladen' });
  }
});

// =============================================
// DOWNLOAD ENDPOINT
// =============================================

// POST /api/links/:id/download – Media von URL herunterladen
router.post('/links/:id/download', async (req, res) => {
  try {
    const link = getLinkById.get({ id: req.params.id });
    if (!link) return res.status(404).json({ error: 'Link nicht gefunden' });

    const installed = await isYtdlpInstalled();
    if (!installed) {
      return res.status(400).json({
        error: 'yt-dlp nicht installiert',
        hint: 'Installiere mit: brew install yt-dlp',
      });
    }

    // Check if already downloaded — only trust disk files if media_path is set in DB.
    // If media_path is null (cache was cleared), always re-download even if orphaned files exist.
    if (link.media_path) {
      const existing = getDownloadedFiles(link.id);
      if (existing.length > 0) {
        const mediaFiles = existing.filter(f => f.type !== 'thumbnail');
        const mainFile = mediaFiles.sort((a, b) => b.size - a.size)[0] || existing[0];

        // Guard: if the main file is < 1 KB it's likely a broken/partial download.
        // Delete and fall through to re-download automatically.
        if (mainFile.size < 1024) {
          console.warn(`[Download] File looks corrupt (${mainFile.size} bytes): ${mainFile.filename} — clearing and re-downloading`);
          existing.forEach(f => { try { fs.unlinkSync(f.filepath); } catch {} });
          db.prepare('UPDATE links SET media_path = NULL, media_type = NULL WHERE id = ?').run(link.id);
          // fall through to fresh download below
        } else {
          return res.json({
            message: 'Bereits heruntergeladen',
            file: mainFile,
            downloadUrl: `/api/files/media/${mainFile.filename}`,
            allFiles: mediaFiles.map(f => ({
              ...f,
              downloadUrl: `/api/files/media/${f.filename}`,
              sizeFormatted: formatSize(f.size),
            })),
          });
        }
      }
    }

    // Download
    const result = await downloadMedia(link.url, link.id);

    // Instagram image-only posts: save as thumbnail only, don't set media_path.
    // The frontend will show the Instagram embed iFrame with built-in carousel.
    const isInstagramImage = link.source === 'instagram' && result.type === 'image';

    if (isInstagramImage) {
      // Save downloaded image as thumbnail for card view
      if (!link.local_thumbnail) {
        try {
          const thumbName = `img_${link.id}_${Date.now()}${path.extname(result.filename)}`;
          const thumbDest = path.join(THUMB_DIR, thumbName);
          fs.copyFileSync(result.filepath, thumbDest);
          db.prepare('UPDATE links SET local_thumbnail = ? WHERE id = ?')
            .run(thumbName, link.id);
          console.log(`[Download] Instagram image saved as thumbnail: ${thumbName}`);
        } catch (copyErr) {
          console.warn(`[Download] Could not save Instagram image as thumbnail: ${copyErr.message}`);
        }
      }
      // Clean up the media file (we only needed it for the thumbnail)
      try { fs.unlinkSync(result.filepath); } catch {}

      // AI analysis on the thumbnail
      const thumbPath = path.join(THUMB_DIR,
        db.prepare('SELECT local_thumbnail FROM links WHERE id = ?').get(link.id)?.local_thumbnail || '');
      if (fs.existsSync(thumbPath)) {
        analyzeContent(thumbPath, {
          title: link.title, description: link.description,
          source: link.source, url: link.url,
        }).then((aiResult) => {
          if (aiResult.tags.length > 0) {
            mergeAITags(link.id, aiResult.tags);
          }
          if (aiResult.description) {
            db.prepare('UPDATE links SET description = ? WHERE id = ?')
              .run(aiResult.description, link.id);
          }
        }).catch(() => {});
      }

      return res.json({
        message: 'Instagram Bilder-Post — Vorschau via Embed',
        type: 'instagram-embed',
      });
    }

    // Update database (videos and non-Instagram images)
    db.prepare('UPDATE links SET media_path = ?, media_type = ? WHERE id = ?')
      .run(result.filename, result.type, link.id);

    // Generate thumbnail from video only if no official thumbnail exists yet
    if (result.type === 'video' && !link.local_thumbnail) {
      const videoThumb = generateVideoThumbnail(result.filepath);
      if (videoThumb) {
        db.prepare('UPDATE links SET local_thumbnail = ? WHERE id = ?')
          .run(videoThumb, link.id);
        console.log(`[Download] Video thumbnail generated (no prior thumbnail): ${videoThumb}`);
      }
    } else if (result.type === 'image') {
      // For non-Instagram image downloads: use the image itself as thumbnail if none exists
      if (!link.local_thumbnail) {
        const thumbFile = result.allFiles?.find(f => f.type === 'thumbnail');
        if (thumbFile) {
          db.prepare('UPDATE links SET local_thumbnail = ? WHERE id = ?')
            .run(thumbFile.filename, link.id);
        } else {
          try {
            const thumbName = `img_${link.id}_${Date.now()}${path.extname(result.filename)}`;
            const thumbDest = path.join(THUMB_DIR, thumbName);
            fs.copyFileSync(result.filepath, thumbDest);
            db.prepare('UPDATE links SET local_thumbnail = ? WHERE id = ?')
              .run(thumbName, link.id);
            console.log(`[Download] Copied image as thumbnail: ${thumbName}`);
          } catch (copyErr) {
            console.warn(`[Download] Could not copy image as thumbnail: ${copyErr.message}`);
          }
        }
      }
    } else if (result.type !== 'video') {
      // Other types: save thumbnail file from yt-dlp if no local thumbnail exists
      const thumbFile = result.allFiles?.find(f => f.type === 'thumbnail');
      if (thumbFile && !link.local_thumbnail) {
        db.prepare('UPDATE links SET local_thumbnail = ? WHERE id = ?')
          .run(thumbFile.filename, link.id);
      }
    }

    // Re-analyze with AI after download (async, non-blocking)
    if (result.type === 'video' || result.type === 'image') {
      // Capture link data immediately — prevents closure bugs if another request
      // comes in before these async callbacks resolve
      const capturedId    = link.id;
      const capturedLink  = { ...link }; // snapshot of link at this moment
      const isMindVideo   = link.space === 'mind' && result.type === 'video' && isWhisperCompatible(result.filepath);

      if (isMindVideo) {
        isWhisperAvailable().then(available => {
          if (!available) {
            console.log(`[Whisper] ⚠️  Not installed — skipping transcription for Mind link ${capturedId}`);
            return analyzeContent(result.filepath, {
              title: capturedLink.title, description: capturedLink.description,
              source: capturedLink.source, url: capturedLink.url,
            });
          }

          console.log(`[Whisper] 🧠 Mind link — transcribing downloaded video ${capturedId}`);
          return transcribeMedia(result.filepath).then(whisperResult => {
            const transcript = whisperResult.transcript || '';

            if (transcript) {
              // Store in hidden `transcript` column — NOT in user-visible note
              db.prepare('UPDATE links SET transcript = ? WHERE id = ?').run(transcript, capturedId);
              console.log(`[Whisper] 💾 Transcript stored (hidden) for link ${capturedId} (${transcript.split(/\s+/).length} words)`);
              generateAndStoreEmbedding(capturedId);
            }

            return analyzeContent(result.filepath, {
              title: capturedLink.title, description: capturedLink.description,
              source: capturedLink.source, url: capturedLink.url,
              note: transcript, // still passed as AI context, never shown in UI
            });
          });
        }).then(aiResult => {
          if (!aiResult) return;
          if (aiResult.tags.length > 0) {
            replaceAITags(capturedId, aiResult.tags);
            console.log(`[AI] Mind video tags für Link ${capturedId}: ${aiResult.tags.join(', ')}`);
          }
          if (aiResult.description) {
            db.prepare('UPDATE links SET description = ? WHERE id = ?').run(aiResult.description, capturedId);
          }
        }).catch(err => {
          console.log(`[Whisper/AI] Fehlgeschlagen für Link ${capturedId}: ${err.message}`);
        });

      } else {
        analyzeContent(result.filepath, {
          title: capturedLink.title,
          description: capturedLink.description,
          source: capturedLink.source,
          url: capturedLink.url,
        }).then((aiResult) => {
          if (aiResult.tags.length > 0) {
            replaceAITags(capturedId, aiResult.tags);
            console.log(`[AI] ${result.type}-Tags für Link ${capturedId}: ${aiResult.tags.join(', ')}`);
          }
          if (aiResult.description) {
            db.prepare('UPDATE links SET description = ? WHERE id = ?')
              .run(aiResult.description, capturedId);
          }
        }).catch(err => {
          console.log(`[AI] Video-Analyse fehlgeschlagen für Link ${capturedId}: ${err.message}`);
        });
      }
    }

    const allMediaFiles = (result.allFiles || []).filter(f => f.type !== 'thumbnail');
    res.json({
      message: 'Download abgeschlossen',
      file: result,
      downloadUrl: `/api/files/media/${result.filename}`,
      allFiles: allMediaFiles.map(f => ({
        ...f,
        downloadUrl: `/api/files/media/${f.filename}`,
        sizeFormatted: formatSize(f.size),
      })),
    });
  } catch (err) {
    console.error('Error downloading media:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/links/:id/files – Heruntergeladene Dateien eines Links
router.get('/links/:id/files', (req, res) => {
  try {
    const files = getDownloadedFiles(req.params.id);
    res.json(files.map(f => ({
      ...f,
      downloadUrl: `/api/files/media/${f.filename}`,
      sizeFormatted: formatSize(f.size),
    })));
  } catch (err) {
    console.error('Error listing files:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Dateien' });
  }
});

// =============================================
// SAVE / UNSAVE MEDIA
// =============================================

// POST /api/links/:id/save – toggle media_saved flag
router.post('/links/:id/save', (req, res) => {
  try {
    const link = getLinkById.get({ id: req.params.id });
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const newValue = link.media_saved ? 0 : 1;
    db.prepare('UPDATE links SET media_saved = ? WHERE id = ?').run(newValue, link.id);
    res.json({ saved: !!newValue });
  } catch (err) {
    console.error('Error toggling save:', err);
    res.status(500).json({ error: 'Failed to toggle save' });
  }
});

// =============================================
// CACHE ENDPOINTS
// =============================================

// DELETE /api/cache – delete downloaded media for UNSAVED links only
router.delete('/cache', (req, res) => {
  try {
    // Get all unsaved link IDs that have media
    const unsaved = db.prepare(
      'SELECT id, media_path FROM links WHERE media_path IS NOT NULL AND (media_saved = 0 OR media_saved IS NULL)'
    ).all();

    let deletedCount = 0;
    for (const link of unsaved) {
      // Delete all files for this link from media dir
      const files = fs.existsSync(MEDIA_DIR)
        ? fs.readdirSync(MEDIA_DIR).filter(f => f.startsWith(`${link.id}_`))
        : [];
      files.forEach(f => {
        try { fs.unlinkSync(path.join(MEDIA_DIR, f)); deletedCount++; } catch {}
      });
    }

    // Reset media_path only for unsaved links
    db.prepare(
      'UPDATE links SET media_path = NULL, media_type = NULL WHERE media_path IS NOT NULL AND (media_saved = 0 OR media_saved IS NULL)'
    ).run();

    const savedCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM links WHERE media_saved = 1 AND media_path IS NOT NULL'
    ).get().cnt;

    res.json({
      message: 'Cache cleared',
      deletedFiles: deletedCount,
      savedKept: savedCount,
    });
  } catch (err) {
    console.error('Error clearing cache:', err);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// DELETE /api/cache/all – delete ALL downloaded media, including saved
router.delete('/cache/all', (req, res) => {
  try {
    let deletedCount = 0;
    if (fs.existsSync(MEDIA_DIR)) {
      const files = fs.readdirSync(MEDIA_DIR);
      files.forEach(f => {
        try { fs.unlinkSync(path.join(MEDIA_DIR, f)); deletedCount++; } catch {}
      });
    }
    db.prepare('UPDATE links SET media_path = NULL, media_type = NULL WHERE media_path IS NOT NULL').run();
    db.prepare('UPDATE links SET media_saved = 0 WHERE media_saved = 1').run();
    res.json({ message: 'All cache cleared', deletedFiles: deletedCount });
  } catch (err) {
    console.error('Error clearing all cache:', err);
    res.status(500).json({ error: 'Failed to clear all cache' });
  }
});

// DELETE /api/links/:id/media – delete all local media files for this link, keep the link
router.delete('/links/:id/media', (req, res) => {
  try {
    const link = getLinkById.get({ id: req.params.id });
    if (!link) return res.status(404).json({ error: 'Link not found' });

    // Delete ALL files in MEDIA_DIR that belong to this link (yt-dlp may create multiple)
    if (fs.existsSync(MEDIA_DIR)) {
      const prefix = `${link.id}_`;
      fs.readdirSync(MEDIA_DIR)
        .filter(f => f.startsWith(prefix))
        .forEach(f => fs.unlinkSync(path.join(MEDIA_DIR, f)));
    }

    db.prepare('UPDATE links SET media_path = NULL, media_type = NULL WHERE id = ?').run(link.id);

    res.json({ message: 'Media deleted', id: link.id });
  } catch (err) {
    console.error('Error clearing media:', err);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

// =============================================
// AI TAGGING ENDPOINT
// =============================================

// POST /api/links/:id/analyze – AI-Analyse manuell triggern
// Returns 202 immediately and runs analysis in background (CLIP can take 30-120s).
router.post('/links/:id/analyze', (req, res) => {
  const link = getLinkById.get({ id: req.params.id });
  if (!link) return res.status(404).json({ error: 'Link nicht gefunden' });

  // Prefer video file for analysis, then local thumbnail, then remote URL
  let imageSource = null;
  if (link.media_path) {
    const videoPath = path.join(MEDIA_DIR, link.media_path);
    if (fs.existsSync(videoPath)) imageSource = videoPath;
  }
  if (!imageSource && link.file_path) {
    imageSource = path.join(UPLOAD_DIR, link.file_path);
  }
  if (!imageSource && link.local_thumbnail) {
    const thumbPath = path.join(THUMB_DIR, link.local_thumbnail);
    if (fs.existsSync(thumbPath)) imageSource = thumbPath;
  }
  if (!imageSource && link.thumbnail_url) {
    imageSource = link.thumbnail_url;
  }
  if (!imageSource) {
    return res.status(400).json({ error: 'Kein Bild/Video zum Analysieren vorhanden' });
  }

  // ── Return immediately — client doesn't need to wait for CLIP/Whisper ──────
  res.status(202).json({ message: 'Re-analyse gestartet' });

  // ── Run everything in background ────────────────────────────────────────────
  const capturedLinkId = link.id;
  const capturedUrl    = link.url;
  const capturedSpace  = link.space;

  setImmediate(async () => {
    try {
      const aiResult = await analyzeContent(imageSource, {
        title: link.title,
        description: link.description,
        source: link.source,
        url: link.url,
        note: link.note,
      });

      if (aiResult) {
        // Re-analyse = fresh start: replace all tags instead of merging.
        // mergeAITags would silently do nothing if 15 tags already exist.
        if (aiResult.tags.length > 0) replaceAITags(capturedLinkId, aiResult.tags);
        if (aiResult.description) {
          db.prepare('UPDATE links SET description = ? WHERE id = ?')
            .run(aiResult.description, capturedLinkId);
        }
      }

      generateAndStoreEmbedding(capturedLinkId);
      pushEvent('link-updated', { id: capturedLinkId });
      console.log(`[Analyze] ✅ Re-analyse abgeschlossen für ${capturedLinkId}`);
    } catch (err) {
      console.error(`[Analyze] ❌ Re-analyse fehlgeschlagen für ${capturedLinkId}:`, err.message);
    }

    // ── For Mind links: also re-run Whisper ───────────────────────────────────
    if (capturedSpace === 'mind' && capturedUrl) {
      try {
        const available = await isWhisperAvailable();
        if (!available) return;

        const transcript = await transcribeFromUrl(capturedUrl, null);
        if (!transcript) return;

        db.prepare('UPDATE links SET transcript = ? WHERE id = ?').run(transcript, capturedLinkId);
        console.log(`[Whisper] 💾 Re-transcription stored for Mind link ${capturedLinkId}`);

        generateAndStoreEmbedding(capturedLinkId);
        pushEvent('link-updated', { id: capturedLinkId });
      } catch (err) {
        console.log(`[Whisper] ⚠️  Re-transcription failed for ${capturedLinkId}: ${err.message}`);
      }
    }
  });
});

// POST /api/backfill-authors – Fetch author URLs for existing links
router.post('/backfill-authors', async (req, res) => {
  const videoSources = ['instagram', 'youtube', 'vimeo', 'tiktok'];
  const links = db.prepare(
    `SELECT id, url, source FROM links WHERE author_url IS NULL AND source IN (${videoSources.map(() => '?').join(',')})`
  ).all(...videoSources);

  console.log(`[Backfill] ${links.length} links without author_url`);

  let updated = 0;
  for (const link of links) {
    try {
      const info = await getMediaInfo(link.url);
      const playlistUser = info.playlist_title
        ? (info.playlist_title.match(/^Post by (.+)$/i) || [])[1] || null
        : null;
      const uploaderName = info.uploader || info.channel || info.uploader_id || info.creator || info.artist || playlistUser || null;
      let authorUrl = info.uploader_url || info.channel_url || null;
      if (!authorUrl && uploaderName && link.url.includes('instagram.com')) {
        authorUrl = `https://www.instagram.com/${uploaderName}/`;
      }
      if (authorUrl) {
        db.prepare('UPDATE links SET author_url = ? WHERE id = ?').run(authorUrl, link.id);
        console.log(`[Backfill] Link ${link.id}: ${authorUrl}`);
        updated++;
      }
    } catch (e) {
      console.log(`[Backfill] Link ${link.id} failed: ${e.message}`);
    }
  }

  res.json({ total: links.length, updated });
});

// =============================================
// REGENERATE VIDEO THUMBNAILS
// =============================================

// POST /api/regenerate-thumbnails – Regenerate thumbnails from downloaded videos
router.post('/regenerate-thumbnails', (req, res) => {
  const links = db.prepare(
    "SELECT id, media_path FROM links WHERE media_type = 'video' AND media_path IS NOT NULL"
  ).all();

  console.log(`[Thumbnails] Regenerating for ${links.length} videos...`);

  let updated = 0;
  for (const link of links) {
    const videoPath = path.join(MEDIA_DIR, link.media_path);
    if (fs.existsSync(videoPath)) {
      const thumb = generateVideoThumbnail(videoPath);
      if (thumb) {
        db.prepare('UPDATE links SET local_thumbnail = ? WHERE id = ?').run(thumb, link.id);
        updated++;
      }
    }
  }

  console.log(`[Thumbnails] Done: ${updated}/${links.length} updated`);
  res.json({ total: links.length, updated });
});

// =============================================
// GIF CREATOR
// =============================================

// GET /api/links/:id/video-info – Get video duration and GIF list
router.get('/links/:id/video-info', (req, res) => {
  try {
    const link = getLinkById.get({ id: req.params.id });
    if (!link) return res.status(404).json({ error: 'Link nicht gefunden' });

    let videoDuration = null;
    let videoPath = null;

    // Check for downloaded video
    if (link.media_path) {
      videoPath = path.join(MEDIA_DIR, link.media_path);
      if (fs.existsSync(videoPath)) {
        try {
          videoDuration = getVideoDuration(videoPath);
        } catch (err) {
          console.error('Error getting video duration:', err.message);
        }
      }
    }

    // Get existing GIFs
    const gifs = getGifsForLink(link.id);

    res.json({
      hasVideo: videoPath && fs.existsSync(videoPath),
      videoDuration,
      gifs,
    });
  } catch (err) {
    console.error('Error getting video info:', err);
    res.status(500).json({ error: 'Fehler beim Abrufen der Video-Informationen' });
  }
});

// POST /api/links/:id/create-gif – Create GIF from video segment
router.post('/links/:id/create-gif', async (req, res) => {
  try {
    const link = getLinkById.get({ id: req.params.id });
    if (!link) return res.status(404).json({ error: 'Link nicht gefunden' });

    const { startTime, endTime, fps = 25, width = 480, colors = 256 } = req.body;

    if (startTime === undefined || endTime === undefined) {
      return res.status(400).json({ error: 'startTime und endTime sind erforderlich' });
    }

    const videoPath = resolveVideoPath(link);
    if (!videoPath || !fs.existsSync(videoPath)) {
      return res.status(400).json({ error: 'Video-Datei nicht gefunden' });
    }

    // Create GIF
    const result = await createGif(videoPath, startTime, endTime, fps, width, colors);

    res.json({
      message: 'GIF erfolgreich erstellt',
      gif: result,
    });
  } catch (err) {
    console.error('Error creating GIF:', err);
    res.status(500).json({ error: err.message || 'Fehler beim Erstellen des GIF' });
  }
});

// DELETE /api/gifs/:filename – Delete a GIF
router.delete('/gifs/:filename', (req, res) => {
  try {
    const { filename } = req.params;

    // Validate filename (only allow alphanumeric and hyphens)
    if (!/^gif-\d+\.gif$/.test(filename)) {
      return res.status(400).json({ error: 'Ungültiger Dateiname' });
    }

    deleteGif(filename);
    res.json({ message: 'GIF gelöscht', filename });
  } catch (err) {
    console.error('Error deleting GIF:', err);
    res.status(500).json({ error: 'Fehler beim Löschen des GIF' });
  }
});

// =============================================
// CLIP EXPORT
// =============================================

// POST /api/links/:id/create-clip – Export MP4 clip from video segment
router.post('/links/:id/create-clip', async (req, res) => {
  try {
    const link = getLinkById.get({ id: req.params.id });
    if (!link) return res.status(404).json({ error: 'Link nicht gefunden' });

    const { startTime, endTime, maxSizeMB } = req.body;

    if (startTime === undefined || endTime === undefined) {
      return res.status(400).json({ error: 'startTime und endTime sind erforderlich' });
    }

    const videoPath = resolveVideoPath(link);
    if (!videoPath || !fs.existsSync(videoPath)) {
      return res.status(400).json({ error: 'Video-Datei nicht gefunden' });
    }

    const options = {};
    if (maxSizeMB) options.maxSizeMB = parseFloat(maxSizeMB);

    const result = await createClip(videoPath, startTime, endTime, options);

    res.json({
      message: 'Clip erfolgreich erstellt',
      clip: result,
    });
  } catch (err) {
    console.error('Error creating clip:', err);
    res.status(500).json({ error: err.message || 'Fehler beim Erstellen des Clips' });
  }
});

// DELETE /api/clips/:filename – Delete a clip
router.delete('/clips/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    if (!/^clip-\d+\.mp4$/.test(filename)) {
      return res.status(400).json({ error: 'Ungültiger Dateiname' });
    }
    deleteClip(filename);
    res.json({ message: 'Clip gelöscht', filename });
  } catch (err) {
    console.error('Error deleting clip:', err);
    res.status(500).json({ error: 'Fehler beim Löschen des Clips' });
  }
});

// =============================================
// STILL GRAB (SCREENSHOT)
// =============================================

// POST /api/links/:id/screenshot – Extract full-res frame from video
router.post('/links/:id/screenshot', async (req, res) => {
  try {
    const link = getLinkById.get({ id: req.params.id });
    if (!link) return res.status(404).json({ error: 'Link nicht gefunden' });

    const { time } = req.body;
    if (time === undefined) {
      return res.status(400).json({ error: 'time ist erforderlich' });
    }

    const videoPath = resolveVideoPath(link);
    if (!videoPath || !fs.existsSync(videoPath)) {
      return res.status(400).json({ error: 'Video-Datei nicht gefunden' });
    }

    const result = await createScreenshot(videoPath, parseFloat(time));

    res.json({
      message: 'Screenshot erstellt',
      screenshot: result,
    });
  } catch (err) {
    console.error('Error creating screenshot:', err);
    res.status(500).json({ error: err.message || 'Fehler beim Erstellen des Screenshots' });
  }
});

// DELETE /api/screenshots/:filename
router.delete('/screenshots/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    if (!/^still-\d+\.png$/.test(filename)) {
      return res.status(400).json({ error: 'Ungültiger Dateiname' });
    }
    deleteScreenshot(filename);
    res.json({ message: 'Screenshot gelöscht', filename });
  } catch (err) {
    console.error('Error deleting screenshot:', err);
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
});

// =============================================
// COLLECTIONS
// =============================================

// GET /api/collections – Alle Collections mit link_count + Thumbnails
router.get('/collections', (req, res) => {
  try {
    const collections = getAllCollections.all();
    // Attach first 4 thumbnails for auto-cover
    const result = collections.map(c => ({
      ...c,
      thumbnails: getCollectionThumbnails.all({ collection_id: c.id }),
    }));
    res.json(result);
  } catch (err) {
    console.error('Error fetching collections:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Collections' });
  }
});

// POST /api/collections – Neue Collection erstellen
router.post('/collections', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }
    const result = createCollection.run({ name: name.trim(), description: description || null });
    const collection = getCollectionById.get({ id: result.lastInsertRowid });
    res.status(201).json(collection);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Eine Collection mit diesem Namen existiert bereits' });
    }
    console.error('Error creating collection:', err);
    res.status(500).json({ error: 'Fehler beim Erstellen der Collection' });
  }
});

// GET /api/collections/:id – Einzelne Collection
router.get('/collections/:id', (req, res) => {
  try {
    const collection = getCollectionById.get({ id: req.params.id });
    if (!collection) return res.status(404).json({ error: 'Collection nicht gefunden' });
    const thumbnails = getCollectionThumbnails.all({ collection_id: collection.id });
    res.json({ ...collection, thumbnails });
  } catch (err) {
    console.error('Error fetching collection:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Collection' });
  }
});

// PATCH /api/collections/:id – Collection aktualisieren
router.patch('/collections/:id', (req, res) => {
  try {
    const collection = getCollectionById.get({ id: req.params.id });
    if (!collection) return res.status(404).json({ error: 'Collection nicht gefunden' });

    const { name, description } = req.body;
    updateCollection.run({
      id: req.params.id,
      name: name !== undefined ? name.trim() : null,
      description: description !== undefined ? description : null,
    });
    const updated = getCollectionById.get({ id: req.params.id });
    res.json(updated);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Eine Collection mit diesem Namen existiert bereits' });
    }
    console.error('Error updating collection:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Collection' });
  }
});

// DELETE /api/collections/:id – Collection löschen
router.delete('/collections/:id', (req, res) => {
  try {
    const collection = getCollectionById.get({ id: req.params.id });
    if (!collection) return res.status(404).json({ error: 'Collection nicht gefunden' });

    deleteCollection.run({ id: req.params.id });
    res.json({ message: 'Collection gelöscht', id: req.params.id });
  } catch (err) {
    console.error('Error deleting collection:', err);
    res.status(500).json({ error: 'Fehler beim Löschen der Collection' });
  }
});

// POST /api/collections/:id/links – Link(s) zur Collection hinzufügen
router.post('/collections/:id/links', (req, res) => {
  try {
    const collection = getCollectionById.get({ id: req.params.id });
    if (!collection) return res.status(404).json({ error: 'Collection nicht gefunden' });

    const { linkId, linkIds } = req.body;
    const ids = linkIds || (linkId ? [linkId] : []);

    if (ids.length === 0) {
      return res.status(400).json({ error: 'linkId oder linkIds ist erforderlich' });
    }

    bulkAddLinksToCollection(parseInt(req.params.id, 10), ids.map(id => parseInt(id, 10)));

    // Update collection timestamp
    db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    const updated = getCollectionById.get({ id: req.params.id });
    res.json({ message: `${ids.length} Link(s) hinzugefügt`, collection: updated });
  } catch (err) {
    console.error('Error adding links to collection:', err);
    res.status(500).json({ error: 'Fehler beim Hinzufügen zur Collection' });
  }
});

// DELETE /api/collections/:id/links/:linkId – Link aus Collection entfernen
router.delete('/collections/:id/links/:linkId', (req, res) => {
  try {
    removeLinkFromCollection.run({
      collection_id: parseInt(req.params.id, 10),
      link_id: parseInt(req.params.linkId, 10),
    });

    db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    res.json({ message: 'Link aus Collection entfernt' });
  } catch (err) {
    console.error('Error removing link from collection:', err);
    res.status(500).json({ error: 'Fehler beim Entfernen aus der Collection' });
  }
});

// PATCH /api/collections/reorder – Reorder collections in the overview
router.patch('/collections/reorder', (req, res) => {
  try {
    const { collectionIds } = req.body;
    if (!Array.isArray(collectionIds) || collectionIds.length === 0) {
      return res.status(400).json({ error: 'collectionIds array is required' });
    }
    const updatePos = db.prepare('UPDATE collections SET sort_position = ? WHERE id = ?');
    const reorder = db.transaction(() => {
      collectionIds.forEach((id, index) => {
        updatePos.run(index, id);
      });
    });
    reorder();
    res.json({ message: 'Collections reordered', count: collectionIds.length });
  } catch (err) {
    console.error('Error reordering collections:', err);
    res.status(500).json({ error: 'Reorder failed' });
  }
});

// PATCH /api/collections/:id/reorder – Reorder links within a collection
router.patch('/collections/:id/reorder', (req, res) => {
  try {
    const collectionId = parseInt(req.params.id, 10);
    const { linkIds } = req.body;
    if (!Array.isArray(linkIds) || linkIds.length === 0) {
      return res.status(400).json({ error: 'linkIds array is required' });
    }

    const updatePos = db.prepare(
      'UPDATE collection_links SET sort_position = ? WHERE collection_id = ? AND link_id = ?'
    );
    const reorder = db.transaction(() => {
      linkIds.forEach((linkId, index) => {
        updatePos.run(index, collectionId, linkId);
      });
    });
    reorder();

    res.json({ message: 'Collection order updated', count: linkIds.length });
  } catch (err) {
    console.error('Error reordering collection:', err);
    res.status(500).json({ error: 'Reorder failed' });
  }
});

// GET /api/links/:id/collections – Collections eines Links
router.get('/links/:id/collections', (req, res) => {
  try {
    const collections = getCollectionsForLink.all({ link_id: parseInt(req.params.id, 10) });
    res.json(collections);
  } catch (err) {
    console.error('Error fetching collections for link:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Collections' });
  }
});

// =============================================
// SOURCES & STATUS
// =============================================

router.get('/sources', (req, res) => {
  try {
    const sources = db.prepare(
      'SELECT source, COUNT(*) as count FROM links GROUP BY source ORDER BY count DESC'
    ).all();
    res.json(sources);
  } catch (err) {
    console.error('Error fetching sources:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Sources' });
  }
});

router.get('/status', async (req, res) => {
  const ytdlp = await isYtdlpInstalled();
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const { total } = countLinks.get();

  res.json({
    version: '1.1.0',
    links: total,
    features: {
      ai_tagging: hasApiKey,
      media_download: ytdlp,
    },
  });
});

// Helper
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// =============================================
// TAG CATALOG ENDPOINT
// =============================================

router.get('/tag-catalog', (req, res) => {
  try {
    const { TAG_CATALOG } = require('./tag-catalog');
    res.json(TAG_CATALOG);
  } catch (err) {
    res.status(500).json({ error: 'Could not load tag catalog' });
  }
});

// =============================================
// SETTINGS ENDPOINTS
// =============================================

// GET /api/settings – get all settings (keys masked for security)
router.get('/settings', (req, res) => {
  try {
    const rows = getAllSettings.all();
    const settings = {};
    const nonSensitiveKeys = ['download_path', 'cloud_backup_path', 'custom_preferred_tags', 'tag_catalog_ratio', 'custom_ai_prompt', 'preferred_ai_provider', 'use_local_clip', 'onboarding_complete'];
    for (const row of rows) {
      if (nonSensitiveKeys.includes(row.key)) {
        // Show full value for non-sensitive settings
        settings[row.key] = row.value || '';
      } else {
        // Mask sensitive values — only show last 6 chars
        if (row.value && row.value.length > 10) {
          settings[row.key] = '••••••' + row.value.slice(-6);
        } else {
          settings[row.key] = row.value ? '••••••' : '';
        }
      }
    }
    // Also indicate if .env fallback is active
    settings._env_telegram = !!process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
    settings._env_ai = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'YOUR_KEY_HERE';
    res.json(settings);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PATCH /api/settings – update a setting
router.patch('/settings', (req, res) => {
  try {
    const { key, value } = req.body;
    const allowed = [
      'telegram_bot_token',
      'anthropic_api_key',
      'openai_api_key',
      'preferred_ai_provider',
      'use_local_clip',
      'download_path',
      'cloud_backup_path',
      'custom_preferred_tags',
      'tag_catalog_ratio',
      'custom_ai_prompt',
      'onboarding_complete'
    ];
    if (!allowed.includes(key)) {
      return res.status(400).json({ error: 'Invalid setting key' });
    }

    // Validate API keys (non-empty if they're API keys)
    if ((key === 'anthropic_api_key' || key === 'openai_api_key') && value && value.length < 10) {
      return res.status(400).json({ error: 'API key too short' });
    }

    setSetting.run({ key, value: value || '' });
    res.json({ message: 'Setting saved', key });
  } catch (err) {
    console.error('Error saving setting:', err);
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

// POST /api/pick-folder – open native macOS folder picker via Finder
router.post('/pick-folder', (req, res) => {
  const { execSync } = require('child_process');
  try {
    const result = execSync(
      `osascript -e 'POSIX path of (choose folder with prompt "Select download folder for MindVault")'`,
      { timeout: 60000, encoding: 'utf-8' }
    ).trim();
    if (result) {
      // Save it as setting
      setSetting.run({ key: 'download_path', value: result });
      res.json({ path: result });
    } else {
      res.status(400).json({ error: 'No folder selected' });
    }
  } catch (err) {
    // User cancelled the dialog
    if (err.message.includes('User canceled') || err.message.includes('-128')) {
      return res.status(400).json({ error: 'cancelled' });
    }
    console.error('Folder picker error:', err.message);
    res.status(500).json({ error: 'Could not open folder picker' });
  }
});

// POST /api/pick-folder/cloud-backup – open folder picker and save as cloud_backup_path
router.post('/pick-folder/cloud-backup', (req, res) => {
  const { execSync } = require('child_process');
  try {
    const result = execSync(
      `osascript -e 'POSIX path of (choose folder with prompt "Select cloud backup folder for MindVault (e.g. your Google Drive folder)")'`,
      { timeout: 60000, encoding: 'utf-8' }
    ).trim();
    if (result) {
      setSetting.run({ key: 'cloud_backup_path', value: result });
      res.json({ path: result });
    } else {
      res.status(400).json({ error: 'No folder selected' });
    }
  } catch (err) {
    if (err.message.includes('User canceled') || err.message.includes('-128')) {
      return res.status(400).json({ error: 'cancelled' });
    }
    console.error('Cloud backup folder picker error:', err.message);
    res.status(500).json({ error: 'Could not open folder picker' });
  }
});

// POST /api/pick-folder/media-storage – open folder picker and save as media_storage_path
router.post('/pick-folder/media-storage', (req, res) => {
  const { execSync } = require('child_process');
  try {
    const result = execSync(
      `osascript -e 'POSIX path of (choose folder with prompt "Select folder for imported media (videos & images) in MindVault")'`,
      { timeout: 60000, encoding: 'utf-8' }
    ).trim();
    if (result) {
      setSetting.run({ key: 'media_storage_path', value: result });
      res.json({ path: result });
    } else {
      res.status(400).json({ error: 'No folder selected' });
    }
  } catch (err) {
    if (err.message.includes('User canceled') || err.message.includes('-128')) {
      return res.status(400).json({ error: 'cancelled' });
    }
    console.error('Media storage folder picker error:', err.message);
    res.status(500).json({ error: 'Could not open folder picker' });
  }
});

// POST /api/open-file/:id – open an imported file in the native OS app (QuickTime, VLC etc.)
// Only works in Electron — sends an IPC message to main process via process.send().
router.post('/open-file/:id', (req, res) => {
  try {
    const link = getLinkById.get({ id: req.params.id });
    if (!link || !link.file_path) return res.status(404).json({ error: 'File not found' });

    const filename = path.basename(link.file_path); // prevent traversal
    // Resolve absolute path: check external storage first, then internal UPLOAD_DIR
    const externalSetting = getSetting.get('media_storage_path');
    let absolutePath = null;
    if (externalSetting?.value) {
      const ext = path.join(externalSetting.value, filename);
      if (fs.existsSync(ext)) absolutePath = ext;
    }
    if (!absolutePath) {
      const internal = path.join(UPLOAD_DIR, filename);
      if (fs.existsSync(internal)) absolutePath = internal;
    }
    if (!absolutePath) return res.status(404).json({ error: 'File not found on disk' });

    // Send to Electron main process which will call shell.openPath()
    if (process.send) {
      process.send({ type: 'open-file', path: absolutePath });
      res.json({ ok: true, path: absolutePath });
    } else {
      // Dev mode without Electron: just return the path
      res.json({ ok: false, path: absolutePath, hint: 'Not running in Electron' });
    }
  } catch (err) {
    console.error('open-file error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/download-file/:type/:filename – stream file to browser with Content-Disposition: attachment
// Chrome shows this as a native download in the download bar. Deletes backend copy after streaming.
router.get('/download-file/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  const safeName = path.basename(filename); // prevent path traversal

  let filePath, contentType;
  if (type === 'gifs')        { filePath = path.join(GIF_DIR,        safeName); contentType = 'image/gif'; }
  else if (type === 'clips')  { filePath = path.join(CLIP_DIR,       safeName); contentType = 'video/mp4'; }
  else if (type === 'screenshots') { filePath = path.join(SCREENSHOT_DIR, safeName); contentType = 'image/jpeg'; }
  else return res.status(400).json({ error: 'Invalid type' });

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const stats = fs.statSync(filePath);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stats.size);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);

  // Delete backend copy once fully streamed — file now lives in Chrome's downloads folder
  stream.on('end', () => {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore if already gone */ }
  });
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).end();
  });
});

// POST /api/save-to-downloads – move a server file to the user's download path (no duplicates)
router.post('/save-to-downloads', (req, res) => {
  try {
    const { sourceUrl, filename } = req.body;
    if (!sourceUrl || !filename) {
      return res.status(400).json({ error: 'sourceUrl and filename required' });
    }

    // Get custom download path from settings, fallback to ~/Downloads
    const setting = getSetting.get('download_path');
    const downloadDir = (setting && setting.value) ? setting.value : path.join(require('os').homedir(), 'Downloads');

    // Resolve the source file from the server's static dirs
    let sourcePath = null;
    if (sourceUrl.includes('/files/gifs/')) {
      sourcePath = path.join(GIF_DIR, path.basename(sourceUrl));
    } else if (sourceUrl.includes('/files/clips/')) {
      sourcePath = path.join(CLIP_DIR, path.basename(sourceUrl));
    } else if (sourceUrl.includes('/files/screenshots/')) {
      sourcePath = path.join(SCREENSHOT_DIR, path.basename(sourceUrl));
    } else if (sourceUrl.includes('/files/media/')) {
      sourcePath = path.join(MEDIA_DIR, path.basename(sourceUrl));
    }

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Source file not found' });
    }

    // Ensure download directory exists
    if (!fs.existsSync(downloadDir)) {
      return res.status(400).json({ error: `Download folder does not exist: ${downloadDir}` });
    }

    // Copy file to download path (avoid overwriting by adding suffix)
    let destPath = path.join(downloadDir, filename);
    if (fs.existsSync(destPath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const timestamp = Date.now();
      destPath = path.join(downloadDir, `${base}_${timestamp}${ext}`);
    }

    fs.copyFileSync(sourcePath, destPath);
    const stats = fs.statSync(destPath);
    console.log(`[Download] Moved to: ${destPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);

    // Remove backend copy — file now lives exclusively in the user's download folder.
    // The frontend removes the item from its list after a successful save.
    fs.unlinkSync(sourcePath);

    res.json({ message: 'Saved', path: destPath, size: stats.size });
  } catch (err) {
    console.error('Error saving to downloads:', err);
    res.status(500).json({ error: 'Failed to save file' });
  }
});

// GET /api/export-html – export library as a self-contained HTML file
router.get('/export-html', async (req, res) => {
  try {
    const links = getAllLinks.all();
    const collections = getAllCollections.all();
    const assignments = db.prepare('SELECT * FROM collection_links').all();

    // Build collection map: linkId → [collection names]
    const collectionMap = {};
    for (const a of assignments) {
      const col = collections.find(c => c.id === a.collection_id);
      if (col) {
        if (!collectionMap[a.link_id]) collectionMap[a.link_id] = [];
        collectionMap[a.link_id].push(col.name);
      }
    }

    // Convert local thumbnails to base64 data URIs — async to avoid blocking event loop
    const thumbBase64 = async (link) => {
      if (link.local_thumbnail) {
        const thumbPath = path.join(THUMB_DIR, link.local_thumbnail);
        try {
          const buf = await fs.promises.readFile(thumbPath);
          const ext = path.extname(link.local_thumbnail).replace('.', '');
          const mime = ext === 'jpg' ? 'jpeg' : (ext || 'jpeg');
          return `data:image/${mime};base64,${buf.toString('base64')}`;
        } catch { /* file missing – fall through to remote URL */ }
      }
      return link.thumbnail_url || null;
    };

    // Resolve all thumbnails concurrently
    const thumbSrcs = await Promise.all(links.map(link => thumbBase64(link)));

    const escHtml = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const sourceIcon = (src) => {
      const icons = { instagram: 'IG', youtube: 'YT', vimeo: 'VM', tiktok: 'TT', twitter: 'TW', pinterest: 'PN', upload: 'UP' };
      return icons[src] || src || '—';
    };

    const formatDate = (d) => {
      if (!d) return '';
      const date = new Date(d);
      return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const linkRows = links.map((link, i) => {
      const thumb = thumbSrcs[i];
      const tags = (() => { try { return JSON.parse(link.tags || '[]'); } catch { return []; } })();
      const cols = collectionMap[link.id] || [];
      return `
        <div class="card" onclick="window.open('${escHtml(link.url)}','_blank')">
          <div class="thumb">${thumb ? `<img src="${escHtml(thumb)}" loading="lazy" alt="" />` : '<div class="no-thumb">No preview</div>'}</div>
          <div class="info">
            <div class="title">${escHtml(link.title) || '<span class="dim">Untitled</span>'}</div>
            <a class="url" href="${escHtml(link.url)}" target="_blank" onclick="event.stopPropagation()">${escHtml(link.url)}</a>
            <div class="meta">
              <span class="source">${sourceIcon(link.source)}</span>
              <span class="date">${formatDate(link.created_at)}</span>
              ${tags.length > 0 ? tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('') : ''}
              ${cols.length > 0 ? cols.map(c => `<span class="col">${escHtml(c)}</span>`).join('') : ''}
            </div>
            ${link.note ? `<div class="note">${escHtml(link.note)}</div>` : ''}
          </div>
        </div>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MindVault Backup — ${new Date().toLocaleDateString('de-DE')}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; padding: 32px; }
  .header { margin-bottom: 32px; display: flex; justify-content: space-between; align-items: baseline; }
  .header h1 { font-size: 22px; font-weight: 600; color: #fff; letter-spacing: -0.3px; }
  .header .stats { font-size: 13px; color: #666; }
  .grid { display: flex; flex-direction: column; gap: 1px; background: #1a1a1a; border-radius: 10px; overflow: hidden; border: 1px solid #222; }
  .card { display: flex; gap: 16px; padding: 14px 16px; background: #111; cursor: pointer; transition: background 0.15s; }
  .card:hover { background: #1a1a1a; }
  .thumb { flex-shrink: 0; width: 80px; height: 56px; border-radius: 6px; overflow: hidden; background: #1a1a1a; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .no-thumb { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #444; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .title { font-size: 14px; font-weight: 500; color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .title .dim { color: #555; font-weight: 400; }
  .url { font-size: 11px; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none; }
  .url:hover { color: #888; text-decoration: underline; }
  .meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 2px; }
  .source { font-size: 10px; font-weight: 700; color: #E8A045; background: rgba(232,160,69,0.12); padding: 1px 6px; border-radius: 3px; letter-spacing: 0.5px; }
  .date { font-size: 11px; color: #555; }
  .tag { font-size: 10px; color: #888; background: #1e1e1e; padding: 1px 6px; border-radius: 3px; }
  .col { font-size: 10px; color: #6aa3e8; background: rgba(106,163,232,0.1); padding: 1px 6px; border-radius: 3px; }
  .note { font-size: 11px; color: #666; font-style: italic; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media (max-width: 600px) { body { padding: 12px; } .thumb { width: 56px; height: 40px; } }
  @media print { body { background: #fff; color: #222; } .card { background: #fff; } .grid { border-color: #ddd; background: #ddd; } .title { color: #111; } .source { color: #b07820; } }
</style>
</head>
<body>
<div class="header">
  <h1>MindVault</h1>
  <span class="stats">${links.length} links &middot; ${collections.length} collections &middot; exported ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
</div>
<div class="grid">
${linkRows}
</div>
</body>
</html>`;

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mindvault-backup-${date}.html"`);
    res.send(html);
  } catch (err) {
    console.error('Error exporting HTML:', err);
    res.status(500).json({ error: 'HTML export failed' });
  }
});

// GET /api/backup – all-in-one backup: HTML gallery with embedded JSON + download button
router.get('/backup', async (req, res) => {
  try {
    const links = getAllLinks.all();
    const collections = getAllCollections.all();
    const assignments = db.prepare('SELECT * FROM collection_links').all();

    const linkColumns = db.prepare('PRAGMA table_info(links)').all().map(c => c.name);
    const collectionColumns = db.prepare('PRAGMA table_info(collections)').all().map(c => c.name);

    // Build JSON export object
    const exportData = {
      version: 2,
      exported_at: new Date().toISOString(),
      schema: { link_fields: linkColumns, collection_fields: collectionColumns },
      links,
      collections,
      collection_links: assignments,
    };

    // Build collection map: linkId → [collection names]
    const collectionMap = {};
    for (const a of assignments) {
      const col = collections.find(c => c.id === a.collection_id);
      if (col) {
        if (!collectionMap[a.link_id]) collectionMap[a.link_id] = [];
        collectionMap[a.link_id].push(col.name);
      }
    }

    // Convert local thumbnails to base64 data URIs — async to avoid blocking event loop
    const thumbBase64 = async (link) => {
      if (link.local_thumbnail) {
        const thumbPath = path.join(THUMB_DIR, link.local_thumbnail);
        try {
          const buf = await fs.promises.readFile(thumbPath);
          const ext = path.extname(link.local_thumbnail).replace('.', '');
          const mime = ext === 'jpg' ? 'jpeg' : (ext || 'jpeg');
          return `data:image/${mime};base64,${buf.toString('base64')}`;
        } catch { /* file missing – fall through to remote URL */ }
      }
      return link.thumbnail_url || null;
    };

    const escHtml = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const sourceIcon = (src) => {
      const icons = { instagram: 'IG', youtube: 'YT', vimeo: 'VM', tiktok: 'TT', twitter: 'TW', pinterest: 'PN', upload: 'UP' };
      return icons[src] || src || '—';
    };

    const formatDate = (d) => {
      if (!d) return '';
      return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    // Resolve all thumbnails concurrently — async to avoid blocking the event loop
    const thumbSrcs = await Promise.all(links.map(link => thumbBase64(link)));

    const linkRows = links.map((link, i) => {
      const thumb = thumbSrcs[i];
      const tags = (() => { try { return JSON.parse(link.tags || '[]'); } catch { return []; } })();
      const cols = collectionMap[link.id] || [];
      return `
        <div class="card" onclick="window.open('${escHtml(link.url)}','_blank')">
          <div class="thumb">${thumb ? `<img src="${escHtml(thumb)}" loading="lazy" alt="" />` : '<div class="no-thumb">No preview</div>'}</div>
          <div class="info">
            <div class="title">${escHtml(link.title) || '<span class="dim">Untitled</span>'}</div>
            <a class="url" href="${escHtml(link.url)}" target="_blank" onclick="event.stopPropagation()">${escHtml(link.url)}</a>
            <div class="meta">
              <span class="source">${sourceIcon(link.source)}</span>
              <span class="date">${formatDate(link.created_at)}</span>
              ${tags.length > 0 ? tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('') : ''}
              ${cols.length > 0 ? cols.map(c => `<span class="col">${escHtml(c)}</span>`).join('') : ''}
            </div>
            ${link.note ? `<div class="note">${escHtml(link.note)}</div>` : ''}
          </div>
        </div>`;
    }).join('\n');

    const date = new Date().toISOString().slice(0, 10);
    const jsonFilename = `mindvault-backup-${date}.json`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MindVault Backup — ${new Date().toLocaleDateString('de-DE')}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; padding: 32px; }
  .header { margin-bottom: 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
  .header-left h1 { font-size: 22px; font-weight: 600; color: #fff; letter-spacing: -0.3px; }
  .header-left .stats { font-size: 13px; color: #555; margin-top: 3px; }
  .header-actions { display: flex; gap: 8px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 7px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: background 0.15s; }
  .btn-primary { background: #E8A045; color: #000; }
  .btn-primary:hover { background: #d4913a; }
  .grid { display: flex; flex-direction: column; gap: 1px; background: #1a1a1a; border-radius: 10px; overflow: hidden; border: 1px solid #222; }
  .card { display: flex; gap: 16px; padding: 14px 16px; background: #111; cursor: pointer; transition: background 0.15s; }
  .card:hover { background: #1a1a1a; }
  .thumb { flex-shrink: 0; width: 80px; height: 56px; border-radius: 6px; overflow: hidden; background: #1a1a1a; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .no-thumb { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #444; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .title { font-size: 14px; font-weight: 500; color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .title .dim { color: #555; font-weight: 400; }
  .url { font-size: 11px; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none; }
  .url:hover { color: #888; text-decoration: underline; }
  .meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 2px; }
  .source { font-size: 10px; font-weight: 700; color: #E8A045; background: rgba(232,160,69,0.12); padding: 1px 6px; border-radius: 3px; letter-spacing: 0.5px; }
  .date { font-size: 11px; color: #555; }
  .tag { font-size: 10px; color: #888; background: #1e1e1e; padding: 1px 6px; border-radius: 3px; }
  .col { font-size: 10px; color: #6aa3e8; background: rgba(106,163,232,0.1); padding: 1px 6px; border-radius: 3px; }
  .note { font-size: 11px; color: #666; font-style: italic; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media (max-width: 600px) { body { padding: 12px; } .thumb { width: 56px; height: 40px; } .header { flex-direction: column; align-items: flex-start; } }
  @media print { body { background: #fff; color: #222; } .card { background: #fff; } .grid { border-color: #ddd; background: #ddd; } .title { color: #111; } .source { color: #b07820; } .btn { display: none; } }
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    <h1>MindVault Backup</h1>
    <div class="stats">${links.length} links &middot; ${collections.length} collections &middot; ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
  </div>
  <div class="header-actions">
    <button class="btn btn-primary" onclick="downloadJSON()">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download JSON
    </button>
  </div>
</div>
<div class="grid">
${linkRows}
</div>
<script id="backup-data" type="application/json">${JSON.stringify(exportData)}</script>
<script>
  function downloadJSON() {
    var data = document.getElementById('backup-data').textContent;
    var blob = new Blob([data], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '${jsonFilename}';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mindvault-backup-${date}.html"`);
    res.send(html);
  } catch (err) {
    console.error('Error generating backup:', err);
    res.status(500).json({ error: 'Backup failed' });
  }
});

// Current export schema version — increment when DB structure changes
const EXPORT_VERSION = 2;

// GET /api/export – export entire library as JSON (links + collections + assignments + embedded thumbnails)
router.get('/export', async (req, res) => {
  try {
    const links = getAllLinks.all();
    const collections = getAllCollections.all();
    const assignments = db.prepare('SELECT * FROM collection_links').all();

    // Capture current column names so future imports know what fields existed
    const linkColumns = db.prepare("PRAGMA table_info(links)").all().map(c => c.name);
    const collectionColumns = db.prepare("PRAGMA table_info(collections)").all().map(c => c.name);

    // Embed thumbnail images as base64 so the export is fully self-contained.
    // On import, these are saved back as files — no re-downloading needed.
    const linksWithThumbs = await Promise.all(links.map(async (link) => {
      if (!link.local_thumbnail) return link;
      try {
        const thumbPath = path.join(THUMB_DIR, link.local_thumbnail);
        const buf = await fs.promises.readFile(thumbPath);
        const ext = path.extname(link.local_thumbnail).slice(1).toLowerCase() || 'jpg';
        const mime = ext === 'jpg' ? 'jpeg' : ext;
        return { ...link, thumbnail_data: `data:image/${mime};base64,${buf.toString('base64')}` };
      } catch {
        return link; // thumbnail file missing — skip silently
      }
    }));

    // Export non-sensitive settings (tag config, paths) — API keys are never exported
    const EXPORTABLE_SETTINGS = ['custom_preferred_tags', 'tag_catalog_ratio', 'custom_ai_prompt', 'download_path', 'cloud_backup_path'];
    const settingsRows = db.prepare(
      `SELECT key, value FROM settings WHERE key IN (${EXPORTABLE_SETTINGS.map(() => '?').join(',')})`
    ).all(...EXPORTABLE_SETTINGS);
    const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));

    const exportData = {
      version: EXPORT_VERSION,
      exported_at: new Date().toISOString(),
      schema: {
        link_fields: linkColumns,
        collection_fields: collectionColumns,
      },
      settings,
      links: linksWithThumbs,
      collections,
      collection_links: assignments,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="mindvault-backup-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(exportData);
  } catch (err) {
    console.error('Error exporting:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

/**
 * Normalize a link from any export version to current format.
 * Future migrations go here (e.g. renamed fields, changed formats).
 */
function migrateLink(link) {
  const migrated = { ...link };
  // Ensure tags is always a JSON string
  if (Array.isArray(migrated.tags)) {
    migrated.tags = JSON.stringify(migrated.tags);
  }
  return migrated;
}

// POST /api/import – import library from JSON backup (version-aware)
router.post('/import', (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.links || !Array.isArray(data.links)) {
      return res.status(400).json({ error: 'Invalid backup file' });
    }

    const importVersion = data.version || 1;
    console.log(`[Import] Processing backup v${importVersion} with ${data.links.length} links`);

    let imported = 0;
    let skipped = 0;
    let collectionsImported = 0;
    let thumbsRestored = 0;

    // Step 1: Save embedded thumbnail images to disk before the DB transaction.
    // Exports include thumbnail_data (base64) so imports are fully self-contained.
    const resolvedThumbnails = {}; // url → local filename
    for (const link of data.links) {
      if (!link.thumbnail_data || !link.local_thumbnail) continue;
      try {
        const match = link.thumbnail_data.match(/^data:image\/[\w+]+;base64,(.+)$/s);
        if (!match) continue;
        const buf = Buffer.from(match[1], 'base64');
        const filename = link.local_thumbnail;
        const destPath = path.join(THUMB_DIR, filename);
        if (!fs.existsSync(destPath)) {
          fs.writeFileSync(destPath, buf);
          thumbsRestored++;
        }
        resolvedThumbnails[link.url] = filename;
      } catch (e) {
        console.warn(`[Import] Could not restore thumbnail for ${link.url}:`, e.message);
      }
    }
    if (thumbsRestored > 0) console.log(`[Import] Restored ${thumbsRestored} thumbnail(s) from backup`);

    // Step 2: Insert links — include local_thumbnail so cards show immediately
    const insertOrIgnore = db.prepare(`
      INSERT OR IGNORE INTO links (url, source, title, description, thumbnail_url, local_thumbnail, tags, note, created_at, updated_at, author_url, space, media_path, media_type, media_saved, file_path)
      VALUES (@url, @source, @title, @description, @thumbnail_url, @local_thumbnail, @tags, @note, @created_at, @updated_at, @author_url, COALESCE(@space, 'eye'), @media_path, @media_type, @media_saved, @file_path)
    `);

    const importTransaction = db.transaction(() => {
      const idMap = {};

      for (const rawLink of data.links) {
        const link = migrateLink(rawLink);
        if (!link.url) { skipped++; continue; }

        const localThumb = resolvedThumbnails[link.url] || link.local_thumbnail || null;

        const result = insertOrIgnore.run({
          url: link.url,
          source: link.source || 'web',
          title: link.title || null,
          description: link.description || null,
          thumbnail_url: link.thumbnail_url || null,
          local_thumbnail: localThumb,
          tags: link.tags || '[]',
          note: link.note || null,
          created_at: link.created_at || new Date().toISOString(),
          updated_at: link.updated_at || new Date().toISOString(),
          author_url: link.author_url || null,
          space: link.space || 'eye',
          media_path: link.media_path || null,
          media_type: link.media_type || null,
          media_saved: link.media_saved || 0,
          file_path: link.file_path || null,
        });

        if (result.changes > 0) {
          idMap[rawLink.id] = result.lastInsertRowid;
          imported++;
        } else {
          const existing = db.prepare('SELECT id FROM links WHERE url = ?').get(link.url);
          if (existing) idMap[rawLink.id] = existing.id;
          skipped++;
        }
      }

      // Import collections
      const collectionIdMap = {};
      if (data.collections && Array.isArray(data.collections)) {
        const insertCollection = db.prepare(`
          INSERT OR IGNORE INTO collections (name, description, created_at, updated_at)
          VALUES (@name, @description, @created_at, @updated_at)
        `);

        for (const col of data.collections) {
          const result = insertCollection.run({
            name: col.name,
            description: col.description || null,
            created_at: col.created_at || new Date().toISOString(),
            updated_at: col.updated_at || new Date().toISOString(),
          });
          if (result.changes > 0) {
            collectionIdMap[col.id] = result.lastInsertRowid;
            collectionsImported++;
          } else {
            const existing = db.prepare('SELECT id FROM collections WHERE name = ?').get(col.name);
            if (existing) collectionIdMap[col.id] = existing.id;
          }
        }

        // Import collection-link assignments
        if (data.collection_links && Array.isArray(data.collection_links)) {
          const insertAssignment = db.prepare(
            'INSERT OR IGNORE INTO collection_links (collection_id, link_id) VALUES (@collection_id, @link_id)'
          );
          for (const cl of data.collection_links) {
            const newColId = collectionIdMap[cl.collection_id];
            const newLinkId = idMap[cl.link_id];
            if (newColId && newLinkId) {
              insertAssignment.run({ collection_id: newColId, link_id: newLinkId });
            }
          }
        }
      }
    });

    importTransaction();

    // Restore non-sensitive settings from backup (only if not already set)
    const IMPORTABLE_SETTINGS = ['custom_preferred_tags', 'tag_catalog_ratio', 'custom_ai_prompt', 'download_path', 'cloud_backup_path'];
    if (data.settings && typeof data.settings === 'object') {
      const upsertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)');
      let settingsRestored = 0;
      for (const key of IMPORTABLE_SETTINGS) {
        if (data.settings[key] !== undefined && data.settings[key] !== null && data.settings[key] !== '') {
          upsertSetting.run({ key, value: String(data.settings[key]) });
          settingsRestored++;
        }
      }
      if (settingsRestored > 0) console.log(`[Import] Restored ${settingsRestored} setting(s) from backup`);
    }

    // Re-download thumbnails in background
    setImmediate(async () => {
      try {
        const linksNeedingThumbs = db.prepare(
          'SELECT id, thumbnail_url FROM links WHERE local_thumbnail IS NULL AND thumbnail_url IS NOT NULL'
        ).all();
        for (const link of linksNeedingThumbs) {
          try {
            const localThumb = await downloadThumbnail(link.thumbnail_url);
            if (localThumb) {
              db.prepare('UPDATE links SET local_thumbnail = ? WHERE id = ?').run(localThumb, link.id);
            }
          } catch {}
        }
        console.log(`[Import] Thumbnail download complete for ${linksNeedingThumbs.length} links`);
      } catch (err) {
        console.error('[Import] Thumbnail download error:', err);
      }
    });

    res.json({
      message: 'Import complete',
      imported,
      skipped,
      collections: collectionsImported,
    });
  } catch (err) {
    console.error('Error importing:', err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

// === Mobile PWA Share ===


// POST /api/share — receives URL shared from mobile PWA (Web Share Target)
router.post('/share', async (req, res) => {
  const { url, title, text } = req.body;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  try {
    // Fetch metadata (same pipeline as manual link add)
    let metadata = {};
    try {
      metadata = await fetchSmartMetadata(url);
    } catch (e) {
      console.warn('⚠️  Metadata fetch failed for shared URL:', e.message);
    }

    const linkTitle = title || metadata.title || url;
    const linkDesc  = metadata.description || text || '';
    const source    = detectSource(url);
    const now       = new Date().toISOString();

    // Insert link into DB
    const result = insertLink.run({
      url,
      title:         linkTitle,
      description:   linkDesc,
      thumbnail_url: metadata.thumbnail_url || null,
      source:        source || 'mobile-share',
      tags:          JSON.stringify(['mobile-share']),
      note:          null,
    });

    const linkId = result.lastInsertRowid;
    console.log(`📱 Mobile share received: [${linkId}] ${url}`);

    // Trigger AI tagging in background (non-blocking)
    setImmediate(async () => {
      try {
        const link = { id: linkId, url, title: linkTitle, description: linkDesc };
        const tags = await analyzeContent(link);
        if (tags && tags.length > 0) {
          updateLink.run({ tags: JSON.stringify(tags), id: linkId });
          console.log(`🏷️  Mobile share tagged [${linkId}]: ${tags.join(', ')}`);
        }
      } catch (e) {
        console.warn('⚠️  Auto-tag failed for mobile share:', e.message);
      }
    });

    res.json({ success: true, id: linkId, title: linkTitle });

  } catch (err) {
    console.error('❌ Mobile share error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/repair-thumbnails
// Scans all links, finds missing local thumbnails, re-downloads them.
router.post('/repair-thumbnails', async (req, res) => {
  try {
    const fs   = require('fs');
    const path = require('path');
    const allLinks = getAllLinks.all();
    const updateThumb = db.prepare('UPDATE links SET local_thumbnail = ? WHERE id = ?');

    const results = { checked: 0, missing: 0, fixed: 0, failed: 0, details: [] };

    for (const link of allLinks) {
      results.checked++;

      // Check if local thumbnail file exists on disk
      const hasFile = link.local_thumbnail &&
        fs.existsSync(path.join(THUMB_DIR, link.local_thumbnail));

      if (hasFile) continue; // all good

      results.missing++;
      const fallbackUrl = link.thumbnail_url;

      if (!fallbackUrl || !fallbackUrl.startsWith('http')) {
        results.failed++;
        results.details.push({ id: link.id, url: link.url, status: 'no_fallback' });
        continue;
      }

      try {
        let newFile = await downloadThumbnail(fallbackUrl);

        // If URL download failed (e.g. expired Instagram CDN URL),
        // try generating thumbnail from downloaded media file
        if (!newFile && link.media_path) {
          const localMedia = path.join(MEDIA_DIR, link.media_path);
          if (fs.existsSync(localMedia)) {
            const ext = path.extname(localMedia).toLowerCase();
            if (['.mp4', '.webm', '.mov', '.mkv', '.avi'].includes(ext)) {
              console.log(`[Repair] URL expired, generating thumbnail from local video: ${link.media_path}`);
              newFile = generateVideoThumbnail(localMedia);
            } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
              console.log(`[Repair] URL expired, using local image as thumbnail: ${link.media_path}`);
              const hash = require('crypto').createHash('md5').update(localMedia).digest('hex');
              const thumbName = `${hash}.jpg`;
              const thumbPath = path.join(THUMB_DIR, thumbName);
              try {
                fs.copyFileSync(localMedia, thumbPath);
                newFile = thumbName;
              } catch {}
            }
          }
        }

        // Last resort: try yt-dlp to re-fetch a fresh thumbnail URL
        if (!newFile && link.url && (link.url.includes('instagram.com') || link.url.includes('youtube.com') || link.url.includes('vimeo.com'))) {
          try {
            console.log(`[Repair] Trying yt-dlp thumbnail extraction for: ${link.url}`);
            const { execSync } = require('child_process');
            const ytdlpPath = process.env.BUNDLED_BIN_PATH
              ? path.join(process.env.BUNDLED_BIN_PATH, 'yt-dlp')
              : 'yt-dlp';
            const thumbUrl = execSync(
              `"${ytdlpPath}" --get-thumbnail "${link.url}" 2>/dev/null`,
              { encoding: 'utf-8', timeout: 15000 }
            ).trim();
            if (thumbUrl && thumbUrl.startsWith('http')) {
              newFile = await downloadThumbnail(thumbUrl);
            }
          } catch {}
        }

        if (newFile) {
          updateThumb.run(newFile, link.id);
          results.fixed++;
          results.details.push({ id: link.id, url: link.url, status: 'fixed', file: newFile });
          console.log(`[Repair] Repaired thumbnail [${link.id}]: ${link.url}`);
        } else {
          results.failed++;
          results.details.push({ id: link.id, url: link.url, status: 'download_failed' });
        }
      } catch (err) {
        results.failed++;
        results.details.push({ id: link.id, url: link.url, status: 'error', error: err.message });
      }
    }

    // Re-sync library cache so PWA gets updated thumbnails too
    if (results.fixed > 0) {
      try { await require('./library-sync').sync(); } catch (_) {}
    }

    console.log(`🔧 Thumbnail repair: ${results.fixed} fixed, ${results.failed} failed of ${results.missing} missing`);
    res.json(results);

  } catch (err) {
    console.error('❌ Repair error:', err.message);
    res.status(500).json({ error: err.message });
  }
});



// POST /api/sync-now — force immediate library sync + return result
router.post('/sync-now', async (req, res) => {
  try {
    await librarySync.sync();
    res.json({ ok: true, message: 'Sync triggered' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/ai-status
// Returns current AI provider health — used by frontend to show warning banner.
router.get('/ai-status', (req, res) => {
  res.json(getAIStatus());
});

// GET /api/clip-status
// Checks if Python + CLIP are installed and ready for local tagging.
router.get('/clip-status', async (req, res) => {
  try {
    const available = await checkClipAvailable();
    res.json({ available, message: available ? 'CLIP ready' : 'CLIP not installed — run setup-clip.sh' });
  } catch (err) {
    res.json({ available: false, message: err.message });
  }
});

// GET /api/clip-debug
// Full diagnostic: checks every step of the CLIP pipeline and reports exactly what fails.
router.get('/clip-debug', async (req, res) => {
  const { execFile } = require('child_process');
  const os = require('os');
  const report = {};

  // 1. DB settings
  try {
    const provider = getSetting.get('preferred_ai_provider');
    const legacyClip = getSetting.get('use_local_clip');
    report.preferred_ai_provider = provider?.value || '(not set)';
    report.use_local_clip = legacyClip?.value || '(not set)';
    report.clip_enabled = provider?.value === 'local_clip' || legacyClip?.value === 'true';
  } catch (e) {
    report.settings_error = e.message;
  }

  // 2. Python path resolution (same order as ai.js / embeddings.js / whisper.js)
  const candidates = [
    // Bundled python-standalone (primary — works in dev and DMG)
    path.join(__dirname, '..', 'python-standalone', 'bin', 'python3'),
    // Legacy clip-env (older builds)
    path.join(__dirname, '..', 'clip-env', 'bin', 'python3'),
    path.join(os.homedir(), 'Library', 'Application Support', 'mindvault', 'clip-env', 'bin', 'python3'),
    // DATA_PATH sibling (edge case)
    process.env.DATA_PATH ? path.join(process.env.DATA_PATH, '..', 'python-standalone', 'bin', 'python3') : null,
    // System Python fallback
    '/opt/homebrew/bin/python3',
  ].filter(Boolean);
  report.python_candidates = candidates.map(p => ({ path: p, exists: require('fs').existsSync(p) }));
  const pythonCmd = candidates.find(p => require('fs').existsSync(p)) || 'python3';
  report.python_resolved = pythonCmd;

  // 3. Can Python run at all?
  await new Promise(resolve => {
    execFile(pythonCmd, ['--version'], { timeout: 5000 }, (err, stdout, stderr) => {
      report.python_version = err ? `ERROR: ${err.message}` : (stdout || stderr).trim();
      resolve();
    });
  });

  // 4. Is 'clip' importable?
  await new Promise(resolve => {
    execFile(pythonCmd, ['-c', 'import clip; print("clip ok")'], { timeout: 10000 }, (err, stdout) => {
      report.clip_import = err ? `FAIL: ${err.message}` : stdout.trim();
      resolve();
    });
  });

  // 5. Is 'torch' importable?
  await new Promise(resolve => {
    execFile(pythonCmd, ['-c', 'import torch; print(torch.__version__)'], { timeout: 10000 }, (err, stdout) => {
      report.torch_version = err ? `FAIL: ${err.message}` : stdout.trim();
      resolve();
    });
  });

  // 6. Check a recent thumbnail exists
  try {
    const thumbDir = require('./thumbnails').THUMB_DIR;
    const files = require('fs').readdirSync(thumbDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    report.thumbnails_dir = thumbDir;
    report.thumbnail_count = files.length;
    report.latest_thumbnail = files.length > 0
      ? path.join(thumbDir, files.sort().slice(-1)[0])
      : null;
  } catch (e) {
    report.thumbnails_error = e.message;
  }

  // 7. Try running clip_tagger.py on the latest thumbnail (if any)
  if (report.latest_thumbnail && report.clip_import === 'clip ok') {
    const { getAllTags } = require('./tag-catalog');
    const input = JSON.stringify({ imagePaths: [report.latest_thumbnail], tags: getAllTags(), topK: 5, threshold: 0.001 });
    const scriptPath = path.join(__dirname, 'clip_tagger.py');
    await new Promise(resolve => {
      execFile(pythonCmd, [scriptPath, input], { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) {
          report.clip_tagger_result = `ERROR: ${err.message}`;
          if (stderr) report.clip_tagger_stderr = stderr.substring(0, 300);
        } else {
          try {
            report.clip_tagger_result = JSON.parse(stdout.trim());
          } catch {
            report.clip_tagger_result = `BAD JSON: ${stdout.substring(0, 200)}`;
          }
        }
        resolve();
      });
    });
  } else if (!report.latest_thumbnail) {
    report.clip_tagger_result = 'SKIPPED — no thumbnail found to test with';
  }

  res.json(report);
});

// GET /api/whisper-debug
// Diagnostic endpoint: checks if Whisper is available and functional.
router.get('/whisper-debug', async (req, res) => {
  const { execFile } = require('child_process');
  const os = require('os');
  const report = {};

  // 1. Python path resolution (same as whisper.js)
  const candidates = [
    path.join(__dirname, '..', 'python-standalone', 'bin', 'python3'),
    process.env.DATA_PATH ? path.join(process.env.DATA_PATH, '..', 'python-standalone', 'bin', 'python3') : null,
    path.join(__dirname, '..', 'clip-env', 'bin', 'python3'),
    '/opt/homebrew/bin/python3',
  ].filter(Boolean);
  const pythonCmd = candidates.find(p => require('fs').existsSync(p)) || 'python3';
  report.python_resolved = pythonCmd;

  // 2. Can whisper be imported?
  await new Promise(resolve => {
    execFile(pythonCmd, ['-c', 'import whisper; print(f"whisper {whisper.__version__}")'], { timeout: 15000 }, (err, stdout) => {
      report.whisper_import = err ? `FAIL: ${err.message}` : stdout.trim();
      resolve();
    });
  });

  // 3. Can torch be used with MPS?
  await new Promise(resolve => {
    execFile(pythonCmd, ['-c', 'import torch; print(f"torch {torch.__version__}, mps={torch.backends.mps.is_available()}")'], { timeout: 10000 }, (err, stdout) => {
      report.torch_mps = err ? `FAIL: ${err.message}` : stdout.trim();
      resolve();
    });
  });

  // 4. Check whisper_transcriber.py exists
  const scriptPath = path.join(__dirname, 'whisper_transcriber.py');
  report.transcriber_script = fs.existsSync(scriptPath) ? 'exists' : 'MISSING';

  // 5. Check ffmpeg available (needed for whisper audio extraction)
  await new Promise(resolve => {
    execFile('ffmpeg', ['-version'], { timeout: 5000 }, (err, stdout) => {
      report.ffmpeg = err ? `FAIL: ${err.message}` : stdout.split('\n')[0];
      resolve();
    });
  });

  // 6. Quick test: transcribe a short silent segment if a media file exists
  try {
    const mediaDir = MEDIA_DIR;
    if (fs.existsSync(mediaDir)) {
      const videos = fs.readdirSync(mediaDir).filter(f => /\.(mp4|webm|mov)$/i.test(f));
      report.media_dir = mediaDir;
      report.video_count = videos.length;
      report.sample_video = videos.length > 0 ? videos[0] : null;
    }
  } catch (e) {
    report.media_error = e.message;
  }

  res.json(report);
});

// Global Express error handler — catches errors thrown/rejected in any route
// (Express 4 doesn't auto-handle async rejections, so this is the safety net)
router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('⚠️  Route error:', err.message, err.stack);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
