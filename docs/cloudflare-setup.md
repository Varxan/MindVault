# Cloudflare Pages — Setup Guide

This document explains how to deploy the MindVault web frontend (PWA share page + API routes) to Cloudflare Pages, replacing Vercel.

---

## Why Cloudflare Pages?

| | Vercel (Free) | Cloudflare Pages (Free) |
|---|---|---|
| Bandwidth | 100 GB/month | Unlimited |
| Functions (API routes) | 100k/month | 100k/day |
| Cold starts | Yes | No (V8 isolates) |
| Custom domain | 1 | Unlimited |

---

## Architecture

Only the **web frontend** is deployed to Cloudflare. The Electron desktop app runs its own local backend (Express + SQLite) and is unaffected.

```
iPhone PWA  →  Cloudflare Pages  →  Supabase (share_queue / library_cache)
                                         ↑
                                   Electron Desktop
                                   (supabase-poller.js)
```

---

## Step 1 — Connect GitHub repo to Cloudflare Pages

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Pages** → **Create a project** → **Connect to Git**
2. Select your `MindVault` repository
3. Set **Framework preset**: `Next.js (Edge)`

**Build settings:**

| Setting | Value |
|---|---|
| Build command | `npx @cloudflare/next-on-pages` |
| Build output directory | `.vercel/output/static` |
| Root directory | `frontend` |

---

## Step 2 — Environment Variables

In the Cloudflare Pages dashboard, go to **Settings → Environment Variables**.

Add these for both **Production** and **Preview**:

| Variable | Value | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wfguqsrdcnalcdgcgzfe.supabase.co` | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service_role key | **Yes — encrypt it** |

> **Important:** `SUPABASE_SERVICE_ROLE_KEY` bypasses Supabase Row Level Security. Never expose it client-side. Cloudflare's Edge Functions keep it server-side. ✓

---

## Step 3 — Custom Domain (mindvault.app)

1. In Cloudflare Pages → your project → **Custom domains** → **Add custom domain**
2. Enter `mindvault.app` (or `www.mindvault.app`)
3. Since your domain is already on Cloudflare DNS, it will auto-verify ✓
4. Cloudflare auto-provisions HTTPS (no cert config needed)

The PWA manifest, QR-pairing URLs, and share links should all use the custom domain.

---

## Step 4 — Update Electron backend .env

After the Cloudflare deployment, update `backend/.env`:

```env
# Replace old VERCEL_URL with the new Cloudflare URL
APP_URL=https://mindvault.app
```

The `VERCEL_URL` key still works as a fallback if you prefer not to rename it.

---

## Step 5 — (Optional) Remove Vercel project

Once Cloudflare is confirmed working:

1. Update any DNS records that pointed to Vercel → point to Cloudflare Pages
2. Delete the Vercel project (or keep it as a backup for a few weeks)

---

## Local Development with Cloudflare

To test the Edge runtime locally:

```bash
cd frontend

# Copy env template
cp .dev.vars.example .dev.vars
# Edit .dev.vars and fill in your Supabase keys

# Build for Cloudflare
npm run pages:build

# Serve locally (mimics CF Workers runtime)
npm run preview
```

> `npm run preview` runs `wrangler pages dev .vercel/output/static` which uses the real V8 Workers runtime locally — any Edge incompatibilities show up here before deploy.

---

## What Does NOT Change

- The Electron desktop app (`backend/`, `electron/`) — no changes needed
- Supabase tables (`share_queue`, `library_cache`) — no changes needed
- The Chrome Extension — no changes needed
- Telegram bot — no changes needed

---

## Troubleshooting

**Build fails with "edge runtime" error:**
Both API routes already have `export const runtime = 'edge'` set. If you see Node.js API errors, check that no `fs`/`path` imports were added to the API routes.

**SUPABASE_SERVICE_ROLE_KEY not found (503 error):**
The secret is not configured in Cloudflare Pages → Settings → Environment Variables. Make sure you added it for the Production environment (not just Preview).

**Images not loading on PWA:**
`next.config.js` sets `images.unoptimized = true` on Cloudflare builds automatically (via `CF_PAGES=1` env var). External thumbnails use plain `<img>` tags and load directly from their source URLs.
