/**
 * GET /api/library-cache
 *
 * Fetches the library snapshot from Supabase using the service role key
 * (bypasses RLS). Accepts an optional ?device_id= query param to filter
 * by user. Falls back to singleton_id=1 for legacy/unregistered devices.
 *
 * This endpoint runs on the server (Vercel), so SUPABASE_SERVICE_ROLE_KEY
 * is never exposed to the browser.
 */

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function GET(request) {
  const supabase = getSupabase();

  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase not configured on server' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('device_id') || null;

  try {
    let data = null;
    let error = null;

    // Try with device_id first if provided
    if (deviceId) {
      const result = await supabase
        .from('library_cache')
        .select('links, updated_at')
        .eq('user_id', deviceId)
        .single();

      data = result.data;
      error = result.error;
    }

    // Fallback: try singleton_id=1 (legacy / unregistered devices)
    if (!data) {
      const fallback = await supabase
        .from('library_cache')
        .select('links, updated_at')
        .eq('singleton_id', 1)
        .single();

      data = fallback.data;
      error = fallback.error;
    }

    if (error && !data) {
      return NextResponse.json(
        { error: 'Library not found', detail: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json({
      links: Array.isArray(data?.links) ? data.links : [],
      updated_at: data?.updated_at ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Server error', detail: err.message },
      { status: 500 }
    );
  }
}
