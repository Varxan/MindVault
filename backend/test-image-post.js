#!/usr/bin/env node
/**
 * Test: What does yt-dlp return for Instagram image posts?
 * Usage: node test-image-post.js <instagram-url>
 */

const { execFile } = require('child_process');

const url = process.argv[2];
if (!url) {
  console.log('Usage: node test-image-post.js <instagram-url>');
  process.exit(1);
}

// Clean URL
let cleanUrl = url;
try {
  const u = new URL(url);
  u.searchParams.delete('img_index');
  u.searchParams.delete('igsh');
  cleanUrl = u.toString();
} catch (e) { }

console.log('\n🔍 Probing URL with yt-dlp (all entries)...');
console.log('URL:', cleanUrl);
console.log('');

execFile('yt-dlp', [
  '--dump-json',
  '--no-download',
  '--no-warnings',
  '--cookies-from-browser', 'firefox',
  cleanUrl,
], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
  if (err) {
    console.log('❌ yt-dlp FAILED:');
    console.log('Error:', err.message);
    if (stderr) console.log('Stderr:', stderr.substring(0, 500));
    return;
  }

  const lines = stdout.trim().split('\n');
  console.log(`📦 yt-dlp returned ${lines.length} entry/entries\n`);

  lines.forEach((line, i) => {
    try {
      const info = JSON.parse(line);
      console.log(`══ Entry ${i + 1} ══════════════════════`);
      console.log('title:', info.title);
      console.log('ext:', info.ext);
      console.log('format:', info.format);
      console.log('format_id:', info.format_id);
      console.log('width:', info.width, '| height:', info.height);
      console.log('url:', info.url ? info.url.substring(0, 100) + '...' : 'NONE');
      console.log('thumbnail:', info.thumbnail ? info.thumbnail.substring(0, 100) + '...' : 'NONE');
      console.log('uploader:', info.uploader);
      console.log('extractor:', info.extractor);

      // Check thumbnails array
      if (info.thumbnails && info.thumbnails.length > 0) {
        console.log('thumbnails:', info.thumbnails.length, 'entries');
        info.thumbnails.forEach((t, j) => {
          console.log(`  thumb[${j}]: ${t.url ? t.url.substring(0, 80) + '...' : 'no url'} (${t.width}x${t.height})`);
        });
      }

      // Check formats
      if (info.formats && info.formats.length > 0) {
        console.log('formats:', info.formats.length, 'entries');
        info.formats.forEach((f, j) => {
          console.log(`  format[${j}]: id=${f.format_id} ext=${f.ext} vcodec=${f.vcodec} acodec=${f.acodec} ${f.width}x${f.height} size=${f.filesize || '?'}`);
          if (f.url) console.log(`    url: ${f.url.substring(0, 80)}...`);
        });
      } else {
        console.log('formats: NONE');
      }

      console.log('');
    } catch (e) {
      console.log(`Entry ${i + 1}: Could not parse JSON - ${e.message}`);
    }
  });
});
