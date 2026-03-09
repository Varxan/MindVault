export const runtime = 'edge';

export const metadata = {
  title: 'Terms of Service — MindVault',
  description: 'Terms of use for MindVault.',
};

export default function TermsPage() {
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
        <h1>Terms of Service</h1>
        <p className="updated">Last updated: March 2026</p>

        <div className="section">
          <h2>Acceptance</h2>
          <p>By using MindVault (the desktop application, website, or any related services), you agree to these terms. If you do not agree, please do not use the software.</p>
        </div>

        <div className="section">
          <h2>Use of the software</h2>
          <p>MindVault is provided as a personal productivity tool for saving and organising links and inspiration. You may use it for personal, non-commercial purposes. You may not:</p>
          <ul>
            <li>Reverse engineer, decompile, or modify the software</li>
            <li>Use it to collect or store content that violates applicable law</li>
            <li>Attempt to interfere with or disrupt any connected services</li>
          </ul>
        </div>

        <div className="section">
          <h2>Your content</h2>
          <p>You retain full ownership of all content you save to MindVault. We do not claim any rights to your library, links, or notes. Since data is stored locally on your device, you are responsible for your own backups.</p>
        </div>

        <div className="section">
          <h2>Beta software</h2>
          <p>MindVault is currently in beta. The software is provided as-is and may contain bugs or incomplete features. We make no guarantees of uptime, data retention, or feature availability during the beta period. We reserve the right to change or discontinue features at any time.</p>
        </div>

        <div className="section">
          <h2>Third-party services</h2>
          <p>MindVault uses Supabase for the share queue and Cloudflare for hosting. Your use of these services is also subject to their respective terms.</p>
        </div>

        <div className="section">
          <h2>Limitation of liability</h2>
          <p>To the fullest extent permitted by law, MindVault is not liable for any loss of data, loss of profits, or indirect damages arising from use of the software.</p>
        </div>

        <div className="section">
          <h2>Changes to these terms</h2>
          <p>We may update these terms from time to time. Continued use of MindVault after changes constitutes acceptance of the updated terms.</p>
        </div>

        <div className="section">
          <h2>Contact</h2>
          <p>Questions? Reach out at <a href="mailto:hello@mindvault.ch">hello@mindvault.ch</a></p>
        </div>
      </div>

      <footer className="footer">
        <p>© 2026 MindVault · <a href="/privacy" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Privacy</a> · <a href="/terms" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Terms</a></p>
      </footer>
    </div>
  );
}
