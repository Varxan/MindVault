import WaitlistForm from '../components/WaitlistForm';

export const runtime = 'edge';

export const metadata = {
  title: 'MindVault — Your Visual Inspiration Library',
  description: 'Save what inspires you — from anywhere. Turn endless scrolling into a curated reference library for your next project.',
};

// MindVault icon SVG inlined — dark bg, green vault + sparkles
const MindVaultIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: size * 0.25, display: 'block' }}>
    <rect width="192" height="192" fill="#1a1a1a" rx="48"/>
    <g transform="translate(48, 56)">
      <rect x="12" y="20" width="72" height="60" rx="4" fill="none" stroke="#4aef8a" strokeWidth="3"/>
      <circle cx="48" cy="50" r="12" fill="none" stroke="#4aef8a" strokeWidth="2"/>
      <g fill="#4aef8a">
        <circle cx="20" cy="15" r="2"/>
        <circle cx="76" cy="18" r="2"/>
        <circle cx="15" cy="75" r="2"/>
        <circle cx="82" cy="78" r="2"/>
      </g>
    </g>
  </svg>
);

export default function LandingPage() {
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: '#f5f2eb', color: '#1a1a18', minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        @font-face {
          font-family: 'Harmony';
          src: url('/fonts/Harmony.otf') format('opentype');
          font-weight: 400;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: 'Humane';
          src: url('/fonts/Humane-Medium.ttf') format('truetype');
          font-weight: 500;
          font-style: normal;
          font-display: swap;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #f5f2eb; --surface: #faf8f4; --surface-2: #edeae3;
          --border: #e2e0d8; --border-2: #ccc9be;
          --text: #1a1a18; --text-muted: #888880; --text-dim: #bbbbb5;
          --accent: #C8861E; --accent-light: rgba(200,134,30,0.1); --accent-mid: rgba(200,134,30,0.22);
          --green: #4aef8a;
        }

        /* NAV */
        .nav { display:flex; align-items:center; justify-content:space-between; padding:18px 48px; border-bottom:1px solid var(--border); position:sticky; top:0; z-index:100; background:rgba(245,242,235,0.92); backdrop-filter:blur(16px); }
        .nav-logo { display:flex; align-items:center; gap:10px; text-decoration:none; color:var(--text); }
        .nav-logo-text { font-family:'Humane', sans-serif; font-weight:500; font-size:22px; letter-spacing:0.04em; line-height:1; padding-top:2px; }
        .nav-right { display:flex; align-items:center; gap:12px; }
        .nav-badge { font-size:11px; font-weight:600; letter-spacing:0.05em; color:var(--accent); background:var(--accent-light); border:1px solid var(--accent-mid); border-radius:20px; padding:4px 10px; text-transform:uppercase; font-family:'Inter',sans-serif; }
        .nav-cta { background:var(--text); color:var(--bg); border:none; border-radius:10px; padding:9px 20px; font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; transition:opacity 0.15s; display:inline-block; font-family:'Inter',sans-serif; }
        .nav-cta:hover { opacity:0.75; }

        /* HERO */
        .hero { text-align:center; padding:110px 24px 88px; max-width:760px; margin:0 auto; }
        .hero h1 { font-family:'Harmony', -apple-system, sans-serif; font-size:clamp(44px,6vw,76px); font-weight:400; line-height:1.02; letter-spacing:-1px; color:var(--text); margin-bottom:24px; }
        .hero h1 em { font-style:normal; color:var(--accent); }
        .hero-sub { font-size:18px; color:var(--text-muted); line-height:1.65; max-width:460px; margin:0 auto 44px; font-weight:400; }
        .btn-coming { display:inline-flex; align-items:center; gap:8px; background:var(--surface-2); color:var(--text-muted); border:1px solid var(--border-2); border-radius:12px; padding:14px 28px; font-size:15px; font-weight:600; cursor:default; font-family:'Inter',sans-serif; }
        .btn-coming .badge { font-size:9px; font-weight:700; letter-spacing:0.08em; background:var(--accent); color:white; border-radius:4px; padding:2px 6px; text-transform:uppercase; }

        /* FEATURES */
        .features { max-width:960px; margin:0 auto; padding:0 24px 100px; }
        .features-header { text-align:center; margin-bottom:56px; }
        .eyebrow { font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--text-dim); margin-bottom:16px; font-family:'Inter',sans-serif; }
        .features-header h2 { font-family:'Harmony', -apple-system, sans-serif; font-size:clamp(28px,4vw,44px); font-weight:400; letter-spacing:-0.5px; color:var(--text); line-height:1.1; }
        .features-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:2px; background:var(--border); border-radius:16px; overflow:hidden; border:1px solid var(--border); }
        .feature-card { background:var(--surface); padding:36px 32px; transition:background 0.2s; }
        .feature-card:hover { background:var(--bg); }
        .feature-icon { width:44px; height:44px; border-radius:11px; background:var(--accent-light); border:1px solid var(--accent-mid); display:flex; align-items:center; justify-content:center; margin-bottom:20px; }
        .feature-card h3 { font-size:17px; font-weight:700; color:var(--text); margin-bottom:10px; letter-spacing:-0.3px; font-family:'Inter',sans-serif; }
        .feature-card p { font-size:14px; color:var(--text-muted); line-height:1.7; }

        /* HOW */
        .how { max-width:560px; margin:0 auto; padding:0 24px 100px; }
        .steps { display:flex; flex-direction:column; }
        .step { display:flex; gap:20px; padding:28px 0; border-bottom:1px solid var(--border); }
        .step:last-child { border-bottom:none; }
        .step-num { width:34px; height:34px; border-radius:50%; flex-shrink:0; background:var(--accent-light); border:1px solid var(--accent-mid); color:var(--accent); font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; margin-top:2px; font-family:'Inter',sans-serif; }
        .step-body h4 { font-size:16px; font-weight:700; color:var(--text); margin-bottom:6px; }
        .step-body p { font-size:14px; color:var(--text-muted); line-height:1.7; }

        /* CTA */
        .cta-bottom { max-width:620px; margin:0 auto; padding:0 24px 110px; text-align:center; }
        .cta-card { background:var(--text); border-radius:20px; padding:56px 40px; }
        .cta-card h2 { font-family:'Harmony', -apple-system, sans-serif; font-size:clamp(26px,3.5vw,40px); font-weight:400; color:var(--bg); margin-bottom:12px; letter-spacing:-0.3px; }
        .cta-card > p { font-size:15px; color:rgba(245,242,235,0.45); margin-bottom:32px; line-height:1.65; }
        .cta-coming { display:inline-flex; align-items:center; gap:10px; background:rgba(245,242,235,0.08); border:1px solid rgba(245,242,235,0.12); border-radius:12px; padding:14px 28px; font-size:14px; font-weight:600; color:rgba(245,242,235,0.35); font-family:'Inter',sans-serif; margin-bottom:24px; }
        .cta-coming .pill { font-size:9px; font-weight:700; letter-spacing:0.08em; background:var(--accent); color:white; border-radius:4px; padding:3px 7px; text-transform:uppercase; }

        /* FOOTER */
        .footer { border-top:1px solid var(--border); padding:28px 48px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        .footer-logo { display:flex; align-items:center; gap:8px; }
        .footer-logo-text { font-family:'Humane',sans-serif; font-weight:500; font-size:18px; letter-spacing:0.04em; color:var(--text-muted); padding-top:1px; }
        .footer p { font-size:13px; color:var(--text-dim); }

        @media (max-width:640px) {
          .nav { padding:14px 20px; }
          .features-grid { grid-template-columns:1fr; }
          .cta-card { padding:40px 24px; }
          .footer { padding:20px; flex-direction:column; text-align:center; }
        }
      `}</style>

      {/* NAV */}
      <nav className="nav">
        <a href="/" className="nav-logo">
          <MindVaultIcon size={28} />
          <span className="nav-logo-text">MindVault</span>
        </a>
        <div className="nav-right">
          <span className="nav-badge">Beta soon</span>
          <a href="#notify" className="nav-cta">Notify me</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <h1>Save what<br /><em>inspires you.</em></h1>
        <p className="hero-sub">
          Turn endless scrolling into a curated visual library.
          References, mood boards, and ideas — always at hand.
        </p>
        <div className="btn-coming">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M7.5 1v8M4 6l3.5 3.5L11 6M1.5 12.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Download for Mac
          <span className="badge">Coming Soon</span>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features">
        <div className="features-header">
          <div className="eyebrow">Why MindVault</div>
          <h2>Your doomscrolling,<br />put to work.</h2>
        </div>
        <div className="features-grid">
          {[
            {
              icon: <path d="M10 2.5L3 7.5V17.5H8V13H12V17.5H17V7.5L10 2.5Z" stroke="#C8861E" strokeWidth="1.5" strokeLinejoin="round"/>,
              title: 'Save from anywhere',
              text: 'Telegram, Chrome Extension, iPhone Share Sheet — everything lands in your Vault instantly. No copy-paste, no switching apps.',
            },
            {
              icon: <><rect x="2" y="2" width="7" height="7" rx="1.5" stroke="#C8861E" strokeWidth="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5" stroke="#C8861E" strokeWidth="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5" stroke="#C8861E" strokeWidth="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5" stroke="#C8861E" strokeWidth="1.5"/></>,
              title: 'Organise your inspiration',
              text: 'Tags, Collections, two Spaces (Eye & Mind). AI recognises what you saved — you never have to type a label manually.',
            },
            {
              icon: <path d="M2 10C2 10 5 4 10 4C15 4 18 10 18 10C18 10 15 16 10 16C5 16 2 10 2 10Z" stroke="#C8861E" strokeWidth="1.5"/>,
              title: 'Instagram, TikTok, YouTube — finally useful',
              text: 'Send the link. MindVault fetches the thumbnail, generates tags, and adds context automatically. Scrolling becomes archiving.',
            },
            {
              icon: <><rect x="2" y="4" width="16" height="12" rx="2" stroke="#C8861E" strokeWidth="1.5"/><path d="M6 9h8M6 12h5" stroke="#C8861E" strokeWidth="1.5" strokeLinecap="round"/></>,
              title: 'References, ready',
              text: 'Mood board for a pitch? Visual references for a shoot? Everything is searchable, visual, and one click away.',
            },
          ].map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">{f.icon}</svg>
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how">
        <div className="features-header">
          <div className="eyebrow">How it works</div>
          <h2>Setup in five minutes.</h2>
        </div>
        <div className="steps">
          {[
            { n: '1', title: 'Install MindVault on your Mac', text: 'The Electron app runs in the background and manages your local library. Your data stays on your machine.' },
            { n: '2', title: 'Send links from anywhere', text: 'Chrome Extension, Telegram bot, or iPhone Share Sheet. Links reach your Vault in seconds — even when your Mac is off.' },
            { n: '3', title: 'Browse your visual library', text: 'Thumbnails, tags, collections, semantic search. Everything that ever inspired you — finally in one place.' },
          ].map(s => (
            <div key={s.n} className="step">
              <div className="step-num">{s.n}</div>
              <div className="step-body"><h4>{s.title}</h4><p>{s.text}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="cta-bottom" id="notify">
        <div className="cta-card">
          <h2>Coming soon.</h2>
          <p>MindVault is currently in private beta.<br />Leave your email and we'll let you know.</p>
          <div className="cta-coming">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1v8M4 6l3.5 3.5L11 6M1.5 12.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Download for Mac
            <span className="pill">Coming Soon</span>
          </div>
          <WaitlistForm dark={true} />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-logo">
          <MindVaultIcon size={22} />
          <span className="footer-logo-text">MindVault</span>
        </div>
        <p>Built for creatives who collect ideas.</p>
        <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>© 2026</p>
      </footer>
    </div>
  );
}
