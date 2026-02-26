const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export async function fetchLinks({ search, source, collection } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (source) params.set('source', source);
  if (collection) params.set('collection', collection);

  const url = `${API_BASE}/links${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) throw new Error('Failed to load links');
  return res.json();
}

export async function fetchSources() {
  const res = await fetch(`${API_BASE}/sources`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load sources');
  return res.json();
}

export async function createLink(data) {
  const res = await fetch(`${API_BASE}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error('Failed to create link');
  return res.json();
}

export async function updateLink(id, data) {
  const res = await fetch(`${API_BASE}/links/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error('Failed to update link');
  return res.json();
}

export async function deleteLink(id) {
  const res = await fetch(`${API_BASE}/links/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) throw new Error('Failed to delete link');
  return res.json();
}

// ── Collections ──

export async function fetchCollections() {
  const res = await fetch(`${API_BASE}/collections`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load collections');
  return res.json();
}

export async function createCollection(data) {
  const res = await fetch(`${API_BASE}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create collection');
  }
  return res.json();
}

export async function updateCollection(id, data) {
  const res = await fetch(`${API_BASE}/collections/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update collection');
  }
  return res.json();
}

export async function deleteCollection(id) {
  const res = await fetch(`${API_BASE}/collections/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete collection');
  return res.json();
}

export async function fetchCollectionById(id) {
  const res = await fetch(`${API_BASE}/collections/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load collection');
  return res.json();
}

export async function addLinksToCollection(collectionId, linkIds) {
  const res = await fetch(`${API_BASE}/collections/${collectionId}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linkIds }),
  });
  if (!res.ok) throw new Error('Failed to add to collection');
  return res.json();
}

export async function removeLinkFromCollection(collectionId, linkId) {
  const res = await fetch(`${API_BASE}/collections/${collectionId}/links/${linkId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to remove from collection');
  return res.json();
}

export async function fetchCollectionsForLink(linkId) {
  const res = await fetch(`${API_BASE}/links/${linkId}/collections`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load collections');
  return res.json();
}
