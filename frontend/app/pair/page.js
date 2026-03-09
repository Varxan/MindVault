'use client';

export const runtime = 'edge';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// ── Platform detection ────────────────────────────────────────────────────────

function getOS() {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'other';
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

// iOS Safari "share sheet" icon — box with arrow up
function IconShareSheet({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
         style={{ display:'inline-block', verticalAlign:'middle' }}>
      <path d="M8 1v8" stroke="#c9a84c" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M5 4l3-3 3 3" stroke="#c9a84c" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 8v5h10V8" stroke="#c9a84c" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Download / install arrow
function IconInstall() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2v10M5 9l4 4 4-4" stroke="#0d0d0d" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 15h14" stroke="#0d0d0d" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

// Slim right chevron
function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

function PairContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const deferredRef  = useRef(null);

  const [paired,      setPaired]      = useState(false);
  const [os,          setOS]          = useState('other');
  const [standalone,  setStandalone]  = useState(false);
  const [installable, setInstallable] = useState(false);
  const [installing,  setInstalling]  = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    setOS(getOS());
    setStandalone(isStandalone());

    // Save device ID from QR code
    const id = searchParams.get('id');
    if (id && id.length >= 10) {
      localStorage.setItem('mindvault_device_id', id);
      setPaired(true);
    }

    // Capture Chrome/Android native install prompt
    const onPrompt = (e) => {
      e.preventDefault();
      deferredRef.current = e;
      setInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // Already running as installed PWA → go straight to library
    if (isStandalone()) {
      setTimeout(() => router.replace('/library'), 600);
    }

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [searchParams, router]);

  const handleInstall = async () => {
    if (deferredRef.current) {
      setInstalling(true);
      deferredRef.current.prompt();
      const { outcome } = await deferredRef.current.userChoice;
      deferredRef.current = null;
      setInstallable(false);
      if (outcome === 'accepted') {
        setTimeout(() => router.replace('/library'), 800);
      } else {
        setInstalling(false);
      }
    } else if (os === 'ios') {
      setShowIosHint(v => !v);
    }
  };

  const goToLibrary = () => router.replace('/library');

  // Already installed — brief confirmation then redirect
  if (standalone) {
    return (
      <Screen>
        <AppIcon />
        <h1 style={s.title}>MindVault</h1>
        <p style={{ ...s.sub, marginTop: 6 }}>Opening your library…</p>
      </Screen>
    );
  }

  return (
    <Screen>
      <style>{css}</style>

      {/* App icon */}
      <div className="a0">
        <AppIcon />
      </div>

      {/* Wordmark */}
      <h1 className="a1" style={s.title}>MindVault</h1>
      <p className="a1" style={s.sub}>Your personal knowledge vault</p>

      <div style={{ height: 36 }} />

      {/* ── Install CTA ──────────────────────────────────── */}
      <div className="a2" style={{ width: '100%' }}>

        {/* Android / Chrome */}
        {(installable || os === 'android') && (
          <button className="btn-primary" onClick={handleInstall} disabled={installing}>
            <IconInstall />
            {installing ? 'Installing…' : 'Install App'}
          </button>
        )}

        {/* iOS */}
        {os === 'ios' && (
          <>
            <button
              className="btn-primary"
              onClick={handleInstall}
              style={showIosHint ? {
                background: 'transparent',
                color: '#c9a84c',
                border: '1px solid rgba(201,168,76,0.35)',
              } : {}}
            >
              {!showIosHint && <IconInstall />}
              {showIosHint ? 'Follow the steps below ↓' : 'Install App'}
            </button>

            {showIosHint && (
              <div className="ios-steps">
                {[
                  { n: 1, text: <>Tap <IconShareSheet size={14}/> <strong>Share</strong> at the bottom of Safari</> },
                  { n: 2, text: <>Select <strong>Add to Home Screen</strong></> },
                  { n: 3, text: <>Tap <strong>Add</strong> — done</> },
                ].map(({ n, text }) => (
                  <div key={n} className="step-row">
                    <div className="step-num">{n}</div>
                    <div className="step-text">{text}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Desktop / other */}
        {os === 'other' && !installable && (
          <button className="btn-primary" onClick={goToLibrary}>
            Open MindVault
          </button>
        )}

      </div>

      {/* Skip link */}
      <div className="a3">
        <button className="btn-ghost" onClick={goToLibrary}>
          Open Library
          <IconChevron />
        </button>

        {/* Paired indicator */}
        {paired && (
          <div style={{ display:'flex', alignItems:'center', gap:5, justifyContent:'center', marginTop:10 }}>
            <div style={{
              width:5, height:5, borderRadius:'50%',
              background:'#4ade80',
              boxShadow:'0 0 5px rgba(74,222,128,0.5)',
            }}/>
            <span style={{ color:'#3d7a56', fontSize:12, fontWeight:500 }}>
              Connected to desktop
            </span>
          </div>
        )}
      </div>

    </Screen>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AppIcon() {
  return (
    <img
      src="/icon-512x512.png"
      alt="MindVault"
      style={{ width:56, height:56, borderRadius:13, display:'block', margin:'0 auto' }}
    />
  );
}

function Screen({ children }) {
  return (
    <div style={{
      minHeight:'100vh',
      background:'#0d0d0d',
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      justifyContent:'center',
      fontFamily:'-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
      padding:'40px 28px',
      boxSizing:'border-box',
    }}>
      <div style={{ width:'100%', maxWidth:'300px', textAlign:'center' }}>
        {children}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  title: {
    color:'#e8e8e8', fontSize:'24px', fontWeight:700,
    margin:'16px 0 5px', letterSpacing:'-0.02em',
  },
  sub: {
    color:'#444', fontSize:'14px', margin:0, fontWeight:400,
  },
};

const css = `
  @keyframes fadeUp {
    from { opacity:0; transform:translateY(12px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes stepsIn {
    from { opacity:0; transform:translateY(8px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .a0 { animation: fadeUp 0.4s ease both; }
  .a1 { animation: fadeUp 0.4s 0.08s ease both; }
  .a2 { animation: fadeUp 0.4s 0.18s ease both; }
  .a3 { animation: fadeUp 0.4s 0.28s ease both; }

  .btn-primary {
    width:100%; padding:15px 20px;
    background:#e8e8e8; color:#0d0d0d;
    border:none; border-radius:14px;
    font-size:15px; font-weight:650;
    cursor:pointer; letter-spacing:-0.01em;
    display:flex; align-items:center; justify-content:center; gap:8px;
    transition: opacity 0.15s, transform 0.1s;
    -webkit-tap-highlight-color: transparent;
    box-sizing:border-box;
  }
  .btn-primary:active { opacity:0.8; transform:scale(0.98); }
  .btn-primary:disabled { opacity:0.5; }

  .btn-ghost {
    background:none; border:none;
    color:#3a3a3a; font-size:13px; font-weight:500;
    cursor:pointer; padding:12px 0;
    width:100%; text-align:center;
    display:flex; align-items:center; justify-content:center; gap:4px;
    -webkit-tap-highlight-color: transparent;
    transition: color 0.15s;
    margin-top:4px;
  }
  .btn-ghost:active { color:#666; }

  .ios-steps {
    margin-top:12px;
    background:rgba(255,255,255,0.03);
    border:1px solid rgba(255,255,255,0.07);
    border-radius:14px;
    padding:16px;
    animation: stepsIn 0.25s ease both;
    text-align:left;
  }
  .step-row {
    display:flex; align-items:flex-start; gap:11px;
    padding:8px 0;
    border-bottom:1px solid rgba(255,255,255,0.04);
  }
  .step-row:last-child { border-bottom:none; padding-bottom:0; }
  .step-row:first-child { padding-top:0; }
  .step-num {
    min-width:20px; height:20px;
    border-radius:50%;
    border:1px solid rgba(201,168,76,0.3);
    color:#c9a84c; font-size:10px; font-weight:700;
    display:flex; align-items:center; justify-content:center;
    margin-top:1px; flex-shrink:0;
  }
  .step-text {
    color:#666; font-size:13px; line-height:1.5;
  }
  .step-text strong { color:#aaa; font-weight:600; }
`;

// ── Export ────────────────────────────────────────────────────────────────────

export default function PairPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', background:'#0d0d0d' }} />
    }>
      <PairContent />
    </Suspense>
  );
}
