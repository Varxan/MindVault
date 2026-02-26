'use client';
import { getApiBase } from '../lib/config';


export default function CollectionCard({ collection, onDelete, onEdit, onClick }) {
  const dateStr = new Date(collection.updated_at || collection.created_at).toLocaleDateString('en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const thumbnails = collection.thumbnails || [];

  const getThumbnailUrl = (t) => {
    if (t.local_thumbnail) {
      return `${getApiBase()}/files/thumbnails/${t.local_thumbnail}`;
    }
    if (t.thumbnail_url && t.thumbnail_url.startsWith('http')) {
      return t.thumbnail_url;
    }
    return null;
  };

  return (
    <div className="collection-card" onClick={onClick}>
      {/* Action Buttons */}
      <div className="card-actions">
        <button
          className="card-action-btn"
          onClick={(e) => { e.stopPropagation(); onEdit(collection); }}
          title="Edit"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
        </button>
        <button
          className="card-action-btn card-delete-btn"
          onClick={(e) => { e.stopPropagation(); onDelete(collection.id); }}
          title="Delete"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Auto Cover: 2x2 Thumbnail Grid */}
      <div className="collection-cover">
        {[0, 1, 2, 3].map((i) => {
          const url = thumbnails[i] ? getThumbnailUrl(thumbnails[i]) : null;
          return (
            <div key={i} className="collection-cover-cell">
              {url ? (
                <img src={url} alt="" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="collection-card-body">
        <div className="collection-card-name">{collection.name}</div>
        {collection.description && (
          <div className="collection-card-desc">{collection.description}</div>
        )}
        <div className="collection-card-meta">
          <span>{collection.link_count} {collection.link_count === 1 ? 'Link' : 'Links'}</span>
          <span>{dateStr}</span>
        </div>
      </div>
    </div>
  );
}
