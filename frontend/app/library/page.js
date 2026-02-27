'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase    = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Minimalist SVG placeholder — thin lines, muted gold, no emoji
function ThumbPlaceholder() {
  return (
    <div style={{
      width: '100%',
      aspectRatio: '16/9',
      background: '#111',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="6" width="26" height="20" rx="2" stroke="#3a3020" strokeWidth="1.2"/>
        <circle cx="10" cy="13" r="2.5" stroke="#3a3020" strokeWidth="1.2"/>
        <path d="M3 22 L10 15 L16 20 L22 14 L29 22" stroke="#3a3020" strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

export default function LibraryPage() {
  const [links, setLinks]         = useState([]);
  const [pending, setPending]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    if (!supabase) { setError('Supabase not configured'); setLoading(false); return; }

    // Fetch library + pending queue in parallel
    Promise.all([
      supabase
        .from('library_cache')
        .select('links, updated_at')
        .eq('singleton_id', 1)
        .single(),
      supabase
        .from('share_queue')
        .select('id, url, title, created_at')
        .eq('processed', false)
        .order('created_at', { ascending: false }),
    ]).then(([{ data: cache, error: err }, { data: queue }]) => {
      if (err) setError('Could not load library');
      else {
        setLinks(Array.isArray(cache?.links) ? cache.links : []);
        setUpdatedAt(cache?.updated_at);
      }
      setPending(queue || []);
      setLoading(false);
    });
  }, []);

  // All unique tags sorted by frequency
  const allTags = useMemo(() => {
    const freq = {};
    links.forEach(l => (l.tags || []).forEach(t => { freq[t] = (freq[t] || 0) + 1; }));
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([t]) => t);
  }, [links]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return links.filter(l => {
      const matchSearch = !q ||
        (l.title || '').toLowerCase().includes(q) ||
        (l.url   || '').toLowerCase().includes(q) ||
        (l.tags  || []).some(t => t.toLowerCase().includes(q));
      const matchTag = !activeTag || (l.tags || []).includes(activeTag);
      return matchSearch && matchTag;
    });
  }, [links, search, activeTag]);

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const formatSync = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0d0d',
      color: '#e0e0e0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      paddingBottom: '32px',
    }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .card { animation: fadeIn 0.25s ease both; }
        .card:active { transform: scale(0.97); transition: transform 0.1s; }
        .search-bar {
          width: 100%;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #e0e0e0;
          font-size: 15px;
          padding: 11px 14px;
          outline: none;
          transition: border-color 0.2s;
          -webkit-appearance: none;
        }
        .search-bar::placeholder { color: #444; }
        .search-bar:focus { border-color: rgba(255,255,255,0.22); }
        .tag-chip {
          display: inline-block;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          color: #888;
          font-size: 11px;
          padding: 4px 10px;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .tag-chip.active {
          background: rgba(255,255,255,0.15);
          border-color: rgba(255,255,255,0.3);
          color: #e0e0e0;
        }
        .card-tag {
          display: inline-block;
          background: rgba(255,255,255,0.07);
          border-radius: 4px;
          color: #666;
          font-size: 10px;
          padding: 2px 6px;
          margin: 1px;
        }
        .thumb {
          width: 100%;
          aspect-ratio: 16/9;
          object-fit: cover;
          background: #1a1a1a;
          display: block;
        }
        .thumb-placeholder {
          width: 100%;
          aspect-ratio: 16/9;
          background: #1a1a1a;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
        }
      `}</style>

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(13,13,13,0.95)',
        backdropFilter: 'blur(12px)',
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Top row: logo + count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <img src="/icon-512x512.png" alt="MindVault" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>MindVault</span>
          {!loading && (
            <span style={{ marginLeft: 'auto', color: '#555', fontSize: 12 }}>
              {filtered.length} / {links.length}
            </span>
          )}
        </div>

        {/* Search */}
        <input
          className="search-bar"
          type="search"
          placeholder="Search links, titles, tags…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

      </div>

      {/* Body */}
      <div style={{ padding: '14px 12px 0' }}>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', color: '#444', paddingTop: '60px', fontSize: 14 }}>
            Loading library…
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ textAlign: 'center', color: '#c0392b', paddingTop: '60px', fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#444', paddingTop: '60px', fontSize: 14 }}>
            {links.length === 0
              ? 'Library not synced yet.\nRestart MindVault on your Mac.'
              : 'No results found.'}
          </div>
        )}

        {/* Pending queue */}
        {!loading && pending.length > 0 && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{
              color: '#555', fontSize: '11px', fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              marginBottom: '8px',
            }}>
              In Queue ({pending.length})
            </div>
            {pending.map(item => (
              <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', marginBottom: '6px',
                  background: '#111', borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  textDecoration: 'none',
                }}>
                {/* Pending dot */}
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#c8a84b', flexShrink: 0,
                  boxShadow: '0 0 6px #c8a84b88',
                }} />
                <div style={{
                  fontSize: '12px', color: '#888',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.title || item.url}
                </div>
                <div style={{
                  marginLeft: 'auto', fontSize: '10px', color: '#3a3020',
                  flexShrink: 0,
                }}>
                  pending
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Grid */}
        {!loading && !error && filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {filtered.map((link, i) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="card"
                style={{
                  textDecoration: 'none',
                  background: '#161616',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.06)',
                  animationDelay: `${Math.min(i * 0.02, 0.3)}s`,
                }}
              >
                {/* Thumbnail */}
                {link.thumbnail_url
                  ? <img
                      className="thumb"
                      src={link.thumbnail_url}
                      alt={link.title || ''}
                      loading="lazy"
                      onError={e => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'block';
                      }}
                    />
                  : null
                }
                <div style={{ display: link.thumbnail_url ? 'none' : 'block' }}>
                  <ThumbPlaceholder />
                </div>

                {/* Info */}
                <div style={{ padding: '8px 8px 6px' }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#d0d0d0',
                    lineHeight: 1.3,
                    marginBottom: '5px',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {link.title || new URL(link.url).hostname}
                  </div>

                  {/* Tags — show first 3 */}
                  <div>
                    {(link.tags || []).slice(0, 3).map(t => (
                      <span key={t} className="card-tag">{t}</span>
                    ))}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Sync timestamp */}
        {updatedAt && !loading && (
          <div style={{ textAlign: 'center', color: '#333', fontSize: 11, marginTop: 20 }}>
            Synced at {formatSync(updatedAt)}
          </div>
        )}
      </div>
    </div>
  );
}
