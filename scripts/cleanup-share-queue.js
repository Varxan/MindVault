#!/usr/bin/env node
/**
 * Marks all unprocessed share_queue entries as processed.
 * Run once from the MindVault root:
 *   node scripts/cleanup-share-queue.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,   // service_role — bypasses RLS
  { auth: { persistSession: false } },
);

async function main() {
  // Show what's pending
  const { data: pending, error: fetchErr } = await sb
    .from('share_queue')
    .select('id, url, created_at, processed')
    .eq('processed', false)
    .order('created_at', { ascending: true });

  if (fetchErr) { console.error('❌ Fetch error:', fetchErr.message); process.exit(1); }

  if (!pending?.length) {
    console.log('✅ share_queue is already clean — nothing to do.');
    return;
  }

  console.log(`Found ${pending.length} unprocessed entries:`);
  pending.forEach(r => console.log(`  • [${r.id}] ${r.created_at.slice(0, 16)}  ${r.url?.slice(0, 70)}`));

  // Mark all as processed
  const { error: updateErr } = await sb
    .from('share_queue')
    .update({ processed: true })
    .eq('processed', false);

  if (updateErr) { console.error('❌ Update error:', updateErr.message); process.exit(1); }

  console.log(`\n✅ Marked ${pending.length} entries as processed. Queue is clean.`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
