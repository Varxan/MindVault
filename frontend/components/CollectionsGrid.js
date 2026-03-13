'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import CollectionCard from './CollectionCard';
import CollectionForm from './CollectionForm';
import { fetchCollections, deleteCollection } from '../lib/api';
import { getApiBase } from '../lib/config';

export default function CollectionsGrid() {
  const router = useRouter();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const loadCollections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchCollections();
      setCollections(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCollections();
    const interval = setInterval(loadCollections, 10000);
    return () => clearInterval(interval);
  }, [loadCollections]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this collection? Links will be kept.')) return;
    try {
      await deleteCollection(id);
      setCollections((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleEdit = (collection) => {
    setEditingCollection(collection);
    setShowForm(true);
  };

  const handleRenamed = (id, newName) => {
    setCollections((prev) =>
      prev.map((c) => c.id === id ? { ...c, name: newName } : c)
    );
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingCollection(null);
  };

  const handleFormSaved = () => {
    handleFormClose();
    loadCollections();
  };

  // Drag & Drop handlers
  const handleDragStart = (e, colId) => {
    setDragId(colId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colId);
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (colId !== dragOverId) setDragOverId(colId);
  };

  const handleDragLeave = () => setDragOverId(null);

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    setDragOverId(null);
    if (!dragId || dragId === targetId) { setDragId(null); return; }

    const oldIndex = collections.findIndex(c => c.id === dragId);
    const newIndex = collections.findIndex(c => c.id === targetId);
    if (oldIndex === -1 || newIndex === -1) { setDragId(null); return; }

    const reordered = [...collections];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    setCollections(reordered);
    setDragId(null);

    try {
      await fetch(`${getApiBase()}/collections/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionIds: reordered.map(c => c.id) }),
      });
    } catch (err) {
      console.error('Reorder failed:', err);
    }
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  return (
    <>
      <header className="header" style={{ position: 'relative' }}>
        {/* Left — MINDVAULT logo, clickable back to main */}
        <div className="header-left">
          <h1
            onClick={() => router.push('/app')}
            style={{ cursor: 'pointer', WebkitAppRegion: 'no-drag' }}
            title="Back to MindVault"
          >
            MindVault
          </h1>
        </div>

        {/* Centre — COLLECTIONS in same tab style as EYE / MIND */}
        <div style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          WebkitAppRegion: 'no-drag',
        }}>
          <span style={{
            display: 'inline-block',
            borderBottom: '2px solid #c8a84b',
            color: '#c8a84b',
            padding: '4px 20px',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            Collections
          </span>
        </div>

        {/* Right — New button in header-btn style */}
        <div className="header-right">
          <button className="header-btn" onClick={() => setShowForm(true)}>
            + New
          </button>
        </div>
      </header>

      {loading && collections.length === 0 ? (
        <div className="loading"><div className="spinner" /></div>
      ) : error ? (
        <div className="empty">
          <div className="empty-icon" style={{fontSize: 24, opacity: 0.3}}>—</div>
          <h2>Backend not reachable</h2>
          <p>Start the backend with:<br /><code>cd backend && npm run dev</code></p>
        </div>
      ) : collections.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" style={{fontSize: 24, opacity: 0.3}}>—</div>
          <h2>No collections yet</h2>
          <p>Create your first collection to group links.</p>
          <button className="collection-create-btn" onClick={() => setShowForm(true)} style={{ marginTop: '1rem' }}>
            + New collection
          </button>
        </div>
      ) : (
        <div className="collections-grid">
          {collections.map((col) => (
            <div
              key={col.id}
              className={`collection-grid-item ${dragId === col.id ? 'dragging' : ''} ${dragOverId === col.id ? 'drag-over' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, col.id)}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              onDragEnd={handleDragEnd}
            >
              <CollectionCard
                collection={col}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onClick={() => router.push(`/collections/${col.id}`)}
                onRenamed={handleRenamed}
              />
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CollectionForm
          collection={editingCollection}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      )}
    </>
  );
}
