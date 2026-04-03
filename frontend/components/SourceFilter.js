'use client';

import SourceLogo from './SourceLogo';

export default function SourceFilter({ sources, active, onChange }) {
  return (
    <div className="source-filter">
      <button
        className={`source-btn ${!active ? 'active' : ''}`}
        onClick={() => onChange(null)}
      >
        All
      </button>
      {sources.map((s) => (
        <button
          key={s.source}
          className={`source-btn ${active === s.source ? 'active' : ''}`}
          onClick={() => onChange(active === s.source ? null : s.source)}
        >
          <SourceLogo source={s.source} size={13} />
          <span style={{ marginLeft: '0.35rem' }}>
            {s.source === 'upload' ? 'Import' : s.source.charAt(0).toUpperCase() + s.source.slice(1)}
          </span>
          <span className="source-count">{s.count}</span>
        </button>
      ))}
    </div>
  );
}
