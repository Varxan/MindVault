import './globals.css';

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
    <html lang="en">
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
            // Detect Electron via user-agent and add class for CSS drag/padding rules
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
      </head>
      <body>{children}</body>
    </html>
  );
}
