#!/usr/bin/env node
// Quick fix: update link 83 title via the refresh-metadata API
const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/links/83/refresh-metadata',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    console.log('Updated title:', result.title);
    console.log('Updated author_url:', result.author_url);
  });
});
req.end();
