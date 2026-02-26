'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase     = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Offline queue — stores links locally if Supabase is unreachable
const QUEUE_KEY = 'mindvault_share_queue';

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}

function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export default function SharePage() {
  const [status, setStatus]       = useState('saving');   // saving | saved | queued | error
  const [message, setMessage]     = useState('Saving to MindVault...');
  const [queueCount, setQueueCount] = useState(0);

  // Send one share entry to Supabase
  const postShare = useCallback(async (share) => {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('share_queue')
      .insert({
        url:   share.url,
        title: share.title || null,
        text:  share.text  || null,
      });

    if (error) throw error;
  }, []);

  // Flush any locally queued links now that we're online
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
      // No URL in params — just show queue status
      const count = loadQueue().length;
      setQueueCount(count);
      if (count > 0) {
        setStatus('queued');
        setMessage(`${count} link${count !== 1 ? 's' : ''} waiting to sync`);
        flushQueue();
      } else {
        setStatus('saved');
        setMessage('MindVault is ready');
      }
      return;
    }

    const share = { url, title, text };

    postShare(share)
      .then(() => {
        flushQueue(); // also flush any pending offline items
        setStatus('saved');
        setMessage('Saved to MindVault ✓');
      })
      .catch(() => {
        // Offline fallback — store locally
        const queue = loadQueue();
        queue.push(share);
        saveQueue(queue);
        setQueueCount(queue.length);
        setStatus('queued');
        setMessage('Saved offline — will sync when connected');
      });
  }, [postShare, flushQueue]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      padding: '24px',
      gap: '16px',
    }}>
      {/* Icon */}
      <div style={{ fontSize: '48px', marginBottom: '8px' }}>
        {status === 'saving' ? '⏳' : status === 'saved' ? '✅' : status === 'queued' ? '📥' : '⚠️'}
      </div>

      {/* App name */}
      <div style={{ color: '#888', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        MindVault
      </div>

      {/* Status message */}
      <div style={{
        color: status === 'error' ? '#f87171' : status === 'queued' ? '#fbbf24' : '#e5e5e5',
        fontSize: '17px',
        fontWeight: 500,
        textAlign: 'center',
      }}>
        {message}
      </div>

      {/* Queue badge */}
      {queueCount > 0 && (
        <div style={{ color: '#666', fontSize: '13px' }}>
          {queueCount} link{queueCount !== 1 ? 's' : ''} pending sync
        </div>
      )}

      {/* Close hint */}
      {(status === 'saved' || status === 'queued') && (
        <div style={{ color: '#555', fontSize: '12px', marginTop: '8px' }}>
          You can close this tab
        </div>
      )}
    </div>
  );
}
