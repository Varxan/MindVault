const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { buildPrompt } = require('./tagging-config');

const { getSetting } = require('./database');

// ─── AI Status Tracker ────────────────────────────────────────────────────────
// Tracks the last API failure so the frontend can show a warning banner.
let _aiStatus = {
  ok: true,
  provider: null,
  statusCode: null,
  errorType: null, // 'rate_limit' | 'auth' | 'billing' | 'server_error' | 'network'
  message: null,
  failedAt: null,
  lastSuccess: null,
};

function recordAIFailure(provider, statusCode, bodyText) {
  let errorType = 'unknown';
  let message = `HTTP ${statusCode}`;

  if (statusCode === 429) {
    errorType = 'rate_limit';
    message = 'Rate limit reached — AI tagging paused temporarily';
  } else if (statusCode === 401 || statusCode === 403) {
    errorType = 'auth';
    message = 'API key invalid or expired';
  } else if (statusCode === 402 || (bodyText && bodyText.includes('billing'))) {
    errorType = 'billing';
    message = 'Billing limit reached — add credits to resume AI tagging';
  } else if (statusCode >= 500) {
    errorType = 'server_error';
    message = 'AI service temporarily unavailable';
  } else if (!statusCode) {
    errorType = 'network';
    message = 'Network error — could not reach AI service';
  }

  _aiStatus = { ok: false, provider, statusCode, errorType, message, failedAt: new Date().toISOString(), lastSuccess: _aiStatus.lastSuccess };
  console.warn(`[AI] ⚠️  Status recorded: ${errorType} (${statusCode}) via ${provider}`);
}

function recordAISuccess(provider) {
  _aiStatus = { ok: true, provider, statusCode: null, errorType: null, message: null, failedAt: null, lastSuccess: new Date().toISOString() };
}

function getAIStatus() {
  const preferred = getSetting.get('preferred_ai_provider')?.value || 'local_clip';

  // If user switched to local CLIP, always report OK — no API errors apply
  if (preferred === 'local_clip') {
    return { ok: true, provider: 'clip', statusCode: null, errorType: null, message: null, failedAt: null, lastSuccess: _aiStatus.lastSuccess };
  }

  // If the preferred API provider has no key configured, report that clearly
  const anthropicKey = getAnthropicKey();
  const openaiKey    = getOpenAIKey();
  if (preferred === 'anthropic' && !anthropicKey) {
    return { ok: false, provider: 'anthropic', statusCode: null, errorType: 'no_key', message: 'No Anthropic API key configured', failedAt: null, lastSuccess: _aiStatus.lastSuccess };
  }
  if (preferred === 'openai' && !openaiKey) {
    return { ok: false, provider: 'openai', statusCode: null, errorType: 'no_key', message: 'No OpenAI API key configured', failedAt: null, lastSuccess: _aiStatus.lastSuccess };
  }

  return { ..._aiStatus };
}
// ─────────────────────────────────────────────────────────────────────────────

// Dynamic getter: DB setting takes priority over .env
function getAnthropicKey() {
  const dbVal = getSetting.get('anthropic_api_key');
  if (dbVal && dbVal.value && dbVal.value.length > 0) return dbVal.value;
  return process.env.ANTHROPIC_API_KEY;
}

// Dynamic getter for OpenAI API key
function getOpenAIKey() {
  const dbVal = getSetting.get('openai_api_key');
  if (dbVal && dbVal.value && dbVal.value.length > 0) return dbVal.value;
  return process.env.OPENAI_API_KEY;
}

// Check if local CLIP is enabled by user
function isClipEnabled() {
  // Check if preferred provider is local_clip OR legacy use_local_clip flag
  const preferredProvider = getSetting.get('preferred_ai_provider');
  if (preferredProvider?.value === 'local_clip') return true;

  const setting = getSetting.get('use_local_clip');
  return setting?.value === 'true' || setting?.value === true;
}

// Resolve the Python executable to use for CLIP.
// Priority order:
//   1. userData clip-env  → production DMG (~/Library/Application Support/MindVault/clip-env)
//   2. backend/ clip-env  → dev mode (project folder / bundled in app)
//   3. system python3     → fallback if user has CLIP in global env
function getClipPython() {
  const os = require('os');

  const candidates = [
    // 1. Preferred: venv installed by setup-clip.sh into userData (works in both dev + DMG)
    path.join(os.homedir(), 'Library', 'Application Support', 'mindvault', 'clip-env', 'bin', 'python3'),
    path.join(os.homedir(), 'Library', 'Application Support', 'MindVault', 'clip-env', 'bin', 'python3'),
    // 2. DATA_PATH sibling (set by Electron, same dir)
    process.env.DATA_PATH
      ? path.join(process.env.DATA_PATH, '..', 'clip-env', 'bin', 'python3')
      : null,
    // 3. Dev mode: clip-env inside backend/ project folder (legacy)
    path.join(__dirname, '..', 'clip-env', 'bin', 'python3'),
    // 4. Homebrew Python as last resort
    '/opt/homebrew/bin/python3',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

// Check if Python + CLIP are available on this system
function checkClipAvailable() {
  return new Promise((resolve) => {
    const pythonCmd = getClipPython();
    execFile(pythonCmd, ['-c', 'import clip; print("ok")'], { timeout: 8000 }, (err, stdout) => {
      resolve(!err && stdout.trim() === 'ok');
    });
  });
}

// Determine which AI provider to use based on availability and user preference
function getPreferredProvider() {
  const preferredSetting = getSetting.get('preferred_ai_provider');
  const preferred = preferredSetting?.value || 'local_clip'; // Default to Local CLIP

  const anthropicKey = getAnthropicKey();
  const openaiKey = getOpenAIKey();

  // Local CLIP is handled separately before this function is called
  if (preferred === 'local_clip') return null;

  if (preferred === 'openai' && openaiKey) return 'openai';
  if (preferred === 'anthropic' && anthropicKey) return 'anthropic';

  // Fallback to whichever is available
  if (openaiKey) return 'openai';
  if (anthropicKey) return 'anthropic';

  return null; // No provider configured
}
const VIDEO_EXTS = ['.mp4', '.webm', '.mkv', '.avi', '.mov'];

/**
 * Read user tagging preferences from the database.
 */
function getTaggingSettings() {
  const settings = {};
  try {
    const prefTags = getSetting.get('custom_preferred_tags');
    if (prefTags && prefTags.value) settings.preferredTags = prefTags.value;

    const ratio = getSetting.get('tag_catalog_ratio');
    if (ratio && ratio.value !== undefined && ratio.value !== '') {
      settings.catalogRatio = parseInt(ratio.value, 10);
      if (isNaN(settings.catalogRatio)) settings.catalogRatio = 80;
    }

    const customPrompt = getSetting.get('custom_ai_prompt');
    if (customPrompt && customPrompt.value) settings.customPrompt = customPrompt.value;
  } catch (err) {
    console.log('[AI] Could not read tagging settings:', err.message);
  }
  return settings;
}

/**
 * Get video duration in seconds using ffprobe.
 */
function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    execFile('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      videoPath,
    ], { timeout: 10000 }, (err, stdout) => {
      const duration = parseFloat(stdout) || 10;
      resolve(duration);
    });
  });
}

/**
 * Calculate optimal number of frames based on video duration.
 * Longer videos get more frames for better analysis.
 */
function getOptimalFrameCount(duration) {
  if (duration < 10) return 2;      // < 10s: 2 frames
  if (duration < 60) return 3;      // 10-60s: 3 frames
  if (duration < 300) return 4;     // 1-5 min: 4 frames
  return 5;                          // > 5 min: 5 frames (max)
}

/**
 * Extract frames from a video file using ffmpeg.
 * Returns array of { base64, media_type } objects.
 */
function extractVideoFrames(videoPath, numFrames = 4) {
  return new Promise((resolve, reject) => {
    const tmpDir = path.join(path.dirname(videoPath), '.frames');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const basename = path.basename(videoPath, path.extname(videoPath));
    const outputPattern = path.join(tmpDir, `${basename}_%02d.jpg`);

    // First get video duration
    execFile('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      videoPath,
    ], { timeout: 10000 }, (err, stdout) => {
      const duration = parseFloat(stdout) || 10;
      const interval = Math.max(1, Math.floor(duration / (numFrames + 1)));

      // Extract frames at evenly spaced intervals
      const selectFilter = Array.from(
        { length: numFrames },
        (_, i) => `eq(n\\,${Math.floor((i + 1) * (duration * 25) / (numFrames + 1))})`
      ).join('+');

      execFile('ffmpeg', [
        '-i', videoPath,
        '-vf', `fps=1/${interval}`,
        '-frames:v', String(numFrames),
        '-q:v', '3',
        '-y',
        outputPattern,
      ], { timeout: 30000 }, (ffErr) => {
        if (ffErr) {
          console.log(`[AI] ffmpeg error: ${ffErr.message}`);
          return reject(ffErr);
        }

        // Read the extracted frames
        const frames = [];
        for (let i = 1; i <= numFrames; i++) {
          const framePath = path.join(tmpDir, `${basename}_${String(i).padStart(2, '0')}.jpg`);
          if (fs.existsSync(framePath)) {
            const buffer = fs.readFileSync(framePath);
            frames.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: buffer.toString('base64'),
              },
            });
            // Clean up frame file
            fs.unlinkSync(framePath);
          }
        }

        // Clean up tmp dir if empty
        try {
          if (fs.readdirSync(tmpDir).length === 0) fs.rmdirSync(tmpDir);
        } catch {}

        if (frames.length === 0) {
          return reject(new Error('No frames extracted'));
        }

        console.log(`[AI] Extracted ${frames.length} frames from video (${duration.toFixed(1)}s)`);
        resolve(frames);
      });
    });
  });
}

/**
 * Check if a file path is a video
 */
function isVideoFile(filePath) {
  return VIDEO_EXTS.includes(path.extname(filePath).toLowerCase());
}

/**
 * Analyze an image or video with Claude Vision.
 * For videos: extracts frames via ffmpeg and sends multiple images.
 * Returns: { tags: string[], description: string }
 */
async function analyzeContent(imageSource, context = {}) {
  // ── CLIP local provider (runs before API check) ───────────────────────────
  if (isClipEnabled() && imageSource && !imageSource.startsWith('http')) {
    if (fs.existsSync(imageSource) && !isVideoFile(imageSource)) {
      console.log('[AI] 🖥️  CLIP local mode — skipping API call');
      const clipResult = await analyzeWithCLIP(imageSource, context);
      if (clipResult && clipResult.tags.length > 0) {
        recordAISuccess('clip');
        return clipResult;
      }
      console.log('[AI] ⚠️  CLIP returned no tags — falling through to API');
    }
  }

  const provider = getPreferredProvider();
  if (!provider) {
    console.log('[AI] ⚠️  No AI provider configured (Anthropic or OpenAI) – using fallback analysis');
    return fallbackAnalysis(context);
  }

  try {
    let contentItems = [];
    let isVideo = false;

    // Handle video files — extract frames (dynamic count based on duration)
    if (!imageSource.startsWith('http') && fs.existsSync(imageSource) && isVideoFile(imageSource)) {
      isVideo = true;
      console.log(`[AI] 🎬 Video detected: ${path.basename(imageSource)}`);
      try {
        const duration = await getVideoDuration(imageSource);
        const optimalFrames = getOptimalFrameCount(duration);
        console.log(`[AI] ⏱️  Duration: ${duration.toFixed(1)}s → extracting ${optimalFrames} frames`);
        contentItems = await extractVideoFrames(imageSource, optimalFrames);
      } catch (e) {
        console.log(`[AI] ⚠️  Frame extraction failed: ${e.message} – using fallback`);
        return fallbackAnalysis(context);
      }
    }
    // Handle remote URLs
    else if (imageSource.startsWith('http')) {
      console.log(`[AI] 📥 Downloading image: ${imageSource.substring(0, 60)}...`);
      const imgResponse = await fetch(imageSource, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
        timeout: 10000,
      });

      if (!imgResponse.ok) {
        console.log(`[AI] ⚠️  Could not download image (${imgResponse.status}) – using fallback`);
        return fallbackAnalysis(context);
      }

      const buffer = await imgResponse.buffer();
      const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
      const mediaType = contentType.split(';')[0].trim();

      if (!mediaType.startsWith('image/')) {
        console.log(`[AI] ⚠️  Not an image (${mediaType}) – using fallback`);
        return fallbackAnalysis(context);
      }

      console.log(`[AI] ✅ Image loaded (${(buffer.length / 1024).toFixed(1)}KB, ${mediaType})`);
      contentItems = [{
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: buffer.toString('base64'),
        },
      }];
    }
    // Handle local image files
    else if (fs.existsSync(imageSource)) {
      console.log(`[AI] 📁 Using local file: ${imageSource}`);
      const buffer = fs.readFileSync(imageSource);
      const ext = path.extname(imageSource).toLowerCase();
      const mediaTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };
      const mediaType = mediaTypes[ext] || 'image/jpeg';

      contentItems = [{
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: buffer.toString('base64'),
        },
      }];
    } else {
      console.log(`[AI] ⚠️  Image source not found: ${imageSource} – using fallback`);
      return fallbackAnalysis(context);
    }

    // Build prompt with user tagging preferences
    const taggingSettings = getTaggingSettings();
    const prompt = buildPrompt(context, isVideo, taggingSettings);

    console.log(`[AI] 🧠 Using ${provider.toUpperCase()} provider`);
    console.log(`[AI] Sending ${contentItems.length} ${isVideo ? 'video frames' : 'image(s)'} for analysis...`);
    console.log(`[AI] Context: ${JSON.stringify(context).substring(0, 100)}...`);

    // Route to appropriate provider
    if (provider === 'anthropic') {
      return await analyzeWithAnthropic(contentItems, prompt, isVideo, context);
    } else if (provider === 'openai') {
      return await analyzeWithOpenAI(contentItems, prompt, isVideo, context);
    }
  } catch (err) {
    console.error('[AI] ❌ Unexpected error:', err.message);
    recordAIFailure(getPreferredProvider() || 'unknown', null, err.message);
    return fallbackAnalysis(context);
  }
}

/**
 * Analyze using Anthropic's Claude Vision API
 */
/**
 * Analyze a local image using CLIP (runs Python script via child_process).
 * Returns { tags, description } or null on failure.
 */
async function analyzeWithCLIP(imagePath, context = {}) {
  const { getAllTags } = require('./tag-catalog');
  const tags = getAllTags();

  const input = JSON.stringify({
    imagePath,
    tags,
    topK: 15,
    threshold: 0.001,
  });

  return new Promise((resolve) => {
    const pythonCmd = getClipPython();
    const scriptPath = path.join(__dirname, 'clip_tagger.py');

    execFile(pythonCmd, [scriptPath, input], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[CLIP] ❌ Script error:', err.message);
        if (stderr) console.error('[CLIP] stderr:', stderr.substring(0, 200));
        recordAIFailure('clip', null, err.message);
        resolve(null);
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.error) {
          console.error('[CLIP] ❌ Python error:', result.error);
          recordAIFailure('clip', null, result.error);
          resolve(null);
          return;
        }

        console.log(`[CLIP] ✅ ${result.tags.length} tags on ${result.device} — ${result.tags.slice(0, 5).join(', ')}…`);
        resolve({
          tags: result.tags,
          description: null, // CLIP doesn't generate descriptions
        });
      } catch (parseErr) {
        console.error('[CLIP] ❌ JSON parse error:', parseErr.message, '| stdout:', stdout.substring(0, 100));
        resolve(null);
      }
    });
  });
}

async function analyzeWithAnthropic(contentItems, prompt, isVideo, context) {
  const apiKey = getAnthropicKey();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You are a cinematographer analyzing visual content. Select tags from the provided catalog that best describe what you see. Think like a creative professional building a comprehensive reference database. Follow the tagging ratio rules exactly as specified in the prompt.`,
      messages: [
        {
          role: 'user',
          content: [
            ...contentItems,
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[AI] ❌ Anthropic API Error (${response.status}):`, errText.substring(0, 200));
    recordAIFailure('anthropic', response.status, errText);
    return fallbackAnalysis(context);
  }

  const data = await response.json();
  const text = data.content[0]?.text || '';

  console.log(`[AI] 📝 Raw response (first 200 chars): ${text.substring(0, 200)}`);
  recordAISuccess('anthropic');
  return parseTagResponse(text, context);
}

/**
 * Analyze using OpenAI's GPT-4 Vision API
 */
async function analyzeWithOpenAI(contentItems, prompt, isVideo, context) {
  const apiKey = getOpenAIKey();

  // Convert Anthropic format to OpenAI format
  const openaiContent = [
    { type: 'text', text: prompt },
  ];

  for (const item of contentItems) {
    if (item.type === 'image' && item.source.type === 'base64') {
      openaiContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${item.source.media_type};base64,${item.source.data}`,
        },
      });
    }
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // Using cost-effective vision model
      max_tokens: 300,
      system: `You are a cinematographer analyzing visual content. Select tags from the provided catalog that best describe what you see. Think like a creative professional building a comprehensive reference database. Follow the tagging ratio rules exactly as specified in the prompt.`,
      messages: [
        {
          role: 'user',
          content: openaiContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[AI] ❌ OpenAI API Error (${response.status}):`, errText.substring(0, 200));
    recordAIFailure('openai', response.status, errText);
    return fallbackAnalysis(context);
  }

  const data = await response.json();
  const text = data.choices[0]?.message?.content || '';

  console.log(`[AI] 📝 Raw response (first 200 chars): ${text.substring(0, 200)}`);
  recordAISuccess('openai');
  return parseTagResponse(text, context);
}

/**
 * Parse tag response from either provider
 */
function parseTagResponse(text, context) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(parsed.tags)) {
        console.warn('[AI] ⚠️  Tags is not an array, using fallback');
        return fallbackAnalysis(context);
      }

      const tags = parsed.tags.slice(0, 15);
      console.log(`[AI] ✅ Success! Selected ${tags.length} tags`);
      console.log(`[AI] Tags: ${tags.join(', ')}`);

      return {
        tags,
        description: parsed.description || null,
      };
    } else {
      console.log('[AI] ⚠️  Could not find JSON in response – using fallback');
      console.log('[AI] Full response:', text);
      return fallbackAnalysis(context);
    }
  } catch (parseErr) {
    console.log('[AI] ⚠️  JSON parse error:', parseErr.message);
    console.log('[AI] Response text:', text.substring(0, 300));
    return fallbackAnalysis(context);
  }
}

/**
 * Fallback: extract tags from title and description
 */
function fallbackAnalysis(context) {
  console.log('[AI] 📌 Using fallback analysis (text-based)');
  const tags = [];
  const text = [context.title, context.description, context.note].filter(Boolean).join(' ');

  if (!text) return { tags: [], description: null };

  const stopWords = new Set([
    'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'aber', 'für', 'mit',
    'von', 'auf', 'ist', 'sind', 'hat', 'the', 'and', 'for', 'with', 'from',
    'this', 'that', 'are', 'was', 'not', 'can', 'will', 'has', 'have', 'you',
    'your', 'our', 'www', 'com', 'http', 'https', 'html',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-zäöüß\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  sorted.slice(0, 13).forEach(([word]) => tags.push(word));

  if (context.source && context.source !== 'web') {
    tags.unshift(context.source);
  }

  // Ensure 15 tags for consistency with AI-generated tags
  while (tags.length < 15 && sorted.length > 0) {
    const nextIdx = tags.length - (context.source ? 1 : 0);
    if (nextIdx < sorted.length && !tags.includes(sorted[nextIdx][0])) {
      tags.push(sorted[nextIdx][0]);
    } else break;
  }

  console.log(`[AI] 📌 Fallback tags (${tags.length}): ${tags.join(', ')}`);
  return { tags: tags.slice(0, 15), description: null };
}

module.exports = { analyzeContent, fallbackAnalysis, getAIStatus, checkClipAvailable };
