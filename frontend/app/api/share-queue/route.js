/**
 * GET /api/share-queue?device_id=xxx
 *
 * Returns unprocessed share_queue rows for the desktop poller.
 * Uses service role key — bypasses RLS so the desktop doesn't need
 * the service role key locally.
 *
 * POST /api/share-queue
 *
 * Inserts a shared link into the Supabase share_queue using the
 * service role key (server-side only — bypasses RLS).
 *
 * Body: { url, title, text, tags, device_id }
 *
 * PATCH /api/share-queue
 *
 * Updates an existing share_queue row.
 * Body (tag update):      { id, tags, tags_ready }
 * Body (mark processed):  { id, processed: true }
 */

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
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('device_id') || null;

    // Return all unprocessed rows:
    // - rows matching this device_id, OR
    // - rows with user_id IS NULL (phone shared before pairing / no device set)
    // This is a single-user app so no cross-user leakage risk.
    let data, error;

    if (deviceId) {
      // user_id = deviceId OR user_id IS NULL
      const result = await supabase
        .from('share_queue')
        .select('*')
        .eq('processed', false)
        .or(`user_id.eq.${deviceId},user_id.is.null`)
        .order('created_at', { ascending: true });
      data = result.data; error = result.error;
    } else {
      const result = await supabase
        .from('share_queue')
        .select('*')
        .eq('processed', false)
        .order('created_at', { ascending: true });
      data = result.data; error = result.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { url, title, text, tags, device_id, space } = body;

    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const row = {
      url,
      title:      title || null,
      text:       text  || null,
      tags:       tags  || null,
      tags_ready: false,
      processed:  false,
      space:      (space === 'mind' ? 'mind' : 'eye'),  // eye | mind, default eye
      ...(device_id ? { user_id: device_id } : {}),
    };

    const { data, error } = await supabase
      .from('share_queue')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { id, tags, tags_ready, processed, space } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Build update payload — only include fields that were provided
    const update = {};
    if (processed !== undefined)  update.processed  = processed;
    if (tags      !== undefined)  update.tags        = tags || null;
    if (tags_ready !== undefined) update.tags_ready  = tags_ready;
    if (space     !== undefined)  update.space       = (space === 'mind' ? 'mind' : 'eye');

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('share_queue')
      .update(update)
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
