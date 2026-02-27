'use client';

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

function LogoGrid() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '7px',
      width: '54px',
      height: '54px',
      margin: '0 auto',
    }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{ background: '#c9a84c', borderRadius: '5px' }} />
      ))}
    </div>
  );
}

// iOS Share Sheet icon (matches the actual Safari share button)
function IconShare() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ display:'inline', verticalAlign:'middle', margin:'0 3px' }}>
      <path d="M9 1v10M5 5l4-4 4 4M2 13v3h14v-3" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 3v9M6 9l4 4 4-4" stroke="#0d0d0d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 15h14" stroke="#0d0d0d" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Main Content ──────────────────────────────────────────────────────────────

function PairContent() {
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const deferredRef   = useRef(null);  // beforeinstallprompt event

  const [paired,      setPaired]      = useState(false);
  const [os,          setOS]          = useState('other');
  const [standalone,  setStandalone]  = useState(false);
  const [installable, setInstallable] = useState(false);  // Android: prompt ready
  const [installing,  setInstalling]  = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  // ── One-time setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const detectedOS = getOS();
    setOS(detectedOS);
    setStandalone(isStandalone());

    // Pair device
    const id = searchParams.get('id');
    if (id && id.length >= 10) {
      localStorage.setItem('mindvault_device_id', id);
      setPaired(true);
    }

    // Capture Android/Chrome install prompt
    const handler = (e) => {
      e.preventDefault();
      deferredRef.current = e;
      setInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // If already standalone, go straight to library
    if (isStandalone()) {
      setTimeout(() => router.replace('/library'), 800);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [searchParams, router]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleInstall = async () => {
    if (deferredRef.current) {
      setInstalling(true);
      deferredRef.current.prompt();
      const { outcome } = await deferredRef.current.userChoice;
      if (outcome === 'accepted') {
        setTimeout(() => router.replace('/library'), 1000);
      } else {
        setInstalling(false);
      }
      deferredRef.current = null;
      setInstallable(false);
    } else if (os === 'ios') {
      setShowIosHint(h => !h);
    }
  };

  const handleOpenLibrary = () => router.replace('/library');

  // ── If standalone, show brief success ─────────────────────────────────────
  if (standalone) {
    return (
      <Screen>
        <LogoGrid />
        <h1 style={styles.title}>MindVault</h1>
        <p style={styles.sub}>Connected · Redirecting…</p>
      </Screen>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────────────
  return (
    <Screen>
      <style>{`
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes bounce {
          0%,100% { transform:translateY(0); }
          50%      { transform:translateY(-6px); }
        }
        .fade-up { animation: fadeUp 0.5s ease both; }
        .fade-up-1 { animation: fadeUp 0.5s 0.1s ease both; }
        .fade-up-2 { animation: fadeUp 0.5s 0.2s ease both; }
        .fade-up-3 { animation: fadeUp 0.5s 0.35s ease both; }
        .btn-install {
          width:100%; padding:15px;
          background:#e8e8e8; color:#0d0d0d;
          border:none; border-radius:16px;
          font-size:16px; font-weight:700;
          cursor:pointer; letter-spacing:0.01em;
          display:flex; align-items:center; justify-content:center; gap:8px;
          transition: opacity 0.15s, transform 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .btn-install:active { opacity:0.85; transform:scale(0.98); }
        .btn-library {
          background:none; border:none;
          color:#555; font-size:14px;
          cursor:pointer; padding:12px 0;
          width:100%; text-align:center;
          display:flex; align-items:center; justify-content:center; gap:6px;
          -webkit-tap-highlight-color: transparent;
          transition: color 0.15s;
        }
        .btn-library:active { color:#888; }
        .ios-hint {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius:16px;
          padding:18px;
          margin-top:12px;
          animation: fadeUp 0.3s ease both;
        }
        .step {
          display:flex; align-items:flex-start; gap:12px;
          margin-bottom:14px;
        }
        .step:last-child { margin-bottom:0; }
        .step-num {
          width:22px; height:22px; min-width:22px;
          border-radius:50%;
          border:1px solid rgba(201,168,76,0.4);
          color:#c9a84c; font-size:11px; font-weight:700;
          display:flex; align-items:center; justify-content:center;
          margin-top:1px;
        }
        .step-text { color:#888; font-size:13px; line-height:1.5; }
        .share-arrow {
          display:inline-block;
          animation: bounce 1.4s ease-in-out infinite;
        }
      `}</style>

      {/* Logo */}
      <div className="fade-up" style={{ marginBottom:'22px' }}>
        <LogoGrid />
      </div>

      {/* Title */}
      <h1 className="fade-up-1" style={styles.title}>MindVault</h1>
      <p className="fade-up-1" style={styles.sub}>
        Your personal knowledge vault
      </p>

      {/* Divider */}
      <div style={{ height:'32px' }} />

      {/* Install CTA */}
      <div className="fade-up-2" style={{ width:'100%' }}>

        {/* Android / Chrome: native prompt */}
        {(installable || os === 'android') && (
          <button className="btn-install" onClick={handleInstall} disabled={installing}>
            <IconDownload />
            {installing ? 'Installing…' : 'Install MindVault'}
          </button>
        )}

        {/* iOS Safari */}
        {os === 'ios' && (
          <>
            <button className="btn-install" onClick={handleInstall}
                    style={{ background: showIosHint ? 'rgba(201,168,76,0.15)' : '#e8e8e8',
                             color: showIosHint ? '#c9a84c' : '#0d0d0d',
                             border: showIosHint ? '1px solid rgba(201,168,76,0.3)' : 'none' }}>
              <IconDownload />
              {showIosHint ? 'Follow the steps below' : 'Install MindVault'}
            </button>

            {showIosHint && (
              <div className="ios-hint">
                <div className="step">
                  <div className="step-num">1</div>
                  <div className="step-text">
                    Tap the <span className="share-arrow"><IconShare /></span> <strong style={{color:'#e8e8e8'}}>Share</strong> button at the bottom of Safari
                  </div>
                </div>
                <div className="step">
                  <div className="step-num">2</div>
                  <div className="step-text">
                    Scroll down and tap <strong style={{color:'#e8e8e8'}}>Add to Home Screen</strong>
                  </div>
                </div>
                <div className="step">
                  <div className="step-num">3</div>
                  <div className="step-text">
                    Tap <strong style={{color:'#e8e8e8'}}>Add</strong> in the top right — done!
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Desktop / other */}
        {os === 'other' && !installable && (
          <button className="btn-install" onClick={handleOpenLibrary}>
            Open MindVault
          </button>
        )}

      </div>

      {/* Already installed / skip link */}
      <div className="fade-up-3">
        <button className="btn-library" onClick={handleOpenLibrary}>
          {paired ? 'Skip · Open Library' : 'Open Library'}
          <span style={{ display:'flex', alignItems:'center' }}><IconArrow /></span>
        </button>
      </div>

      {/* Connection badge */}
      {paired && (
        <div className="fade-up-3" style={{
          marginTop:'8px',
          display:'flex', alignItems:'center', gap:'6px', justifyContent:'center',
        }}>
          <div style={{
            width:6, height:6, borderRadius:'50%', background:'#4ade80',
            boxShadow:'0 0 6px rgba(74,222,128,0.6)',
          }}/>
          <span style={{ color:'#4ade80', fontSize:'12px', fontWeight:500 }}>
            Connected to desktop
          </span>
        </div>
      )}

    </Screen>
  );
}

// ── Layout wrapper ────────────────────────────────────────────────────────────

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
      <div style={{ width:'100%', maxWidth:'320px', textAlign:'center' }}>
        {children}
      </div>
    </div>
  );
}

const styles = {
  title: {
    color:'#e8e8e8',
    fontSize:'26px',
    fontWeight:700,
    margin:'14px 0 6px',
    letterSpacing:'-0.01em',
  },
  sub: {
    color:'#555',
    fontSize:'14px',
    margin:0,
    fontWeight:400,
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export default function PairPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', background:'#0d0d0d', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ color:'#444', fontSize:'14px' }}>Loading…</div>
      </div>
    }>
      <PairContent />
    </Suspense>
  );
}
