/**
 * Test: Instagram carousel image extraction
 * Tests multiple methods to get ALL images from a carousel post.
 *
 * Usage: node test-carousel.js <instagram-url>
 */
const fetch = require('node-fetch');

const url = process.argv[2];
if (!url) {
  console.log('Usage: node test-carousel.js <instagram-url>');
  process.exit(1);
}

const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
if (!match) {
  console.log('Could not extract shortcode from URL');
  process.exit(1);
}
const shortcode = match[2];
console.log(`Shortcode: ${shortcode}\n`);

async function testMethod1_Embed() {
  console.log('=== Method 1: Embed page ===');
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;

  try {
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      redirect: 'follow',
      timeout: 15000,
    });

    const html = await res.text();
    console.log(`HTML length: ${html.length}`);

    // Check for EmbeddedMediaImage
    const imgMatches = html.match(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]+/g) || [];
    console.log(`EmbeddedMediaImage tags found: ${imgMatches.length}`);
    imgMatches.forEach((m, i) => {
      const src = m.match(/src="([^"]+)"/);
      console.log(`  Image ${i+1}: ${src ? src[1].substring(0, 80) + '...' : 'NO SRC'}`);
    });

    // Check for CDN URLs in any img src
    const allImgSrcs = html.match(/src="(https:\/\/[^"]*?(?:cdninstagram|fbcdn)[^"]*?)"/g) || [];
    console.log(`\nAll CDN img srcs: ${allImgSrcs.length}`);
    const seen = new Set();
    allImgSrcs.forEach((m, i) => {
      const u = m.match(/"([^"]+)"/)[1].replace(/&amp;/g, '&');
      const base = u.split('?')[0];
      if (!seen.has(base)) {
        seen.add(base);
        console.log(`  ${i+1}: ${u.substring(0, 100)}...`);
      }
    });

    // Check script tags for image URLs
    const scriptUrls = html.match(/https:\\u002F\\u002F[^"]*?(?:cdninstagram|fbcdn)[^"]*/g) || [];
    console.log(`\nScript-embedded CDN URLs: ${scriptUrls.length}`);
    const seenScript = new Set();
    scriptUrls.forEach((m, i) => {
      const decoded = m.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&');
      const base = decoded.split('?')[0];
      if (!seenScript.has(base)) {
        seenScript.add(base);
        console.log(`  ${i+1}: ${decoded.substring(0, 100)}...`);
      }
    });

    // Check for "edge_sidecar_to_children" (carousel indicator in embedded data)
    if (html.includes('edge_sidecar_to_children')) {
      console.log('\n✓ Carousel data (edge_sidecar_to_children) FOUND in embed page!');

      // Try to extract the JSON
      const jsonMatch = html.match(/window\.__additionalDataLoaded\s*\(\s*['"][^'"]+['"]\s*,\s*(\{.+?\})\s*\)/s);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          const media = data?.shortcode_media || data?.graphql?.shortcode_media;
          if (media?.edge_sidecar_to_children?.edges) {
            const edges = media.edge_sidecar_to_children.edges;
            console.log(`  Carousel items: ${edges.length}`);
            edges.forEach((edge, i) => {
              const node = edge.node;
              console.log(`  Item ${i+1}: ${node.display_url?.substring(0, 80)}... (${node.__typename})`);
            });
          }
        } catch (e) {
          console.log(`  JSON parse failed: ${e.message}`);
        }
      }
    } else {
      console.log('\n✗ No carousel data in embed page');
    }

    // Check for EmbedSidecarGraphQL or similar
    const sidecarMatch = html.match(/class="[^"]*Sidecar[^"]*"/g) || [];
    console.log(`Sidecar classes: ${sidecarMatch.length}`);

  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

async function testMethod2_MediaEndpoint() {
  console.log('\n=== Method 2: /media/?size=l (single image only) ===');
  const mediaUrl = `https://www.instagram.com/p/${shortcode}/media/?size=l`;

  try {
    const res = await fetch(mediaUrl, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    });

    if (res.status >= 300 && res.status < 400) {
      console.log(`Redirect → ${res.headers.get('location')?.substring(0, 80)}...`);
    } else {
      console.log(`Status: ${res.status}, Content-Type: ${res.headers.get('content-type')}`);
    }
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

async function testMethod3_EmbedJSON() {
  console.log('\n=== Method 3: Embed page with captioned variant ===');
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;

  try {
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      timeout: 15000,
    });

    const html = await res.text();
    console.log(`HTML length: ${html.length}`);

    // Look for image URLs in ALL contexts
    const allCdnUrls = new Set();

    // Pattern 1: Regular src attributes
    const srcPattern = /(?:src|data-src|srcset)="(https:\/\/[^"]*?(?:cdninstagram|fbcdn|instagram)[^"]*?)"/g;
    let m;
    while ((m = srcPattern.exec(html)) !== null) {
      allCdnUrls.add(m[1].replace(/&amp;/g, '&'));
    }

    // Pattern 2: Unicode-escaped URLs in scripts
    const scriptPattern = /https:\\u002F\\u002F[^"\\]*?(?:cdninstagram|fbcdn)[^"\\]*/g;
    while ((m = scriptPattern.exec(html)) !== null) {
      allCdnUrls.add(m[0].replace(/\\u002F/g, '/').replace(/\\u0026/g, '&'));
    }

    // Pattern 3: display_url in JSON
    const displayPattern = /"display_url"\s*:\s*"(https:[^"]+)"/g;
    while ((m = displayPattern.exec(html)) !== null) {
      allCdnUrls.add(m[1].replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
    }

    // Deduplicate by base path
    const uniqueByBase = new Map();
    for (const u of allCdnUrls) {
      const base = u.split('?')[0];
      if (!uniqueByBase.has(base)) {
        uniqueByBase.set(base, u);
      }
    }

    console.log(`Total unique CDN URLs found: ${uniqueByBase.size}`);
    let idx = 0;
    for (const [base, full] of uniqueByBase) {
      idx++;
      console.log(`  ${idx}: ${full.substring(0, 120)}...`);
    }

  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

async function testMethod4_GraphQL() {
  console.log('\n=== Method 4: Instagram GraphQL API ===');
  const gqlUrl = `https://www.instagram.com/graphql/query/?query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables={"shortcode":"${shortcode}"}`;

  try {
    const res = await fetch(gqlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 10000,
    });

    console.log(`Status: ${res.status}`);
    if (res.ok) {
      const text = await res.text();
      console.log(`Response: ${text.substring(0, 300)}...`);
    }
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

(async () => {
  await testMethod1_Embed();
  await testMethod2_MediaEndpoint();
  await testMethod3_EmbedJSON();
  await testMethod4_GraphQL();

  console.log('\n=== Summary ===');
  console.log('Run this with an Instagram carousel URL to see which methods return multiple images.');
})();
