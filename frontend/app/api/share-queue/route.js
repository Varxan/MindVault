/**
 * POST /api/share-queue
 *
 * Inserts a shared link into the Supabase share_queue using the
 * service role key (server-side only — bypasses RLS).
 *
 * Body: { url, title, text, tags, device_id }
 *
 * PATCH /api/share-queue
 *
 * Updates an existing share_queue row (attach tags, mark tags_ready).
 * Body: { id, tags, tags_ready }
 */

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { url, title, text, tags, device_id } = body;

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
    const { id, tags, tags_ready } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('share_queue')
      .update({ tags: tags || null, tags_ready: tags_ready ?? true })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
