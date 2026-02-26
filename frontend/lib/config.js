/**
 * MindVault – Zentrale Konfiguration
 *
 * Wie API_BASE aufgelöst wird:
 *  1. NEXT_PUBLIC_API_URL gesetzt (z.B. Vercel/Railway) → verwendet diese URL
 *  2. Electron / lokaler Dev → leitet Backend-Port aus window.location ab
 */

export function getApiBase() {
  // Env-Variable hat immer Priorität (Vercel, Railway, etc.)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // Server-side ohne Env-Variable → localhost fallback
  if (typeof window === 'undefined') {
    return 'http://localhost:3001/api';
  }

  // Client-side lokaler Betrieb (Electron / npm run dev) — Port automatisch ableiten
  const host = window.location.hostname;
  const port = window.location.port;
  const backendPort = port === '3000' ? '3001' : port || '3001';
  return `http://${host}:${backendPort}/api`;
}

// For simple imports that expect a constant
export const API_BASE = getApiBase();

export const FRONTEND_PORT = 3000;
export const BACKEND_PORT  = 3001;
