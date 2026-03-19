#!/usr/bin/env node
/**
 * MindVault License Key Generator
 *
 * Generates license keys in format: MVLT-XXXX-XXXX-XXXX
 * Inserts them into Supabase `licenses` table and exports a CSV to keys/
 *
 * Usage:
 *   node scripts/generate-licenses.js [count] [notes]
 *   node scripts/generate-licenses.js 10
 *   node scripts/generate-licenses.js 5 "Beta-Tester"
 *   node scripts/generate-licenses.js 1 "FREE:Marco"     ← gratis key
 *
 * npm shortcuts:
 *   npm run licenses:generate             → 10 keys
 *   npm run licenses:beta                 → 20 keys, notes "Beta"
 *   npm run licenses:free -- "Marco"      → 1 gratis key, notes "FREE:Marco"
 */

const path = require('path');
require(path.join(__dirname, '..', 'node_modules', 'dotenv')).config({
  path: path.join(__dirname, '..', 'backend', '.env')
});
const { createClient } = require(path.join(__dirname, '..', 'backend', 'node_modules', '@supabase', 'supabase-js'));
const crypto = require('crypto');
const fs = require('fs');

// ─── Config ───────────────────────────────────────────────────────────────────
const COUNT       = parseInt(process.argv[2]) || 1;
const NOTES       = process.argv[3] || '';
const MAX_DEVICES = 3;
const PREFIX      = 'MVLT';
const CHARS       = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion

// Keys are saved to keys/ in the project root (never wiped by npm run dist)
const KEYS_DIR = path.join(__dirname, '..', 'keys');
// ──────────────────────────────────────────────────────────────────────────────

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('❌  SUPABASE_URL or SUPABASE_KEY missing in backend/.env');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function generateKey() {
  const segment = (len) =>
    Array.from({ length: len }, () => CHARS[crypto.randomInt(0, CHARS.length)]).join('');
  return `${PREFIX}-${segment(4)}-${segment(4)}-${segment(4)}`;
}

async function main() {
  const isFree = NOTES.toUpperCase().startsWith('FREE:') || NOTES.toUpperCase() === 'FREE';
  const label  = isFree ? '🎁 GRATIS' : '🔑 PAID';

  console.log(`\n${label} — MindVault License Key Generator`);
  console.log(`─────────────────────────────────────────`);
  console.log(`Keys:   ${COUNT}`);
  if (NOTES) console.log(`Notes:  "${NOTES}"`);
  console.log('');

  // Generate unique keys
  const keys = [];
  const seen = new Set();
  while (keys.length < COUNT) {
    const key = generateKey();
    if (!seen.has(key)) {
      seen.add(key);
      keys.push({
        key,
        max_activations:  MAX_DEVICES,
        activation_count: 0,
        notes: NOTES || null,
      });
    }
  }

  // Insert into Supabase
  console.log('📤  Uploading to Supabase...');
  const { data, error } = await supabase.from('licenses').insert(keys).select();

  if (error) {
    console.error('❌  Supabase error:', error.message);
    process.exit(1);
  }

  console.log(`✅  ${data.length} key(s) saved to Supabase\n`);

  // Print keys to terminal
  console.log('Keys:');
  console.log('─────');
  keys.forEach(({ key }) => console.log(`  ${key}`));
  console.log('');

  // Export CSV to keys/ (persists across builds)
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().slice(0, 10);
  const slug      = NOTES
    ? '-' + NOTES.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    : '';
  const filename  = `mindvault-keys-${timestamp}${slug}.csv`;
  const outPath   = path.join(KEYS_DIR, filename);

  const csvLines = [
    'key,max_activations,notes,generated_at',
    ...keys.map(({ key, notes }) =>
      `${key},${MAX_DEVICES},"${notes || ''}",${timestamp}`
    ),
  ];
  fs.writeFileSync(outPath, csvLines.join('\n'), 'utf8');
  console.log(`📄  CSV saved to: keys/${filename}`);
  console.log('\nFertig! ✨\n');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
