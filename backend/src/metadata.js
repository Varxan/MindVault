const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { execFile } = require('child_process');

// Platforms where yt-dlp gives better metadata than og:image
const VIDEO_PLATFORMS = ['instagram', 'youtube', 'vimeo', 'tiktok'];

/**
 * Fetch Vimeo metadata via oEmbed API (fast, returns official poster thumbnail).
 * yt-dlp often returns auto-generated "default" thumbnails with padding for Vimeo.
 */
async function fetchVimeoMetadata(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}&width=1920`;
    const response = await fetch(oembedUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();

    return {
      title: data.title || null,
      description: data.description || null,
      thumbnail_url: data.thumbnail_url || null,
      author_url: data.author_url || null,
      width: data.width || null,
      height: data.height || null,
    };
  } catch (err) {
    console.log(`[Metadata] Vimeo oEmbed failed: ${err.message}`);
    return null;
  }
}

/**
 * Fetch YouTube metadata via oEmbed API (official, reliable, no yt-dlp needed).
 * YouTube oEmbed: https://www.youtube.com/oembed?url=<url>&format=json
 * Returns title + thumbnail. Does NOT return description or exact dimensions.
 */
async function fetchYouTubeMetadata(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();

    return {
      title:         data.title         || null,
      description:   null,  // oEmbed doesn't provide description
      thumbnail_url: data.thumbnail_url || null,
      author_url:    null,
      width:         data.width         || null,
      height:        data.height        || null,
    };
  } catch (err) {
    console.log(`[Metadata] YouTube oEmbed failed: ${err.message}`);
    return null;
  }
}

/**
 * Detect source platform from URL
 */
function detectSource(url) {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname.includes('instagram.com') || hostname.includes('instagr.am')) return 'instagram';
  if (hostname.includes('vimeo.com')) return 'vimeo';
  if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube';
  if (hostname.includes('tiktok.com')) return 'tiktok';
  if (hostname.includes('pinterest.com') || hostname.includes('pin.it')) return 'pinterest';
  if (hostname.includes('behance.net')) return 'behance';
  if (hostname.includes('dribbble.com')) return 'dribbble';
  if (hostname.includes('flickr.com')) return 'flickr';
  if (hostname.includes('unsplash.com')) return 'unsplash';
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';

  return 'web';
}

/**
 * Fetch Open Graph / meta data from a URL
 */
async function fetchMetadata(url) {
  const result = {
    title: null,
    description: null,
    thumbnail_url: null,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) return result;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return result;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Title: og:title > twitter:title > <title>
    result.title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text().trim() ||
      null;

    // Description: og:description > meta description
    result.description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      null;

    // Thumbnail: og:image > twitter:image
    result.thumbnail_url =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('meta[name="twitter:image:src"]').attr('content') ||
      null;

    // Make relative thumbnail URLs absolute
    if (result.thumbnail_url && !result.thumbnail_url.startsWith('http')) {
      try {
        result.thumbnail_url = new URL(result.thumbnail_url, url).href;
      } catch {
        result.thumbnail_url = null;
      }
    }

    // Truncate long strings
    if (result.title && result.title.length > 200) {
      result.title = result.title.substring(0, 200);
    }
    if (result.description && result.description.length > 500) {
      result.description = result.description.substring(0, 500);
    }
  } catch (err) {
    // Silently fail – metadata is optional
    console.log(`[Metadata] Could not fetch: ${url} – ${err.message}`);
  }

  return result;
}

/**
 * Fetch metadata via yt-dlp for video platforms.
 * Returns the actual video thumbnail (correct aspect ratio) plus title/description.
 * Falls back gracefully if yt-dlp is not installed or fails.
 */
function fetchVideoMetadata(url) {
  // Clean Instagram URLs: remove img_index, igsh params that confuse yt-dlp
  let cleanUrl = url;
  if (url.includes('instagram.com')) {
    try {
      const u = new URL(url);
      u.searchParams.delete('img_index');
      u.searchParams.delete('igsh');
      cleanUrl = u.toString();
    } catch (e) { /* keep original */ }
  }

  return new Promise((resolve) => {
    execFile('yt-dlp', [
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--playlist-items', '1',
      '--cookies-from-browser', 'firefox',
      cleanUrl,
    ], { timeout: 20000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        console.log(`[Metadata] yt-dlp failed for ${url}: ${err.message}`);
        return resolve(null);
      }

      try {
        const firstLine = stdout.trim().split('\n')[0];
        const info = JSON.parse(firstLine);

        // Pick best thumbnail: prefer one matching video dimensions
        let bestThumb = info.thumbnail || null;

        if (info.thumbnails && info.thumbnails.length > 0) {
          // Sort by resolution (largest first) and pick one with matching aspect ratio
          const videoRatio = info.width && info.height ? info.width / info.height : null;

          const sorted = [...info.thumbnails]
            .filter(t => t.url)
            .sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));

          if (videoRatio && sorted.length > 0) {
            // Find thumbnail closest to video aspect ratio
            const match = sorted.find(t => {
              if (!t.width || !t.height) return false;
              const thumbRatio = t.width / t.height;
              return Math.abs(thumbRatio - videoRatio) < 0.2;
            });
            if (match) bestThumb = match.url;
          }

          // Fallback to largest thumbnail
          if (!bestThumb && sorted.length > 0) {
            bestThumb = sorted[0].url;
          }
        }

        // Debug: log all identity fields from yt-dlp for Instagram
        if (url.includes('instagram.com')) {
          console.log(`[Metadata] Instagram debug:`, JSON.stringify({
            title: info.title,
            fulltitle: info.fulltitle,
            uploader: info.uploader,
            uploader_id: info.uploader_id,
            uploader_url: info.uploader_url,
            channel: info.channel,
            channel_id: info.channel_id,
            channel_url: info.channel_url,
            creator: info.creator,
            artist: info.artist,
            webpage_url_basename: info.webpage_url_basename,
            playlist_title: info.playlist_title,
            extractor: info.extractor,
          }, null, 2));
        }

        // Build author URL — try many fields yt-dlp might use
        // Extract username from playlist_title ("Post by username") as last resort
        const playlistUser = info.playlist_title
          ? (info.playlist_title.match(/^Post by (.+)$/i) || [])[1] || null
          : null;
        const uploaderName = info.uploader || info.channel || info.uploader_id || info.channel_id || info.creator || info.artist || playlistUser || null;
        let authorUrl = info.uploader_url || info.channel_url || null;
        if (!authorUrl && uploaderName && url.includes('instagram.com')) {
          authorUrl = `https://www.instagram.com/${uploaderName}/`;
        }

        // For Instagram: use uploader name as title if the item title is generic
        // (carousel items often get generic titles like "Video 1", "Photo 2", or just a number)
        let finalTitle = info.title || info.fulltitle || null;
        if (url.includes('instagram.com')) {
          const isGeneric = !finalTitle || /^(Video|Photo|Reel|Image|Post)?\s*\d*$/i.test((finalTitle || '').trim());
          if (isGeneric && uploaderName) {
            finalTitle = uploaderName;
          } else if (isGeneric) {
            // Last resort: try to extract username from the URL pattern
            // instagram.com/username/reel/xxx or /p/xxx posted by user
            finalTitle = info.playlist_title || finalTitle;
          }
        }

        const result = {
          title: finalTitle,
          description: info.description || null,
          thumbnail_url: bestThumb,
          author_url: authorUrl,
          width: info.width || null,
          height: info.height || null,
        };

        console.log(`[Metadata] yt-dlp: ${result.title || url} (${result.width}x${result.height})`);
        resolve(result);
      } catch (e) {
        console.log(`[Metadata] yt-dlp parse error: ${e.message}`);
        resolve(null);
      }
    });
  });
}

/**
 * Fetch Instagram image URL via /media/?size=l endpoint.
 * Works for image-only posts where yt-dlp returns nothing.
 * Returns the CDN redirect URL as thumbnail.
 */
async function fetchInstagramMediaUrl(url) {
  try {
    const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (!match) return null;
    const shortcode = match[2];

    const mediaUrl = `https://www.instagram.com/p/${shortcode}/media/?size=l`;
    const res = await fetch(mediaUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location) {
        console.log(`[Metadata] Instagram /media/ redirect: ${location.substring(0, 80)}...`);
        return location;
      }
    } else if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('image')) {
        // The URL itself serves the image directly
        return mediaUrl;
      }
    }
  } catch (err) {
    console.log(`[Metadata] Instagram /media/ failed: ${err.message}`);
  }
  return null;
}

/**
 * Smart metadata fetch: uses yt-dlp for video platforms, og:image for everything else.
 * For Vimeo: uses oEmbed API first (fast, returns official poster thumbnail).
 * For Instagram: falls back to /media/?size=l when yt-dlp fails (image-only posts).
 */
async function fetchSmartMetadata(url, source) {
  // YouTube: oEmbed first — fast, official, never blocked, always has real title
  // This fixes iOS share sheets sending notification text instead of video title
  if (source === 'youtube') {
    const ytMeta = await fetchYouTubeMetadata(url);
    if (ytMeta && ytMeta.title) {
      console.log(`[Metadata] YouTube oEmbed: "${ytMeta.title}"`);
      // Try yt-dlp additionally for better thumbnail (maxresdefault), but keep oEmbed title
      const ytdlpMeta = await fetchVideoMetadata(url);
      if (ytdlpMeta && ytdlpMeta.thumbnail_url) {
        ytMeta.thumbnail_url = ytdlpMeta.thumbnail_url;
      }
      return ytMeta;
    }
    console.log(`[Metadata] YouTube oEmbed failed, falling back to yt-dlp for ${url}`);
  }

  // Vimeo: use oEmbed API first (fast, official poster thumbnail)
  if (source === 'vimeo') {
    const vimeoMeta = await fetchVimeoMetadata(url);
    if (vimeoMeta && vimeoMeta.thumbnail_url) {
      console.log(`[Metadata] Vimeo oEmbed: ${vimeoMeta.title} (${vimeoMeta.width}x${vimeoMeta.height})`);
      return vimeoMeta;
    }
    console.log(`[Metadata] Vimeo oEmbed failed, trying yt-dlp for ${url}`);
  }

  // For video platforms, try yt-dlp (correct aspect ratio)
  if (VIDEO_PLATFORMS.includes(source)) {
    const videoMeta = await fetchVideoMetadata(url);
    if (videoMeta) {
      // If yt-dlp got title/author but no thumbnail, try og:image as fallback for thumbnail only
      if (!videoMeta.thumbnail_url) {
        console.log(`[Metadata] yt-dlp got metadata but no thumbnail, trying og:image for ${url}`);
        const ogMeta = await fetchMetadata(url);
        if (ogMeta && ogMeta.thumbnail_url) {
          videoMeta.thumbnail_url = ogMeta.thumbnail_url;
        }
      }
      return videoMeta;
    }

    // yt-dlp failed completely — Instagram-specific fallback
    if (source === 'instagram') {
      console.log(`[Metadata] yt-dlp failed for Instagram, trying /media/?size=l fallback`);
      const igImageUrl = await fetchInstagramMediaUrl(url);
      if (igImageUrl) {
        return {
          title: null,
          description: null,
          thumbnail_url: igImageUrl,
          author_url: null,
          width: null,
          height: null,
        };
      }
    }

    // Fallback to og:image if yt-dlp fails completely
    console.log(`[Metadata] yt-dlp failed, falling back to og:image for ${url}`);
  }

  // Standard og:image fetch
  const meta = await fetchMetadata(url);
  return { ...meta, author_url: null, width: null, height: null };
}

module.exports = { detectSource, fetchMetadata, fetchSmartMetadata, fetchVideoMetadata, VIDEO_PLATFORMS };
