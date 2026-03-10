/**
 * MindVault Activation API — Cloudflare Worker
 *
 * Acts as a secure proxy between the Electron app and Supabase.
 * The Supabase service role key never leaves this Worker — it is
 * stored as a Cloudflare secret and is never bundled into the DMG.
 *
 * Endpoints:
 *   POST /activation/trial      — Start 30-day free trial (new user)
 *   POST /activation/signin     — Sign in (returning user / second device)
 *   POST /activation/activate   — Activate with license key
 *
 * All requests must carry:
 *   Authorization: Bearer <APP_SECRET>
 *
 * Environment variables (set via `wrangler secret put`):
 *   APP_SECRET          — shared secret between Worker and Electron app
 *   SUPABASE_URL        — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY — Supabase service role key (bypasses RLS)
 *   SUPABASE_ANON_KEY   — Supabase anon key (for Auth endpoints)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Only POST allowed
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    // Verify shared secret
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token || token !== env.APP_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      const body = await request.json();

      if (path === '/activation/trial')    return handleStartTrial(body, env);
      if (path === '/activation/signin')   return handleSignIn(body, env);
      if (path === '/activation/activate') return handleActivate(body, env);

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: 'Internal server error' }, 500);
    }
  },
};

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /activation/trial
 * Body: { email, password, deviceId }
 * Creates a Supabase Auth account and starts a 30-day trial.
 * On reinstall, restores the original trial start date.
 */
async function handleStartTrial({ email, password, deviceId }, env) {
  if (!email || !password) return json({ error: 'Email and password required.' }, 400);

  // 1. Create or sign in via Supabase Auth
  let authUserId = null;
  const signUpRes = await supabaseAuth('signup', { email, password }, env);

  if (signUpRes.ok && signUpRes.data?.user?.id) {
    authUserId = signUpRes.data.user.id;
  } else if (
    signUpRes.data?.code === 'user_already_exists' ||
    signUpRes.status === 422
  ) {
    // Account exists — sign in to get auth ID
    const signInRes = await supabaseAuth('token?grant_type=password', { email, password }, env);
    if (signInRes.ok && signInRes.data?.user?.id) {
      authUserId = signInRes.data.user.id;
    } else {
      const msg = signInRes.data?.error_description || 'An account with this email already exists. Please sign in instead.';
      return json({ error: msg });
    }
  } else {
    const msg = signUpRes.data?.message || 'Could not create account. Please check your connection.';
    return json({ error: msg });
  }

  // 2. Upsert users table — preserve original trial date on reinstall
  const existingRes = await supabaseDb('GET', 'users', null, `email=eq.${encodeURIComponent(email)}&select=*`, env);
  let trialStartedAt;

  if (existingRes.ok && existingRes.data?.length > 0) {
    trialStartedAt = existingRes.data[0].trial_started_at;
  } else {
    trialStartedAt = new Date().toISOString();
    await supabaseDb('POST', 'users', {
      email,
      device_id:        deviceId || crypto.randomUUID(),
      trial_started_at: trialStartedAt,
      is_licensed:      false,
    }, null, env);
  }

  return json({ success: true, authUserId, trialStartedAt });
}

/**
 * POST /activation/signin
 * Body: { email, password }
 * Authenticates and returns the user's trial/license status.
 */
async function handleSignIn({ email, password }, env) {
  if (!email || !password) return json({ error: 'Email and password required.' }, 400);

  // 1. Authenticate via Supabase Auth
  const signInRes = await supabaseAuth('token?grant_type=password', { email, password }, env);
  if (!signInRes.ok || !signInRes.data?.user?.id) {
    const msg = signInRes.data?.error_description || 'Invalid email or password.';
    return json({ error: msg });
  }
  const authUserId = signInRes.data.user.id;

  // 2. Load user record
  const userRes = await supabaseDb('GET', 'users', null, `email=eq.${encodeURIComponent(email)}&select=*`, env);
  if (!userRes.ok || !userRes.data?.length) {
    return json({ error: 'Account not found. Please start a new trial.' });
  }
  const user = userRes.data[0];

  return json({
    success:        true,
    authUserId,
    trialStartedAt: user.trial_started_at,
    isLicensed:     user.is_licensed === true,
    licenseKey:     user.license_key || null,
  });
}

/**
 * POST /activation/activate
 * Body: { email, key, deviceId }
 * Validates a license key and marks the user as licensed.
 */
async function handleActivate({ email, key, deviceId }, env) {
  if (!email || !key) return json({ error: 'Email and license key required.' }, 400);

  // 1. Look up the license key
  const licRes = await supabaseDb('GET', 'licenses', null, `key=eq.${encodeURIComponent(key)}&select=*`, env);
  if (!licRes.ok || !licRes.data?.length) {
    return json({ error: 'License key not found.' });
  }
  const license = licRes.data[0];

  if (license.activation_count >= license.max_activations) {
    return json({ error: `Maximum activations (${license.max_activations}) reached.` });
  }

  // 2. Increment activation count
  await supabaseDb('PATCH', 'licenses', {
    activation_count: license.activation_count + 1,
  }, `key=eq.${encodeURIComponent(key)}`, env);

  // 3. Upsert user record
  const dId = deviceId || crypto.randomUUID();
  const existingUser = await supabaseDb('GET', 'users', null, `email=eq.${encodeURIComponent(email)}&select=*`, env);

  if (existingUser.ok && existingUser.data?.length > 0) {
    await supabaseDb('PATCH', 'users', {
      license_key:  key,
      is_licensed:  true,
      activated_at: new Date().toISOString(),
      device_id:    dId,
    }, `email=eq.${encodeURIComponent(email)}`, env);
  } else {
    await supabaseDb('POST', 'users', {
      email,
      license_key:       key,
      device_id:         dId,
      trial_started_at:  new Date().toISOString(),
      is_licensed:       true,
      activated_at:      new Date().toISOString(),
    }, null, env);
  }

  return json({ success: true });
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function supabaseAuth(path, body, env) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/${path}`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey':       env.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function supabaseDb(method, table, body, query, env) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const headers = {
    'Content-Type':  'application/json',
    'apikey':        env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  };
  if (method === 'POST') headers['Prefer'] = 'return=representation';
  if (method === 'PATCH') headers['Prefer'] = 'return=minimal';

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ── Response helper ───────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
