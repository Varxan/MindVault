#!/usr/bin/env node
/**
 * Test: Can we extract images from Instagram embed pages?
 * Usage: node test-embed.js <instagram-url>
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const url = process.argv[2] || 'https://www.instagram.com/p/DGTnFvmi6gQ/';

// Extract shortcode
const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
if (!match) {
  console.log('Could not extract Instagram shortcode from URL');
  process.exit(1);
}
const shortcode = match[2];

async function testEmbed() {
  console.log('\n🔍 Testing Instagram image extraction...');
  console.log('URL:', url);
  console.log('Shortcode:', shortcode);

  // Method 1: Embed page
  console.log('\n── Method 1: Embed Page ──');
  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
    console.log('Fetching:', embedUrl);
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });
    console.log('Status:', res.status);
    const html = await res.text();
    console.log('HTML length:', html.length);

    const $ = cheerio.load(html);

    // Look for images
    const images = [];
    $('img').each((i, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('cdninstagram') || src && src.includes('fbcdn')) {
        images.push(src);
      }
    });
    console.log('CDN images found:', images.length);
    images.forEach((img, i) => console.log(`  [${i}]: ${img.substring(0, 100)}...`));

    // Look for images in EmbeddedMediaImage class
    $('img.EmbeddedMediaImage').each((i, el) => {
      console.log(`  EmbeddedMediaImage[${i}]: ${$(el).attr('src')?.substring(0, 100)}...`);
    });

    // Look in srcset
    $('img[srcset]').each((i, el) => {
      console.log(`  srcset[${i}]: ${$(el).attr('srcset')?.substring(0, 150)}...`);
    });

    // Look for image URLs in script tags
    const scriptImages = [];
    $('script').each((i, el) => {
      const text = $(el).html() || '';
      const matches = text.match(/https?:\/\/[^"'\s]*?cdninstagram\.com[^"'\s]*/g) || [];
      const matches2 = text.match(/https?:\/\/[^"'\s]*?fbcdn\.net[^"'\s]*/g) || [];
      scriptImages.push(...matches, ...matches2);
    });
    console.log('Script CDN URLs:', scriptImages.length);
    scriptImages.forEach((img, i) => console.log(`  script[${i}]: ${img.substring(0, 120)}...`));

    // Also check og:image in embed
    const ogImage = $('meta[property="og:image"]').attr('content');
    console.log('og:image:', ogImage ? ogImage.substring(0, 100) + '...' : 'NONE');

  } catch (err) {
    console.log('Error:', err.message);
  }

  // Method 2: Media endpoint (public posts only)
  console.log('\n── Method 2: Media endpoint ──');
  try {
    const mediaUrl = `https://www.instagram.com/p/${shortcode}/media/?size=l`;
    console.log('Fetching:', mediaUrl);
    const res = await fetch(mediaUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    });
    console.log('Status:', res.status);
    const location = res.headers.get('location');
    if (location) {
      console.log('Redirects to:', location.substring(0, 120) + '...');
      // Check if it's an actual image
      const imgRes = await fetch(location, { method: 'HEAD' });
      console.log('Image status:', imgRes.status, '| Type:', imgRes.headers.get('content-type'), '| Size:', imgRes.headers.get('content-length'));
    } else {
      const ct = res.headers.get('content-type');
      console.log('Content-Type:', ct);
      if (ct && ct.includes('image')) {
        console.log('Direct image! Size:', res.headers.get('content-length'));
      }
    }
  } catch (err) {
    console.log('Error:', err.message);
  }

  // Method 3: oEmbed
  console.log('\n── Method 3: oEmbed ──');
  try {
    const oembedUrl = `https://api.instagram.com/oembed/?url=https://www.instagram.com/p/${shortcode}/`;
    console.log('Fetching:', oembedUrl);
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    console.log('Status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Title:', data.title);
      console.log('Author:', data.author_name);
      console.log('Author URL:', data.author_url);
      console.log('Thumbnail:', data.thumbnail_url ? data.thumbnail_url.substring(0, 100) + '...' : 'NONE');
      console.log('Width:', data.thumbnail_width, '| Height:', data.thumbnail_height);
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

testEmbed();
