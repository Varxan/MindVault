# Cloudflare Pages — Setup Guide

This document explains how to deploy the MindVault web frontend (PWA share page + API routes) to Cloudflare Pages, replacing Vercel.

**Domain:** `mindvault.ch` (purchased via Hostpoint)

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
iPhone PWA  →  Cloudflare Pages (mindvault.ch)  →  Supabase (share_queue)
                                                          ↑  Realtime WebSocket
                                                    Electron Desktop
                                                    (supabase-poller.js)
```

---

## Step 0 — Create a Cloudflare Account

1. Go to [cloudflare.com](https://cloudflare.com) → **Sign up** (free)
2. No credit card needed for Pages + DNS (both free tier)

---

## Step 1 — Point mindvault.ch to Cloudflare DNS

The domain is currently at Hostpoint. You have two options:

### Option A — Transfer DNS to Cloudflare (Recommended)

This gives you full Cloudflare CDN, DDoS protection, and auto-SSL for free.

1. In Cloudflare dashboard → **Add a site** → enter `mindvault.ch`
2. Choose **Free plan**
3. Cloudflare will scan your existing DNS records automatically
4. Cloudflare gives you two nameservers, e.g. `aria.ns.cloudflare.com` and `bob.ns.cloudflare.com`
5. Log in to **admin.hostpoint.ch** → Domains → `mindvault.ch` → **Nameserver**
6. Replace Hostpoint's nameservers with the two Cloudflare nameservers
7. Wait 15–60 min for propagation → Cloudflare confirms ✓

### Option B — Keep DNS at Hostpoint, add CNAME (Simpler, but less features)

If you don't want to move DNS, add a CNAME record in Hostpoint's DNS panel:

| Type | Name | Value |
|---|---|---|
| CNAME | `mindvault.ch` | `mindvault.pages.dev` |
| CNAME | `www` | `mindvault.pages.dev` |

> Note: Some registrars don't allow CNAME on the root domain (`@`). If that's the case, use `www.mindvault.ch` only, or go with Option A.

**Recommendation: Use Option A.** Cloudflare DNS is free, faster, and makes the custom domain setup in Step 3 automatic.

---

## Step 2 — Connect GitHub repo to Cloudflare Pages

1. In Cloudflare dashboard → **Pages** → **Create a project** → **Connect to Git**
2. Authorise GitHub and select your `MindVault` repository
3. Set **Framework preset**: `Next.js (Edge)`

**Build settings:**

| Setting | Value |
|---|---|
| Build command | `npx @cloudflare/next-on-pages` |
| Build output directory | `.vercel/output/static` |
| Root directory | `frontend` |

---

## Step 3 — Environment Variables

In the Cloudflare Pages dashboard, go to **Settings → Environment Variables**.

Add these for both **Production** and **Preview**:

| Variable | Value | Encrypt? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wfguqsrdcnalcdgcgzfe.supabase.co` | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service_role key | **Yes** |

> **Important:** `SUPABASE_SERVICE_ROLE_KEY` bypasses Supabase Row Level Security. It must stay server-side. Cloudflare Workers keep it there automatically — it is never sent to the browser or the phone. ✓

---

## Step 4 — Custom Domain (mindvault.ch)

If you used **Option A** (Cloudflare DNS):
1. In Cloudflare Pages → your project → **Custom domains** → **Add custom domain**
2. Enter `mindvault.ch`
3. Since the domain is already on Cloudflare DNS, it auto-verifies in seconds ✓
4. HTTPS certificate is auto-provisioned — no extra config needed

If you used **Option B** (Hostpoint DNS / CNAME):
1. Same as above — enter `mindvault.ch` or `www.mindvault.ch`
2. Cloudflare will ask you to add a TXT record at Hostpoint to verify ownership
3. Once verified, HTTPS is provisioned automatically

---

## Step 5 — Update Electron backend .env

After the Cloudflare deployment is confirmed working, open `backend/.env` and update:

```env
APP_URL=https://mindvault.ch
```

The old `VERCEL_URL` key works as a fallback if you haven't renamed it yet.

---

## Step 6 — (Optional) Remove Vercel project

Once everything is confirmed working on Cloudflare:

1. Test the PWA on your phone at `https://mindvault.ch/share`
2. Test link sharing end-to-end
3. Delete or archive the Vercel project

---

## Local Development with Cloudflare

To test the Edge runtime locally before deploying:

```bash
cd frontend

# Copy env template
cp .dev.vars.example .dev.vars
# Edit .dev.vars and fill in your real Supabase keys

# Build for Cloudflare (runs `next build` + transforms output)
npm run pages:build

# Serve locally — uses real V8 Workers runtime, not Node.js
npm run preview
```

> Any Edge incompatibilities show up here before they reach production.

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
The secret is not set in Cloudflare Pages → Settings → Environment Variables → Production. Check you set it for Production (not just Preview).

**Images not loading on PWA:**
`next.config.js` automatically sets `images.unoptimized = true` on Cloudflare builds (via the `CF_PAGES=1` env var that Cloudflare injects). Thumbnails load directly from their source URLs as plain `<img>` tags.

**Hostpoint nameserver change not propagating:**
DNS changes take up to 48h globally (usually 15–60 min). Check status at [dnschecker.org](https://dnschecker.org) — enter `mindvault.ch` and look for the new Cloudflare nameservers.
