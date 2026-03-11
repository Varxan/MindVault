'use client';
import { useEffect, useState } from 'react';

const css = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
/* Inter is injected via next/font — no Google Fonts request needed */
/* Scoped landing-page variables — override any global theme */
:root,[data-theme],[data-theme="dark"],[data-theme="light"]{
  --lp-bg:#faf8f4;
  --lp-surface:#f5f2eb;
  --lp-border:#e2e0d8;
  --lp-text:#1a1a18;
  --lp-text-muted:#5a5a54;
  --lp-text-dim:#a8a49d;
  --lp-accent:#C8861E;
}
html{scroll-behavior:smooth;}
body{background:#faf8f4!important;color:#1a1a18;font-family:'Harmony',Georgia,serif;-webkit-font-smoothing:antialiased;}

.reveal{opacity:0;transform:translateY(28px);transition:opacity 0.85s cubic-bezier(0.16,1,0.3,1),transform 0.85s cubic-bezier(0.16,1,0.3,1);}
.reveal.in{opacity:1;transform:none;}
.d1{transition-delay:0.10s;} .d2{transition-delay:0.20s;} .d3{transition-delay:0.32s;}

.lp-nav{
  display:flex;align-items:center;justify-content:space-between;
  padding:18px 40px;position:sticky;top:0;z-index:100;
  background:rgba(250,248,244,0.92);backdrop-filter:blur(16px);
  border-bottom:1px solid var(--lp-border);
}
.lp-nav-logo{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--lp-text);}
.lp-nav-logo img{width:26px;height:26px;border-radius:6px;}
.lp-nav-logo-text{font-family:'Humane',sans-serif;font-weight:500;font-size:20px;letter-spacing:0.06em;}
.lp-nav-badge{
  font-family:var(--font-inter,'Inter'),sans-serif;font-size:11px;font-weight:600;
  letter-spacing:0.1em;text-transform:uppercase;
  color:var(--lp-accent);background:rgba(200,134,30,0.10);
  padding:5px 12px;border-radius:100px;
}

.lp-hero{padding:80px 40px 0;overflow:hidden;}
.lp-hero-meta{display:flex;align-items:center;justify-content:space-between;margin-bottom:40px;}
.lp-hero-eyebrow{font-family:var(--font-inter,'Inter'),sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--lp-accent);}
.lp-hero-mac{font-family:'Harmony',serif;font-size:13px;color:var(--lp-text-dim);font-style:italic;}
.lp-hero h1{
  font-family:'Humane',sans-serif;font-weight:500;
  text-transform:uppercase;letter-spacing:0.05em;
  line-height:0.87;color:var(--lp-text);
  font-size:clamp(80px,16vw,220px);
  white-space:nowrap;overflow:hidden;
  opacity:0;
  animation:lp-hero-in 1.1s 0.15s cubic-bezier(0.16,1,0.3,1) forwards;
}
@keyframes lp-hero-in{from{opacity:0;transform:translateY(28px);}to{opacity:1;transform:none;}}
.lp-hero-sub-row{
  display:flex;align-items:flex-end;justify-content:space-between;
  gap:48px;padding:40px 0 56px;
  border-bottom:1px solid var(--lp-border);
  opacity:0;
  animation:lp-hero-in 1s 0.55s cubic-bezier(0.16,1,0.3,1) forwards;
}
.lp-hero-sub{font-family:'Harmony',Georgia,serif;font-size:20px;color:var(--lp-text-muted);line-height:1.7;max-width:500px;}

.lp-signup-col{display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex-shrink:0;}
.lp-signup-form{display:flex;gap:0;border:1px solid var(--lp-border);border-radius:12px;overflow:hidden;background:#fff;}
.lp-signup-input{
  font-family:'Harmony',serif;font-size:14px;color:var(--lp-text);
  border:none;outline:none;background:transparent;
  padding:13px 18px;min-width:220px;
}
.lp-signup-input::placeholder{color:var(--lp-text-dim);}
.lp-signup-btn{
  font-family:var(--font-inter,'Inter'),sans-serif;font-size:13px;font-weight:700;
  color:#fff;background:var(--lp-text);
  border:none;cursor:pointer;padding:13px 22px;
  white-space:nowrap;transition:opacity 0.2s;
}
.lp-signup-btn:hover{opacity:0.82;}
.lp-signup-btn:disabled{opacity:0.6;cursor:default;}
.lp-signup-note{font-family:'Harmony',serif;font-style:italic;font-size:12px;color:var(--lp-text-dim);}
.lp-signup-success{font-family:'Harmony',serif;font-size:14px;color:var(--lp-accent);font-style:italic;padding:8px 0;}
.lp-signup-error{font-family:'Harmony',serif;font-size:13px;color:#e05c5c;margin-top:6px;}

.lp-built-for{display:flex;align-items:center;overflow-x:auto;border-bottom:1px solid var(--lp-border);}
.lp-bf-label{font-family:var(--font-inter,'Inter'),sans-serif;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--lp-text-dim);padding:16px 40px;flex-shrink:0;border-right:1px solid var(--lp-border);}
.lp-bf-items{display:flex;overflow-x:auto;}
.lp-bf-item{font-family:'Harmony',serif;font-size:14px;color:var(--lp-text-muted);padding:16px 28px;border-right:1px solid var(--lp-border);white-space:nowrap;flex-shrink:0;}

.lp-features{max-width:1100px;margin:0 auto;padding:100px 40px;}
.lp-section-label{font-family:var(--font-inter,'Inter'),sans-serif;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--lp-text-dim);margin-bottom:48px;}
.lp-feat-rows{display:flex;flex-direction:column;}
.lp-feat-row{display:grid;grid-template-columns:260px 1fr 40px;gap:48px;align-items:start;padding:44px 0;border-top:1px solid var(--lp-border);}
.lp-feat-row:last-child{border-bottom:1px solid var(--lp-border);}
.lp-feat-title{font-family:'Humane',sans-serif;font-size:clamp(38px,4vw,54px);font-weight:500;text-transform:uppercase;letter-spacing:0.02em;color:var(--lp-text);line-height:1;padding-top:4px;}
.lp-feat-desc{font-family:'Harmony',Georgia,serif;font-size:17px;color:#4a4a44;line-height:1.8;max-width:540px;}
.lp-feat-n{font-family:var(--font-inter,'Inter'),sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;color:var(--lp-text-dim);padding-top:8px;text-align:right;}

.lp-eyemind{background:var(--lp-text);padding:80px 40px;}
.lp-eyemind-inner{max-width:1100px;margin:0 auto;}
.lp-eyemind-header{margin-bottom:64px;}
.lp-eyemind-header h2{font-family:'Humane',sans-serif;font-size:clamp(64px,8vw,120px);font-weight:500;text-transform:uppercase;letter-spacing:0.04em;color:var(--lp-bg);line-height:0.88;}
.lp-eyemind-header p{font-family:'Harmony',serif;font-size:17px;color:rgba(245,242,235,0.4);line-height:1.7;max-width:500px;margin-top:24px;}
.lp-em-cards{display:grid;grid-template-columns:1fr 1fr;gap:2px;}
.lp-em-card{background:rgba(255,255,255,0.04);padding:48px 44px;border-radius:4px;position:relative;overflow:hidden;}
.lp-em-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:var(--lp-accent);transform:scaleX(0);transform-origin:left;transition:transform 1.6s cubic-bezier(0.16,1,0.3,1);}
.lp-em-card.in::after{transform:scaleX(1);}
.lp-em-card-label{font-family:'Humane',sans-serif;font-size:72px;font-weight:500;text-transform:uppercase;letter-spacing:0.06em;color:var(--lp-accent);line-height:1;margin-bottom:24px;}
.lp-em-card-title{font-family:'Harmony',serif;font-size:18px;color:var(--lp-bg);line-height:1.5;margin-bottom:12px;}
.lp-em-card p{font-family:'Harmony',Georgia,serif;font-size:15px;color:rgba(245,242,235,0.4);line-height:1.75;}

.lp-platforms{display:flex;align-items:center;gap:12px;padding:20px 40px;flex-wrap:wrap;border-bottom:1px solid var(--lp-border);background:var(--lp-bg);}
.lp-pl-label{font-family:var(--font-inter,'Inter'),sans-serif;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--lp-text-dim);margin-right:4px;}
.lp-pl{font-family:'Harmony',serif;font-size:13px;color:var(--lp-text-muted);background:var(--lp-surface);border:1px solid var(--lp-border);border-radius:100px;padding:4px 14px;}

.lp-cta{padding:100px 40px;text-align:center;background:var(--lp-bg);}
.lp-cta h2{font-family:'Humane',sans-serif;font-size:clamp(80px,12vw,160px);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;line-height:0.88;color:var(--lp-text);margin-bottom:40px;}
.lp-cta h2 em{font-style:normal;color:var(--lp-accent);}
.lp-cta-sub{font-family:'Harmony',serif;font-size:18px;color:var(--lp-text-muted);max-width:460px;margin:0 auto 44px;line-height:1.7;}
.lp-cta-form{display:flex;gap:0;border:1px solid var(--lp-border);border-radius:12px;overflow:hidden;background:#fff;max-width:420px;margin:0 auto;}
.lp-cta-input{font-family:'Harmony',serif;font-size:15px;color:var(--lp-text);border:none;outline:none;background:transparent;padding:15px 20px;flex:1;}
.lp-cta-input::placeholder{color:var(--lp-text-dim);}
.lp-cta-btn{font-family:var(--font-inter,'Inter'),sans-serif;font-size:13px;font-weight:700;color:#fff;background:var(--lp-text);border:none;cursor:pointer;padding:15px 24px;white-space:nowrap;transition:opacity 0.2s;}
.lp-cta-btn:hover{opacity:0.82;}
.lp-cta-btn:disabled{opacity:0.6;cursor:default;}
.lp-cta-note{font-family:'Harmony',serif;font-style:italic;font-size:13px;color:var(--lp-text-dim);margin-top:14px;}
.lp-cta-success{font-family:'Harmony',serif;font-size:16px;color:var(--lp-accent);font-style:italic;margin-top:20px;}
.lp-cta-error{font-family:'Harmony',serif;font-size:13px;color:#e05c5c;margin-top:10px;}

.lp-footer{border-top:1px solid var(--lp-border);padding:24px 40px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;background:var(--lp-bg);}
.lp-footer-logo{display:flex;align-items:center;gap:8px;}
.lp-footer-logo-text{font-family:'Humane',sans-serif;font-size:18px;letter-spacing:0.06em;color:var(--lp-text-muted);}
.lp-footer p,.lp-footer a{font-family:'Harmony',serif;font-size:13px;color:var(--lp-text-dim);text-decoration:none;}
.lp-footer-links{display:flex;gap:24px;}

/* ── Tablet & Mobile (≤ 768px) ──────────────────────────────── */
@media(max-width:768px){

  /* NAV */
  .lp-nav{padding:14px 20px;}

  /* HERO */
  .lp-hero{padding:48px 20px 0;}
  .lp-hero-meta{flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:24px;}
  .lp-hero h1{
    font-size:clamp(52px,17vw,96px);
    white-space:normal;        /* allow wrapping — critical on mobile */
    line-height:0.85;
    letter-spacing:0.03em;
  }
  .lp-hero-sub-row{
    flex-direction:column;align-items:flex-start;
    gap:28px;padding:28px 0 44px;
  }
  .lp-hero-sub{font-size:18px;max-width:100%;}

  /* EMAIL FORM — vertical stack */
  .lp-signup-col{align-items:stretch;width:100%;}
  .lp-signup-form{
    flex-direction:column;width:100%;
    border-radius:14px;overflow:hidden;
  }
  .lp-signup-input{min-width:0;width:100%;padding:15px 18px;font-size:16px;} /* 16px prevents iOS zoom */
  .lp-signup-btn{padding:15px 18px;text-align:center;font-size:14px;}
  .lp-signup-note{text-align:left;font-size:12px;}

  /* BUILT FOR — fade hint on right edge */
  .lp-built-for{position:relative;}
  .lp-built-for::after{
    content:'';position:absolute;top:0;right:0;bottom:0;width:40px;
    background:linear-gradient(to right,transparent,#faf8f4);
    pointer-events:none;
  }
  .lp-bf-label{padding:13px 20px;font-size:9px;}
  .lp-bf-item{padding:13px 20px;font-size:13px;}

  /* FEATURES */
  .lp-features{padding:64px 20px;}
  .lp-feat-row{
    grid-template-columns:1fr;gap:14px;padding:32px 0;
  }
  .lp-feat-title{font-size:clamp(34px,9vw,48px);}
  .lp-feat-desc{font-size:16px;line-height:1.75;}
  .lp-feat-n{
    display:block;
    text-align:left;padding-top:0;
    order:-1;                  /* number appears above title on mobile */
    font-size:10px;letter-spacing:0.12em;
  }

  /* EYE / MIND */
  .lp-eyemind{padding:60px 20px;}
  .lp-eyemind-header{margin-bottom:40px;}
  .lp-eyemind-header h2{font-size:clamp(52px,14vw,88px);}
  .lp-eyemind-header p{font-size:15px;max-width:100%;}
  .lp-em-cards{grid-template-columns:1fr;gap:2px;}
  .lp-em-card{padding:36px 28px;}
  .lp-em-card-label{font-size:56px;}
  .lp-em-card-title{font-size:16px;}
  .lp-em-card p{font-size:14px;}

  /* PLATFORMS */
  .lp-platforms{padding:16px 20px;gap:8px;}

  /* CTA */
  .lp-cta{padding:72px 20px;}
  .lp-cta h2{font-size:clamp(60px,16vw,96px);}
  .lp-cta-sub{font-size:17px;max-width:100%;}
  .lp-cta-form{
    flex-direction:column;max-width:100%;
    border-radius:14px;
  }
  .lp-cta-input{padding:15px 18px;font-size:16px;} /* 16px prevents iOS zoom */
  .lp-cta-btn{padding:15px 18px;text-align:center;}

  /* FOOTER */
  .lp-footer{padding:24px 20px;flex-direction:column;align-items:flex-start;gap:16px;}
  .lp-footer-links{gap:20px;}
}

/* ── Small phones (≤ 390px) ─────────────────────────────────── */
@media(max-width:390px){
  .lp-hero h1{font-size:clamp(44px,15vw,72px);}
  .lp-cta h2{font-size:clamp(52px,15vw,76px);}
  .lp-eyemind-header h2{font-size:clamp(44px,13vw,68px);}
  .lp-feat-title{font-size:clamp(30px,8vw,42px);}
  .lp-em-card{padding:28px 20px;}
}
`;

function SignupForm({ formClass, inputClass, btnClass, noteClass, successClass, successText, noteText, btnLabel }) {
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
    return <p className={successClass}>{successText}</p>;
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
    const runObserver = () => {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
      }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

      document.querySelectorAll('.reveal, .lp-em-card').forEach(el => io.observe(el));
      return io;
    };

    // Run immediately after paint so elements in viewport on load also animate
    let io;
    const raf = requestAnimationFrame(() => {
      io = runObserver();
    });
    return () => {
      cancelAnimationFrame(raf);
      if (io) io.disconnect();
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* NAV */}
      <nav className="lp-nav">
        <a href="/" className="lp-nav-logo">
          <img src="/icon-512x512.png" alt="MindVault" />
          <span className="lp-nav-logo-text">MindVault</span>
        </a>
        <div>
          <span className="lp-nav-badge">Early Access</span>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-meta">
          <span className="lp-hero-eyebrow">For filmmakers, directors &amp; creators</span>
          <span className="lp-hero-mac">Mac · Coming soon</span>
        </div>
        <h1>YOUR CREATIVE VAULT.</h1>
        <div className="lp-hero-sub-row">
          <p className="lp-hero-sub">
            Turn endless scrolling into a curated visual library.
            References, mood boards and ideas, always at hand.
          </p>
          <div className="lp-signup-col">
            <SignupForm
              formClass="lp-signup-form"
              inputClass="lp-signup-input"
              btnClass="lp-signup-btn"
              noteClass="lp-signup-note"
              successClass="lp-signup-success"
              successText="You're on the list. We'll be in touch."
              noteText="Be the first to know when MindVault launches."
              btnLabel="Get Early Access"
            />
          </div>
        </div>
      </section>

      {/* BUILT FOR */}
      <div className="lp-built-for">
        <span className="lp-bf-label">Built for</span>
        <div className="lp-bf-items">
          {['Film Directors','Directors of Photography','Treatment Designers','Colorists','Art Directors','Creative Directors'].map(t => (
            <span key={t} className="lp-bf-item">{t}</span>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <section className="lp-features">
        <div className="lp-section-label reveal">What it does</div>
        <div className="lp-feat-rows">
          {[
            { title: 'Capture the moment.', desc: 'A frame that stops you. A colour palette, a scene, a cut that belongs in your next treatment. Save it in one move, from any source, any device. It\'s in your vault before the moment passes.', n: '01' },
            { title: 'Always findable.', desc: 'Collections, tags, and AI that recognises what you saved. No manual labelling, ever. Search by mood, colour, subject or concept. Your archive grows without becoming a mess.', n: '02' },
            { title: 'Treatment-ready.', desc: 'Trim a clip. Pull a still. Create a GIF. Your saved references become deliverables without leaving the app. Mood boards and treatments built from the material you collected from day one.', n: '03' },
          ].map((f, i) => (
            <div key={i} className={`lp-feat-row reveal${i > 0 ? ` d${i}` : ''}`}>
              <div className="lp-feat-title">{f.title}</div>
              <p className="lp-feat-desc">{f.desc}</p>
              <span className="lp-feat-n">{f.n}</span>
            </div>
          ))}
        </div>
      </section>

      {/* EYE / MIND */}
      <section className="lp-eyemind">
        <div className="lp-eyemind-inner">
          <div className="lp-eyemind-header reveal">
            <h2>Two ways of seeing.</h2>
            <p>Not all inspiration works the same way. Some things you feel before you think them. Others you understand before you see them. MindVault keeps both worlds separate and searchable.</p>
          </div>
          <div className="lp-em-cards">
            <div className="lp-em-card reveal">
              <div className="lp-em-card-label">EYE</div>
              <p className="lp-em-card-title">What you see.</p>
              <p>Colour, light, texture, movement, composition. Visual references analysed for how they look. Find a frame by its feel, not by what you called it.</p>
            </div>
            <div className="lp-em-card reveal d2">
              <div className="lp-em-card-label">MIND</div>
              <p className="lp-em-card-title">What you think.</p>
              <p>Tutorials, behind-the-scenes, educational videos. The knowledge behind the craft, saved alongside your visual references, always in context.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PLATFORMS */}
      <div className="lp-platforms">
        <span className="lp-pl-label">Works with</span>
        {['Instagram','YouTube','Vimeo','TikTok'].map(p => (
          <span key={p} className="lp-pl">{p}</span>
        ))}
      </div>

      {/* FINAL CTA */}
      <section className="lp-cta">
        <div className="reveal">
          <h2>Join the<br/><em>waitlist.</em></h2>
          <p className="lp-cta-sub">MindVault is in final testing. Leave your email and we&apos;ll let you know the moment it&apos;s ready.</p>
        </div>
        <div className="reveal d1">
          <SignupForm
            formClass="lp-cta-form"
            inputClass="lp-cta-input"
            btnClass="lp-cta-btn"
            noteClass="lp-cta-note"
            successClass="lp-cta-success"
            successText="You're on the list. We'll be in touch."
            noteText="No spam. One email when it launches."
            btnLabel="Notify me"
          />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-logo">
          <img src="/icon-512x512.png" width={20} height={20} style={{ borderRadius: 4 }} alt="" />
          <span className="lp-footer-logo-text">MindVault</span>
        </div>
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
