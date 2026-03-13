/** @type {import('next').NextConfig} */
const path = require('path');

// Load SENTRY_DSN from backend/.env so it's available at Next.js build time.
// NEXT_PUBLIC_* vars are baked into the JS bundle during `next build`.
try { require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') }); } catch (_) {}
if (process.env.SENTRY_DSN)         process.env.NEXT_PUBLIC_SENTRY_DSN     = process.env.SENTRY_DSN;
if (process.env.LS_CHECKOUT_URL)    process.env.NEXT_PUBLIC_LS_CHECKOUT_URL = process.env.LS_CHECKOUT_URL;

// @sentry/nextjs is optional — gracefully degrade if not installed yet
const withSentryConfig = (() => {
  try { return require('@sentry/nextjs').withSentryConfig; } catch (_) { return (c) => c; }
})();

// CF_PAGES=1 is set automatically by Cloudflare Pages during build.
// In Electron / local dev this variable is not set, so standalone mode stays active.
const isCloudflare = process.env.CF_PAGES === '1';

const nextConfig = {
  // standalone output bundles the app into a self-contained folder used by
  // the Electron build (electron-builder copies .next/standalone into the app).
  // Cloudflare Pages uses @cloudflare/next-on-pages instead, which is
  // incompatible with standalone — so we skip it on CF builds.
  ...(!isCloudflare && { output: 'standalone' }),

  // Tell Next.js that this directory (frontend/) is the root for file tracing.
  // Without this, Next.js 15 uses the monorepo root (parent dir) and nests
  // the standalone output as .next/standalone/frontend/server.js instead of
  // .next/standalone/server.js — which breaks the Electron build.
  outputFileTracingRoot: path.join(__dirname),

  images: {
    // Cloudflare Pages doesn't support Next.js Image Optimisation — use
    // plain <img> behaviour (unoptimized) there.  Electron / dev keeps the
    // default (optimised) behaviour.
    ...(isCloudflare && { unoptimized: true }),
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Sentry webpack plugin options (only active when @sentry/nextjs is installed)
  silent:             true,  // suppress verbose build output
  hideSourceMaps:     true,  // don't expose source maps to users
  disableLogger:      true,
  // Skip Sentry build steps if DSN not configured
  dryRun:             !process.env.SENTRY_DSN,
});
