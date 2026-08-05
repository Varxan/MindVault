const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fetch = require('node-fetch');

/**
 * Detect which browser's cookies yt-dlp can use on this machine.
 * Returns e.g. ['--cookies-from-browser', 'firefox'] or [] if none found.
 *
 * Why: python-build-standalone ships without a cookie database.
 * `--cookies-from-browser` requires that the browser's profile folder exists
 * on the CURRENT USER's machine. On a fresh Mac account it doesn't, which
 * causes yt-dlp to abort with "could not find … cookies database".
 * We check before adding the flag so downloads work on any account.
 */
function getCookieArgs() {
  const home = os.homedir();
  const candidates = [
    { browser: 'firefox', path: path.join(home, 'Library', 'Application Support', 'Firefox', 'Profiles') },
    { browser: 'chrome',  path: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default') },
    { browser: 'chromium',path: path.join(home, 'Library', 'Application Support', 'Chromium', 'Default') },
  ];
  for (const { browser, path: p } of candidates) {
    try {
      if (fs.existsSync(p)) return ['--cookies-from-browser', browser];
    } catch {}
  }
  return []; // no supported browser found — proceed without cookies
}

const DEV_DATA_ROOT = path.join(os.homedir(), 'Library', 'Application Support', 'mindvault', 'data');
const DATA_ROOT = process.env.DATA_PATH || DEV_DATA_ROOT;
const MEDIA_DIR = path.join(DATA_ROOT, 'media'); // default (internal) location

// Ensure default media directory exists
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

/**
 * Returns the active media cache directory.
 * If the user has configured a custom path via Settings → media_cache_path,
 * that folder is used for new downloads. Falls back to the internal MEDIA_DIR.
 */
function getMediaCacheDir() {
  try {
    const { getSetting } = require('./database');
    const setting = getSetting.get('media_cache_path');
    if (setting?.value && fs.existsSync(setting.value)) {
      return setting.value;
    }
  } catch {}
  return MEDIA_DIR;
}

/**
 * User-writable yt-dlp copy — lives OUTSIDE the signed .app bundle so it can
 * self-update via `yt-dlp -U`. The bundled binary inside the app is read-only
 * and frozen at build time, which means its extractors break as platforms
 * change their APIs (e.g. Vimeo killed anonymous OAuth in July 2026 → 401).
 * Keeping an auto-updating copy in Application Support fixes this permanently.
 */
const USER_BIN_DIR   = path.join(DATA_ROOT, 'bin');
const USER_YTDLP     = path.join(USER_BIN_DIR, 'yt-dlp');

/**
 * Resolve the full path to yt-dlp.
 * Priority: user-writable auto-updating copy → bundled binary → system installs.
 */
function findYtdlp() {
  // Bundled binary path set by Electron via BUNDLED_BIN_PATH env var
  const bundledBin = process.env.BUNDLED_BIN_PATH
    ? path.join(process.env.BUNDLED_BIN_PATH, 'yt-dlp')
    : null;

  // ── Seed the user-writable copy from the bundled binary (one-time) ─────────
  // The copy in Application Support can self-update via -U; the bundled one can't.
  try {
    if (bundledBin && fs.existsSync(bundledBin) && !fs.existsSync(USER_YTDLP)) {
      fs.mkdirSync(USER_BIN_DIR, { recursive: true });
      fs.copyFileSync(bundledBin, USER_YTDLP);
      fs.chmodSync(USER_YTDLP, 0o755);
      console.log(`[yt-dlp] Seeded user-writable copy: ${USER_YTDLP}`);
    }
  } catch (e) {
    console.warn(`[yt-dlp] Could not seed user copy: ${e.message}`);
  }

  const candidates = [
    USER_YTDLP,                      // auto-updating user copy (highest priority)
    bundledBin,                      // bundled inside the .app (frozen at build time)
    'yt-dlp',                        // PATH (works in dev + if PATH is set)
    '/opt/homebrew/bin/yt-dlp',      // Homebrew on Apple Silicon
    '/usr/local/bin/yt-dlp',         // Homebrew on Intel
    '/usr/bin/yt-dlp',               // system install
    path.join(os.homedir(), '.local/bin/yt-dlp'), // pip --user install
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (p === 'yt-dlp') return p;  // let the OS resolve it
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return 'yt-dlp'; // fallback — will show a useful error if not found
}

const YTDLP = findYtdlp();

/**
 * Self-update yt-dlp via its built-in updater (`yt-dlp -U`).
 * Only possible for the user-writable copy — the bundled binary inside the
 * signed .app is read-only. Runs non-blocking; downloads the latest stable
 * release from GitHub and atomically replaces the binary in place.
 *
 * Why this matters: platform extractors (Vimeo, Instagram, TikTok…) break
 * regularly when sites change their APIs. yt-dlp ships fixes within days —
 * but only users running a current version get them. Without this, every
 * site breakage would require a full MindVault release.
 */
function updateYtdlp() {
  return new Promise((resolve) => {
    // Only the user copy is writable/updatable
    if (YTDLP !== USER_YTDLP) {
      console.log(`[yt-dlp] Skipping self-update (not using user-writable copy: ${YTDLP})`);
      return resolve(false);
    }
    console.log('[yt-dlp] Checking for updates…');
    execFile(YTDLP, ['-U'], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        console.warn(`[yt-dlp] Self-update failed: ${err.message}`);
        if (stderr) console.warn(`[yt-dlp] stderr: ${stderr.substring(0, 300)}`);
        return resolve(false);
      }
      const out = (stdout || '').trim().split('\n').pop() || '';
      console.log(`[yt-dlp] ${out}`);
      resolve(true);
    });
  });
}

/**
 * Start the periodic updater: check on startup (delayed so app boot isn't
 * slowed) and then every 24h while the app is running.
 */
let _updateTimer = null;
function startYtdlpAutoUpdate() {
  if (_updateTimer) return;
  // First check 30s after startup — network and app are settled by then
  setTimeout(() => { updateYtdlp(); }, 30_000);
  _updateTimer = setInterval(() => { updateYtdlp(); }, 24 * 60 * 60 * 1000);
}

/**
 * Check if yt-dlp is installed
 */
function isYtdlpInstalled() {
  return new Promise((resolve) => {
    execFile(YTDLP, ['--version'], (err) => {
      resolve(!err);
    });
  });
}

/**
 * Get info about a URL without downloading.
 * Handles carousels/playlists (multiple JSON lines) by parsing the first entry.
 * Uses Firefox cookies for authenticated platforms (Instagram etc.)
 */
function getMediaInfo(url) {
  // Clean Instagram URLs: remove img_index, igsh params
  let cleanUrl = url;
  if (url.includes('instagram.com')) {
    try {
      const u = new URL(url);
      u.searchParams.delete('img_index');
      u.searchParams.delete('igsh');
      cleanUrl = u.toString();
    } catch (e) { /* keep original */ }
  }

  return new Promise((resolve, reject) => {
    execFile(YTDLP, [
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--playlist-items', '1',
      ...getCookieArgs(),
      '--sleep-requests', '1',
      cleanUrl,
    ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      try {
        const firstLine = stdout.trim().split('\n')[0];
        const info = JSON.parse(firstLine);

        // Build author_url from available fields
        const uploaderName = info.uploader || info.channel || info.uploader_id || null;
        if (!info.uploader_url) {
          if (uploaderName && url.includes('instagram.com')) {
            info.uploader_url = `https://www.instagram.com/${uploaderName}/`;
          } else if (info.channel_url) {
            info.uploader_url = info.channel_url;
          }
        }

        // Fix generic carousel titles (e.g. "Video 1", "Photo 2")
        if (url.includes('instagram.com') && info.title) {
          const isGeneric = /^(Video|Photo|Reel|Image)\s*\d*$/i.test(info.title.trim());
          if (isGeneric && uploaderName) {
            info.title = uploaderName;
          }
        }

        resolve(info);
      } catch (e) {
        reject(new Error('Could not parse media info'));
      }
    });
  });
}

/**
 * Probe a URL with yt-dlp to get JSON info for all items (carousel support)
 */
function probeUrl(cleanUrl) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, [
      '--dump-json', '--no-download', '--no-warnings',
      ...getCookieArgs(),
      cleanUrl,
    ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      try {
        const lines = stdout.trim().split('\n');
        const entries = lines.map(line => JSON.parse(line));
        resolve(entries);
      } catch (e) { reject(e); }
    });
  });
}

/**
 * Extract Instagram shortcode from URL
 */
function extractInstagramShortcode(url) {
  const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[2] : null;
}

/**
 * Download single Instagram image via /media/?size=l endpoint.
 * Used as fallback when yt-dlp fails (image-only posts).
 * For carousel posts, only the first image is downloaded as thumbnail —
 * the full carousel is shown via Instagram's embed iFrame in the frontend.
 */
async function downloadInstagramImage(shortcode, linkId) {
  const mediaUrl = `https://www.instagram.com/p/${shortcode}/media/?size=l`;
  console.log(`[Download] Instagram /media/ fallback: ${mediaUrl}`);

  const res = await fetch(mediaUrl, {
    redirect: 'manual',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    timeout: 15000,
  });

  let imageUrl;
  if (res.status >= 300 && res.status < 400) {
    imageUrl = res.headers.get('location');
    console.log(`[Download] Instagram redirect → ${imageUrl ? imageUrl.substring(0, 80) + '...' : 'NONE'}`);
  } else if (res.ok) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('image')) {
      // Direct image response (no redirect)
      const buffer = await res.buffer();
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
      const filename = `${linkId}_instagram_${shortcode}.${ext}`;
      const filepath = path.join(getMediaCacheDir(), filename);
      fs.writeFileSync(filepath, buffer);
      console.log(`[Download] Instagram direct image: ${filename} (${(buffer.length / 1024).toFixed(0)}KB)`);
      return {
        filename, filepath, type: 'image', size: buffer.length,
        allFiles: [{ filename, filepath, size: buffer.length, type: 'image' }],
      };
    }
  }

  if (!imageUrl) {
    throw new Error('Instagram /media/ endpoint returned no image URL');
  }

  const filename = `${linkId}_instagram_${shortcode}.jpg`;
  const filepath = path.join(getMediaCacheDir(), filename);
  const size = await downloadImageDirect(imageUrl, filepath);
  console.log(`[Download] Instagram image downloaded: ${filename} (${(size / 1024).toFixed(0)}KB)`);

  return {
    filename, filepath, type: 'image', size,
    allFiles: [{ filename, filepath, size, type: 'image' }],
  };
}

/**
 * Download an image directly from a URL using fetch
 */
async function downloadImageDirect(imageUrl, destPath) {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
    timeout: 30000,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const buffer = await response.buffer();
  fs.writeFileSync(destPath, buffer);
  return buffer.length;
}

/**
 * Download media (video or photo) from URL
 * Returns: { filename, filepath, type }
 */
function downloadMedia(url, linkId) {
  return new Promise(async (resolve, reject) => {
    const installed = await isYtdlpInstalled();
    if (!installed) {
      return reject(new Error('yt-dlp nicht installiert. Installiere mit: brew install yt-dlp'));
    }

    // Clean Instagram URLs: remove img_index, igsh params
    let cleanUrl = url;
    const isInstagram = url.includes('instagram.com');
    if (isInstagram) {
      try {
        const u = new URL(url);
        u.searchParams.delete('img_index');
        u.searchParams.delete('igsh');
        cleanUrl = u.toString();
      } catch (e) { /* keep original */ }
    }

    // For Instagram carousels: include playlist index in filename
    const outputTemplate = isInstagram
      ? path.join(getMediaCacheDir(), `${linkId}_%(title).30s_%(playlist_index|0)s.%(ext)s`)
      : path.join(getMediaCacheDir(), `${linkId}_%(title).30s.%(ext)s`);

    // Probe to check what this URL contains
    let probeEntries = [];
    let isImagePost = false;
    try {
      probeEntries = await probeUrl(cleanUrl);
      if (probeEntries.length > 0) {
        const first = probeEntries[0];
        const imgExts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

        // Check if first entry is an image
        if (imgExts.includes((first.ext || '').toLowerCase())) {
          isImagePost = true;
        }

        // Also check: if no video formats are available
        if (!isImagePost && first.formats) {
          const hasVideo = first.formats.some(f => f.vcodec && f.vcodec !== 'none');
          if (!hasVideo) isImagePost = true;
        }

        // Check all entries: if ALL are images, it's an image post
        if (!isImagePost) {
          const allImages = probeEntries.every(entry => {
            return imgExts.includes((entry.ext || '').toLowerCase());
          });
          if (allImages) isImagePost = true;
        }
      }
    } catch (probeErr) {
      console.log(`[Download] Probe failed: ${probeErr.message}`);

      // ─── Instagram fallback: use /media/?size=l when yt-dlp returns nothing ───
      if (isInstagram) {
        const shortcode = extractInstagramShortcode(cleanUrl);
        if (shortcode) {
          try {
            console.log(`[Download] yt-dlp failed for Instagram — trying /media/?size=l fallback`);
            const result = await downloadInstagramImage(shortcode, linkId);
            return resolve(result);
          } catch (igErr) {
            console.log(`[Download] Instagram /media/ fallback also failed: ${igErr.message}`);
          }
        }
      }
      // If not Instagram or fallback failed, continue to yt-dlp download
    }

    // ─── IMAGE POST: Download images directly via URL ───
    if (isImagePost && probeEntries.length > 0) {
      console.log(`[Download] Image post detected (${probeEntries.length} image(s)) — downloading directly`);

      try {
        const files = [];

        for (let i = 0; i < probeEntries.length; i++) {
          const entry = probeEntries[i];
          // Get the best image URL
          let imageUrl = entry.url;

          // For some platforms, the URL might be in a different field
          if (!imageUrl && entry.formats && entry.formats.length > 0) {
            // Pick the largest format
            const sorted = [...entry.formats].sort((a, b) => (b.filesize || 0) - (a.filesize || 0));
            imageUrl = sorted[0].url;
          }

          if (!imageUrl) {
            console.log(`[Download] No image URL found for entry ${i + 1}, skipping`);
            continue;
          }

          const ext = (entry.ext || 'jpg').toLowerCase();
          const safeName = (entry.title || 'image').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
          const filename = `${linkId}_${safeName}_${i}.${ext}`;
          const filepath = path.join(getMediaCacheDir(), filename);

          try {
            const size = await downloadImageDirect(imageUrl, filepath);
            console.log(`[Download] Image ${i + 1}/${probeEntries.length}: ${filename} (${(size / 1024).toFixed(0)}KB)`);

            files.push({
              filename,
              filepath,
              size,
              type: 'image',
            });
          } catch (imgErr) {
            console.warn(`[Download] Failed to download image ${i + 1}: ${imgErr.message}`);
          }
        }

        if (files.length === 0) {
          return reject(new Error('Keine Bilder heruntergeladen — URLs möglicherweise abgelaufen'));
        }

        // Return the first/largest file as main
        const mainFile = files.sort((a, b) => b.size - a.size)[0];

        console.log(`[Download] Done: ${files.length} image(s) downloaded`);

        return resolve({
          filename: mainFile.filename,
          filepath: mainFile.filepath,
          type: 'image',
          size: mainFile.size,
          allFiles: files,
        });
      } catch (imgDownloadErr) {
        console.error(`[Download] Direct image download failed: ${imgDownloadErr.message}`);
        return reject(new Error(`Bilder-Download fehlgeschlagen: ${imgDownloadErr.message}`));
      }
    }

    // ─── Instagram image fallback: if probe returned entries but no images were downloaded ───
    if (isInstagram && probeEntries.length === 0) {
      const shortcode = extractInstagramShortcode(cleanUrl);
      if (shortcode) {
        try {
          console.log(`[Download] No probe entries for Instagram — trying /media/?size=l fallback`);
          const result = await downloadInstagramImage(shortcode, linkId);
          return resolve(result);
        } catch (igErr) {
          console.log(`[Download] Instagram /media/ fallback failed: ${igErr.message}`);
          // Fall through to video download as last resort
        }
      }
    }

    // ─── VIDEO POST: Use yt-dlp to download ───
    const args = [
      cleanUrl,
      '-o', outputTemplate,
      '--no-warnings',
      '--restrict-filenames',
      ...getCookieArgs(),
      // Best quality video+audio, max 1080p
      '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      '--merge-output-format', 'mp4',
      // Also write thumbnail
      '--write-thumbnail',
      '--convert-thumbnails', 'jpg',
    ];

    if (isInstagram) {
      // Rate-limit Instagram: 2 seconds between requests + max 10 items
      args.push('--sleep-requests', '2');
      args.push('--sleep-interval', '1');
      args.push('--max-sleep-interval', '3');
      args.push('--playlist-items', '1:10');
    } else {
      args.push('--no-playlist');
    }

    console.log(`[Download] Starting video download: ${url}`);

    const proc = spawn(YTDLP, args, { timeout: 300000 });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[Download] Failed (code ${code}):`, stderr);
        return reject(new Error(`Download fehlgeschlagen: ${stderr.substring(0, 200)}`));
      }

      // Find the downloaded file(s)
      const matchingFiles = fs.readdirSync(MEDIA_DIR)
        .filter(f => f.startsWith(`${linkId}_`));
      const files = matchingFiles.map(f => ({
          filename: f,
          filepath: path.join(MEDIA_DIR, f),
          size: fs.statSync(path.join(MEDIA_DIR, f)).size,
          type: guessMediaType(f, matchingFiles),
        }));

      if (files.length === 0) {
        return reject(new Error('Keine Datei heruntergeladen'));
      }

      // Return the main media file (largest non-thumbnail)
      const mediaFile = files
        .filter(f => f.type !== 'thumbnail')
        .sort((a, b) => b.size - a.size)[0] || files[0];

      console.log(`[Download] Done: ${mediaFile.filename} (${(mediaFile.size / 1024 / 1024).toFixed(1)}MB)`);

      resolve({
        filename: mediaFile.filename,
        filepath: mediaFile.filepath,
        type: mediaFile.type,
        size: mediaFile.size,
        allFiles: files,
      });
    });
  });
}

/**
 * Guess media type from filename
 * When called with allFiles, .jpg files are detected as thumbnails
 * if a video file with the same prefix exists (yt-dlp pattern).
 */
function guessMediaType(filename, allFiles) {
  const ext = path.extname(filename).toLowerCase();
  const videoExts = ['.mp4', '.webm', '.mkv', '.avi', '.mov'];
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

  if (videoExts.includes(ext)) return 'video';
  if (filename.includes('.thumb') || filename.includes('_thumbnail')) return 'thumbnail';

  // If it's an image and there's a video with the same prefix, it's a yt-dlp thumbnail
  if (imageExts.includes(ext) && allFiles) {
    const baseName = path.basename(filename, ext);
    const hasVideo = allFiles.some(f => {
      const fExt = path.extname(f).toLowerCase();
      return videoExts.includes(fExt) && f.startsWith(baseName.split('.')[0]);
    });
    if (hasVideo) return 'thumbnail';
  }

  if (imageExts.includes(ext)) return 'image';
  return 'other';
}

/**
 * List downloaded files for a link
 */
function getDownloadedFiles(linkId) {
  if (!fs.existsSync(MEDIA_DIR)) return [];

  const matchingFiles = fs.readdirSync(MEDIA_DIR)
    .filter(f => f.startsWith(`${linkId}_`));
  return matchingFiles.map(f => ({
      filename: f,
      filepath: path.join(MEDIA_DIR, f),
      size: fs.statSync(path.join(MEDIA_DIR, f)).size,
      type: guessMediaType(f, matchingFiles),
    }));
}

module.exports = {
  isYtdlpInstalled,
  getMediaInfo,
  downloadMedia,
  getDownloadedFiles,
  MEDIA_DIR,
  getMediaCacheDir,
  YTDLP,
  getCookieArgs,
  updateYtdlp,
  startYtdlpAutoUpdate,
};
