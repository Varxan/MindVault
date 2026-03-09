'use client';

export const runtime = 'edge';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LinkCard from '../../../components/LinkCard';
import { fetchLinks, fetchCollectionById, updateCollection, removeLinkFromCollection } from '../../../lib/api';
import { getApiBase } from '../../../lib/config';


export default function CollectionDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [collection, setCollection] = useState(null);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [descValue, setDescValue] = useState('');

  // Drag-and-drop state
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [col, data] = await Promise.all([
        fetchCollectionById(id),
        fetchLinks({ collection: id }),
      ]);
      setCollection(col);
      setLinks(data.links);
      setNameValue(col.name);
      setDescValue(col.description || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRemoveFromCollection = async (linkId) => {
    try {
      await removeLinkFromCollection(id, linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      setCollection((prev) => prev ? { ...prev, link_count: prev.link_count - 1 } : prev);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleSaveName = async () => {
    if (!nameValue.trim()) return;
    try {
      await updateCollection(id, { name: nameValue.trim() });
      setCollection((prev) => ({ ...prev, name: nameValue.trim() }));
      setEditingName(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveDesc = async () => {
    try {
      await updateCollection(id, { description: descValue.trim() || null });
      setCollection((prev) => ({ ...prev, description: descValue.trim() || null }));
      setEditingDesc(false);
    } catch (err) {
      alert(err.message);
    }
  };

  // Drag-and-drop handlers
  const handleDragStart = (e, linkId) => {
    setDragId(linkId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', linkId);
  };

  const handleDragOver = (e, linkId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (linkId !== dragOverId) setDragOverId(linkId);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    setDragOverId(null);
    if (!dragId || dragId === targetId) { setDragId(null); return; }

    const oldIndex = links.findIndex(l => l.id === dragId);
    const newIndex = links.findIndex(l => l.id === targetId);
    if (oldIndex === -1 || newIndex === -1) { setDragId(null); return; }

    const reordered = [...links];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    setLinks(reordered);
    setDragId(null);

    // Persist to backend
    try {
      await fetch(`${getApiBase()}/collections/${id}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkIds: reordered.map(l => l.id) }),
      });
    } catch (err) {
      console.error('Reorder failed:', err);
    }
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  if (loading && !collection) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  if (error) {
    return (
      <div className="empty">
        <div className="empty-icon">⚡</div>
        <h2>Loading error</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!collection) return null;

  return (
    <>
      <header className="header" style={{ position: 'relative' }}>
        {/* Left — MINDVAULT logo, clickable back to main */}
        <div className="header-left">
          <h1
            onClick={() => router.push('/')}
            style={{ cursor: 'pointer', WebkitAppRegion: 'no-drag' }}
            title="Back to MindVault"
          >
            MindVault
          </h1>
        </div>

        {/* Centre — breadcrumb + collection name, same tab style as EYE / MIND */}
        <div style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          WebkitAppRegion: 'no-drag',
        }}>
          {/* Breadcrumb — Collections → */}
          <button
            onClick={() => router.push('/collections')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '10px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-display)',
              cursor: 'pointer',
              padding: '0 0 3px 0',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.target.style.color = '#c8a84b'}
            onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
          >
            Collections
          </button>

          {/* Collection name — editable, gold underline like active tab */}
          {editingName ? (
            <form onSubmit={(e) => { e.preventDefault(); handleSaveName(); }}>
              <input
                className="collection-edit-input"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                autoFocus
                onBlur={handleSaveName}
                style={{ textAlign: 'center', fontSize: '11px' }}
              />
            </form>
          ) : (
            <span
              onClick={() => setEditingName(true)}
              style={{
                display: 'inline-block',
                borderBottom: '2px solid #c8a84b',
                color: '#c8a84b',
                padding: '2px 20px',
                fontSize: '11px',
                fontWeight: 600,
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                maxWidth: '300px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title="Click to rename"
            >
              {collection.name}
            </span>
          )}
        </div>

        {/* Right — placeholder for balance */}
        <div className="header-right" />
      </header>

      {links.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Top-left card */}
              <rect x="4" y="8" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4"/>
              <line x1="10" y1="17" x2="26" y2="17" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" strokeLinecap="round"/>
              <line x1="10" y1="22" x2="22" y2="22" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" strokeLinecap="round"/>
              {/* Top-right card */}
              <rect x="40" y="8" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4"/>
              <line x1="46" y1="17" x2="62" y2="17" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" strokeLinecap="round"/>
              <line x1="46" y1="22" x2="58" y2="22" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" strokeLinecap="round"/>
              {/* Bottom-left card — slightly more faded for depth */}
              <rect x="4" y="40" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.2"/>
              <line x1="10" y1="49" x2="26" y2="49" stroke="currentColor" strokeWidth="1" strokeOpacity="0.1" strokeLinecap="round"/>
              <line x1="10" y1="54" x2="22" y2="54" stroke="currentColor" strokeWidth="1" strokeOpacity="0.1" strokeLinecap="round"/>
              {/* Bottom-right card */}
              <rect x="40" y="40" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.2"/>
              <line x1="46" y1="49" x2="62" y2="49" stroke="currentColor" strokeWidth="1" strokeOpacity="0.1" strokeLinecap="round"/>
              <line x1="46" y1="54" x2="58" y2="54" stroke="currentColor" strokeWidth="1" strokeOpacity="0.1" strokeLinecap="round"/>
            </svg>
          </div>
          <h2>Empty collection</h2>
          <p>Add links to this collection from the main view.</p>
        </div>
      ) : (
        <div className="collection-grid-sortable">
          {links.map((link) => (
            <div
              key={link.id}
              className={`collection-link-wrapper ${dragId === link.id ? 'dragging' : ''} ${dragOverId === link.id ? 'drag-over' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, link.id)}
              onDragOver={(e) => handleDragOver(e, link.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, link.id)}
              onDragEnd={handleDragEnd}
            >
              <LinkCard link={link} onDelete={handleRemoveFromCollection} onRefresh={loadData} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
