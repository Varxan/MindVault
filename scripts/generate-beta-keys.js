#!/usr/bin/env node
/**
 * MindVault — Beta Lifetime License Key Generator
 *
 * Generates MVLT-XXXX-XXXX-XXXX keys and outputs:
 *   1. Plain list (copy/paste to send to testers)
 *   2. SQL for Supabase dashboard (supabase.com → SQL Editor → New Query)
 *
 * Usage:
 *   node scripts/generate-beta-keys.js          → generates 5 keys
 *   node scripts/generate-beta-keys.js 10       → generates 10 keys
 *   node scripts/generate-beta-keys.js 3 5      → 3 keys, 5 max activations each
 */

const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion

function generateLicenseKey() {
  const segment = (len) =>
    Array.from({ length: len }, () =>
      KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)]
    ).join('');
  return `MVLT-${segment(4)}-${segment(4)}-${segment(4)}`;
}

const count       = parseInt(process.argv[2]) || 5;
const maxActivations = parseInt(process.argv[3]) || 5; // default 5 for beta (more generous than standard 3)

const keys = Array.from({ length: count }, generateLicenseKey);
const now  = new Date().toISOString();

// ── 1. Plain list ─────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log(`  MindVault Beta Keys (${count} × lifetime)`);
console.log('══════════════════════════════════════════');
keys.forEach((k, i) => console.log(`  ${String(i + 1).padStart(2, ' ')}. ${k}`));
console.log('══════════════════════════════════════════\n');

// ── 2. SQL for Supabase dashboard ─────────────────────────────────────────────
const rows = keys.map(k =>
  `  ('${k}', 0, ${maxActivations}, 'Beta tester — lifetime key', NOW())`
).join(',\n');

const sql = `-- MindVault Beta Lifetime Keys
-- Generated: ${now}
-- Paste into: supabase.com → SQL Editor → New Query → Run

INSERT INTO licenses (key, activation_count, max_activations, notes, created_at)
VALUES
${rows};
`;

console.log('── SQL (paste into Supabase SQL Editor) ──────────────────────────\n');
console.log(sql);
console.log('──────────────────────────────────────────────────────────────────\n');
console.log('Steps:');
console.log('  1. Go to supabase.com → your project → SQL Editor → New Query');
console.log('  2. Paste the SQL above and click Run');
console.log('  3. Keys are live immediately\n');
