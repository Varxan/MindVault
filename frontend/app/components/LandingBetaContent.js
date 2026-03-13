'use client';
import { useEffect, useState } from 'react';

const css = `
@font-face{font-family:'Humane';src:url('/fonts/Humane-Medium.ttf') format('truetype');font-weight:500;font-display:swap;}

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#faf8f4;--surface:#f5f2eb;--border:#e2e0d8;
  --text:#1a1a18;--text-muted:#5a5a54;--text-dim:#a8a49d;--accent:#C8861E;
}
html{scroll-behavior:smooth;}
body{background:var(--bg)!important;color:var(--text);font-family:var(--font-inter,'Inter'),sans-serif;-webkit-font-smoothing:antialiased;}

.lp-reveal{opacity:0;transform:translateY(28px);transition:opacity 0.85s cubic-bezier(0.16,1,0.3,1),transform 0.85s cubic-bezier(0.16,1,0.3,1);}
.lp-reveal.in{opacity:1;transform:none;}
.d1{transition-delay:0.10s;}.d2{transition-delay:0.20s;}

.lp-nav{display:flex;align-items:center;justify-content:space-between;padding:18px 40px;position:sticky;top:0;z-index:100;background:rgba(250,248,244,0.92);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);}
.lp-nav-logo{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--text);}
.lp-nav-logo img{width:28px;height:28px;border-radius:6px;flex-shrink:0;}
.lp-nav-logo-text{font-family:'Humane',sans-serif;font-weight:500;font-size:20px;letter-spacing:0.06em;}
.lp-nav-badge{font-family:var(--font-inter,'Inter'),sans-serif;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);background:rgba(200,134,30,0.10);padding:5px 12px;border-radius:100px;}

.lp-hero{padding:80px 40px 0;overflow:hidden;min-height:90vh;display:flex;flex-direction:column;justify-content:flex-start;}
.lp-hero-meta{display:flex;align-items:center;justify-content:space-between;margin-bottom:40px;}
.lp-hero-eyebrow{font-family:var(--font-inter,'Inter'),sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent);}
.lp-hero-mac{font-family:var(--font-inter,'Inter'),sans-serif;font-size:13px;color:var(--text-dim);font-style:italic;}
.lp-hero h1{font-family:'Humane',sans-serif;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;line-height:0.87;color:var(--text);font-size:clamp(100px,18vw,240px);white-space:nowrap;overflow:hidden;opacity:0;animation:lp-hero-in 1.1s 0.15s cubic-bezier(0.16,1,0.3,1) forwards;}
@keyframes lp-hero-in{from{opacity:0;transform:translateY(28px);}to{opacity:1;transform:none;}}
.lp-hero-sub-row{display:flex;align-items:flex-end;justify-content:space-between;gap:48px;padding:40px 0 56px;border-bottom:1px solid var(--border);opacity:0;animation:lp-hero-in 1s 0.55s cubic-bezier(0.16,1,0.3,1) forwards;}
.lp-hero-sub{font-family:var(--font-inter,'Inter'),sans-serif;font-weight:300;font-size:19px;color:var(--text-muted);line-height:1.8;max-width:500px;letter-spacing:0.01em;}

.lp-signup-col{display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex-shrink:0;}
.lp-signup-form{display:flex;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:#fff;}
.lp-signup-input{font-family:var(--font-inter,'Inter'),sans-serif;font-size:14px;color:var(--text);border:none;outline:none;background:transparent;padding:13px 18px;min-width:220px;}
.lp-signup-input::placeholder{color:var(--text-dim);}
.lp-signup-btn{font-family:var(--font-inter,'Inter'),sans-serif;font-size:13px;font-weight:700;color:#fff;background:var(--text);border:none;cursor:pointer;padding:13px 22px;white-space:nowrap;transition:opacity 0.2s;}
.lp-signup-btn:hover{opacity:0.82;}
.lp-signup-btn:disabled{opacity:0.5;cursor:default;}
.lp-signup-note{font-family:var(--font-inter,'Inter'),sans-serif;font-weight:300;font-size:12px;color:var(--text-dim);font-style:italic;}
.lp-signup-success{font-family:var(--font-inter,'Inter'),sans-serif;font-size:14px;color:var(--accent);font-style:italic;}
.lp-signup-error{font-family:var(--font-inter,'Inter'),sans-serif;font-size:12px;color:#c0392b;margin-top:6px;}

.lp-built-for{display:flex;align-items:center;overflow-x:auto;border-bottom:1px solid var(--border);border-top:1px solid var(--border);margin-top:auto;}
.lp-bf-label{font-family:var(--font-inter,'Inter'),sans-serif;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-dim);padding:16px 40px;flex-shrink:0;border-right:1px solid var(--border);}
.lp-bf-item{font-family:var(--font-inter,'Inter'),sans-serif;font-size:14px;color:var(--text-muted);padding:16px 28px;border-right:1px solid var(--border);white-space:nowrap;flex-shrink:0;}

.lp-app-preview{padding:60px 40px 0;opacity:0;animation:lp-hero-in 1s 0.80s cubic-bezier(0.16,1,0.3,1) forwards;}
.lp-app-preview-inner{position:relative;border-radius:16px;overflow:hidden;border:1px solid var(--border);background:var(--surface);box-shadow:0 8px 48px rgba(26,26,24,0.08),0 2px 8px rgba(26,26,24,0.05);}
.lp-app-preview video{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;pointer-events:none;user-select:none;-webkit-user-select:none;}

.lp-features{max-width:1100px;margin:0 auto;padding:100px 40px;}
.lp-section-label{font-family:var(--font-inter,'Inter'),sans-serif;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-dim);margin-bottom:48px;}
.lp-feat-row{display:grid;grid-template-columns:260px 1fr 40px;gap:48px;align-items:start;padding:44px 0;border-top:1px solid var(--border);}
.lp-feat-row:last-child{border-bottom:1px solid var(--border);}
.lp-feat-title{font-family:'Humane',sans-serif;font-size:clamp(38px,4vw,54px);font-weight:500;text-transform:uppercase;letter-spacing:0.02em;color:var(--text);line-height:1;padding-top:4px;}
.lp-feat-desc{font-family:var(--font-inter,'Inter'),sans-serif;font-weight:300;font-size:16px;color:#4a4a44;line-height:1.85;max-width:540px;letter-spacing:0.01em;}
.lp-feat-n{font-family:var(--font-inter,'Inter'),sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;color:var(--text-dim);padding-top:8px;text-align:right;}

.lp-eyemind{background:var(--text);padding:80px 40px;}
.lp-eyemind-inner{max-width:1100px;margin:0 auto;}
.lp-eyemind-header{margin-bottom:64px;}
.lp-eyemind-header h2{font-family:'Humane',sans-serif;font-size:clamp(64px,8vw,120px);font-weight:500;text-transform:uppercase;letter-spacing:0.04em;color:var(--bg);line-height:0.88;}
.lp-eyemind-header p{font-family:var(--font-inter,'Inter'),sans-serif;font-weight:300;font-size:16px;color:rgba(245,242,235,0.4);line-height:1.85;max-width:500px;margin-top:24px;letter-spacing:0.01em;}
.lp-em-cards{display:grid;grid-template-columns:1fr 1fr;gap:2px;}
.lp-em-card{background:rgba(255,255,255,0.04);padding:48px 44px;border-radius:4px;position:relative;overflow:hidden;}
.lp-em-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform 1.6s cubic-bezier(0.16,1,0.3,1);}
.lp-em-card.in::after{transform:scaleX(1);}
.lp-em-card-label{font-family:'Humane',sans-serif;font-size:72px;font-weight:500;text-transform:uppercase;letter-spacing:0.06em;color:var(--accent);line-height:1;margin-bottom:24px;}
.lp-em-card-title{font-family:var(--font-inter,'Inter'),sans-serif;font-weight:300;font-size:17px;color:var(--bg);line-height:1.5;margin-bottom:12px;letter-spacing:0.01em;}
.lp-em-card p{font-family:var(--font-inter,'Inter'),sans-serif;font-weight:300;font-size:14px;color:rgba(245,242,235,0.4);line-height:1.85;letter-spacing:0.01em;}

.lp-platforms{display:flex;align-items:center;gap:12px;padding:20px 40px;flex-wrap:wrap;border-bottom:1px solid var(--border);}
.lp-pl-label{font-family:var(--font-inter,'Inter'),sans-serif;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-dim);margin-right:4px;}
.lp-pl{font-family:var(--font-inter,'Inter'),sans-serif;font-size:13px;color:var(--text-muted);background:var(--surface);border:1px solid var(--border);border-radius:100px;padding:4px 14px;}

.lp-cta{padding:100px 40px;text-align:center;}
.lp-cta h2{font-family:'Humane',sans-serif;font-size:clamp(80px,12vw,160px);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;line-height:0.88;color:var(--text);margin-bottom:40px;}
.lp-cta h2 em{font-style:normal;color:var(--accent);}
.lp-cta-sub{font-family:var(--font-inter,'Inter'),sans-serif;font-weight:300;font-size:18px;color:var(--text-muted);max-width:460px;margin:0 auto 44px;line-height:1.8;letter-spacing:0.01em;}
.lp-cta-form{display:flex;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:#fff;max-width:420px;margin:0 auto;}
.lp-cta-input{font-family:var(--font-inter,'Inter'),sans-serif;font-size:15px;color:var(--text);border:none;outline:none;background:transparent;padding:15px 20px;flex:1;}
.lp-cta-input::placeholder{color:var(--text-dim);}
.lp-cta-btn{font-family:var(--font-inter,'Inter'),sans-serif;font-size:13px;font-weight:700;color:#fff;background:var(--text);border:none;cursor:pointer;padding:15px 24px;white-space:nowrap;transition:opacity 0.2s;}
.lp-cta-btn:hover{opacity:0.82;}
.lp-cta-btn:disabled{opacity:0.5;cursor:default;}
.lp-cta-note{font-family:var(--font-inter,'Inter'),sans-serif;font-weight:300;font-size:13px;color:var(--text-dim);margin-top:14px;font-style:italic;}
.lp-cta-success{font-family:var(--font-inter,'Inter'),sans-serif;font-size:16px;color:var(--accent);font-style:italic;margin-bottom:12px;}

.lp-footer{border-top:1px solid var(--border);padding:24px 40px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;}
.lp-footer-logo{font-family:'Humane',sans-serif;font-size:18px;letter-spacing:0.06em;color:var(--text-muted);}
.lp-footer p,.lp-footer a{font-family:var(--font-inter,'Inter'),sans-serif;font-size:13px;color:var(--text-dim);text-decoration:none;}
.lp-footer-links{display:flex;gap:24px;}

@media(max-width:768px){
  .lp-nav{padding:14px 24px;}
  .lp-hero{padding:48px 24px 0;}
  .lp-hero-sub-row{flex-direction:column;gap:32px;}
  .lp-signup-col{align-items:stretch;width:100%;}
  .lp-features{padding:60px 24px;}
  .lp-feat-row{grid-template-columns:1fr;gap:16px;}
  .lp-feat-n{display:none;}
  .lp-eyemind{padding:60px 24px;}
  .lp-em-cards{grid-template-columns:1fr;}
  .lp-cta{padding:60px 24px;}
  .lp-app-preview{padding:40px 24px 0;}
  .lp-footer{padding:20px 24px;flex-direction:column;gap:12px;}
}
`;

function SignupForm({ formClass, inputClass, btnClass, noteClass, successClass, noteText, btnLabel }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || state === 'loading') return;
    setState('loading');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setState(res.ok ? 'success' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'success') {
    return <p className={successClass}>You&apos;re on the list.</p>;
  }

  return (
    <>
      <form className={formClass} onSubmit={handleSubmit}>
        <input
          className={inputClass}
          type="email"
          placeholder="your@email.com"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <button className={btnClass} type="submit" disabled={state === 'loading'}>
          {state === 'loading' ? 'Saving…' : btnLabel}
        </button>
      </form>
      {state === 'error' && <p className="lp-signup-error">Something went wrong. Please try again.</p>}
      {noteText && <span className={noteClass}>{noteText}</span>}
    </>
  );
}

export default function LandingBetaContent() {
  useEffect(() => {
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); }),
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );
    document.querySelectorAll('.lp-reveal, .lp-em-card').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const vid = document.querySelector('.lp-app-preview video');
    if (vid) { vid.muted = true; vid.play().catch(() => {}); }
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <nav className="lp-nav">
        <a href="/" className="lp-nav-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mindvault-icon.png" alt="MindVault" width={28} height={28} />
          <span className="lp-nav-logo-text">MindVault</span>
        </a>
        <span className="lp-nav-badge">Early Access</span>
      </nav>

      <section className="lp-hero">
        <div className="lp-hero-meta">
          <span className="lp-hero-eyebrow">For filmmakers, directors &amp; creators</span>
          <span className="lp-hero-mac">Mac · Coming soon</span>
        </div>
        <h1>YOUR CREATIVE VAULT.</h1>
        <div className="lp-hero-sub-row">
          <p className="lp-hero-sub">Turn endless scrolling into a curated visual library. References, mood boards and ideas, always at hand.</p>
          <div className="lp-signup-col">
            <SignupForm
              formClass="lp-signup-form"
              inputClass="lp-signup-input"
              btnClass="lp-signup-btn"
              noteClass="lp-signup-note"
              successClass="lp-signup-success"
              noteText="Be the first to know when MindVault launches."
              btnLabel="Get Early Access"
            />
          </div>
        </div>
        <div className="lp-built-for">
          <span className="lp-bf-label">Built for</span>
          <span className="lp-bf-item">Film Directors</span>
          <span className="lp-bf-item">Directors of Photography</span>
          <span className="lp-bf-item">Treatment Designers</span>
          <span className="lp-bf-item">Colorists</span>
          <span className="lp-bf-item">Art Directors</span>
          <span className="lp-bf-item">Creative Directors</span>
        </div>
      </section>

      <div className="lp-app-preview">
        <div className="lp-app-preview-inner">
          <video src="/MV1.mp4" autoPlay muted loop playsInline disablePictureInPicture disableRemotePlayback />
        </div>
      </div>

      <section className="lp-features">
        <div className="lp-section-label lp-reveal">What it does</div>
        <div>
          <div className="lp-feat-row lp-reveal">
            <div className="lp-feat-title">Capture the moment.</div>
            <p className="lp-feat-desc">A frame that stops you. A colour palette, a scene, a cut that belongs in your next treatment. Save it in one move, from any source, any device.</p>
            <span className="lp-feat-n">01</span>
          </div>
          <div className="lp-feat-row lp-reveal d1">
            <div className="lp-feat-title">Always findable.</div>
            <p className="lp-feat-desc">Collections, tags, and AI that recognises what you saved. No manual labelling, ever. Search by mood, colour, subject or concept.</p>
            <span className="lp-feat-n">02</span>
          </div>
          <div className="lp-feat-row lp-reveal d2">
            <div className="lp-feat-title">Treatment-ready.</div>
            <p className="lp-feat-desc">Trim a clip. Pull a still. Create a GIF. Your saved references become deliverables without leaving the app.</p>
            <span className="lp-feat-n">03</span>
          </div>
        </div>
      </section>

      <section className="lp-eyemind">
        <div className="lp-eyemind-inner">
          <div className="lp-eyemind-header lp-reveal">
            <h2>Two ways of seeing.</h2>
            <p>Not all inspiration works the same way. MindVault keeps both worlds separate and searchable.</p>
          </div>
          <div className="lp-em-cards">
            <div className="lp-em-card lp-reveal">
              <div className="lp-em-card-label">EYE</div>
              <p className="lp-em-card-title">What you see.</p>
              <p>Colour, light, texture, movement, composition. Find a frame by its feel, not by what you called it.</p>
            </div>
            <div className="lp-em-card lp-reveal d2">
              <div className="lp-em-card-label">MIND</div>
              <p className="lp-em-card-title">What you think.</p>
              <p>Tutorials, behind-the-scenes, educational videos. The knowledge behind the craft, always in context.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="lp-platforms">
        <span className="lp-pl-label">Works with</span>
        <span className="lp-pl">Instagram</span>
        <span className="lp-pl">YouTube</span>
        <span className="lp-pl">Vimeo</span>
        <span className="lp-pl">TikTok</span>
      </div>

      <section className="lp-cta">
        <div className="lp-reveal">
          <h2>Join the<br /><em>waitlist.</em></h2>
          <p className="lp-cta-sub">MindVault is in final testing. Leave your email and we&apos;ll let you know the moment it&apos;s ready.</p>
        </div>
        <div className="lp-reveal d1">
          <SignupForm
            formClass="lp-cta-form"
            inputClass="lp-cta-input"
            btnClass="lp-cta-btn"
            noteClass="lp-cta-note"
            successClass="lp-cta-success"
            noteText="No spam. One email when it launches."
            btnLabel="Notify me"
          />
        </div>
      </section>

      <footer className="lp-footer">
        <span className="lp-footer-logo">MindVault</span>
        <p>Built for people who collect ideas.</p>
        <div className="lp-footer-links">
          <a href="/privacy">Privacy</a>
          <a href="mailto:hello@mindvault.ch">Contact</a>
        </div>
        <p>© 2026</p>
      </footer>
    </>
  );
}
