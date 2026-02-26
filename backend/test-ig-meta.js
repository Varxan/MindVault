#!/usr/bin/env node
// Test: what does yt-dlp return for an Instagram carousel post?
const { execFile } = require('child_process');

const url = process.argv[2] || 'https://www.instagram.com/p/DU4Q4Eej0_p/';

console.log(`Testing URL: ${url}\n`);

execFile('yt-dlp', [
  '--dump-json',
  '--no-download',
  '--no-warnings',
  '--playlist-items', '1',
  '--cookies-from-browser', 'firefox',
  url,
], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
  if (err) {
    console.log('ERROR:', err.message);
    if (stderr) console.log('STDERR:', stderr.substring(0, 500));
    return;
  }

  try {
    const firstLine = stdout.trim().split('\n')[0];
    const info = JSON.parse(firstLine);

    console.log('=== IDENTITY FIELDS ===');
    console.log('title:', info.title);
    console.log('fulltitle:', info.fulltitle);
    console.log('uploader:', info.uploader);
    console.log('uploader_id:', info.uploader_id);
    console.log('uploader_url:', info.uploader_url);
    console.log('channel:', info.channel);
    console.log('channel_id:', info.channel_id);
    console.log('channel_url:', info.channel_url);
    console.log('creator:', info.creator);
    console.log('artist:', info.artist);
    console.log('playlist_title:', info.playlist_title);
    console.log('playlist:', info.playlist);
    console.log('playlist_id:', info.playlist_id);
    console.log('extractor:', info.extractor);
    console.log('webpage_url:', info.webpage_url);
    console.log('webpage_url_basename:', info.webpage_url_basename);
    console.log('\n=== THUMBNAIL ===');
    console.log('thumbnail:', info.thumbnail ? 'YES' : 'NO');
    console.log('thumbnails count:', info.thumbnails ? info.thumbnails.length : 0);
    console.log('\n=== ALL TOP-LEVEL KEYS ===');
    console.log(Object.keys(info).join(', '));
  } catch (e) {
    console.log('Parse error:', e.message);
    console.log('Raw output (first 500 chars):', stdout.substring(0, 500));
  }
});
