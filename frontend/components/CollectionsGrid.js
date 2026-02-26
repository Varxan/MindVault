'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import CollectionCard from './CollectionCard';
import CollectionForm from './CollectionForm';
import { fetchCollections, deleteCollection } from '../lib/api';

export default function CollectionsGrid() {
  const router = useRouter();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);

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

  const handleFormClose = () => {
    setShowForm(false);
    setEditingCollection(null);
  };

  const handleFormSaved = () => {
    handleFormClose();
    loadCollections();
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <button className="collection-back-btn" onClick={() => router.push('/')}>
            ← MindVault
          </button>
          <h1>Collections</h1>
        </div>
        <button className="collection-create-btn" onClick={() => setShowForm(true)}>
          + New collection
        </button>
      </header>

      {loading && collections.length === 0 ? (
        <div className="loading"><div className="spinner" /></div>
      ) : error ? (
        <div className="empty">
          <div className="empty-icon">⚡</div>
          <h2>Backend not reachable</h2>
          <p>Start the backend with:<br /><code>cd backend && npm run dev</code></p>
        </div>
      ) : collections.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📁</div>
          <h2>No collections yet</h2>
          <p>Create your first collection to group links.</p>
          <button className="collection-create-btn" onClick={() => setShowForm(true)} style={{ marginTop: '1rem' }}>
            + New collection
          </button>
        </div>
      ) : (
        <div className="collections-grid">
          {collections.map((col) => (
            <CollectionCard
              key={col.id}
              collection={col}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onClick={() => router.push(`/collections/${col.id}`)}
            />
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
