'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

const QUEUE_KEY = 'mindvault_share_queue';
function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

// Elegant minimal checkmark SVG
function IconCheck() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="19" stroke="#c8a84b" strokeWidth="1.2"/>
      <path d="M12 20.5L17.5 26L28 14" stroke="#c8a84b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Elegant minimal offline/queued SVG
function IconOffline() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="19" stroke="#555" strokeWidth="1.2"/>
      <path d="M20 12V22" stroke="#888" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M15 18L20 23L25 18" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 27H27" stroke="#555" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export default function SharePage() {
  const [phase, setPhase]       = useState('input'); // input | saving | done | queued
  const [tagInput, setTagInput] = useState('');
  const [savedId, setSavedId]   = useState(null);
  const [shareData, setShareData] = useState(null);
  const tagRef = useRef(null);

  // ── Parse URL params immediately on mount ──────────────────────────────────
  useEffect(() => {
    const p   = new URLSearchParams(window.location.search);
    const url = p.get('url') || p.get('text') || '';
    if (!url) { setPhase('done'); return; }

    const share = { url, title: p.get('title') || '', text: p.get('text') || '' };
    setShareData(share);

    // Deduplicate: don't re-insert if same URL was just saved (within 30s)
    // This prevents double-inserts from Web Share Target loading the page twice
    const lastKey = 'mindvault_last_share';
    const lastShare = JSON.parse(localStorage.getItem(lastKey) || '{}');
    const now = Date.now();
    if (lastShare.url === url && (now - (lastShare.ts || 0)) < 30_000) {
      // Same URL within 30 seconds — reuse the existing ID, don't re-insert
      if (lastShare.id) setSavedId(lastShare.id);
      setTimeout(() => tagRef.current?.focus(), 200);
      return;
    }

    // Fire insert immediately in background via secure server API
    const deviceId = localStorage.getItem('mindvault_device_id');
    fetch('/api/share-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url:       share.url,
        title:     share.title || null,
        text:      share.text  || null,
        device_id: deviceId || null,
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

  const handleSend = useCallback(async () => {
    if (!shareData) return;
    setPhase('saving');
    try {
      // Attach tags + mark ready
      if (savedId) {
        await fetch('/api/share-queue', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: savedId, tags: tagInput.trim() || null, tags_ready: true }),
        });
      } else {
        // Insert wasn't done yet — do a fresh insert with tags
        const deviceId = localStorage.getItem('mindvault_device_id');
        await fetch('/api/share-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url:       shareData.url,
            title:     shareData.title || null,
            tags:      tagInput.trim() || null,
            tags_ready: true,
            device_id: deviceId || null,
          }),
        });
      }
      setPhase('done');
    } catch {
      const q = loadQueue();
      q.push({ ...shareData, tags: tagInput.trim() || null });
      saveQueue(q);
      setPhase('queued');
    }
  }, [shareData, savedId, tagInput]);

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
      setPhase('done');
    } catch {
      setPhase('queued');
    }
  }, [shareData, savedId]);

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
          0%   { transform:scale(0); opacity:0; }
          70%  { transform:scale(1.2); }
          100% { transform:scale(1); opacity:1; }
        }
        .card {
          width:100%; max-width:320px;
          animation: fadeUp 0.35s ease both;
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
          cursor:pointer; margin-top:10px;
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
        .check { animation: pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }
      `}</style>

      <div className="card">

        {/* Logo — small, always visible */}
        <div style={{ textAlign:'center', marginBottom:'32px', opacity: 0.9 }}>
          <img
            src="/icon-512x512.png"
            alt="MindVault"
            style={{ width:'48px', height:'48px', borderRadius:'11px' }}
          />
        </div>

        {/* ── Input phase ─────────────────────────────────── */}
        {phase === 'input' && (
          <>
            <p style={{
              color:'#666', fontSize:'12px', fontWeight:600,
              letterSpacing:'0.08em', textTransform:'uppercase',
              marginBottom:'14px', marginTop:0,
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

        {/* ── Saving spinner ───────────────────────────────── */}
        {phase === 'saving' && (
          <div style={{ textAlign:'center', color:'#555', fontSize:'15px' }}>
            Saving…
          </div>
        )}

        {/* ── Done ────────────────────────────────────────── */}
        {(phase === 'done' || phase === 'queued') && (
          <div style={{ textAlign:'center' }}>
            <div className="check" style={{ display:'flex', justifyContent:'center', marginBottom:'20px' }}>
              {phase === 'done' ? <IconCheck /> : <IconOffline />}
            </div>
            <div style={{ color:'#e8e8e8', fontSize:'17px', fontWeight:600, marginBottom:'8px' }}>
              {phase === 'done' ? 'Added to queue' : 'Saved offline'}
            </div>
            <div style={{ color:'#444', fontSize:'13px' }}>
              {phase === 'done'
                ? 'MindVault will import it when online'
                : 'Will sync when connected'}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
