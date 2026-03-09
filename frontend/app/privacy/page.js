export const runtime = 'edge';

export const metadata = {
  title: 'Privacy Policy — MindVault',
  description: 'How MindVault handles your data.',
};

export default function PrivacyPage() {
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
        .container { max-width:680px; margin:0 auto; padding:72px 24px 100px; }
        .container h1 { font-family:'Harmony',sans-serif; font-size:clamp(32px,4vw,48px); font-weight:400; letter-spacing:-0.5px; margin-bottom:8px; }
        .updated { font-size:13px; color:var(--text-dim); margin-bottom:56px; }
        .section { margin-bottom:40px; }
        .section h2 { font-size:16px; font-weight:700; color:var(--text); margin-bottom:10px; letter-spacing:-0.2px; }
        .section p, .section li { font-size:15px; color:var(--text-muted); line-height:1.75; }
        .section ul { padding-left:20px; }
        .section li { margin-bottom:6px; }
        .section a { color:var(--accent); text-decoration:none; }
        .section a:hover { text-decoration:underline; }
        .footer { border-top:1px solid var(--border); padding:24px 48px; text-align:center; }
        .footer p { font-size:13px; color:var(--text-dim); }
        @media (max-width:640px) { .nav { padding:14px 20px; } .footer { padding:20px; } }
      `}</style>

      <nav className="nav">
        <a href="/" className="nav-logo">
          <img src="/icon-512x512.png" alt="MindVault" />
          <span className="nav-logo-text">MindVault</span>
        </a>
      </nav>

      <div className="container">
        <h1>Privacy Policy</h1>
        <p className="updated">Last updated: March 2026</p>

        <div className="section">
          <h2>Overview</h2>
          <p>MindVault is a local-first application. Your library — links, thumbnails, tags and metadata — is stored on your own device. We do not sell your data, run ads, or share your content with third parties.</p>
        </div>

        <div className="section">
          <h2>Data stored on your device</h2>
          <p>The MindVault desktop app stores the following locally:</p>
          <ul>
            <li>Saved links and their metadata (title, thumbnail, tags, notes)</li>
            <li>Collections and library structure</li>
            <li>Application preferences and settings</li>
          </ul>
          <p style={{ marginTop: 12 }}>This data never leaves your machine unless you explicitly export it.</p>
        </div>

        <div className="section">
          <h2>Link processing</h2>
          <p>When you save a link, MindVault fetches metadata (title, thumbnail, description) from the URL. This request originates from your device or, when using the share queue, from our processing server. Fetched metadata is stored locally on your machine.</p>
        </div>

        <div className="section">
          <h2>Share queue (Telegram bot, Chrome Extension, iPhone)</h2>
          <p>To enable sending links from your phone or browser to the desktop app, MindVault uses a temporary cloud queue (Supabase). Links are stored in this queue only until your desktop app picks them up, at which point they are marked as processed. We do not retain queue items beyond processing.</p>
        </div>

        <div className="section">
          <h2>Waitlist</h2>
          <p>If you submit your email on mindvault.ch to join the beta waitlist, we store only your email address. We use it exclusively to notify you when the beta is available. You can request deletion at any time by emailing us.</p>
        </div>

        <div className="section">
          <h2>Analytics</h2>
          <p>We do not use third-party analytics, tracking pixels, or fingerprinting. The website may log standard server access logs (IP address, browser, timestamp) via Cloudflare for security purposes.</p>
        </div>

        <div className="section">
          <h2>Contact</h2>
          <p>Questions about your data? Reach out at <a href="mailto:hello@mindvault.ch">hello@mindvault.ch</a></p>
        </div>
      </div>

      <footer className="footer">
        <p>© 2026 MindVault · <a href="/privacy" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Privacy</a> · <a href="/terms" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Terms</a></p>
      </footer>
    </div>
  );
}
