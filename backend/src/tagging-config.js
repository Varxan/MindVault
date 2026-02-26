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
 *   @param {string}  taggingSettings.preferredTags  - Comma-separated preferred tags
 *   @param {number}  taggingSettings.catalogRatio   - 0-100, percentage from catalog (default 80)
 *   @param {string}  taggingSettings.customPrompt   - Additional user instructions
 */
function buildPrompt(context = {}, isVideo = false, taggingSettings = {}) {
  const totalTags = 15;
  const catalogRatio = typeof taggingSettings.catalogRatio === 'number'
    ? Math.max(0, Math.min(100, taggingSettings.catalogRatio))
    : 80;

  const catalogCount = Math.round(totalTags * catalogRatio / 100);
  const customCount = totalTags - catalogCount;

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

  // Tagging rules with dynamic ratio
  let customTagsInstruction;
  if (customCount === 0) {
    customTagsInstruction = `- Use ONLY catalog tags (no custom tags allowed)`;
  } else if (customCount <= 3) {
    customTagsInstruction = `- Add UP TO ${customCount} custom tag${customCount !== 1 ? 's' : ''} ONLY if something important is genuinely missing`;
  } else {
    customTagsInstruction = `- Add UP TO ${customCount} custom tag${customCount !== 1 ? 's' : ''} for important visual elements, techniques, moods, or styles not in the catalog. Be creative but selective.`;
  }

  prompt += `
TAGGING RULES (${catalogRatio}/${100 - catalogRatio} Strategy):
- Select ${totalTags} tags TOTAL
- AT LEAST ${catalogCount} tags MUST come from the catalog above (${catalogRatio}% rule)
${customTagsInstruction}
- Prioritize: aesthetic, lighting, color, mood, movement (for video)
- All tags must be in English
- Output only the tags and a brief (1 sentence) visual description`;

  // Custom user prompt
  if (taggingSettings.customPrompt && taggingSettings.customPrompt.trim()) {
    prompt += `\n\nADDITIONAL INSTRUCTIONS FROM USER:\n${taggingSettings.customPrompt.trim()}`;
  }

  // Output format
  prompt += `\n\nOUTPUT FORMAT (JSON only):
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
