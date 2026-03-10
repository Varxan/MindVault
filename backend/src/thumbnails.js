const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const DATA_ROOT = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
const THUMB_DIR = path.join(DATA_ROOT, 'thumbnails');

// Resolve ffmpeg — bundled binary takes priority over system install
function findFfmpeg() {
  if (process.env.BUNDLED_BIN_PATH) {
    const bundled = path.join(process.env.BUNDLED_BIN_PATH, 'ffmpeg');
    if (fs.existsSync(bundled)) return bundled;
  }
  if (fs.existsSync('/opt/homebrew/bin/ffmpeg')) return '/opt/homebrew/bin/ffmpeg';
  if (fs.existsSync('/usr/local/bin/ffmpeg')) return '/usr/local/bin/ffmpeg';
  return 'ffmpeg';
}
const FFMPEG = findFfmpeg();

// Ensure thumbnail directory exists
if (!fs.existsSync(THUMB_DIR)) {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
}

/**
 * Download a thumbnail from URL and save locally
 * Returns local filename or null
 */
async function downloadThumbnail(imageUrl) {
  if (!imageUrl) return null;

  try {
    // Generate unique filename from URL
    const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
    const ext = guessExtension(imageUrl);
    const filename = `${hash}${ext}`;
    const filepath = path.join(THUMB_DIR, filename);

    // Skip if already downloaded
    if (fs.existsSync(filepath)) {
      return filename;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/*,*/*',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`[Thumb] Download failed (${response.status}): ${imageUrl}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      console.log(`[Thumb] Not an image (${contentType}): ${imageUrl}`);
      return null;
    }

    const buffer = await response.buffer();

    // Don't save tiny images (likely tracking pixels)
    if (buffer.length < 1000) {
      return null;
    }

    fs.writeFileSync(filepath, buffer);
    console.log(`[Thumb] Saved: ${filename} (${(buffer.length / 1024).toFixed(1)}KB)`);

    return filename;
  } catch (err) {
    console.log(`[Thumb] Error: ${err.message}`);
    return null;
  }
}

/**
 * Guess file extension from URL
 */
function guessExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.png')) return '.png';
    if (pathname.endsWith('.gif')) return '.gif';
    if (pathname.endsWith('.webp')) return '.webp';
    if (pathname.endsWith('.svg')) return '.svg';
  } catch {}
  return '.jpg';
}

/**
 * Generate a thumbnail from a video file using ffmpeg.
 * Extracts a frame at 25% of the video duration for a representative image.
 * Returns local filename or null.
 */
function generateVideoThumbnail(videoPath) {
  try {
    const { execSync } = require('child_process');

    // Get video duration
    const durationStr = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf-8' }
    ).trim();
    const duration = parseFloat(durationStr) || 0;
    const seekTo = Math.max(0, duration * 0.25); // 25% into the video

    const hash = require('crypto').createHash('md5').update(videoPath + '-vthumb').digest('hex');
    const filename = `${hash}.jpg`;
    const filepath = path.join(THUMB_DIR, filename);

    // Extract a single frame
    try {
      execSync(
        `"${FFMPEG}" -y -ss ${seekTo} -i "${videoPath}" -vframes 1 -q:v 2 "${filepath}"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );
    } catch (e) {
      console.log(`[Thumb] ffmpeg error: ${e.stderr || e.message}`);
      return null;
    }

    if (fs.existsSync(filepath) && fs.statSync(filepath).size > 500) {
      console.log(`[Thumb] Video thumbnail generated: ${filename}`);
      return filename;
    }

    return null;
  } catch (err) {
    console.log(`[Thumb] Video thumbnail error: ${err.message}`);
    return null;
  }
}

/**
 * Get the local path for a thumbnail filename
 */
function getThumbnailPath(filename) {
  return path.join(THUMB_DIR, filename);
}

module.exports = { downloadThumbnail, generateVideoThumbnail, getThumbnailPath, THUMB_DIR };
