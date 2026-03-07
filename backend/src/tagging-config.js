/**
 * MindVault AI Tagging Configuration
 * Dynamic: reads user settings (preferred tags, catalog ratio, custom prompt)
 */

const { TAG_CATALOG, getAllTags } = require('./tag-catalog');

/**
 * Build the tag catalog reference string for the prompt
 */
function buildCatalogReference() {
  let ref = 'AVAILABLE TAGS (choose from these):\n\n';

  Object.entries(TAG_CATALOG).forEach(([key, category]) => {
    ref += `${category.label}:\n`;
    category.tags.forEach(tag => {
      ref += `  - ${tag.label}\n`;
    });
    ref += '\n';
  });

  return ref;
}

const CATALOG_REF = buildCatalogReference();

const VIDEO_PROMPT_PREFIX = `You are analyzing MULTIPLE FRAMES from a video. Frames are taken at evenly spaced intervals throughout the video.

Consider the narrative flow, visual progression, and overall cinematic language. Focus on: camera movement, pacing, editing style, and dominant visual aesthetic.

`;

/**
 * Build a dynamic tagging prompt based on user settings.
 *
 * @param {Object} context       - Link metadata (title, description, source, note)
 * @param {boolean} isVideo      - Whether the content is a video
 * @param {Object} taggingSettings - User preferences from DB
 *   @param {string}  taggingSettings.preferredTags    - Comma-separated preferred tags
 *   @param {number}  taggingSettings.aiInterpretedCount - How many AI-invented tags to add (default 3)
 *   @param {string}  taggingSettings.customPrompt     - Additional user instructions
 */
function buildPrompt(context = {}, isVideo = false, taggingSettings = {}) {
  // AI interpreted tags = freely invented by AI on top of catalog tags
  const aiInterpretedCount = typeof taggingSettings.catalogRatio === 'number'
    ? Math.max(0, Math.min(10, taggingSettings.catalogRatio))
    : 5;

  // Build context string
  let contextStr = '';
  if (context.title) contextStr += `Title: ${context.title}\n`;
  if (context.description) contextStr += `Description: ${context.description}\n`;
  if (context.source) contextStr += `Platform: ${context.source}\n`;
  if (context.note) contextStr += `Note: ${context.note}\n`;

  // Start with video prefix if needed
  let prompt = isVideo ? VIDEO_PROMPT_PREFIX : '';

  // Main instruction
  prompt += `You are a cinematographer and visual director analyzing visual content.

Your task: Select relevant tags from the catalog to comprehensively describe this image/video. Think like a visual effects supervisor building a complete reference database.

${CATALOG_REF}`;

  // Preferred tags section
  if (taggingSettings.preferredTags && taggingSettings.preferredTags.trim()) {
    const preferred = taggingSettings.preferredTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    if (preferred.length > 0) {
      prompt += `\nPREFERRED TAGS (prioritize these when relevant):
${preferred.map(t => `  - ${t}`).join('\n')}
Note: Only use preferred tags if they genuinely match the content. Do not force them.\n`;
    }
  }

  // Tagging rules
  let aiTagsInstruction;
  if (aiInterpretedCount === 0) {
    aiTagsInstruction = `- Use ONLY catalog tags (no AI interpreted tags)`;
  } else if (aiInterpretedCount <= 3) {
    aiTagsInstruction = `- Add UP TO ${aiInterpretedCount} AI interpreted tag${aiInterpretedCount !== 1 ? 's' : ''} ONLY if something important is genuinely missing from the catalog`;
  } else {
    aiTagsInstruction = `- Add UP TO ${aiInterpretedCount} AI interpreted tags for visual elements, techniques, moods, or styles not covered by the catalog. Be creative but selective.`;
  }

  const totalTags = `10–13 catalog tags + up to ${aiInterpretedCount} AI interpreted tags`;

  prompt += `
TAGGING RULES:
- Select ALL relevant catalog tags (typically 10–13 tags)
- Catalog tags must match what is genuinely visible
${aiTagsInstruction}
- Prioritize: aesthetic, lighting, color, mood, movement (for video)
- All tags must be in English
- Output only the tags and a brief (1 sentence) visual description`;

  // Custom user prompt
  if (taggingSettings.customPrompt && taggingSettings.customPrompt.trim()) {
    prompt += `\n\nADDITIONAL INSTRUCTIONS FROM USER:\n${taggingSettings.customPrompt.trim()}`;
  }

  // Output format
  prompt += `\n\nOUTPUT FORMAT (JSON only, no fixed total — include all relevant catalog tags plus AI interpreted):
{"tags": ["tag1", "tag2", ...], "description": "brief visual description"}`;

  // Context
  if (contextStr.trim()) {
    prompt += `\n\nCONTEXT:\n${contextStr.trim()}`;
  }

  return prompt;
}

module.exports = {
  buildPrompt,
  TAG_CATALOG,
  getAllTags
};
