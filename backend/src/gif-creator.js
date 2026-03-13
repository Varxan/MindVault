const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { MEDIA_DIR } = require('./downloader');

const os = require('os');
const DEV_DATA_ROOT = path.join(os.homedir(), 'Library', 'Application Support', 'mindvault', 'data');
const DATA_ROOT = process.env.DATA_PATH || DEV_DATA_ROOT;
const GIF_DIR = path.join(DATA_ROOT, 'gifs');

// Resolve ffmpeg/ffprobe — bundled binary takes priority over system install
function findBin(name) {
  if (process.env.BUNDLED_BIN_PATH) {
    const bundled = path.join(process.env.BUNDLED_BIN_PATH, name);
    if (fs.existsSync(bundled)) return bundled;
  }
  // Homebrew fallbacks
  const homebrew = `/opt/homebrew/bin/${name}`;
  if (fs.existsSync(homebrew)) return homebrew;
  const homebrewIntel = `/usr/local/bin/${name}`;
  if (fs.existsSync(homebrewIntel)) return homebrewIntel;
  return name; // rely on PATH
}

const FFMPEG  = findBin('ffmpeg');
const FFPROBE = findBin('ffprobe');

// Ensure GIF directory exists
if (!fs.existsSync(GIF_DIR)) {
  fs.mkdirSync(GIF_DIR, { recursive: true });
}

/**
 * Create a GIF from a video segment
 * @param {string} videoPath - Full path to video file
 * @param {number} startTime - Start time in seconds
 * @param {number} endTime - End time in seconds
 * @param {number} fps - Frames per second (default 25)
 * @param {number} width - Output width (default 480, -1 for original)
 * @returns {Promise<{filename, filepath, gifUrl}>}
 */
async function createGif(videoPath, startTime, endTime, fps = 25, width = 480, colors = 256) {
  try {
    // Validate input
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const duration = endTime - startTime;
    if (duration <= 0) {
      throw new Error('End time must be greater than start time');
    }

    if (duration > 120) {
      throw new Error('GIF duration cannot exceed 120 seconds');
    }

    // Clamp colors to valid range
    const maxColors = Math.max(8, Math.min(256, colors));

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `gif-${timestamp}.gif`;
    const filepath = path.join(GIF_DIR, filename);

    console.log(`[GIF Creator] Creating GIF: ${filename}`);
    console.log(`  - Video: ${videoPath}`);
    console.log(`  - Duration: ${startTime}s to ${endTime}s (${duration}s)`);
    console.log(`  - FPS: ${fps}, Width: ${width}, Colors: ${maxColors}`);

    // Build ffmpeg command
    // Step 1: Extract frames from video segment
    const paletteFile = path.join(GIF_DIR, `palette-${timestamp}.png`);

    // Generate palette for better quality GIFs (colors control compression)
    const paletteCmd = `"${FFMPEG}" -y -ss ${startTime} -t ${duration} -i "${videoPath}" -vf "fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=max_colors=${maxColors}" "${paletteFile}"`;

    console.log(`[GIF Creator] Generating palette (${maxColors} colors)...`);
    try {
      execSync(paletteCmd, { encoding: 'utf-8', stdio: 'pipe' });
    } catch (e) {
      throw new Error(`ffmpeg palette error: ${e.stderr || e.message}`);
    }

    // Generate GIF using palette
    const gifCmd = `"${FFMPEG}" -y -ss ${startTime} -t ${duration} -i "${videoPath}" -i "${paletteFile}" -lavfi "fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a" "${filepath}"`;

    console.log(`[GIF Creator] Generating GIF...`);
    try {
      execSync(gifCmd, { encoding: 'utf-8', stdio: 'pipe' });
    } catch (e) {
      throw new Error(`ffmpeg gif error: ${e.stderr || e.message}`);
    }

    // Clean up palette file
    if (fs.existsSync(paletteFile)) {
      fs.unlinkSync(paletteFile);
    }

    // Check if GIF was created
    if (!fs.existsSync(filepath)) {
      throw new Error('GIF creation failed - file was not created');
    }

    const stats = fs.statSync(filepath);
    console.log(`[GIF Creator] ✅ GIF created successfully: ${filename} (${formatSize(stats.size)})`);

    return {
      filename,
      filepath,
      gifUrl: `/api/files/gifs/${filename}`,
      size: stats.size,
      duration,
    };
  } catch (err) {
    console.error('[GIF Creator] Error:', err.message);
    throw err;
  }
}

/**
 * Get duration of a video file in seconds
 * @param {string} videoPath - Full path to video file
 * @returns {number} Duration in seconds
 */
function getVideoDuration(videoPath) {
  try {
    const cmd = `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
    const output = execSync(cmd, { encoding: 'utf-8' }).trim();
    return parseFloat(output);
  } catch (err) {
    console.error('Error getting video duration:', err.message);
    throw new Error('Could not determine video duration');
  }
}

/**
 * Get all GIFs for a link
 * @param {number} linkId - Link ID
 * @returns {Array} List of GIF files
 */
function getGifsForLink(linkId) {
  const prefix = `gif-link${linkId}-`;
  const files = fs.readdirSync(GIF_DIR).filter(f => f.startsWith(prefix));
  return files.map(f => ({
    filename: f,
    filepath: path.join(GIF_DIR, f),
    gifUrl: `/api/files/gifs/${f}`,
    size: fs.statSync(path.join(GIF_DIR, f)).size,
  }));
}

/**
 * Delete a GIF file
 * @param {string} filename - GIF filename
 */
function deleteGif(filename) {
  const filepath = path.join(GIF_DIR, filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    console.log(`[GIF Creator] Deleted: ${filename}`);
  }
}

/**
 * Format file size for display
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Still Grab (Screenshot) ──

const SCREENSHOT_DIR = path.join(DATA_ROOT, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * Extract a single frame from a video at max resolution as PNG
 * @param {string} videoPath - Full path to video file
 * @param {number} time - Time in seconds
 * @returns {Promise<{filename, filepath, url, size}>}
 */
async function createScreenshot(videoPath, time) {
  try {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const timestamp = Date.now();
    const filename = `still-${timestamp}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);

    console.log(`[Still Grab] Extracting frame at ${time}s from ${videoPath}`);

    // Extract single frame at native resolution, no scaling
    const cmd = `${FFMPEG} -y -ss ${time} -i "${videoPath}" -frames:v 1 -q:v 1 "${filepath}" 2>/dev/null`;
    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', timeout: 30000 });

    if (!fs.existsSync(filepath)) {
      throw new Error('Screenshot failed - file was not created');
    }

    const stats = fs.statSync(filepath);
    console.log(`[Still Grab] ✅ Frame saved: ${filename} (${formatSize(stats.size)})`);

    return {
      filename,
      filepath,
      url: `/files/screenshots/${filename}`,
      size: stats.size,
    };
  } catch (err) {
    console.error('[Still Grab] Error:', err.message);
    throw err;
  }
}

/**
 * Delete a screenshot file
 */
function deleteScreenshot(filename) {
  const filepath = path.join(SCREENSHOT_DIR, filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    console.log(`[Still Grab] Deleted: ${filename}`);
  }
}

// ── MP4 Clip Export ──

const CLIP_DIR = path.join(DATA_ROOT, 'clips');

if (!fs.existsSync(CLIP_DIR)) {
  fs.mkdirSync(CLIP_DIR, { recursive: true });
}

/**
 * Export a segment of a video as MP4
 * @param {string} videoPath - Full path to video file
 * @param {number} startTime - Start time in seconds
 * @param {number} endTime - End time in seconds
 * @returns {Promise<{filename, filepath, clipUrl, size, duration}>}
 */
async function createClip(videoPath, startTime, endTime, options = {}) {
  try {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const duration = endTime - startTime;
    if (duration <= 0) {
      throw new Error('End time must be greater than start time');
    }

    const timestamp = Date.now();
    const filename = `clip-${timestamp}.mp4`;
    const filepath = path.join(CLIP_DIR, filename);
    const maxSizeBytes = options.maxSizeMB ? options.maxSizeMB * 1024 * 1024 : null;

    console.log(`[Clip Export] Creating clip: ${filename}`);
    console.log(`  - Video: ${videoPath}`);
    console.log(`  - Duration: ${startTime}s to ${endTime}s (${duration}s)`);
    if (maxSizeBytes) console.log(`  - Max size: ${options.maxSizeMB} MB`);

    let cmd;

    if (maxSizeBytes) {
      // Calculate target bitrate to fit under maxSize
      // Reserve 128kbps for audio, rest for video
      const audioBitrate = 128; // kbps
      const totalBitsAvailable = maxSizeBytes * 8; // bits
      const audioBitsUsed = audioBitrate * 1000 * duration;
      const videoBitsAvailable = totalBitsAvailable - audioBitsUsed;
      const videoBitrateKbps = Math.floor(videoBitsAvailable / duration / 1000);

      if (videoBitrateKbps < 100) {
        throw new Error(`Clip ist zu lang für ${options.maxSizeMB} MB – bitte einen kürzeren Ausschnitt wählen`);
      }

      console.log(`  - Target video bitrate: ${videoBitrateKbps}k (audio: ${audioBitrate}k)`);

      // Two-pass would be ideal but single-pass with constrained bitrate is faster
      cmd = `"${FFMPEG}" -y -ss ${startTime} -t ${duration} -i "${videoPath}" -c:v libx264 -preset slow -b:v ${videoBitrateKbps}k -maxrate ${videoBitrateKbps}k -bufsize ${Math.floor(videoBitrateKbps * 2)}k -c:a aac -b:a ${audioBitrate}k -movflags +faststart "${filepath}"`;
    } else {
      // Default quality-based encoding
      cmd = `"${FFMPEG}" -y -ss ${startTime} -t ${duration} -i "${videoPath}" -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -movflags +faststart "${filepath}"`;
    }

    try {
      execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', timeout: 300000 });
    } catch (e) {
      throw new Error(`ffmpeg clip error: ${e.stderr || e.message}`);
    }

    if (!fs.existsSync(filepath)) {
      throw new Error('Clip creation failed - file was not created');
    }

    const stats = fs.statSync(filepath);
    console.log(`[Clip Export] ✅ Clip created: ${filename} (${formatSize(stats.size)})`);

    // Safety check: if compression was requested and file is still too large, warn
    if (maxSizeBytes && stats.size > maxSizeBytes) {
      console.warn(`[Clip Export] ⚠️ File is ${formatSize(stats.size)}, exceeds target ${options.maxSizeMB} MB`);
    }

    return {
      filename,
      filepath,
      clipUrl: `/files/clips/${filename}`,
      size: stats.size,
      duration,
      compressed: !!maxSizeBytes,
    };
  } catch (err) {
    console.error('[Clip Export] Error:', err.message);
    throw err;
  }
}

/**
 * Delete a clip file
 */
function deleteClip(filename) {
  const filepath = path.join(CLIP_DIR, filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    console.log(`[Clip Export] Deleted: ${filename}`);
  }
}

module.exports = {
  createGif,
  createClip,
  createScreenshot,
  getVideoDuration,
  getGifsForLink,
  deleteGif,
  deleteClip,
  deleteScreenshot,
  GIF_DIR,
  CLIP_DIR,
  SCREENSHOT_DIR,
  formatSize,
};
