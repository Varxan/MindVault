/**
 * MindVault Semantic Embeddings
 * Node.js wrapper for embedder.py (sentence-transformers)
 *
 * Converts text → 384-dim float vector for semantic search.
 * Uses the same clip-env Python venv as CLIP and Whisper.
 *
 * Usage:
 *   const { embedText, cosineSimilarity, isEmbeddingAvailable } = require('./embeddings');
 *   const vec = await embedText("rainy street at night");  // Float32Array (384)
 *   const score = cosineSimilarity(vec, storedVec);        // 0.0 – 1.0
 */

const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// ── Python resolution (same clip-env as CLIP + Whisper) ──────────────────────
function getEmbedPython() {
  const os = require('os');
  const candidates = [
    // 1. Standalone Python — portable, no venv issues, works on any Mac
    path.join(__dirname, '..', 'python-standalone', 'bin', 'python3'),
    // 2. Legacy: old clip-env venv (older builds)
    path.join(__dirname, '..', 'clip-env', 'bin', 'python3'),
    path.join(os.homedir(), 'Library', 'Application Support', 'mindvault', 'clip-env', 'bin', 'python3'),
    process.env.DATA_PATH
      ? path.join(process.env.DATA_PATH, '..', 'python-standalone', 'bin', 'python3')
      : null,
    '/opt/homebrew/bin/python3',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'python3';
}

// ── Availability check ────────────────────────────────────────────────────────
function isEmbeddingAvailable() {
  return new Promise((resolve) => {
    const py = getEmbedPython();
    execFile(py, ['-c', 'from sentence_transformers import SentenceTransformer; print("ok")'],
      { timeout: 60000 }, (err, stdout) => resolve(!err && stdout.trim() === 'ok'));
  });
}

// ── Core embedding ────────────────────────────────────────────────────────────
/**
 * Convert text to a 384-dim embedding vector.
 *
 * @param {string} text - The text to embed (title + description + transcript etc.)
 * @returns {Promise<Float32Array>} normalized 384-dim vector
 */
function embedText(text) {
  if (!text || !text.trim()) return Promise.resolve(null);

  const input = JSON.stringify({ text: text.trim() });

  return new Promise((resolve, reject) => {
    const py         = getEmbedPython();
    const scriptPath = path.join(__dirname, 'embedder.py');

    execFile(py, [scriptPath, input], { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[Embed] ❌ Script error:', err.message);
        if (stderr) console.error('[Embed] stderr:', stderr.substring(0, 200));
        return reject(new Error(err.message));
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.error) return reject(new Error(result.error));

        // Store as Float32Array for compact in-memory use
        const vec = new Float32Array(result.embedding);
        resolve(vec);
      } catch (e) {
        reject(new Error('Invalid JSON from embedder.py'));
      }
    });
  });
}

// ── Vector serialization (for SQLite BLOB storage) ───────────────────────────
/** Float32Array → Buffer for SQLite BLOB */
function vecToBuffer(vec) {
  return Buffer.from(vec.buffer);
}

/** Buffer from SQLite BLOB → Float32Array */
function bufferToVec(buf) {
  if (!buf) return null;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

// ── Cosine similarity ─────────────────────────────────────────────────────────
/**
 * Compute cosine similarity between two normalized Float32Arrays.
 * Both vectors are L2-normalized by embedder.py, so this is just a dot product.
 *
 * @returns {number} similarity score 0.0 – 1.0 (higher = more similar)
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // already normalized → dot product = cosine similarity
}

// ── Build text for embedding ──────────────────────────────────────────────────
/**
 * Build the input text for a link's embedding from its metadata.
 * Combines title + description + note (transcript for Mind) into one string.
 */
function buildEmbedText(link) {
  // Use hidden transcript column (not user-visible note) for Mind links.
  // For Eye links, transcript is empty so it falls back to title + description.
  return [link.title, link.description, link.transcript, link.note]
    .filter(Boolean)
    .map(s => s.trim())
    .join(' ')
    .substring(0, 4000);
}

module.exports = {
  embedText,
  isEmbeddingAvailable,
  cosineSimilarity,
  vecToBuffer,
  bufferToVec,
  buildEmbedText,
};
