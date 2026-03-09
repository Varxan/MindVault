/** @type {import('next').NextConfig} */
const path = require('path');

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

module.exports = nextConfig;
