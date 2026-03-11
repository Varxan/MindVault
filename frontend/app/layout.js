import './globals.css';
import { Inter } from 'next/font/google';

// next/font downloads Inter at BUILD TIME and serves it from your own domain.
// No requests to Google at runtime — fully GDPR compliant, no cookie banner needed.
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'MindVault',
  description: 'Your personal visual inspiration tool for filmmakers and creators',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MindVault',
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* PWA Meta Tags */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1a1a1a" />
        <meta name="description" content="Your personal visual inspiration tool for filmmakers and creators" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MindVault" />

        {/* Icons */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="manifest" href="/manifest.json" />

        {/* Theme + Electron detection — runs before hydration, no flash */}
        <script dangerouslySetInnerHTML={{__html: `
          (function() {
            try {
              var theme = localStorage.getItem('mv-theme') || 'dark';
              document.documentElement.setAttribute('data-theme', theme);
            } catch(e) {}
            if (typeof navigator !== 'undefined' && navigator.userAgent.indexOf('Electron') !== -1) {
              document.documentElement.classList.add('is-electron');
            }
          })();
        `}} />

        {/* Service Worker Registration */}
        <script dangerouslySetInnerHTML={{__html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(err => {
                console.log('Service Worker registration failed:', err);
              });
            });
          }
        `}} />

        {/* PWA Install Prompt */}
        <script dangerouslySetInnerHTML={{__html: `
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window.__pwaInstallPrompt = e;
          });
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
