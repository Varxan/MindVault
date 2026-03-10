'use client';

import { useState } from 'react';
import { createCollection, updateCollection } from '../lib/api';

export default function CollectionForm({ collection, onClose, onSaved }) {
  const isEdit = !!collection;
  const [name, setName] = useState(collection?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSaving(true);
      setError(null);
      if (isEdit) {
        await updateCollection(collection.id, { name: name.trim() });
      } else {
        await createCollection({ name: name.trim() });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="add-form-backdrop" onClick={onClose}>
      <div className="add-form collection-form" onClick={(e) => e.stopPropagation()}>
        <div className="add-form-header">
          <h2>{isEdit ? 'Edit collection' : 'New collection'}</h2>
          <button className="add-form-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="add-form-group">
            <input
              className="add-form-input"
              type="text"
              placeholder="Collection name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error && <div className="collection-form-error">{error}</div>}

          <button
            type="submit"
            className="add-form-submit"
            disabled={saving || !name.trim()}
          >
            {saving ? 'Saving...' : isEdit ? 'Save' : 'Create'}
          </button>
        </form>
      </div>
    </div>
  );
}
