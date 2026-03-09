/**
 * GET /api/library-cache?device_id=xxx
 *
 * Fetches the library snapshot for a specific device from Supabase.
 * Uses service role key (server-side only — never exposed to browser).
 * device_id is the Primary Key — each user has exactly one row.
 */

// Run on Cloudflare Workers Edge Runtime (V8 isolate — no Node.js).
// Supabase-JS v2 is fully Edge-compatible (uses fetch internally).
export const runtime = 'edge';

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured on server' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('device_id') || 'default';

  try {
    const { data, error } = await supabase
      .from('library_cache')
      .select('links, updated_at')
      .eq('device_id', deviceId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Library not found', detail: error?.message },
        { status: 404 }
      );
    }

    return NextResponse.json({
      links:      Array.isArray(data.links) ? data.links : [],
      updated_at: data.updated_at ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Server error', detail: err.message }, { status: 500 });
  }
}
