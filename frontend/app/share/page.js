'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase     = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const QUEUE_KEY = 'mindvault_share_queue';

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}

function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export default function SharePage() {
  const [status, setStatus]         = useState('saving');
  const [message, setMessage]       = useState('Saving to MindVault...');
  const [queueCount, setQueueCount] = useState(0);
  const [insertedId, setInsertedId] = useState(null);
  const [tagInput, setTagInput]     = useState('');
  const tagInputRef = useRef(null);

  // Insert a new row into share_queue; returns the new row's id
  const postShare = useCallback(async (share) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('share_queue')
      .insert({
        url:        share.url,
        title:      share.title || null,
        text:       share.text  || null,
        tags_ready: false,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }, []);

  // Mark tags as ready (poller will pick it up)
  const submitTags = useCallback(async (id, tagsText) => {
    if (!supabase || !id) return;
    await supabase
      .from('share_queue')
      .update({
        tags:       tagsText.trim() || null,
        tags_ready: true,
      })
      .eq('id', id);
  }, []);

  const handleTagSubmit = useCallback(async () => {
    await submitTags(insertedId, tagInput);
    setStatus('done');
    setMessage(tagInput.trim() ? 'Saved with tags ✓' : 'Saved to MindVault ✓');
  }, [insertedId, tagInput, submitTags]);

  const handleSkip = useCallback(async () => {
    await submitTags(insertedId, '');
    setStatus('done');
    setMessage('Saved to MindVault ✓');
  }, [insertedId, submitTags]);

  const flushQueue = useCallback(async () => {
    const queue = loadQueue();
    if (queue.length === 0) return;
    const remaining = [];
    for (const item of queue) {
      try {
        await postShare(item);
      } catch {
        remaining.push(item);
      }
    }
    saveQueue(remaining);
    setQueueCount(remaining.length);
  }, [postShare]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url    = params.get('url') || params.get('text') || '';
    const title  = params.get('title') || '';
    const text   = params.get('text')  || '';

    if (!url) {
      const count = loadQueue().length;
      setQueueCount(count);
      if (count > 0) {
        setStatus('queued');
        setMessage(`${count} link${count !== 1 ? 's' : ''} waiting to sync`);
        flushQueue();
      } else {
        setStatus('done');
        setMessage('MindVault is ready');
      }
      return;
    }

    const share = { url, title, text };

    postShare(share)
      .then((id) => {
        flushQueue();
        setInsertedId(id);
        setStatus('tagging');
        setMessage('Saved to MindVault ✓');
        setTimeout(() => tagInputRef.current?.focus(), 300);
      })
      .catch(() => {
        const queue = loadQueue();
        queue.push(share);
        saveQueue(queue);
        setQueueCount(queue.length);
        setStatus('queued');
        setMessage('Saved offline — will sync when connected');
      });
  }, [postShare, flushQueue]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTagSubmit();
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '24px',
    }}>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes checkmark {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        .mindvault-icon {
          animation: slideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .status-check {
          animation: checkmark 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: inline-block;
        }
        .tag-area {
          animation: slideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s backwards;
        }
        .tag-input {
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          color: #e0e0e0;
          font-size: 15px;
          padding: 12px 16px;
          outline: none;
          width: 100%;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }
        .tag-input::placeholder { color: #555; }
        .tag-input:focus { border-color: rgba(255,255,255,0.28); }
        .btn-primary {
          background: #e0e0e0;
          color: #0a0a0a;
          border: none;
          border-radius: 10px;
          padding: 12px 22px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .btn-primary:active { opacity: 0.75; }
        .btn-skip {
          background: none;
          border: none;
          color: #555;
          font-size: 13px;
          cursor: pointer;
          padding: 8px 16px;
          transition: color 0.15s;
        }
        .btn-skip:hover { color: #888; }
      `}</style>

      {/* Logo */}
      <div className="mindvault-icon" style={{
        marginBottom: '32px',
        opacity: status === 'saving' ? 0.5 : 1,
        transition: 'opacity 0.4s ease',
      }}>
        <img
          src="/icon-512x512.png"
          alt="MindVault"
          style={{ width: '64px', height: '64px', borderRadius: '14px' }}
        />
      </div>

      {/* Status block */}
      <div style={{
        textAlign: 'center',
        animation: 'slideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s backwards',
        width: '100%',
        maxWidth: '320px',
      }}>

        {/* Checkmark */}
        {(status === 'tagging' || status === 'done') && (
          <div className="status-check" style={{
            fontSize: '44px',
            marginBottom: '12px',
            lineHeight: 1,
          }}>
            ✓
          </div>
        )}

        {/* Spinner for saving */}
        {status === 'saving' && (
          <div style={{ fontSize: '32px', marginBottom: '12px', lineHeight: 1 }}>⏳</div>
        )}

        {/* Queued icon */}
        {status === 'queued' && (
          <div style={{ fontSize: '32px', marginBottom: '12px', lineHeight: 1 }}>📥</div>
        )}

        {/* Main message */}
        <div style={{
          color: status === 'queued' ? '#ffd93d' : '#e0e0e0',
          fontSize: '17px',
          fontWeight: 600,
          letterSpacing: '-0.3px',
          marginBottom: '6px',
        }}>
          {message}
        </div>

        {/* Subtitle */}
        {status === 'tagging' && (
          <div style={{ color: '#666', fontSize: '13px', marginBottom: '24px' }}>
            Add tags to this link
          </div>
        )}

        {/* Queue badge */}
        {queueCount > 0 && (
          <div style={{ color: '#888', fontSize: '13px', marginTop: '8px' }}>
            {queueCount} link{queueCount !== 1 ? 's' : ''} queued offline
          </div>
        )}

        {/* ── Tag Input ── */}
        {status === 'tagging' && (
          <div className="tag-area">
            <div style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                ref={tagInputRef}
                className="tag-input"
                type="text"
                placeholder="design, inspiration, video…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button className="btn-primary" onClick={handleTagSubmit}>
                Add
              </button>
            </div>
            <div style={{ marginTop: '12px' }}>
              <button className="btn-skip" onClick={handleSkip}>
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Close hint */}
        {(status === 'done' || status === 'queued') && (
          <div style={{
            color: '#555',
            fontSize: '12px',
            marginTop: '20px',
          }}>
            You can close this tab
          </div>
        )}
      </div>
    </div>
  );
}
