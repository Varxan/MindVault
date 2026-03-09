/**
 * POST /api/waitlist
 * Inserts an email address into the Supabase `waitlist` table.
 *
 * Required Supabase table (run once in SQL editor):
 *
 *   create table if not exists waitlist (
 *     id         uuid        default gen_random_uuid() primary key,
 *     email      text        not null unique,
 *     created_at timestamptz default now()
 *   );
 *   alter table waitlist enable row level security;
 *   create policy "allow_insert" on waitlist for insert with check (true);
 */
export const runtime = 'edge';

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  return createClient(url, key);
}

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from('waitlist')
      .insert({ email: email.toLowerCase().trim() });

    // Ignore duplicate emails — silently succeed
    if (error && !error.message.includes('duplicate')) {
      console.error('Waitlist insert error:', error);
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Waitlist error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
