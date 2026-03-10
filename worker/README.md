# MindVault Activation Worker

Cloudflare Worker that acts as a secure proxy between the Electron app
and Supabase. The Supabase service role key lives only here — never in the DMG.

## One-time setup (run on your Mac)

### 1. Install Wrangler
```bash
npm install -g wrangler
wrangler login
```

### 2. Deploy the Worker
```bash
cd ~/Documents/MindVault/worker
wrangler deploy
```

### 3. Set secrets (Supabase keys stay server-side)
```bash
wrangler secret put APP_SECRET
# Enter: mv-api-v1-2026

wrangler secret put SUPABASE_URL
# Enter: https://wfguqsrdcnalcdgcgzfe.supabase.co

wrangler secret put SUPABASE_SERVICE_KEY
# Enter: (the service role key from backend/.env)

wrangler secret put SUPABASE_ANON_KEY
# Enter: (the anon key from backend/.env)
```

### 4. Add custom domain in Cloudflare Dashboard
- Go to: Workers & Pages → mindvault-activation → Settings → Domains & Routes
- Add custom domain: `api.mindvault.ch`
- Cloudflare sets up the DNS record automatically

### 5. Verify it works
```bash
curl -X POST https://api.mindvault.ch/activation/activate \
  -H "Authorization: Bearer mv-api-v1-2026" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","key":"MVLT-XXXX-XXXX-XXXX"}'
```

## Rotating the APP_SECRET
1. Generate a new secret string
2. Update `APP_SECRET` constant in `electron/main.js`
3. Run `wrangler secret put APP_SECRET` and enter the new value
4. Rebuild the DMG (`npm run dist`)
