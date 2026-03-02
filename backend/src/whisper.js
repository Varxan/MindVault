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
const { execFile } = require('child_process');

// ── Python resolution (same logic as CLIP in ai.js) ──────────────────────────
// Reuses the clip-env venv where both CLIP and Whisper are installed.
function getWhisperPython() {
  const os = require('os');

  const candidates = [
    // 1. Preferred: venv installed by setup-clip.sh into userData (DMG + dev)
    path.join(os.homedir(), 'Library', 'Application Support', 'MindVault', 'clip-env', 'bin', 'python3'),
    // 2. DATA_PATH sibling (set by Electron)
    process.env.DATA_PATH
      ? path.join(process.env.DATA_PATH, '..', 'clip-env', 'bin', 'python3')
      : null,
    // 3. Dev mode: clip-env inside backend/ project folder
    path.join(__dirname, '..', 'clip-env', 'bin', 'python3'),
    // 4. Homebrew Python as last resort
    '/opt/homebrew/bin/python3',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'python3';
}

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
          const result = JSON.parse(stdout.trim());

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

module.exports = { transcribeMedia, isWhisperAvailable, isWhisperCompatible };
