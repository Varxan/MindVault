export const runtime = 'edge';

export const metadata = {
  title: 'MindVault — Deine visuelle Inspirations-Bibliothek',
  description: 'Speichere was dich inspiriert — egal woher. Verwandle gedankenloses Scrollen in eine kuratierte Referenz-Bibliothek.',
};

export default function LandingPage() {
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: '#f5f2eb', color: '#1a1a18', minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #f5f2eb; --surface: #faf8f4; --surface-2: #edeae3;
          --border: #e2e0d8; --border-2: #ccc9be;
          --text: #1a1a18; --text-muted: #888880; --text-dim: #bbb;
          --accent: #C8861E; --accent-light: rgba(200,134,30,0.1); --accent-mid: rgba(200,134,30,0.22);
        }

        /* NAV */
        .nav { display:flex; align-items:center; justify-content:space-between; padding:18px 48px; border-bottom:1px solid var(--border); position:sticky; top:0; z-index:100; background:rgba(245,242,235,0.92); backdrop-filter:blur(16px); }
        .nav-logo { display:flex; align-items:center; gap:10px; text-decoration:none; color:var(--text); }
        .nav-logo-mark { width:30px; height:30px; border-radius:7px; background:var(--text); display:flex; align-items:center; justify-content:center; }
        .nav-logo span { font-weight:700; font-size:16px; letter-spacing:-0.3px; }
        .nav-right { display:flex; align-items:center; gap:12px; }
        .nav-badge { font-size:11px; font-weight:600; letter-spacing:0.05em; color:var(--accent); background:var(--accent-light); border:1px solid var(--accent-mid); border-radius:20px; padding:4px 10px; text-transform:uppercase; }
        .nav-cta { background:var(--text); color:var(--bg); border:none; border-radius:10px; padding:9px 20px; font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; transition:opacity 0.15s; display:inline-block; font-family:inherit; }
        .nav-cta:hover { opacity:0.75; }

        /* HERO */
        .hero { text-align:center; padding:80px 24px 64px; max-width:780px; margin:0 auto; }
        .hero h1 { font-size:clamp(38px,5.5vw,64px); font-weight:700; line-height:1.08; letter-spacing:-2px; color:var(--text); margin-bottom:22px; }
        .hero h1 em { font-style:normal; color:var(--accent); }
        .hero-sub { font-size:19px; color:var(--text-muted); line-height:1.6; max-width:520px; margin:0 auto 40px; font-weight:400; }
        .btn-coming { display:inline-flex; align-items:center; gap:8px; background:var(--surface-2); color:var(--text-muted); border:1px solid var(--border-2); border-radius:12px; padding:14px 28px; font-size:15px; font-weight:600; cursor:default; text-decoration:none; font-family:inherit; }
        .btn-coming .badge { font-size:9px; font-weight:700; letter-spacing:0.08em; background:var(--accent); color:white; border-radius:4px; padding:2px 6px; text-transform:uppercase; }

        /* MOCKUP */
        .mockup-wrap { max-width:1020px; margin:0 auto; padding:0 24px 88px; }
        .mockup-window { background:#0a0a0a; border-radius:14px; overflow:hidden; box-shadow:0 0 0 1px rgba(0,0,0,0.12),0 32px 80px rgba(0,0,0,0.22),0 8px 20px rgba(0,0,0,0.12); }
        .mockup-bar { background:#111; padding:11px 16px; display:flex; align-items:center; gap:7px; border-bottom:1px solid rgba(255,255,255,0.05); }
        .mdot { width:10px; height:10px; border-radius:50%; }
        .mockup-header { background:#111; border-bottom:1px solid rgba(255,255,255,0.06); padding:0 20px; display:flex; align-items:center; justify-content:space-between; height:52px; }
        .mockup-logo { font-size:18px; font-weight:700; letter-spacing:-0.5px; color:#C8861E; font-family:Georgia,serif; }
        .mockup-tabs { display:flex; gap:24px; }
        .mockup-tab { font-size:12px; font-weight:600; letter-spacing:0.05em; color:rgba(255,255,255,0.3); text-transform:uppercase; }
        .mockup-tab.active { color:#C8861E; border-bottom:2px solid #C8861E; }
        .mockup-actions { display:flex; gap:8px; }
        .mockup-action-btn { font-size:11px; color:rgba(255,255,255,0.3); background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:4px 10px; }
        .mockup-search { background:#0a0a0a; padding:10px 20px; border-bottom:1px solid rgba(255,255,255,0.05); }
        .mockup-search-inner { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; height:34px; display:flex; align-items:center; gap:8px; padding:0 12px; }
        .mockup-search-inner span { font-size:12px; color:rgba(255,255,255,0.18); }
        .mockup-grid { background:#0a0a0a; padding:16px 16px 0; columns:4; column-gap:10px; }
        .mc { break-inside:avoid; margin-bottom:10px; background:#141414; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.06); }
        .mc-body { padding:8px 10px 10px; }
        .mc-source { display:flex; align-items:center; gap:5px; margin-bottom:2px; }
        .mc-source-icon { width:12px; height:12px; border-radius:2px; background:rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:center; }
        .mc-source-domain { font-size:10px; color:rgba(255,255,255,0.25); }
        .mc-title { font-size:11px; font-weight:600; color:rgba(255,255,255,0.75); line-height:1.3; margin-bottom:6px; }
        .mc-tags { display:flex; gap:3px; flex-wrap:wrap; }
        .mc-tag { font-size:9px; color:rgba(255,255,255,0.25); background:rgba(255,255,255,0.05); border-radius:3px; padding:2px 5px; }
        .mc-date { font-size:9px; color:rgba(255,255,255,0.15); margin-top:5px; }

        /* SELLS */
        .sells { max-width:960px; margin:0 auto; padding:0 24px 88px; }
        .sells-header { text-align:center; margin-bottom:52px; }
        .section-eyebrow { font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--text-dim); margin-bottom:14px; }
        .sells-header h2 { font-size:clamp(26px,3.5vw,40px); font-weight:700; letter-spacing:-1px; color:var(--text); line-height:1.15; }
        .sells-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:2px; background:var(--border); border-radius:16px; overflow:hidden; border:1px solid var(--border); }
        .sell-card { background:var(--surface); padding:36px 32px; transition:background 0.2s; }
        .sell-card:hover { background:var(--bg); }
        .sell-icon { width:44px; height:44px; border-radius:11px; background:var(--accent-light); border:1px solid var(--accent-mid); display:flex; align-items:center; justify-content:center; margin-bottom:20px; }
        .sell-card h3 { font-size:18px; font-weight:700; color:var(--text); margin-bottom:10px; letter-spacing:-0.3px; }
        .sell-card p { font-size:15px; color:var(--text-muted); line-height:1.65; }

        /* HOW */
        .how { max-width:640px; margin:0 auto; padding:0 24px 88px; }
        .steps { display:flex; flex-direction:column; }
        .step { display:flex; gap:18px; padding:26px 0; border-bottom:1px solid var(--border); }
        .step:last-child { border-bottom:none; }
        .step-num { width:34px; height:34px; border-radius:50%; flex-shrink:0; background:var(--accent-light); border:1px solid var(--accent-mid); color:var(--accent); font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; margin-top:2px; }
        .step-body h4 { font-size:16px; font-weight:700; color:var(--text); margin-bottom:6px; }
        .step-body p { font-size:14px; color:var(--text-muted); line-height:1.65; }

        /* CTA */
        .cta-bottom { max-width:700px; margin:0 auto; padding:0 24px 100px; text-align:center; }
        .cta-card { background:var(--text); border-radius:20px; padding:52px 36px; }
        .cta-card h2 { font-size:clamp(22px,3vw,34px); font-weight:700; color:var(--bg); margin-bottom:12px; letter-spacing:-0.5px; }
        .cta-card > p { font-size:15px; color:rgba(245,242,235,0.5); margin-bottom:32px; line-height:1.6; }
        .cta-coming { display:inline-flex; align-items:center; gap:10px; background:rgba(245,242,235,0.1); border:1px solid rgba(245,242,235,0.15); border-radius:12px; padding:16px 32px; font-size:15px; font-weight:600; color:rgba(245,242,235,0.4); font-family:inherit; }
        .cta-coming .pill { font-size:9px; font-weight:700; letter-spacing:0.08em; background:var(--accent); color:white; border-radius:4px; padding:3px 7px; text-transform:uppercase; }
        .cta-notify { margin-top:18px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
        .cta-notify input { background:rgba(245,242,235,0.08); border:1px solid rgba(245,242,235,0.15); border-radius:10px; padding:11px 16px; font-size:14px; color:rgba(245,242,235,0.7); font-family:inherit; outline:none; min-width:220px; transition:border-color 0.2s; }
        .cta-notify input::placeholder { color:rgba(245,242,235,0.25); }
        .cta-notify input:focus { border-color:rgba(245,242,235,0.35); }
        .cta-notify button { background:var(--accent); color:white; border:none; border-radius:10px; padding:11px 22px; font-size:14px; font-weight:600; cursor:pointer; font-family:inherit; transition:opacity 0.15s; }
        .cta-notify button:hover { opacity:0.88; }

        /* FOOTER */
        .footer { border-top:1px solid var(--border); padding:28px 48px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        .footer-logo { display:flex; align-items:center; gap:8px; }
        .footer-logo-mark { width:22px; height:22px; border-radius:5px; background:var(--text); opacity:0.3; display:flex; align-items:center; justify-content:center; }
        .footer p { font-size:13px; color:var(--text-dim); }

        @media (max-width:640px) {
          .nav { padding:14px 20px; }
          .mockup-grid { columns:2; }
          .sells-grid { grid-template-columns:1fr; }
          .footer { padding:20px; flex-direction:column; text-align:center; }
        }
      `}</style>

      {/* NAV */}
      <nav className="nav">
        <a href="/" className="nav-logo">
          <div className="nav-logo-mark">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" fill="#f5f2eb"/>
              <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" fill="#f5f2eb" opacity=".6"/>
              <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" fill="#f5f2eb" opacity=".6"/>
              <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" fill="#f5f2eb" opacity=".35"/>
            </svg>
          </div>
          <span>MindVault</span>
        </a>
        <div className="nav-right">
          <span className="nav-badge">Beta soon</span>
          <a href="#notify" className="nav-cta">Notify me</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <h1>Dein visuelles<br /><em>Inspirations-Archiv.</em></h1>
        <p className="hero-sub">
          Speichere was dich inspiriert — egal woher. Verwandle gedankenloses Scrollen in
          eine kuratierte Referenz-Bibliothek für deine nächste Arbeit.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
          <div className="btn-coming">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1v8M4 6l3.5 3.5L11 6M1.5 12.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Download für Mac
            <span className="badge">Coming Soon</span>
          </div>
        </div>
      </section>

      {/* APP MOCKUP */}
      <div className="mockup-wrap">
        <div className="mockup-window">
          <div className="mockup-bar">
            <div className="mdot" style={{background:'#ff5f57'}}/>
            <div className="mdot" style={{background:'#febc2e'}}/>
            <div className="mdot" style={{background:'#28c840'}}/>
          </div>
          <div className="mockup-header">
            <span className="mockup-logo">MINDVAULT</span>
            <div className="mockup-tabs">
              <div className="mockup-tab active">EYE</div>
              <div className="mockup-tab">MIND</div>
            </div>
            <div className="mockup-actions">
              <div className="mockup-action-btn">Select</div>
              <div className="mockup-action-btn">Collections</div>
            </div>
          </div>
          <div className="mockup-search">
            <div className="mockup-search-inner">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="3.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"/><path d="M8 8l2 2" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round"/></svg>
              <span>Search...</span>
            </div>
          </div>
          <div className="mockup-grid">
            {[
              { bg:'linear-gradient(160deg,#1a0e0a,#3d1f12,#1a0e0a)', ar:'3/4', title:'roastnpost_oakland', tags:['portrait','film','street'], date:'09.03.2026', domain:'instagram.com' },
              { bg:'linear-gradient(180deg,#0d1520,#1a2d45,#0d1a2a)', ar:'2/3', title:'Macro portrait — electric_theatre', tags:['macro','close-up','portrait'], date:'08.03.2026', domain:'instagram.com' },
              { bg:'linear-gradient(160deg,#1a1208,#2e2010,#0e0c08)', ar:'16/9', title:'Video by room6.agency', tags:['landscape','cinematic','dop'], date:'26.02.2026', domain:'instagram.com' },
              { bg:'linear-gradient(180deg,#1a2035,#2d3555 30%,#c87a30 70%,#8c3a10)', ar:'16/10', title:'Video by alexisgomez', tags:['golden hour','beach','mood'], date:'20.02.2026', domain:'instagram.com' },
              { bg:'linear-gradient(180deg,#12100e,#2a2420,#181410)', ar:'3/4', title:'Street portrait — Mexico City', tags:['street','portrait','mexico'], date:'15.02.2026', domain:'vimeo.com' },
              { bg:'linear-gradient(160deg,#12100e,#201c14,#0e0c0a)', ar:'16/9', title:'Raleigh — RALEIGH FOREVER', tags:['film','narrative','mood'], date:'12.02.2026', domain:'vimeo.com' },
              { bg:'linear-gradient(180deg,#181010,#301818,#120c0c)', ar:'3/4', title:'Cinema — Lights & Composition', tags:['cinema','composition','ref'], date:'08.02.2026', domain:'instagram.com' },
            ].map((c, i) => (
              <div key={i} className="mc">
                <div style={{ aspectRatio:c.ar, background:c.bg, width:'100%' }}/>
                <div className="mc-body">
                  <div className="mc-source">
                    <div className="mc-source-icon"/>
                    <span className="mc-source-domain">{c.domain}</span>
                  </div>
                  <div className="mc-title">{c.title}</div>
                  <div className="mc-tags">{c.tags.map(t => <span key={t} className="mc-tag">{t}</span>)}</div>
                  <div className="mc-date">{c.date}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height:60, background:'linear-gradient(to bottom, transparent, #0a0a0a)' }}/>
        </div>
      </div>

      {/* SELLS */}
      <section className="sells">
        <div className="sells-header">
          <div className="section-eyebrow">Warum MindVault</div>
          <h2>Dein Doomscrolling hat<br/>jetzt einen Zweck.</h2>
        </div>
        <div className="sells-grid">
          {[
            { icon:<path d="M10 2.5L3 7.5V17.5H8V13H12V17.5H17V7.5L10 2.5Z" stroke="#C8861E" strokeWidth="1.5" strokeLinejoin="round"/>, title:'Speichere links von überall', text:'Telegram, iPhone Share Sheet, Chrome Extension — alles landet direkt in deinem Vault. Kein App-Wechsel, kein Copy-Paste, kein Vergessen.' },
            { icon:<><rect x="2" y="2" width="7" height="7" rx="1.5" stroke="#C8861E" strokeWidth="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5" stroke="#C8861E" strokeWidth="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5" stroke="#C8861E" strokeWidth="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5" stroke="#C8861E" strokeWidth="1.5"/></>, title:'Organisiere deine Inspirationen', text:'Tags, Collections, zwei Spaces (Eye & Mind). KI erkennt automatisch worum es geht — du musst nichts manuell eintippen.' },
            { icon:<path d="M2 10C2 10 5 4 10 4C15 4 18 10 18 10C18 10 15 16 10 16C5 16 2 10 2 10Z" stroke="#C8861E" strokeWidth="1.5"/>, title:'Instagram, TikTok, YouTube — endlich sinnvoll', text:'Statt endlos zu scrollen und alles zu vergessen: schick dir den Link. MindVault macht daraus ein visuelles Archiv mit Thumbnail, Tags und Kontext.' },
            { icon:<><rect x="2" y="4" width="16" height="12" rx="2" stroke="#C8861E" strokeWidth="1.5"/><path d="M6 9h8M6 12h5" stroke="#C8861E" strokeWidth="1.5" strokeLinecap="round"/></>, title:'References ready — immer', text:'Moodboard für einen Pitch? Referenzen für dein nächstes Projekt? Alles ist durchsuchbar, visuell und sofort zur Hand.' },
          ].map((s, i) => (
            <div key={i} className="sell-card">
              <div className="sell-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">{s.icon}</svg>
              </div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW */}
      <section className="how">
        <div className="sells-header">
          <div className="section-eyebrow">So funktioniert's</div>
          <h2>Setup in 5 Minuten.</h2>
        </div>
        <div className="steps">
          {[
            { n:'1', title:'MindVault auf dem Mac installieren', text:'Die Electron-App lädt im Hintergrund und verwaltet deine lokale Bibliothek. Deine Daten bleiben auf deinem Rechner.' },
            { n:'2', title:'Links von überall senden', text:'Chrome Extension, Telegram Bot oder iPhone Share Sheet. Der Link landet in Sekunden in deinem Vault — auch wenn der Mac gerade aus ist.' },
            { n:'3', title:'Deine visuelle Bibliothek durchstöbern', text:'Thumbnails, Tags, Collections, semantische Suche. Alles was dich je inspiriert hat — endlich an einem Ort.' },
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
          <h2>Bald verfügbar.</h2>
          <p>MindVault ist aktuell in der Beta-Phase.<br/>Trag dich ein und wir sagen dir Bescheid.</p>
          <div className="cta-coming">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1v8M4 6l3.5 3.5L11 6M1.5 12.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Download für Mac
            <span className="pill">Coming Soon</span>
          </div>
          <div className="cta-notify">
            <input type="email" placeholder="deine@email.com" />
            <button type="button">Benachrichtigen</button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-logo">
          <div className="footer-logo-mark">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" fill="white"/>
              <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" fill="white" opacity=".6"/>
              <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" fill="white" opacity=".6"/>
              <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" fill="white" opacity=".35"/>
            </svg>
          </div>
          <span>MindVault</span>
        </div>
        <p>Gebaut für Kreative, die Ideen sammeln.</p>
        <p style={{color:'var(--text-dim)',fontSize:12}}>© 2026</p>
      </footer>
    </div>
  );
}
