/**
 * MindVault Tag Catalog
 * Predefined tags organized by category for efficient AI tagging.
 *
 * Each tag has:
 *   id    — stable internal identifier
 *   label — display name shown in the UI
 *   clip  — natural language prompt sent to CLIP for scoring
 *           (CLIP understands descriptive sentences far better than single words)
 */

const TAG_CATALOG = {
  aesthetic: {
    label: 'Aesthetic / Visual Style',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'naturalistic',          label: 'Naturalistic',           clip: 'a naturalistic realistic visual style with natural colors' },
      { id: 'stylized',              label: 'Stylized',               clip: 'a visually stylized image with artistic and designed treatment' },
      { id: 'gritty',                label: 'Gritty',                 clip: 'a gritty rough raw unpolished visual with grain and texture' },
      { id: 'clean_polished',        label: 'Clean / Polished',       clip: 'a clean polished refined high-end visual quality' },
      { id: 'vintage',               label: 'Vintage',                clip: 'a vintage retro aged photograph with warm faded tones' },
      { id: 'dreamlike',             label: 'Dreamlike',              clip: 'a soft dreamlike ethereal glowing blurred image' },
      { id: 'surreal',               label: 'Surreal',                clip: 'a surreal strange impossible dreamlike scene' },
      { id: 'documentary',           label: 'Documentary',            clip: 'a documentary style candid real-world photojournalism image' },
      { id: 'hyperreal',             label: 'Hyper-real',             clip: 'an ultra sharp hyper realistic detailed photograph' },
      { id: 'noir',                  label: 'Noir',                   clip: 'a black and white film noir scene with dramatic shadows' },
      { id: 'minimalistic',          label: 'Minimalistic',           clip: 'a minimalist simple image with lots of empty space' },
      { id: 'maximalist',            label: 'Maximalist',             clip: 'a busy maximalist image filled with many visual elements' },
      { id: 'romantic_soft',         label: 'Romantic / Soft',        clip: 'a romantic soft warm glowing intimate visual' },
      { id: 'harsh_raw',             label: 'Harsh / Raw',            clip: 'a harsh raw unfiltered intense confrontational visual' },
      { id: 'glossy_commercial',     label: 'Glossy Commercial',      clip: 'a glossy high-end commercial advertising photograph' },
      { id: 'intimate_observational',label: 'Intimate Observational', clip: 'an intimate observational candid close personal moment' },
      { id: 'epic_scope',            label: 'Epic Scope',             clip: 'an epic wide sweeping cinematic landscape with grand scale' },
      { id: 'experimental',          label: 'Experimental',           clip: 'an experimental abstract artistic unconventional visual' },
    ]
  },

  lighting: {
    label: 'Lighting Style',
    multi: true,
    maxSelect: 3,
    tags: [
      { id: 'natural_light',       label: 'Natural Light',        clip: 'a scene lit entirely by natural sunlight from windows or outdoors' },
      { id: 'soft_light',          label: 'Soft Light',           clip: 'a scene with soft diffused even lighting and very soft shadows' },
      { id: 'hard_light',          label: 'Hard Light',           clip: 'a scene with hard directional light casting sharp defined shadows' },
      { id: 'dark_moody',          label: 'Dark & Moody',         clip: 'a dark moody scene with deep shadows and very little light' },
      { id: 'bright_airy',         label: 'Bright & Airy',        clip: 'a bright evenly lit airy scene with no harsh shadows' },
      { id: 'motivated',           label: 'Motivated Lighting',   clip: 'a scene where light sources like lamps and windows are visible' },
      { id: 'practicals_heavy',    label: 'Practicals Heavy',     clip: 'a scene lit primarily by lamps screens and visible light sources' },
      { id: 'backlit',             label: 'Backlit',              clip: 'a scene with strong backlighting behind the subject' },
      { id: 'rim_light',           label: 'Rim Light',            clip: 'a scene with rim lighting that outlines the edge of a subject' },
      { id: 'silhouette',          label: 'Silhouette',           clip: 'a silhouette of a person or object against a bright background' },
      { id: 'chiaroscuro',         label: 'Chiaroscuro',          clip: 'a dramatic scene with extreme contrast between bright light and deep shadow' },
      { id: 'neon',                label: 'Neon Lighting',        clip: 'a scene with colorful neon lights and glowing signs' },
      { id: 'candlelight_fire',    label: 'Candle / Firelight',   clip: 'a scene lit by warm flickering candlelight or firelight' },
      { id: 'overcast_diffuse',    label: 'Overcast / Diffuse',   clip: 'an outdoor scene under flat overcast cloudy diffuse light' },
      { id: 'golden_hour',         label: 'Golden Hour',          clip: 'a scene bathed in warm golden sunlight during sunset or sunrise' },
      { id: 'top_light',           label: 'Top Light',            clip: 'a scene with dramatic overhead top lighting from above' },
      { id: 'negative_fill',       label: 'Negative Fill',        clip: 'a scene with deliberate dark shadow areas blocking the light' },
      { id: 'volumetric_haze',     label: 'Atmospheric Haze',     clip: 'a scene with fog mist atmospheric haze or volumetric light rays' },
    ]
  },

  color: {
    label: 'Color Palette',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'warm',               label: 'Warm Tones',          clip: 'an image with warm orange amber and red color tones' },
      { id: 'cool',               label: 'Cool / Blue',         clip: 'an image with cool blue and teal color tones' },
      { id: 'teal_orange',        label: 'Teal & Orange',       clip: 'an image with teal shadows and orange highlights color grading' },
      { id: 'monochrome',         label: 'Monochrome',          clip: 'a single-color toned monochrome image' },
      { id: 'black_and_white',    label: 'Black & White',       clip: 'a black and white photograph with no color' },
      { id: 'desaturated',        label: 'Desaturated',         clip: 'a desaturated image with muted washed-out colors' },
      { id: 'high_saturation',    label: 'Vibrant',             clip: 'a highly saturated vibrant colorful image with rich vivid colors' },
      { id: 'pastel',             label: 'Pastel',              clip: 'an image with soft light pastel colors' },
      { id: 'neon_palette',       label: 'Neon Colors',         clip: 'an image with bright electric neon glowing colors' },
      { id: 'earth_tones',        label: 'Earth Tones',         clip: 'an image with warm earth tones brown ochre green and natural colors' },
      { id: 'high_contrast',      label: 'High Contrast',       clip: 'a high contrast image with very bright highlights and very dark shadows' },
      { id: 'muted_midtones',     label: 'Muted / Flat',        clip: 'an image with muted flat low-contrast midtone colors' },
    ]
  },

  mood: {
    label: 'Mood / Tone',
    multi: true,
    maxSelect: 3,
    tags: [
      { id: 'tense',          label: 'Tense',          clip: 'a tense dramatic high-stakes scene' },
      { id: 'suspenseful',    label: 'Suspenseful',    clip: 'a suspenseful thriller atmosphere with hidden danger' },
      { id: 'intimate',       label: 'Intimate',       clip: 'an intimate personal close vulnerable emotional moment' },
      { id: 'romantic',       label: 'Romantic',       clip: 'a romantic loving tender scene between people' },
      { id: 'melancholic',    label: 'Melancholic',    clip: 'a melancholic sad sorrowful emotional scene' },
      { id: 'hopeful',        label: 'Hopeful',        clip: 'a hopeful optimistic uplifting inspiring scene' },
      { id: 'ominous',        label: 'Ominous',        clip: 'an ominous dark foreboding threatening scene' },
      { id: 'eerie',          label: 'Eerie',          clip: 'an eerie unsettling creepy uncanny atmosphere' },
      { id: 'chaotic',        label: 'Chaotic',        clip: 'a chaotic energetic fast-moving frantic scene' },
      { id: 'calm',           label: 'Calm',           clip: 'a calm peaceful serene tranquil quiet scene' },
      { id: 'playful',        label: 'Playful',        clip: 'a playful fun joyful lighthearted cheerful scene' },
      { id: 'triumphant',     label: 'Triumphant',     clip: 'a triumphant victorious powerful celebration scene' },
      { id: 'lonely',         label: 'Lonely',         clip: 'a lonely isolated solitary empty abandoned scene' },
      { id: 'dreamy',         label: 'Dreamy',         clip: 'a dreamy hazy soft atmospheric gentle scene' },
      { id: 'anxious',        label: 'Anxious',        clip: 'an anxious nervous uneasy restless uncomfortable atmosphere' },
      { id: 'uplifting',      label: 'Uplifting',      clip: 'an uplifting motivational feel-good positive scene' },
      { id: 'contemplative',  label: 'Contemplative',  clip: 'a contemplative thoughtful reflective meditative quiet scene' },
      { id: 'raw_intense',    label: 'Raw / Intense',  clip: 'a raw intense visceral powerful overwhelming scene' },
    ]
  },

  timeOfDay: {
    label: 'Time of Day',
    multi: false,
    maxSelect: 1,
    tags: [
      { id: 'day',            label: 'Day',            clip: 'a bright daytime outdoor scene in full daylight' },
      { id: 'night',          label: 'Night',          clip: 'a nighttime dark scene with artificial city lights' },
      { id: 'dawn',           label: 'Dawn',           clip: 'an early morning dawn scene with soft pink and purple light' },
      { id: 'dusk',           label: 'Dusk',           clip: 'a dusk evening scene after sunset with fading light' },
      { id: 'golden_hour',    label: 'Golden Hour',    clip: 'warm golden sunlight during the hour before sunset or after sunrise' },
      { id: 'blue_hour',      label: 'Blue Hour',      clip: 'the blue hour twilight with cool blue ambient light just after sunset' },
      { id: 'interior_day',   label: 'Interior Day',   clip: 'an indoor interior scene lit by daylight from windows' },
      { id: 'interior_night', label: 'Interior Night', clip: 'an indoor interior scene at night lit by artificial lamps' },
    ]
  },

  location: {
    label: 'Location / Context',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'interior',        label: 'Interior',         clip: 'an indoor interior room scene' },
      { id: 'exterior',        label: 'Exterior',         clip: 'an outdoor exterior scene outside a building' },
      { id: 'urban',           label: 'Urban',            clip: 'an urban city street buildings and city environment' },
      { id: 'rural',           label: 'Rural',            clip: 'a rural countryside farmland village scene' },
      { id: 'nature',          label: 'Nature',           clip: 'a natural landscape with forest mountains ocean or wilderness' },
      { id: 'industrial',      label: 'Industrial',       clip: 'an industrial factory warehouse or machinery environment' },
      { id: 'domestic_home',   label: 'Home',             clip: 'a domestic home house living room bedroom or kitchen' },
      { id: 'office',          label: 'Office',           clip: 'an office workplace desk corporate professional environment' },
      { id: 'nightlife',       label: 'Nightlife',        clip: 'a nightlife bar club party music venue night out' },
      { id: 'studio_stage',    label: 'Studio / Stage',   clip: 'a studio stage performance film set or controlled environment' },
    ]
  },
};

/**
 * Get flattened list of all tag labels (for API-based providers)
 */
function getAllTags() {
  const all = [];
  Object.values(TAG_CATALOG).forEach(category => {
    category.tags.forEach(tag => all.push(tag.label));
  });
  return all;
}

/**
 * Get structured list of all tags with their CLIP prompts and category metadata.
 * Used by the CLIP tagger for accurate scoring + category-aware selection.
 * Returns: [{ label, clip, categoryId, maxSelect }]
 */
function getAllTagsForCLIP() {
  const all = [];
  Object.entries(TAG_CATALOG).forEach(([categoryId, category]) => {
    category.tags.forEach(tag => {
      all.push({
        label:      tag.label,
        clip:       tag.clip,
        categoryId,
        maxSelect:  category.maxSelect || 1,
      });
    });
  });
  return all;
}

module.exports = { TAG_CATALOG, getAllTags, getAllTagsForCLIP };
