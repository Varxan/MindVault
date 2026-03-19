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
 *   POST /webhook/lemon         — Lemon Squeezy purchase webhook (no auth header)
 *
 * All activation requests must carry:
 *   Authorization: Bearer <APP_SECRET>
 *
 * Environment variables (set via `wrangler secret put`):
 *   APP_SECRET           — shared secret between Worker and Electron app
 *   SUPABASE_URL         — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY — Supabase service role key (bypasses RLS)
 *   SUPABASE_ANON_KEY    — Supabase anon key (for Auth endpoints)
 *   LEMON_SIGNING_SECRET — Lemon Squeezy webhook signing secret
 *   RESEND_API_KEY       — Resend.com API key for transactional email
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

    const url  = new URL(request.url);
    const path = url.pathname;

    // ── Lemon Squeezy webhook — has its own HMAC auth, no Bearer token ────────
    if (path === '/webhook/lemon') {
      return handleLemonWebhook(request, env);
    }

    // ── All other endpoints require the shared APP_SECRET ─────────────────────
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token || token !== env.APP_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }

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

// ── Lemon Squeezy webhook ─────────────────────────────────────────────────────

/**
 * POST /webhook/lemon
 *
 * Receives Lemon Squeezy events. We care about "order_created".
 * Flow:
 *   1. Verify HMAC-SHA256 signature (X-Signature header)
 *   2. Extract customer email from the order
 *   3. Generate a new MVLT-XXXX-XXXX-XXXX license key
 *   4. Insert into Supabase `licenses` table
 *   5. Send key to customer via Resend email
 */
async function handleLemonWebhook(request, env) {
  // Read raw body (needed for signature verification)
  const rawBody  = await request.text();
  const sigHeader = request.headers.get('X-Signature') || '';

  // Verify HMAC-SHA256
  if (env.LEMON_SIGNING_SECRET) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(env.LEMON_SIGNING_SECRET);
    const msgData = encoder.encode(rawBody);

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = hexToBytes(sigHeader);
    const valid = await crypto.subtle.verify('HMAC', cryptoKey, sigBytes, msgData);
    if (!valid) {
      console.error('[Lemon] Invalid signature');
      return new Response('Unauthorized', { status: 401 });
    }
  } else {
    console.warn('[Lemon] LEMON_SIGNING_SECRET not set — skipping signature check');
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const eventName = event?.meta?.event_name;
  console.log('[Lemon] Event:', eventName);

  // We only act on new paid orders
  if (eventName !== 'order_created') {
    return new Response('OK', { status: 200 });
  }

  const attrs = event?.data?.attributes;
  if (!attrs) return new Response('OK', { status: 200 });

  // Skip refunded / failed orders
  if (attrs.status !== 'paid') {
    console.log('[Lemon] Skipping order with status:', attrs.status);
    return new Response('OK', { status: 200 });
  }

  const email    = attrs.user_email;
  const name     = attrs.user_name || '';
  const orderId  = String(event?.data?.id || '');

  if (!email) {
    console.error('[Lemon] No email in order');
    return new Response('OK', { status: 200 });
  }

  console.log(`[Lemon] New order from ${email} (order ${orderId})`);

  // Generate a fresh MVLT-XXXX-XXXX-XXXX key
  const key = generateLicenseKey();

  // Insert into Supabase licenses table
  const insertRes = await supabaseDb('POST', 'licenses', {
    key,
    max_activations:  3,
    activation_count: 0,
    notes:            `LemonSqueezy order ${orderId}`,
    email,
  }, null, env);

  if (!insertRes.ok) {
    console.error('[Lemon] Failed to insert license:', JSON.stringify(insertRes.data));
    // Still return 200 to LS so it doesn't retry; we'll fix manually if needed
    return new Response('OK', { status: 200 });
  }

  console.log(`[Lemon] License created: ${key}`);

  // Send email via Resend
  if (env.RESEND_API_KEY) {
    await sendLicenseEmail({ email, name, key }, env);
  } else {
    console.warn('[Lemon] RESEND_API_KEY not set — skipping email');
  }

  return new Response('OK', { status: 200 });
}

// ── License key generator ─────────────────────────────────────────────────────

const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion

function generateLicenseKey() {
  const segment = (len) =>
    Array.from({ length: len }, () => {
      // Use crypto.getRandomValues for CF Workers (Web Crypto API)
      const arr = new Uint8Array(1);
      crypto.getRandomValues(arr);
      return KEY_CHARS[arr[0] % KEY_CHARS.length];
    }).join('');
  return `MVLT-${segment(4)}-${segment(4)}-${segment(4)}`;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ── Resend email ──────────────────────────────────────────────────────────────

async function sendLicenseEmail({ email, name, key }, env) {
  const firstName = name.split(' ')[0] || 'there';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f2eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2eb;padding:48px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e0d8;">

        <!-- Header -->
        <tr>
          <td style="background:#1a1a18;padding:32px 40px;text-align:center;">
            <img src="https://mindvault.ch/icon-512x512.png" width="48" height="48"
                 style="border-radius:11px;display:block;margin:0 auto 12px;" alt="MindVault" />
            <p style="margin:0;color:#f5f2eb;font-size:20px;font-weight:700;letter-spacing:-0.3px;">MindVault</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 16px;font-size:16px;color:#1a1a18;">Hi ${firstName},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#555550;line-height:1.7;">
              Thank you for your purchase! Here is your MindVault license key:
            </p>

            <!-- Key box -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#f5f2eb;border:1px solid #e2e0d8;border-radius:12px;padding:20px;text-align:center;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#888880;">Your License Key</p>
                  <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:0.12em;color:#1a1a18;font-family:'Courier New',monospace;">${key}</p>
                </td>
              </tr>
            </table>

            <p style="margin:28px 0 8px;font-size:15px;color:#555550;line-height:1.7;">
              To activate MindVault:
            </p>
            <ol style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#555550;line-height:1.9;">
              <li>Open MindVault on your Mac</li>
              <li>When prompted, enter the license key above</li>
              <li>MindVault unlocks immediately — no internet required after activation</li>
            </ol>
            <p style="margin:0 0 8px;font-size:13px;color:#888880;line-height:1.7;">
              Your key supports up to <strong>3 devices</strong>. Keep this email safe.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #e2e0d8;padding:24px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#bbbbb5;">
              Questions? Reply to this email — we are happy to help.<br />
              MindVault · mindvault.ch
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from:    'MindVault <hello@mindvault.ch>',
      to:      [email],
      subject: 'Your MindVault License Key',
      html,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[Resend] Failed to send email:', res.status, errBody);
  } else {
    console.log(`[Resend] License email sent to ${email}`);
  }
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
