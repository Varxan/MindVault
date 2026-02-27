#!/usr/bin/env node
/**
 * MindVault License Key Generator
 *
 * Generates license keys in format: MVLT-XXXX-XXXX-XXXX
 * - Inserts them into Supabase `licenses` table
 * - Exports a CSV file you can use for distribution (email, Gumroad, etc.)
 *
 * Usage:
 *   node scripts/generate-licenses.js [count] [notes]
 *
 * Examples:
 *   node scripts/generate-licenses.js 10
 *   node scripts/generate-licenses.js 50 "Beta Launch"
 *   node scripts/generate-licenses.js 1 "Gumroad Order #4421"
 */

const path = require('path');
require(path.join(__dirname, '..', 'node_modules', 'dotenv')).config({
  path: path.join(__dirname, '..', 'backend', '.env')
});
const { createClient } = require(path.join(__dirname, '..', 'backend', 'node_modules', '@supabase', 'supabase-js'));
const crypto = require('crypto');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ─── Config ───────────────────────────────────────────────────────────────────
const COUNT         = parseInt(process.argv[2]) || 10;
const NOTES         = process.argv[3] || '';
const MAX_DEVICES   = 3;   // how many Macs per license key
const PREFIX        = 'MVLT';
const CHARS         = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
// ──────────────────────────────────────────────────────────────────────────────

function generateKey() {
  const segment = (len) =>
    Array.from({ length: len }, () =>
      CHARS[crypto.randomInt(0, CHARS.length)]
    ).join('');

  return `${PREFIX}-${segment(4)}-${segment(4)}-${segment(4)}`;
}

async function main() {
  console.log(`\n🔑 MindVault License Key Generator`);
  console.log(`───────────────────────────────────`);
  console.log(`Generating ${COUNT} key(s)...`);
  if (NOTES) console.log(`Notes: "${NOTES}"`);
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
        max_activations: MAX_DEVICES,
        activation_count: 0,
        notes: NOTES || null,
      });
    }
  }

  // Insert into Supabase
  console.log('📤 Uploading to Supabase...');
  const { data, error } = await supabase
    .from('licenses')
    .insert(keys)
    .select();

  if (error) {
    console.error('❌ Supabase error:', error.message);
    process.exit(1);
  }

  console.log(`✅ ${data.length} keys inserted into Supabase\n`);

  // Print keys to console
  console.log('Generated Keys:');
  console.log('───────────────');
  keys.forEach(({ key }) => console.log(`  ${key}`));
  console.log('');

  // Export CSV
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `mindvault-keys-${timestamp}${NOTES ? '-' + NOTES.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : ''}.csv`;
  const outPath = path.join(__dirname, '..', 'dist', filename);

  // Make sure dist folder exists
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const csvLines = [
    'key,max_activations,notes,generated_at',
    ...keys.map(({ key, notes }) =>
      `${key},${MAX_DEVICES},"${notes || ''}",${timestamp}`
    ),
  ];

  fs.writeFileSync(outPath, csvLines.join('\n'), 'utf8');
  console.log(`📄 CSV exported to: dist/${filename}`);
  console.log('\nDone! ✨\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
