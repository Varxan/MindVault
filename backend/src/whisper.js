/**
 * MindVault Whisper Integration
 * Node.js wrapper for whisper_transcriber.py
 *
 * Transcribes audio/video files using OpenAI Whisper (local, offline, MIT license).
 * Uses the same clip-env Python venv as CLIP — Whisper must be installed there
 * via setup-whisper.sh.
 *
 * Usage:
 *   const { transcribeMedia, isWhisperAvailable } = require('./whisper');
 *   const result = await transcribeMedia(videoPath);
 *   // result: { transcript, language, duration, segments }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { getSetting } = require('./database');
// Reuse downloader's yt-dlp path resolution (includes BUNDLED_BIN_PATH for the .app)
// and cookie detection (needed for Instagram audio extraction)
const { YTDLP, getCookieArgs } = require('./downloader');

// ─── Path Whitelist ───────────────────────────────────────────────────────────
// Prevent Whisper from transcribing files outside MindVault's own directories.
const _devDataRoot  = path.join(os.homedir(), 'Library', 'Application Support', 'mindvault', 'data');
const _ALLOWED_BASE = process.env.DATA_PATH || _devDataRoot;

function isAllowedPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const resolved = path.resolve(filePath);
  const allowedDirs = [
    path.resolve(_ALLOWED_BASE),
    path.resolve(os.tmpdir()),
  ];
  const externalSetting = getSetting.get('media_storage_path');
  if (externalSetting?.value) allowedDirs.push(path.resolve(externalSetting.value));
  return allowedDirs.some(dir => resolved.startsWith(dir + path.sep) || resolved === dir);
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Python resolution (same logic as CLIP in ai.js) ──────────────────────────
// Reuses the clip-env venv where both CLIP and Whisper are installed.
function getWhisperPython() {
  const os = require('os');

  const candidates = [
    // 1. Standalone Python — portable, no venv issues, works on any Mac
    path.join(__dirname, '..', 'python-standalone', 'bin', 'python3'),
    // 2. DATA_PATH sibling (set by Electron)
    process.env.DATA_PATH
      ? path.join(process.env.DATA_PATH, '..', 'python-standalone', 'bin', 'python3')
      : null,
    // 3. Legacy: old clip-env venv (older builds)
    path.join(__dirname, '..', 'clip-env', 'bin', 'python3'),
    // 4. Homebrew Python as last resort
    '/opt/homebrew/bin/python3',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'python3';
}

// ── Concurrency Queue (max 1 Whisper job at a time) ──────────────────────────
// Whisper loads a torch model into MPS/RAM — running two in parallel doubles
// memory usage and can cause OOM or MPS contention on 8 GB MacBooks.
let _whisperRunning = false;
const _whisperQueue = [];

function _runExclusive(fn) {
  return new Promise((resolve, reject) => {
    if (_whisperRunning) {
      console.log(`[Whisper] ⏳ Job queued — ${_whisperQueue.length + 1} waiting (one already running)`);
    }
    _whisperQueue.push({ fn, resolve, reject });
    _drainWhisperQueue();
  });
}

function _drainWhisperQueue() {
  if (_whisperRunning || _whisperQueue.length === 0) return;
  _whisperRunning = true;
  const { fn, resolve, reject } = _whisperQueue.shift();
  fn()
    .then(resolve, reject)
    .finally(() => {
      _whisperRunning = false;
      _drainWhisperQueue();
    });
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Availability check ────────────────────────────────────────────────────────
/**
 * Check if Whisper is available in the current Python environment.
 * Returns true if `import whisper` succeeds.
 */
function isWhisperAvailable() {
  return new Promise((resolve) => {
    const pythonCmd = getWhisperPython();
    execFile(pythonCmd, ['-c', 'import whisper; print("ok")'], { timeout: 8000 }, (err, stdout) => {
      resolve(!err && stdout.trim() === 'ok');
    });
  });
}

// ── Core transcription ────────────────────────────────────────────────────────
/**
 * Transcribe an audio or video file using Whisper.
 *
 * @param {string} mediaPath  - Absolute path to audio/video file
 * @param {object} [options]
 * @param {string} [options.model='base'] - Whisper model: tiny|base|small|medium|large
 * @param {string} [options.language]     - Force language (e.g. 'en', 'de'). Auto-detect if omitted.
 *
 * @returns {Promise<{ transcript: string, language: string, duration: number|null, segments: number }>}
 */
function transcribeMedia(mediaPath, options = {}) {
  if (!isAllowedPath(mediaPath)) {
    return Promise.reject(new Error(`[Whisper] ⛔ Path not allowed (outside MindVault dirs): ${mediaPath}`));
  }
  return _runExclusive(() => _transcribeMediaCore(mediaPath, options));
}

function _transcribeMediaCore(mediaPath, options = {}) {

  const model    = options.model    || 'base';
  const language = options.language || null;

  const input = JSON.stringify({ mediaPath, model, language });

  return new Promise((resolve, reject) => {
    const pythonCmd  = getWhisperPython();
    const scriptPath = path.join(__dirname, 'whisper_transcriber.py');

    console.log(`[Whisper] 🎙️  Transcribing: ${path.basename(mediaPath)} (model: ${model})`);

    execFile(
      pythonCmd,
      [scriptPath, input],
      { timeout: 600_000 }, // 10 min — large files can take a while on CPU
      (err, stdout, stderr) => {
        if (err) {
          console.error('[Whisper] ❌ Script error:', err.message);
          if (stderr) console.error('[Whisper] stderr:', stderr.substring(0, 300));
          return reject(new Error(err.message));
        }

        try {
          // Whisper sometimes prints "Detected language: X" to stdout before the JSON.
          // Find the last line that looks like a JSON object.
          const jsonLine = stdout.trim().split('\n').filter(l => l.trimStart().startsWith('{')).pop();
          if (!jsonLine) {
            console.error('[Whisper] ❌ No JSON line found in stdout:', stdout.substring(0, 200));
            return reject(new Error('No JSON output from whisper_transcriber.py'));
          }

          const result = JSON.parse(jsonLine);

          if (result.error) {
            console.error('[Whisper] ❌ Python error:', result.error);
            return reject(new Error(result.error));
          }

          const words = result.transcript ? result.transcript.split(/\s+/).length : 0;
          console.log(
            `[Whisper] ✅ Done — ${words} words, lang: ${result.language}, ` +
            `${result.duration ? result.duration + 's' : 'duration unknown'}`
          );

          resolve(result);
        } catch (parseErr) {
          console.error('[Whisper] ❌ JSON parse error:', parseErr.message, '| stdout:', stdout.substring(0, 200));
          reject(new Error('Invalid JSON from whisper_transcriber.py'));
        }
      }
    );
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Returns true if the file extension is a supported audio/video format.
 */
const SUPPORTED_EXTS = new Set([
  '.mp4', '.webm', '.mkv', '.avi', '.mov',  // video
  '.mp3', '.m4a', '.wav', '.aac', '.ogg', '.flac',  // audio
]);

function isWhisperCompatible(filePath) {
  return SUPPORTED_EXTS.has(path.extname(filePath).toLowerCase());
}

// ── Auto-transcribe from URL (audio-only, temp file, auto-deleted) ────────────
/**
 * Download audio-only from a URL via yt-dlp, transcribe with Whisper,
 * delete the temp file, return the transcript.
 *
 * This is the "invisible" pipeline — no user-visible download, no note saved.
 * Used when a Mind link is created to silently build a transcript for AI context.
 *
 * @param {string} url - Video/audio URL (YouTube, Vimeo, etc.)
 * @param {string} tmpDir - Directory to use for temp audio file
 * @returns {Promise<string>} transcript text, or '' on failure
 */
async function transcribeFromUrl(url, tmpDir) {
  const os = require('os');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);

  const tmpPath = path.join(tmpDir || os.tmpdir(), `mv_audio_${Date.now()}.m4a`);

  try {
    // Download audio-only (much smaller than video — typically 2-10 MB)
    // Uses the same bundled yt-dlp path as downloader.js (BUNDLED_BIN_PATH in Electron)
    // and cookie args for platforms like Instagram that need browser cookies.
    console.log(`[Whisper] 📥 Downloading audio-only for transcription: ${url.substring(0, 60)}…`);
    console.log(`[Whisper] 🔧 yt-dlp path: ${YTDLP}`);
    const cookieArgs = getCookieArgs();
    await execFileAsync(YTDLP, [
      ...cookieArgs,
      '--no-playlist',
      '--extract-audio',
      '--audio-format', 'm4a',
      '--audio-quality', '3',       // medium quality — enough for speech
      '--max-filesize', '50m',      // safety cap: skip files > 50 MB
      '--no-warnings',
      '-o', tmpPath,
      url,
    ], { timeout: 120_000 }); // 2 min max for audio download

    if (!fs.existsSync(tmpPath)) {
      console.log('[Whisper] ⚠️  Audio download produced no file — skipping');
      return '';
    }

    const fileSizeMB = (fs.statSync(tmpPath).size / 1024 / 1024).toFixed(1);
    console.log(`[Whisper] 🎵 Audio downloaded: ${fileSizeMB} MB`);

    // Transcribe
    const result = await transcribeMedia(tmpPath);
    return result.transcript || '';

  } catch (err) {
    console.log(`[Whisper] ⚠️  Auto-transcription failed: ${err.message}`);
    if (err.stderr) console.log(`[Whisper] stderr: ${String(err.stderr).substring(0, 400)}`);
    return '';
  } finally {
    // Always delete temp file
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    console.log('[Whisper] 🗑️  Temp audio file deleted');
  }
}

module.exports = { transcribeMedia, transcribeFromUrl, isWhisperAvailable, isWhisperCompatible };
