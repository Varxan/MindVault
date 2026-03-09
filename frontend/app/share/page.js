'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

const QUEUE_KEY = 'mindvault_share_queue';
function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

// ── Icons ──────────────────────────────────────────────────────────────────

function IconCheck({ color = '#c8a84b' }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <circle cx="22" cy="22" r="21" stroke={color} strokeWidth="1.2"/>
      <path d="M13 22.5L19 28.5L31 15" stroke={color} strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconOffline() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <circle cx="22" cy="22" r="21" stroke="#444" strokeWidth="1.2"/>
      <path d="M22 13V24" stroke="#666" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M16 20L22 26L28 20" stroke="#666" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 30H30" stroke="#444" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

// Pulsing dots while waiting for desktop to process
function PulsingDots() {
  return (
    <div style={{ display:'flex', gap:'5px', justifyContent:'center', alignItems:'center' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width: 4, height: 4,
          borderRadius: '50%',
          background: '#c8a84b',
          animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
          opacity: 0.5,
        }}/>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function SharePage() {
  // phases: input → saving → queued → saved
  //                              └──→ offline (on error)
  const [phase, setPhase]         = useState('input');
  const [tagInput, setTagInput]   = useState('');
  const [savedId, setSavedId]     = useState(null);
  const [shareData, setShareData] = useState(null);
  const [selectedSpace, setSelectedSpace] = useState('eye');
  const tagRef   = useRef(null);
  const pollRef  = useRef(null);  // interval handle for status polling

  // ── Stop polling on unmount ────────────────────────────────────────────────
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Poll until the desktop processes our item ──────────────────────────────
  const startPolling = useCallback((id) => {
    if (!id) return;
    const deadline = Date.now() + 3 * 60_000; // 3 minutes max

    pollRef.current = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(pollRef.current);
        // Link is safely saved in the queue — desktop just wasn't open.
        // Show "saved" so the user isn't left with an infinite spinner.
        setPhase('saved');
        return;
      }
      try {
        const r = await fetch('/api/share-queue');
        if (!r.ok) return;
        const { items } = await r.json();
        // If our item is no longer in the unprocessed list → it was imported
        const stillPending = items.some(item => item.id === id);
        if (!stillPending) {
          clearInterval(pollRef.current);
          setPhase('saved');
        }
      } catch (_) {}
    }, 4_000); // check every 4 seconds
  }, []);

  // ── Parse URL params on mount ──────────────────────────────────────────────
  useEffect(() => {
    const p   = new URLSearchParams(window.location.search);
    const url = p.get('url') || p.get('text') || '';
    if (!url) { setPhase('saved'); return; }

    const share = { url, title: p.get('title') || '', text: p.get('text') || '' };
    setShareData(share);

    // Dedup guard: same URL within 30s → reuse existing row
    const lastKey   = 'mindvault_last_share';
    const lastShare = JSON.parse(localStorage.getItem(lastKey) || '{}');
    const now       = Date.now();
    if (lastShare.url === url && (now - (lastShare.ts || 0)) < 30_000 && lastShare.id) {
      setSavedId(lastShare.id);
      setTimeout(() => tagRef.current?.focus(), 200);
      return;
    }

    // Insert in background immediately (space chosen later in UI, will be updated on send)
    const deviceId = localStorage.getItem('mindvault_device_id');
    fetch('/api/share-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url:       share.url,
        title:     share.title || null,
        text:      share.text  || null,
        device_id: deviceId   || null,
        space:     'eye',      // default; updated with real choice on handleSend
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.id) {
          setSavedId(data.id);
          localStorage.setItem(lastKey, JSON.stringify({ url, id: data.id, ts: now }));
        }
      })
      .catch(() => {});

    setTimeout(() => tagRef.current?.focus(), 200);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!shareData) return;
    setPhase('saving');
    try {
      let id = savedId;
      if (id) {
        await fetch('/api/share-queue', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, tags: tagInput.trim() || null, tags_ready: true, space: selectedSpace }),
        });
      } else {
        const deviceId = localStorage.getItem('mindvault_device_id');
        const r = await fetch('/api/share-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url:        shareData.url,
            title:      shareData.title || null,
            tags:       tagInput.trim() || null,
            tags_ready: true,
            device_id:  deviceId || null,
            space:      selectedSpace,
          }),
        });
        const data = await r.json();
        id = data.id || null;
        if (id) setSavedId(id);
      }
      setPhase('queued');
      startPolling(id);
    } catch {
      const q = loadQueue();
      q.push({ ...shareData, tags: tagInput.trim() || null, space: selectedSpace });
      saveQueue(q);
      setPhase('offline');
    }
  }, [shareData, savedId, tagInput, selectedSpace, startPolling]);

  const handleSkip = useCallback(async () => {
    if (!shareData) return;
    setPhase('saving');
    try {
      if (savedId) {
        await fetch('/api/share-queue', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: savedId, tags_ready: true }),
        });
      }
      setPhase('queued');
      startPolling(savedId);
    } catch {
      setPhase('offline');
    }
  }, [shareData, savedId, startPolling]);

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0d0d',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '32px 24px',
      boxSizing: 'border-box',
    }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes pop {
          0%   { transform:scale(0.5); opacity:0; }
          70%  { transform:scale(1.1); }
          100% { transform:scale(1);   opacity:1; }
        }
        @keyframes pulse {
          0%, 80%, 100% { transform:scale(0.6); opacity:0.3; }
          40%            { transform:scale(1);   opacity:1;   }
        }
        @keyframes glow {
          0%,100% { opacity:0.7; }
          50%     { opacity:1;   }
        }
        .card {
          width:100%; max-width:320px;
          animation: fadeUp 0.35s ease both;
          padding: 32px 24px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
        }
        .tag-field {
          width:100%; box-sizing:border-box;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius:14px;
          color:#e8e8e8;
          font-size:16px;
          padding:14px 16px;
          outline:none;
          transition: border-color 0.2s;
          -webkit-appearance:none;
        }
        .tag-field::placeholder { color:#444; }
        .tag-field:focus { border-color:rgba(255,255,255,0.25); }
        .btn-send {
          width:100%; padding:14px;
          background:#e8e8e8; color:#0d0d0d;
          border:none; border-radius:14px;
          font-size:15px; font-weight:600;
          cursor:pointer; margin-top:16px;
          transition: opacity 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .btn-send:active { opacity:0.7; }
        .btn-skip {
          background:none; border:none;
          color:#444; font-size:13px;
          cursor:pointer; padding:10px 0;
          width:100%; text-align:center;
          -webkit-tap-highlight-color: transparent;
        }
        .btn-skip:active { color:#888; }
        .icon-wrap { animation: pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }
        .glow { animation: glow 2s ease-in-out infinite; }
      `}</style>

      <div className="card">

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:'28px', opacity:0.9 }}>
          <img src="/icon-512x512.png" alt="MindVault"
               style={{ width:'44px', height:'44px', borderRadius:'10px' }}/>
        </div>

        {/* ── Input ──────────────────────────────────────── */}
        {phase === 'input' && (
          <>
            {/* Eye / Mind Selector */}
            <div style={{ display:'flex', gap:'8px', marginBottom:'20px' }}>
              {[{ label: 'Eye', value: 'eye' }, { label: 'Mind', value: 'mind' }].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedSpace(opt.value)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: selectedSpace === opt.value ? 'rgba(200,168,75,0.15)' : 'rgba(255,255,255,0.04)',
                    border: selectedSpace === opt.value ? '1px solid rgba(200,168,75,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    color: selectedSpace === opt.value ? '#c8a84b' : '#555',
                    fontSize: '13px',
                    fontWeight: selectedSpace === opt.value ? 600 : 400,
                    cursor: 'pointer',
                    letterSpacing: '0.05em',
                    transition: 'all 0.15s',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <p style={{
              color:'#666', fontSize:'12px', fontWeight:600,
              letterSpacing:'0.08em', textTransform:'uppercase',
              marginBottom:'18px', marginTop:0,
            }}>
              Add tags
            </p>
            <input
              ref={tagRef}
              className="tag-field"
              type="text"
              placeholder="design, video, inspiration…"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={handleKey}
              enterKeyHint="send"
            />
            <button className="btn-send" onClick={handleSend}>
              Add to Queue
            </button>
            <button className="btn-skip" onClick={handleSkip}>
              Skip
            </button>
          </>
        )}

        {/* ── Saving ─────────────────────────────────────── */}
        {phase === 'saving' && (
          <div style={{ textAlign:'center', color:'#555', fontSize:'15px' }}>
            Saving…
          </div>
        )}

        {/* ── Queued: waiting for desktop ─────────────────── */}
        {phase === 'queued' && (
          <div style={{ textAlign:'center' }}>
            <div className="icon-wrap" style={{ display:'flex', justifyContent:'center', marginBottom:'18px' }}>
              <div className="glow">
                <IconCheck color="#c8a84b" />
              </div>
            </div>
            <div style={{ color:'#e8e8e8', fontSize:'17px', fontWeight:600, marginBottom:'12px' }}>
              Added to queue
            </div>
            <div style={{ marginBottom:'8px' }}>
              <PulsingDots />
            </div>
            <div style={{ color:'#444', fontSize:'13px', marginTop:'8px' }}>
              Importing to MindVault…
            </div>
          </div>
        )}

        {/* ── Saved: desktop confirmed import ─────────────── */}
        {phase === 'saved' && (
          <div style={{ textAlign:'center' }}>
            <div className="icon-wrap" style={{ display:'flex', justifyContent:'center', marginBottom:'18px' }}>
              <IconCheck color="#c8a84b" />
            </div>
            <div style={{ color:'#e8e8e8', fontSize:'17px', fontWeight:600, marginBottom:'8px' }}>
              Saved to MindVault
            </div>
            <div style={{ color:'#444', fontSize:'13px' }}>
              Will appear in your library when MindVault is open
            </div>
          </div>
        )}

        {/* ── Offline fallback ────────────────────────────── */}
        {phase === 'offline' && (
          <div style={{ textAlign:'center' }}>
            <div className="icon-wrap" style={{ display:'flex', justifyContent:'center', marginBottom:'18px' }}>
              <IconOffline />
            </div>
            <div style={{ color:'#e8e8e8', fontSize:'17px', fontWeight:600, marginBottom:'8px' }}>
              Saved offline
            </div>
            <div style={{ color:'#444', fontSize:'13px' }}>
              Will sync when connected
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
