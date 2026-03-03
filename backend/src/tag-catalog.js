/**
 * MindVault Tag Catalog
 * Predefined tags organized by category for efficient AI tagging.
 * Each tag has a CLIP-optimized `prompt` for zero-shot visual matching.
 * AI selects from these tags (80%) and only creates new ones when needed (20%).
 */

const TAG_CATALOG = {

  // ── GENERAL CONTENT (Eye + Mind) ───────────────────────────────────────────

  subject: {
    label: 'Subject Matter',
    multi: true,
    maxSelect: 3,
    tags: [
      { id: 'people_portrait',    label: 'People / Portrait',   prompt: 'a photo of a person or human portrait' },
      { id: 'nature_landscape',   label: 'Nature / Landscape',  prompt: 'a photo of nature, landscape, mountains, or forests' },
      { id: 'architecture',       label: 'Architecture',        prompt: 'a photo of a building, structure, or architectural design' },
      { id: 'product',            label: 'Product',             prompt: 'a product photo or commercial object shot' },
      { id: 'food_drink',         label: 'Food & Drink',        prompt: 'a photo of food, drink, or culinary content' },
      { id: 'fashion_style',      label: 'Fashion / Style',     prompt: 'a fashion photo, clothing, or style reference' },
      { id: 'text_typography',    label: 'Text / Typography',   prompt: 'an image dominated by text, words, or typography' },
      { id: 'abstract_pattern',   label: 'Abstract / Pattern',  prompt: 'an abstract or geometric pattern design' },
      { id: 'technology',         label: 'Technology',          prompt: 'a photo of technology, screens, computers, or devices' },
      { id: 'animals',            label: 'Animals',             prompt: 'a photo of an animal or wildlife' },
      { id: 'vehicles',           label: 'Vehicles / Transport',prompt: 'a photo of a car, vehicle, or transportation' },
      { id: 'interior_space',     label: 'Interior Space',      prompt: 'a photo of an interior room, furniture, or home design' },
    ]
  },

  format: {
    label: 'Content Format',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'photography',        label: 'Photography',         prompt: 'a realistic photograph taken with a camera' },
      { id: 'illustration',       label: 'Illustration',        prompt: 'a digital or hand-drawn illustration or artwork' },
      { id: 'graphic_design',     label: 'Graphic Design',      prompt: 'a graphic design, poster, or visual composition' },
      { id: 'ui_app_design',      label: 'UI / App Design',     prompt: 'a screenshot of a user interface, app, or website design' },
      { id: 'video_thumbnail',    label: 'Video / Thumbnail',   prompt: 'a video thumbnail or film still frame' },
      { id: '3d_render',          label: '3D Render / CGI',     prompt: 'a 3D rendering or computer generated image' },
      { id: 'infographic',        label: 'Infographic / Data',  prompt: 'an infographic, chart, or data visualization' },
      { id: 'logo_brand',         label: 'Logo / Branding',     prompt: 'a logo, brand identity, or icon design' },
      { id: 'animation',          label: 'Animation / Motion',  prompt: 'an animation, motion graphic, or cartoon' },
      { id: 'collage_mixed',      label: 'Collage / Mixed',     prompt: 'a collage or mixed-media visual composition' },
    ]
  },

  // ── CINEMATIC / VISUAL (Eye + Mind) ────────────────────────────────────────

  aesthetic: {
    label: 'Aesthetic / Visual Style',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'naturalistic',       label: 'Naturalistic',        prompt: 'a naturalistic, realistic, and unprocessed visual style' },
      { id: 'stylized',           label: 'Stylized',            prompt: 'a heavily stylized and artistic visual treatment' },
      { id: 'gritty',             label: 'Gritty',              prompt: 'a gritty, rough, and textured aesthetic' },
      { id: 'clean_polished',     label: 'Clean / Polished',    prompt: 'a clean, polished, and refined visual presentation' },
      { id: 'vintage',            label: 'Vintage',             prompt: 'a vintage, retro, or old-fashioned visual style' },
      { id: 'dreamlike',          label: 'Dreamlike',           prompt: 'a soft dreamlike and ethereal visual quality' },
      { id: 'surreal',            label: 'Surreal',             prompt: 'a surreal, impossible, or fantastical scene' },
      { id: 'documentary',        label: 'Documentary',         prompt: 'a documentary or journalistic photography style' },
      { id: 'hyperreal',          label: 'Hyper-real',          prompt: 'an ultra-detailed hyper-realistic image' },
      { id: 'noir',               label: 'Noir',                prompt: 'a moody film noir style with dark shadows and contrast' },
      { id: 'minimalistic',       label: 'Minimalistic',        prompt: 'a minimalist composition with lots of negative space' },
      { id: 'maximalist',         label: 'Maximalist',          prompt: 'a maximalist busy and layered visual composition' },
      { id: 'romantic_soft',      label: 'Romantic / Soft',     prompt: 'a soft romantic and gentle visual atmosphere' },
      { id: 'harsh_raw',          label: 'Harsh / Raw',         prompt: 'a harsh raw and unfiltered visual energy' },
      { id: 'glossy_commercial',  label: 'Glossy Commercial',   prompt: 'a high-gloss commercial advertising visual' },
      { id: 'epic_scope',         label: 'Epic Scope',          prompt: 'an epic wide-scope cinematic landscape composition' },
      { id: 'experimental',       label: 'Experimental',        prompt: 'an experimental avant-garde artistic visual' },
    ]
  },

  lighting: {
    label: 'Lighting Style',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'natural_light',      label: 'Natural Light',       prompt: 'a scene lit by natural sunlight or daylight' },
      { id: 'soft_light',         label: 'Soft Light',          prompt: 'a scene with soft diffused flattering light' },
      { id: 'hard_light',         label: 'Hard Light',          prompt: 'a scene with hard directional light casting sharp shadows' },
      { id: 'low_key',            label: 'Low Key',             prompt: 'a dark low-key scene with minimal light and deep shadows' },
      { id: 'high_key',           label: 'High Key',            prompt: 'a bright high-key image with minimal shadows' },
      { id: 'backlit',            label: 'Backlit',             prompt: 'a subject lit from behind creating a glowing backlight effect' },
      { id: 'silhouette',         label: 'Silhouette',          prompt: 'a dark silhouette against a bright background' },
      { id: 'chiaroscuro',        label: 'Chiaroscuro',         prompt: 'a high contrast chiaroscuro dramatic light and shadow' },
      { id: 'neon',               label: 'Neon Lighting',       prompt: 'a scene with colorful neon lights or LED glow' },
      { id: 'candlelight_fire',   label: 'Candle / Firelight',  prompt: 'a scene lit by warm candlelight or firelight' },
      { id: 'golden_hour',        label: 'Golden Hour',         prompt: 'a scene during golden hour with warm orange sunlight' },
      { id: 'volumetric_haze',    label: 'Volumetric / Haze',   prompt: 'a scene with volumetric light rays or atmospheric haze' },
    ]
  },

  color: {
    label: 'Color Palette',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'warm',               label: 'Warm Tones',          prompt: 'an image with warm orange, yellow, or red color tones' },
      { id: 'cool',               label: 'Cool / Blue',         prompt: 'an image with cool blue, teal, or cyan color tones' },
      { id: 'teal_orange',        label: 'Teal & Orange',       prompt: 'a cinematic teal and orange color grade' },
      { id: 'monochrome',         label: 'Monochrome',          prompt: 'a monochrome single-color toned image' },
      { id: 'black_and_white',    label: 'Black & White',       prompt: 'a black and white photograph or image' },
      { id: 'desaturated',        label: 'Desaturated',         prompt: 'a desaturated or muted low-saturation image' },
      { id: 'high_saturation',    label: 'High Saturation',     prompt: 'a vibrant highly saturated colorful image' },
      { id: 'pastel',             label: 'Pastel',              prompt: 'a soft pastel color palette image' },
      { id: 'neon_palette',       label: 'Neon Palette',        prompt: 'an image with bright neon fluorescent colors' },
      { id: 'earth_tones',        label: 'Earth Tones',         prompt: 'an image with natural earth tones, browns, and greens' },
      { id: 'high_contrast',      label: 'High Contrast',       prompt: 'a high contrast image with deep blacks and bright whites' },
    ]
  },

  mood: {
    label: 'Mood / Tone',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'tense',              label: 'Tense',               prompt: 'a tense or suspenseful dramatic atmosphere' },
      { id: 'intimate',           label: 'Intimate',            prompt: 'an intimate close personal emotional scene' },
      { id: 'romantic',           label: 'Romantic',            prompt: 'a romantic and loving atmosphere' },
      { id: 'melancholic',        label: 'Melancholic',         prompt: 'a sad melancholic or sorrowful mood' },
      { id: 'hopeful',            label: 'Hopeful',             prompt: 'a hopeful optimistic and uplifting feeling' },
      { id: 'ominous',            label: 'Ominous',             prompt: 'an ominous dark threatening atmosphere' },
      { id: 'calm',               label: 'Calm',                prompt: 'a calm peaceful and serene atmosphere' },
      { id: 'playful',            label: 'Playful',             prompt: 'a playful fun and energetic mood' },
      { id: 'epic',               label: 'Epic',                prompt: 'an epic grand and powerful visual feeling' },
      { id: 'dreamy',             label: 'Dreamy',              prompt: 'a dreamy hazy and soft romantic mood' },
      { id: 'anxious',            label: 'Anxious',             prompt: 'an anxious restless or unsettling mood' },
      { id: 'contemplative',      label: 'Contemplative',       prompt: 'a quiet contemplative and reflective mood' },
    ]
  },

  location: {
    label: 'Location / Setting',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'outdoor_nature',     label: 'Outdoor / Nature',    prompt: 'an outdoor scene in nature or natural environment' },
      { id: 'urban_city',         label: 'Urban / City',        prompt: 'an urban city street or metropolitan environment' },
      { id: 'interior_room',      label: 'Interior / Room',     prompt: 'an indoor interior room or interior space' },
      { id: 'beach_ocean',        label: 'Beach / Ocean',       prompt: 'a beach or ocean coastal scene' },
      { id: 'studio',             label: 'Studio',              prompt: 'a professional photo or film studio environment' },
      { id: 'desert',             label: 'Desert',              prompt: 'a dry desert or arid landscape' },
      { id: 'forest',             label: 'Forest',              prompt: 'a dense forest or woodland scene' },
      { id: 'mountains',          label: 'Mountains',           prompt: 'a mountainous terrain or snowy peaks' },
      { id: 'nightlife',          label: 'Nightlife',           prompt: 'a bar, nightclub, or evening city nightlife scene' },
    ]
  },

  camerawork: {
    label: 'Camera / Shot',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'close_up',           label: 'Close-up',            prompt: 'a close-up shot of a face, detail, or object' },
      { id: 'wide_shot',          label: 'Wide Shot',           prompt: 'a wide-angle shot showing the full environment' },
      { id: 'aerial_overhead',    label: 'Aerial / Overhead',   prompt: 'an aerial drone or top-down overhead shot' },
      { id: 'pov_first_person',   label: 'POV / First Person',  prompt: 'a first-person point-of-view camera perspective' },
      { id: 'portrait_headshot',  label: 'Portrait / Headshot', prompt: 'a portrait or headshot photo of a person' },
      { id: 'macro',              label: 'Macro / Detail',      prompt: 'an extreme close-up macro photography of a small detail' },
      { id: 'motion_blur',        label: 'Motion / Action',     prompt: 'a fast action shot with motion blur or dynamic movement' },
    ]
  },

};

/**
 * Get flattened list of all tag labels for display and AI text-based matching.
 */
function getAllTags() {
  const all = [];
  Object.values(TAG_CATALOG).forEach(category => {
    category.tags.forEach(tag => {
      all.push(tag.label);
    });
  });
  return all;
}

/**
 * Get array of { label, prompt } for CLIP-optimized zero-shot classification.
 * CLIP works much better with descriptive natural language prompts
 * than with short single-word labels.
 */
function getAllTagsWithPrompts() {
  const all = [];
  Object.values(TAG_CATALOG).forEach(category => {
    category.tags.forEach(tag => {
      all.push({
        label: tag.label,
        prompt: tag.prompt || tag.label, // fallback to label if no prompt defined
      });
    });
  });
  return all;
}

module.exports = { TAG_CATALOG, getAllTags, getAllTagsWithPrompts };
