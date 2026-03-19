// Sentry — Browser / Renderer process
// This file is loaded automatically by @sentry/nextjs for client-side errors.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:      process.env.NODE_ENV,
    tracesSampleRate: 0.1,   // 10% of sessions — adjust as needed
    // Ignore noisy browser errors that are not real bugs
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
    ],
  });
}
