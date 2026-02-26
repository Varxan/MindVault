/**
 * MindVault Tag Catalog
 * Predefined tags organized by category for efficient AI tagging.
 * AI selects from these tags (80%) and only creates new ones when needed (20%).
 */

const TAG_CATALOG = {
  aesthetic: {
    label: 'Aesthetic / Visual Style',
    multi: true,
    maxSelect: 1,
    tags: [
      { id: 'naturalistic', label: 'Naturalistic' },
      { id: 'stylized', label: 'Stylized' },
      { id: 'gritty', label: 'Gritty' },
      { id: 'clean_polished', label: 'Clean / Polished' },
      { id: 'vintage', label: 'Vintage' },
      { id: 'dreamlike', label: 'Dreamlike' },
      { id: 'surreal', label: 'Surreal' },
      { id: 'documentary', label: 'Documentary' },
      { id: 'hyperreal', label: 'Hyper-real' },
      { id: 'noir', label: 'Noir' },
      { id: 'minimalistic', label: 'Minimalistic' },
      { id: 'maximalist', label: 'Maximalist' },
      { id: 'romantic_soft', label: 'Romantic / Soft' },
      { id: 'harsh_raw', label: 'Harsh / Raw' },
      { id: 'glossy_commercial', label: 'Glossy Commercial' },
      { id: 'intimate_observational', label: 'Intimate Observational' },
      { id: 'epic_scope', label: 'Epic Scope' },
      { id: 'experimental', label: 'Experimental' }
    ]
  },

  lighting: {
    label: 'Lighting Style',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'natural_light', label: 'Natural Light' },
      { id: 'soft_light', label: 'Soft Light' },
      { id: 'hard_light', label: 'Hard Light' },
      { id: 'low_key', label: 'Low Key' },
      { id: 'high_key', label: 'High Key' },
      { id: 'motivated', label: 'Motivated Lighting' },
      { id: 'practicals_heavy', label: 'Practicals Heavy' },
      { id: 'backlit', label: 'Backlit' },
      { id: 'rim_light', label: 'Rim Light' },
      { id: 'silhouette', label: 'Silhouette' },
      { id: 'chiaroscuro', label: 'Chiaroscuro' },
      { id: 'neon', label: 'Neon Lighting' },
      { id: 'candlelight_firelight', label: 'Candle / Firelight' },
      { id: 'overcast_diffuse', label: 'Overcast / Diffuse' },
      { id: 'golden_hour', label: 'Golden Hour' },
      { id: 'top_light', label: 'Top Light' },
      { id: 'negative_fill', label: 'Negative Fill' },
      { id: 'volumetric_haze', label: 'Volumetric / Haze' }
    ]
  },

  movement: {
    label: 'Camera Movement (Video)',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'static_locked', label: 'Static / Locked Off' },
      { id: 'handheld', label: 'Handheld' },
      { id: 'steadicam', label: 'Steadicam' },
      { id: 'gimbal', label: 'Gimbal' },
      { id: 'dolly', label: 'Dolly' },
      { id: 'crane_jib', label: 'Crane / Jib' },
      { id: 'drone', label: 'Drone' },
      { id: 'whip_pan', label: 'Whip Pan' },
      { id: 'push_in', label: 'Push In' },
      { id: 'pull_out', label: 'Pull Out' },
      { id: 'tracking_lateral', label: 'Tracking (Lateral)' },
      { id: 'circular_orbit', label: 'Circular / Orbit' },
      { id: 'zoom', label: 'Zoom' },
      { id: 'long_take_oner', label: 'Long Take / Oner' }
    ]
  },

  color: {
    label: 'Color Palette',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'warm', label: 'Warm' },
      { id: 'cool', label: 'Cool / Blue' },
      { id: 'teal_orange', label: 'Teal & Orange' },
      { id: 'monochrome', label: 'Monochrome' },
      { id: 'black_and_white', label: 'Black & White' },
      { id: 'desaturated', label: 'Desaturated' },
      { id: 'high_saturation', label: 'High Saturation' },
      { id: 'pastel', label: 'Pastel' },
      { id: 'neon_palette', label: 'Neon Palette' },
      { id: 'earth_tones', label: 'Earth Tones' },
      { id: 'high_contrast_color', label: 'High Contrast Color' },
      { id: 'muted_midtones', label: 'Muted Midtones' }
    ]
  },

  mood: {
    label: 'Mood / Tone',
    multi: true,
    maxSelect: 2,
    tags: [
      { id: 'tense', label: 'Tense' },
      { id: 'suspenseful', label: 'Suspenseful' },
      { id: 'intimate', label: 'Intimate' },
      { id: 'romantic', label: 'Romantic' },
      { id: 'melancholic', label: 'Melancholic' },
      { id: 'hopeful', label: 'Hopeful' },
      { id: 'ominous', label: 'Ominous' },
      { id: 'eerie', label: 'Eerie' },
      { id: 'chaotic', label: 'Chaotic' },
      { id: 'calm', label: 'Calm' },
      { id: 'playful', label: 'Playful' },
      { id: 'triumphant', label: 'Triumphant' },
      { id: 'lonely', label: 'Lonely' },
      { id: 'gritty_dark', label: 'Gritty Dark' },
      { id: 'dreamy', label: 'Dreamy' },
      { id: 'anxious', label: 'Anxious' },
      { id: 'uplifting', label: 'Uplifting' },
      { id: 'contemplative', label: 'Contemplative' }
    ]
  },

  timeOfDay: {
    label: 'Time of Day',
    multi: false,
    tags: [
      { id: 'day', label: 'Day' },
      { id: 'night', label: 'Night' },
      { id: 'dawn', label: 'Dawn' },
      { id: 'dusk', label: 'Dusk' },
      { id: 'golden_hour_time', label: 'Golden Hour' },
      { id: 'blue_hour', label: 'Blue Hour' },
      { id: 'interior_day', label: 'Interior Day' },
      { id: 'interior_night', label: 'Interior Night' }
    ]
  },

  location: {
    label: 'Location / Context',
    multi: true,
    maxSelect: 1,
    tags: [
      { id: 'interior', label: 'Interior' },
      { id: 'exterior', label: 'Exterior' },
      { id: 'urban', label: 'Urban' },
      { id: 'rural', label: 'Rural' },
      { id: 'nature', label: 'Nature' },
      { id: 'industrial', label: 'Industrial' },
      { id: 'domestic_home', label: 'Domestic / Home' },
      { id: 'office_corporate', label: 'Office / Corporate' },
      { id: 'nightlife', label: 'Nightlife' },
      { id: 'studio_stage', label: 'Studio / Stage' }
    ]
  },

  genre: {
    label: 'Genre / Context',
    multi: false,
    tags: [
      { id: 'drama', label: 'Drama' },
      { id: 'thriller', label: 'Thriller' },
      { id: 'horror', label: 'Horror' },
      { id: 'scifi', label: 'Sci-Fi' },
      { id: 'action', label: 'Action' },
      { id: 'comedy', label: 'Comedy' },
      { id: 'romance', label: 'Romance' },
      { id: 'fantasy', label: 'Fantasy' },
      { id: 'documentary_genre', label: 'Documentary' },
      { id: 'commercial', label: 'Commercial' },
      { id: 'music_video', label: 'Music Video' },
      { id: 'period', label: 'Period' }
    ]
  }
};

/**
 * Get flattened list of all available tags for reference
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

module.exports = { TAG_CATALOG, getAllTags };
