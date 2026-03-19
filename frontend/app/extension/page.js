export const runtime = 'edge';

export const metadata = {
  title: 'Browser Extension — MindVault',
  description: 'Install the MindVault browser extension to save links, images, and videos from any website with one click.',
  openGraph: {
    title: 'MindVault Browser Extension',
    description: 'Save anything from the web to your personal library with one click.',
    url: 'https://mindvault.ch/extension',
  },
};

export default function ExtensionPage() {
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: '#f5f2eb', color: '#1a1a18', minHeight: '100vh' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @font-face { font-family:'Harmony'; src:url('/fonts/Harmony.otf') format('opentype'); font-weight:400; font-display:swap; }
        @font-face { font-family:'Humane'; src:url('/fonts/Humane-Medium.ttf') format('truetype'); font-weight:500; font-display:swap; }
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        :root {
          --bg:#f5f2eb; --surface:#faf8f4; --border:#e2e0d8;
          --text:#1a1a18; --text-muted:#888880; --text-dim:#bbbbb5;
          --accent:#C8861E;
        }
        .nav { display:flex; align-items:center; justify-content:space-between; padding:18px 48px; border-bottom:1px solid var(--border); background:rgba(245,242,235,0.92); backdrop-filter:blur(16px); position:sticky; top:0; z-index:100; }
        .nav-logo { display:flex; align-items:center; gap:10px; text-decoration:none; color:var(--text); }
        .nav-logo img { width:28px; height:28px; border-radius:6px; display:block; }
        .nav-logo-text { font-family:'Humane',sans-serif; font-weight:500; font-size:22px; letter-spacing:0.04em; line-height:1; padding-top:2px; }
        .ext-container { max-width:640px; margin:0 auto; padding:80px 24px 100px; text-align:center; }
        .ext-container h1 { font-family:'Harmony',sans-serif; font-size:clamp(32px,5vw,52px); font-weight:400; letter-spacing:-0.5px; margin-bottom:12px; }
        .ext-subtitle { font-size:16px; color:var(--text-muted); line-height:1.7; margin-bottom:48px; max-width:480px; margin-left:auto; margin-right:auto; }
        .ext-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:32px; margin-bottom:24px; text-align:left; }
        .ext-card-header { display:flex; align-items:center; gap:14px; margin-bottom:16px; }
        .ext-card-icon { width:44px; height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0; }
        .ext-card-icon.chrome { background:rgba(66,133,244,0.1); }
        .ext-card-icon.edge { background:rgba(0,120,215,0.1); }
        .ext-card-title { font-size:17px; font-weight:600; color:var(--text); }
        .ext-card-desc { font-size:14px; color:var(--text-muted); line-height:1.65; margin-bottom:20px; }
        .ext-btn {
          display:inline-flex; align-items:center; gap:8px;
          background:var(--accent); color:#fff;
          border:none; border-radius:10px;
          font-size:14px; font-weight:600;
          padding:12px 28px; cursor:pointer;
          text-decoration:none;
          transition:opacity 0.15s;
        }
        .ext-btn:hover { opacity:0.85; }
        .ext-btn.secondary {
          background:transparent; color:var(--text);
          border:1px solid var(--border);
        }
        .ext-btn.secondary:hover { border-color:var(--text-dim); }
        .ext-shortcuts { margin-top:40px; }
        .ext-shortcuts h2 { font-size:15px; font-weight:600; color:var(--text); margin-bottom:16px; }
        .ext-shortcut-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .ext-shortcut {
          background:var(--surface); border:1px solid var(--border);
          border-radius:10px; padding:16px;
          text-align:center;
        }
        .ext-shortcut-key {
          font-family:'SF Mono', 'Fira Code', monospace;
          font-size:14px; font-weight:600; color:var(--text);
          margin-bottom:6px;
        }
        .ext-shortcut-label { font-size:12px; color:var(--text-muted); }
        .ext-note { font-size:12px; color:var(--text-dim); line-height:1.6; margin-top:32px; }
        .footer { border-top:1px solid var(--border); padding:24px 48px; text-align:center; }
        .footer p { font-size:13px; color:var(--text-dim); }
        @media (max-width:640px) {
          .nav { padding:14px 20px; }
          .footer { padding:20px; }
          .ext-shortcut-grid { grid-template-columns:1fr; }
        }
      `}</style>

      <nav className="nav">
        <a href="/" className="nav-logo">
          <img src="/icon-512x512.png" alt="MindVault" />
          <span className="nav-logo-text">MindVault</span>
        </a>
      </nav>

      <div className="ext-container">
        <h1>Browser Extension</h1>
        <p className="ext-subtitle">
          Save any page, image, or video to your MindVault library with one click. Works with Chrome, Edge, Brave, and other Chromium browsers.
        </p>

        {/* Chrome / Main */}
        <div className="ext-card">
          <div className="ext-card-header">
            <div className="ext-card-icon chrome">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#4285f4" strokeWidth="2"/><circle cx="12" cy="12" r="4" fill="#4285f4"/></svg>
            </div>
            <span className="ext-card-title">Chrome, Brave &amp; Chromium</span>
          </div>
          <p className="ext-card-desc">
            Install from the Chrome Web Store. This also works for Brave, Arc, Opera, and any other Chromium based browser.
          </p>
          {/* TODO: replace EXTENSION_ID_PLACEHOLDER with real ID after publishing */}
          <a
            className="ext-btn"
            href="https://chrome.google.com/webstore/detail/mindvault/EXTENSION_ID_PLACEHOLDER"
            target="_blank"
            rel="noopener noreferrer"
          >
            Install for Chrome
          </a>
        </div>

        {/* Edge */}
        <div className="ext-card">
          <div className="ext-card-header">
            <div className="ext-card-icon edge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#0078d7" strokeWidth="2"/><path d="M8 12a4 4 0 108 0" stroke="#0078d7" strokeWidth="2"/></svg>
            </div>
            <span className="ext-card-title">Microsoft Edge</span>
          </div>
          <p className="ext-card-desc">
            Edge supports Chrome extensions natively. Click below to install the same extension via the Chrome Web Store.
          </p>
          <a
            className="ext-btn secondary"
            href="https://chrome.google.com/webstore/detail/mindvault/EXTENSION_ID_PLACEHOLDER"
            target="_blank"
            rel="noopener noreferrer"
          >
            Install for Edge
          </a>
        </div>

        {/* Keyboard shortcuts */}
        <div className="ext-shortcuts">
          <h2>Keyboard shortcuts</h2>
          <div className="ext-shortcut-grid">
            <div className="ext-shortcut">
              <div className="ext-shortcut-key">⌘ ⇧ E</div>
              <div className="ext-shortcut-label">Save to Eye (visual)</div>
            </div>
            <div className="ext-shortcut">
              <div className="ext-shortcut-key">⌘ ⇧ M</div>
              <div className="ext-shortcut-label">Save to Mind (knowledge)</div>
            </div>
          </div>
        </div>

        <p className="ext-note">
          Make sure MindVault is running on your Mac before using the extension. The extension connects to MindVault on your local network.<br />
          Questions? Contact us at <a href="mailto:hello@mindvault.ch" style={{color: 'var(--accent)', textDecoration: 'none'}}>hello@mindvault.ch</a>
        </p>
      </div>

      <footer className="footer">
        <p>© 2026 MindVault · <a href="/privacy" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Privacy</a> · <a href="/terms" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Terms</a></p>
      </footer>
    </div>
  );
}
