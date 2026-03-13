'use client';

export default function CollectionFilter({ collections, active, onChange }) {
  if (!collections || collections.length === 0) return null;

  return (
    <div className="collection-filter">
      <span className="collection-filter-label" style={{fontSize: 11, fontWeight: 600, opacity: 0.4}}>Collection</span>
      <button
        className={`source-btn ${!active ? 'active' : ''}`}
        onClick={() => onChange(null)}
      >
        Alle
      </button>
      {collections.map((c) => (
        <button
          key={c.id}
          className={`source-btn ${active === c.id ? 'active' : ''}`}
          onClick={() => onChange(active === c.id ? null : c.id)}
        >
          {c.name}
          <span className="source-count">{c.link_count}</span>
        </button>
      ))}
    </div>
  );
}
