export const runtime = 'edge';

export const metadata = {
  title: 'MindVault — Your personal link vault',
  description: 'Capture links from anywhere. Organize with tags. Access your visual library from any device.',
};

export default function LandingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#080808',
      color: '#e0e0e0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      overflowX: 'hidden',
    }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Nav ── */
        .nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 40px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          position: sticky; top: 0; z-index: 100;
          background: rgba(8,8,8,0.92);
          backdrop-filter: blur(12px);
        }
        .nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .nav-logo span { font-weight: 700; font-size: 16px; color: #e0e0e0; letter-spacing: -0.3px; }
        .nav-cta {
          background: #e0e0e0; color: #080808;
          border: none; border-radius: 10px;
          padding: 9px 20px; font-size: 14px; font-weight: 600;
          cursor: pointer; text-decoration: none;
          transition: opacity 0.15s;
          display: inline-block;
        }
        .nav-cta:hover { opacity: 0.85; }

        /* ── Hero ── */
        .hero {
          text-align: center;
          padding: 90px 24px 80px;
          max-width: 720px;
          margin: 0 auto;
        }
        .hero-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(200,168,75,0.1);
          border: 1px solid rgba(200,168,75,0.25);
          border-radius: 20px;
          padding: 5px 14px;
          font-size: 12px; font-weight: 600;
          color: #c8a84b;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 28px;
        }
        .hero h1 {
          font-size: clamp(36px, 6vw, 60px);
          font-weight: 700;
          line-height: 1.1;
          letter-spacing: -1.5px;
          color: #f0f0f0;
          margin-bottom: 20px;
        }
        .hero h1 .accent { color: #c8a84b; }
        .hero p {
          font-size: 18px;
          color: #666;
          line-height: 1.6;
          max-width: 480px;
          margin: 0 auto 40px;
        }
        .hero-actions {
          display: flex; gap: 12px; justify-content: center;
          flex-wrap: wrap;
        }
        .btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          background: #e0e0e0; color: #080808;
          border: none; border-radius: 12px;
          padding: 14px 28px; font-size: 15px; font-weight: 600;
          cursor: pointer; text-decoration: none;
          transition: opacity 0.15s, transform 0.15s;
        }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-secondary {
          display: inline-flex; align-items: center; gap: 8px;
          background: transparent; color: #888;
          border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
          padding: 14px 28px; font-size: 15px; font-weight: 500;
          cursor: pointer; text-decoration: none;
          transition: all 0.15s;
        }
        .btn-secondary:hover { color: #e0e0e0; border-color: rgba(255,255,255,0.25); }

        /* ── Preview ── */
        .preview-wrap {
          max-width: 900px;
          margin: 0 auto;
          padding: 0 24px 80px;
        }
        .preview-window {
          background: #111;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
        }
        .preview-bar {
          background: #1a1a1a;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding: 12px 16px;
          display: flex; align-items: center; gap: 8px;
        }
        .dot { width: 10px; height: 10px; border-radius: 50%; }
        .preview-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: rgba(255,255,255,0.04);
          padding: 20px;
          gap: 12px;
        }
        .preview-card {
          background: #161616;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .preview-thumb {
          width: 100%; aspect-ratio: 16/9;
          display: flex; align-items: center; justify-content: center;
        }
        .preview-info { padding: 8px 10px 10px; }
        .preview-title {
          font-size: 11px; font-weight: 600; color: #bbb;
          margin-bottom: 5px; line-height: 1.3;
        }
        .preview-tags { display: flex; gap: 4px; flex-wrap: wrap; }
        .preview-tag {
          font-size: 9px; color: #555;
          background: rgba(255,255,255,0.04);
          border-radius: 3px; padding: 2px 5px;
        }

        /* ── Features ── */
        .features {
          max-width: 900px;
          margin: 0 auto;
          padding: 0 24px 80px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }
        .feature-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 28px 24px;
          transition: border-color 0.2s;
        }
        .feature-card:hover { border-color: rgba(255,255,255,0.12); }
        .feature-icon {
          width: 40px; height: 40px;
          background: rgba(200,168,75,0.08);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 16px;
        }
        .feature-card h3 {
          font-size: 15px; font-weight: 600;
          color: #d0d0d0; margin-bottom: 8px;
        }
        .feature-card p { font-size: 14px; color: #555; line-height: 1.6; }

        /* ── How it works ── */
        .how {
          max-width: 700px;
          margin: 0 auto;
          padding: 0 24px 80px;
          text-align: center;
        }
        .section-label {
          font-size: 11px; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: #444;
          margin-bottom: 12px;
        }
        .how h2 {
          font-size: clamp(24px, 4vw, 36px); font-weight: 700;
          color: #e0e0e0; margin-bottom: 14px; letter-spacing: -0.5px;
        }
        .how > p { font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 48px; }
        .steps {
          display: flex; flex-direction: column; gap: 0;
          text-align: left;
        }
        .step {
          display: flex; gap: 20px; align-items: flex-start;
          padding: 24px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .step:last-child { border-bottom: none; }
        .step-num {
          width: 32px; height: 32px; border-radius: 50%;
          background: rgba(200,168,75,0.08);
          border: 1px solid rgba(200,168,75,0.2);
          color: #c8a84b; font-size: 13px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-top: 2px;
        }
        .step-body h4 { font-size: 15px; font-weight: 600; color: #d0d0d0; margin-bottom: 6px; }
        .step-body p { font-size: 14px; color: #555; line-height: 1.6; }

        /* ── Download ── */
        .download {
          max-width: 700px;
          margin: 0 auto;
          padding: 0 24px 100px;
          text-align: center;
        }
        .download-card {
          background: rgba(200,168,75,0.04);
          border: 1px solid rgba(200,168,75,0.15);
          border-radius: 20px;
          padding: 48px 32px;
        }
        .download h2 {
          font-size: clamp(22px, 3.5vw, 32px); font-weight: 700;
          color: #e0e0e0; margin-bottom: 12px; letter-spacing: -0.5px;
        }
        .download > .download-card > p {
          font-size: 16px; color: #666; margin-bottom: 32px; line-height: 1.6;
        }
        .download-buttons {
          display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .btn-dl {
          display: inline-flex; align-items: center; gap: 10px;
          background: #e0e0e0; color: #080808;
          border: none; border-radius: 12px;
          padding: 14px 24px; font-size: 14px; font-weight: 600;
          cursor: pointer; text-decoration: none;
          transition: opacity 0.15s, transform 0.15s;
          min-width: 160px; justify-content: center;
        }
        .btn-dl:hover { opacity: 0.88; transform: translateY(-1px); }
        .btn-dl.win {
          background: transparent; color: #888;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .btn-dl.win:hover { color: #e0e0e0; border-color: rgba(255,255,255,0.25); }
        .version-note { font-size: 12px; color: #333; }
        .version-note a { color: #c8a84b; text-decoration: none; }
        .version-note a:hover { text-decoration: underline; }

        /* ── Footer ── */
        .footer {
          border-top: 1px solid rgba(255,255,255,0.05);
          padding: 32px 40px;
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .footer-logo { display: flex; align-items: center; gap: 8px; }
        .footer-logo span { font-size: 14px; font-weight: 600; color: #444; }
        .footer p { font-size: 13px; color: #333; }

        @media (max-width: 600px) {
          .nav { padding: 16px 20px; }
          .preview-grid { grid-template-columns: repeat(2, 1fr); }
          .preview-grid .preview-card:last-child { display: none; }
          .footer { padding: 24px 20px; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav className="nav">
        <a href="/" className="nav-logo">
          <img src="/icon-192x192.png" alt="MindVault" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <span>MindVault</span>
        </a>
        <a href="https://github.com/Varxan/MindVault/releases/latest" className="nav-cta">
          Download
        </a>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-badge">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <circle cx="4" cy="4" r="4" fill="#c8a84b" />
          </svg>
          Personal · Private · Offline-first
        </div>

        <h1>
          Your links.<br />
          <span className="accent">Beautifully organized.</span>
        </h1>

        <p>
          MindVault saves links from anywhere — browser, Telegram, iPhone Share Sheet — and turns them into a visual, tagged library you actually want to browse.
        </p>

        <div className="hero-actions">
          <a
            href="https://github.com/Varxan/MindVault/releases/latest"
            className="btn-primary"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v9M4 7l4 4 4-4M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Download for Mac
          </a>
          <a
            href="/library"
            className="btn-secondary"
          >
            Open PWA
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </section>

      {/* ── App Preview ── */}
      <div className="preview-wrap">
        <div className="preview-window">
          <div className="preview-bar">
            <div className="dot" style={{ background: '#ff5f57' }} />
            <div className="dot" style={{ background: '#febc2e' }} />
            <div className="dot" style={{ background: '#28c840' }} />
            <div style={{ marginLeft: 12, fontSize: 12, color: '#444', fontWeight: 500 }}>
              MindVault
            </div>
          </div>
          <div className="preview-grid">
            {[
              { color: '#1a1208', accent: '#c8a84b', title: 'Cinematic lighting techniques for documentary', tags: ['film', 'lighting', 'dop'] },
              { color: '#0a1218', accent: '#4a9eff', title: 'CSS Grid mastery — complete visual guide', tags: ['css', 'design', 'dev'] },
              { color: '#120a18', accent: '#b44aff', title: 'Brutalist UI design patterns 2024', tags: ['ui', 'inspiration'] },
              { color: '#0a1808', accent: '#4aff8c', title: 'Audio mixing for film: the invisible art', tags: ['audio', 'film', 'post'] },
              { color: '#18100a', accent: '#ff8c4a', title: 'Building an Electron app from scratch', tags: ['electron', 'dev'] },
              { color: '#0a1818', accent: '#4afff0', title: 'Color grading with DaVinci Resolve', tags: ['colorgrade', 'film'] },
            ].map((card, i) => (
              <div key={i} className="preview-card">
                <div className="preview-thumb" style={{ background: card.color }}>
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <rect x="2" y="4" width="24" height="18" rx="2" stroke={card.accent} strokeWidth="1" opacity="0.4"/>
                    <circle cx="8" cy="10" r="2" stroke={card.accent} strokeWidth="1" opacity="0.4"/>
                    <path d="M2 18 L8 12 L13 16 L19 10 L26 18" stroke={card.accent} strokeWidth="1" strokeLinejoin="round" opacity="0.4"/>
                  </svg>
                </div>
                <div className="preview-info">
                  <div className="preview-title">{card.title}</div>
                  <div className="preview-tags">
                    {card.tags.map(t => <span key={t} className="preview-tag">{t}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Features ── */}
      <section className="features">
        {[
          {
            icon: (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2L11.5 7H16L12.5 10L14 15L9 12L4 15L5.5 10L2 7H6.5L9 2Z" stroke="#c8a84b" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
            ),
            title: 'Visual thumbnails',
            desc: 'Every link gets an auto-fetched thumbnail. Browse your vault like a mood board, not a list.',
          },
          {
            icon: (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M2 9a7 7 0 1 0 14 0A7 7 0 0 0 2 9z" stroke="#c8a84b" strokeWidth="1.3"/>
                <path d="M9 6v3l2 2" stroke="#c8a84b" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            ),
            title: 'Share in seconds',
            desc: 'Use the iPhone Share Sheet, Telegram, or the Chrome extension. Links land in your vault instantly.',
          },
          {
            icon: (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="#c8a84b" strokeWidth="1.3"/>
                <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="#c8a84b" strokeWidth="1.3"/>
                <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="#c8a84b" strokeWidth="1.3"/>
                <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="#c8a84b" strokeWidth="1.3"/>
              </svg>
            ),
            title: 'Tags & collections',
            desc: 'Organize by topic, project, or mood. Filter instantly. AI tagging keeps everything sorted automatically.',
          },
          {
            icon: (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9h12M3 5h12M3 13h8" stroke="#c8a84b" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            ),
            title: 'Offline-first',
            desc: 'Your data lives on your Mac. No subscriptions, no cloud lock-in. Fast, private, always available.',
          },
          {
            icon: (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2v4M9 12v4M2 9h4M12 9h4M4.5 4.5l2.8 2.8M10.7 10.7l2.8 2.8M4.5 13.5l2.8-2.8M10.7 7.3l2.8-2.8" stroke="#c8a84b" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            ),
            title: 'Semantic search',
            desc: 'Find links by meaning, not just keywords. Search for "ideas about tension in film" and it just works.',
          },
          {
            icon: (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="4" width="14" height="10" rx="2" stroke="#c8a84b" strokeWidth="1.3"/>
                <path d="M6 4V3M12 4V3M2 8h14" stroke="#c8a84b" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            ),
            title: 'Spaces: Eye & Mind',
            desc: 'Visual inspiration in Eye, longer reads in Mind. Two vaults, one app.',
          },
        ].map((f, i) => (
          <div key={i} className="feature-card">
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </section>

      {/* ── How it works ── */}
      <section className="how">
        <div className="section-label">How it works</div>
        <h2>From any device, to your vault</h2>
        <p>MindVault runs locally on your Mac but accepts links from anywhere.</p>
        <div className="steps">
          {[
            {
              n: '1',
              title: 'Install MindVault on your Mac',
              desc: 'Download the Electron app. It runs in the background and manages your local library.',
            },
            {
              n: '2',
              title: 'Share links from anywhere',
              desc: 'Use the Chrome extension, the Telegram bot, or the iPhone Share Sheet. Links queue up in Supabase and sync to your Mac the moment it\'s online.',
            },
            {
              n: '3',
              title: 'Browse your visual vault',
              desc: 'Open MindVault on your Mac or phone. Thumbnails, tags, collections — your whole web, organized.',
            },
          ].map(s => (
            <div key={s.n} className="step">
              <div className="step-num">{s.n}</div>
              <div className="step-body">
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Download ── */}
      <section className="download">
        <div className="download-card">
          <h2>Ready to start?</h2>
          <p>Free to download. Your data, your machine.</p>
          <div className="download-buttons">
            <a
              href="https://github.com/Varxan/MindVault/releases/latest"
              className="btn-dl"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1v9M4 7l4 4 4-4M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Download for macOS
            </a>
            <a
              href="https://github.com/Varxan/MindVault/releases/latest"
              className="btn-dl win"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5.5" height="5.5" fill="currentColor" opacity="0.7"/>
                <rect x="8.5" y="2" width="5.5" height="5.5" fill="currentColor" opacity="0.7"/>
                <rect x="2" y="8.5" width="5.5" height="5.5" fill="currentColor" opacity="0.7"/>
                <rect x="8.5" y="8.5" width="5.5" height="5.5" fill="currentColor" opacity="0.7"/>
              </svg>
              Download for Windows
            </a>
          </div>
          <p className="version-note">
            View all releases on{' '}
            <a href="https://github.com/Varxan/MindVault/releases">GitHub</a>
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-logo">
          <img src="/icon-192x192.png" alt="MindVault" style={{ width: 22, height: 22, borderRadius: 5, opacity: 0.5 }} />
          <span>MindVault</span>
        </div>
        <p>Built for creators who collect ideas.</p>
        <a href="/library" style={{ fontSize: 13, color: '#333', textDecoration: 'none' }}>
          Open PWA →
        </a>
      </footer>
    </div>
  );
}
