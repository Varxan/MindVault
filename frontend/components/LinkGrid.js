'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import LinkCard from './LinkCard';
import SourceFilter from './SourceFilter';
import CollectionFilter from './CollectionFilter';
import AddLink from './AddLink';
import CollectionForm from './CollectionForm';
import PreviewModal from './PreviewModal';
import SettingsPanel from './SettingsPanel';
import MobileQRSection from './MobileQRSection';
import { fetchLinks, fetchSources, fetchCollections, deleteLink, addLinksToCollection, fetchSemanticSearch } from '../lib/api';
import { getApiBase } from '../lib/config';


export default function LinkGrid() {
  const router = useRouter();
  const [links, setLinks] = useState([]);
  const [total, setTotal] = useState(0);
  const [sources, setSources] = useState([]);
  const [collections, setCollections] = useState([]);
  const [search, setSearch] = useState('');
  const [activeSource, setActiveSource] = useState(null);
  const [activeCollection, setActiveCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSemanticSearch, setIsSemanticSearch] = useState(false);

  // Bulk selection
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedLinks, setSelectedLinks] = useState(new Set());
  const [showBulkCollectionPicker, setShowBulkCollectionPicker] = useState(false);

  // Preview modal (for list view)
  const [previewLink, setPreviewLink] = useState(null);

  // New collection form
  const [showCollectionForm, setShowCollectionForm] = useState(false);

  // Settings menu
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsActioned, setSettingsActioned] = useState(false);
  const [settingsPage, setSettingsPage] = useState('main'); // 'main' | 'tokens' | 'downloads' | 'backup' | 'tagging'
  const [settingsStatus, setSettingsStatus] = useState({});
  const [telegramToken, setTelegramToken] = useState('');

  // New SettingsPanel state
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // Eye // Mind space filter
  const [activeSpace, setActiveSpace] = useState('eye'); // default to Eye on start

  // Right-click context menu (global — outside card stacking contexts)
  const [cardContextMenu, setCardContextMenu] = useState(null); // { x, y, link } | null

  const handleCardContextMenu = (e, link) => {
    setCardContextMenu({ x: e.clientX, y: e.clientY, link });
  };

  const handleMoveSpace = async (space) => {
    if (!cardContextMenu) return;
    const { link } = cardContextMenu;
    setCardContextMenu(null);
    try {
      const res = await fetch(`${getApiBase()}/links/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ space }),
      });
      if (!res.ok) throw new Error('Failed');
      refresh();
    } catch (err) {
      alert('Error moving link: ' + err.message);
    }
  };

  // QR modal
  const [showQRModal, setShowQRModal] = useState(false);

  // Thumbnail repair
  const [repairStatus, setRepairStatus] = useState(null); // null | 'running' | { fixed, failed, missing }
  const [aiStatus, setAiStatus] = useState(null); // null | { ok, errorType, message, provider }
  const handleRepairThumbnails = async () => {
    setRepairStatus('running');
    setSettingsActioned(true);
    try {
      const res = await fetch(`${getApiBase()}/repair-thumbnails`, { method: 'POST' });
      const data = await res.json();
      setRepairStatus(data);
      setTimeout(() => setRepairStatus(null), 6000);
    } catch (err) {
      setRepairStatus({ error: err.message });
      setTimeout(() => setRepairStatus(null), 4000);
    }
  };

  // Tag catalog modal
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagCatalog, setTagCatalog] = useState(null);
  const [tagSearch, setTagSearch] = useState('');

  const openTagModal = async () => {
    let catalog = tagCatalog;
    if (!catalog) {
      try {
        const res = await fetch(`${getApiBase()}/tag-catalog`);
        const data = await res.json();
        setTagCatalog(data);
        catalog = data;
      } catch {}
    }
    if (catalog) {
      const allCatalogTags = Object.values(catalog).flatMap(cat => cat.tags.map(t => t.label));
      const currentTags = (settingsStatus.custom_preferred_tags || '').split(',').map(t => t.trim()).filter(Boolean);
      // If stored tags are far fewer than the full catalog, the list was never properly initialized
      if (currentTags.length < Math.floor(allCatalogTags.length / 2)) {
        await handleSaveToken('custom_preferred_tags', allCatalogTags.join(', '));
        await loadSettings();
      }
    }
    setShowTagModal(true);
  };

  // Filter dropdown
  const [filterOpen, setFilterOpen] = useState(false);
  const importRef = useRef(null);
  const [theme, setTheme] = useState('dark');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list' | 'large'

  useEffect(() => {
    const saved = localStorage.getItem('mv-theme') || 'dark';
    setTheme(saved);
    const savedView = localStorage.getItem('mv-view') || 'grid';
    setViewMode(savedView);
  }, []);

  const handleViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('mv-view', mode);
  };

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mv-theme', next);
  };

  const loadSettings = async () => {
    try {
      const res = await fetch(`${getApiBase()}/settings`);
      const data = await res.json();
      setSettingsStatus(data);
    } catch {}
  };

  // For tagging preferences (not API keys) - simplified version
  const handleSaveToken = async (key, value) => {
    if (key !== 'download_path' && !value.trim()) return;
    try {
      const res = await fetch(`${getApiBase()}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: (value || '').trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      loadSettings();
    } catch (err) {
      alert('Error saving: ' + err.message);
    }
  };


  const handleExport = async () => {
    try {
      const res = await fetch(`${getApiBase()}/export`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mindvault-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSettingsOpen(false);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch(`${getApiBase()}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      alert(`Import done: ${result.imported} new links, ${result.skipped} already existed, ${result.collections} collections`);
      setSettingsOpen(false);
      refresh();
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const loadLinks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use semantic search when: there's a query AND we're in Mind space
      const useSemantic = search && activeSpace === 'mind';

      if (useSemantic) {
        const data = await fetchSemanticSearch({ q: search, space: 'mind', limit: 50 });
        if (data.fallback) {
          // Semantic not installed — silently fall back to keyword search
          setIsSemanticSearch(false);
          const kw = await fetchLinks({ search, space: 'mind' });
          setLinks(kw.links);
          setTotal(kw.total);
        } else {
          setIsSemanticSearch(true);
          setLinks(data.links);
          setTotal(data.total);
        }
      } else {
        setIsSemanticSearch(false);
        const data = await fetchLinks({
          search: search || undefined,
          source: activeSource || undefined,
          collection: activeCollection || undefined,
          space: activeSpace || undefined,
        });
        setLinks(data.links);
        setTotal(data.total);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, activeSource, activeCollection, activeSpace]);

  const loadSources = useCallback(async () => {
    try {
      const data = await fetchSources();
      setSources(data);
    } catch {
      // Silently fail
    }
  }, []);

  const loadCollections = useCallback(async () => {
    try {
      const data = await fetchCollections();
      setCollections(data);
    } catch {
      // Silently fail
    }
  }, []);

  const refresh = useCallback(() => {
    loadLinks();
    loadSources();
    loadCollections();
  }, [loadLinks, loadSources, loadCollections]);

  useEffect(() => {
    refresh();

    // ── SSE: listen for backend push events — no more polling ────────────────
    const apiBase = getApiBase();
    const es = new EventSource(`${apiBase}/events`);

    es.onmessage = (e) => {
      try {
        const { type } = JSON.parse(e.data);
        if (type === 'link-added' || type === 'link-updated' || type === 'link-deleted') {
          loadLinks();
        }
      } catch {}
    };

    // SSE auto-reconnects natively on error — no action needed
    es.onerror = () => {};

    // Fallback: 120s poll if SSE never connects (e.g. very old browser)
    const fallbackInterval = setInterval(() => {
      if (es.readyState === EventSource.CLOSED && !document.hidden) refresh();
    }, 120000);

    return () => {
      es.close();
      clearInterval(fallbackInterval);
    };
  }, [refresh, loadLinks]);

  // Check AI status once on mount + every 60s (lightweight)
  useEffect(() => {
    const checkAIStatus = async () => {
      try {
        const res = await fetch(`${getApiBase()}/ai-status`);
        if (res.ok) {
          const data = await res.json();
          setAiStatus(data);
        }
      } catch (_) {}
    };
    checkAIStatus();
    const interval = setInterval(() => {
      if (!document.hidden) checkAIStatus();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!settingsOpen) { setSettingsActioned(false); return; }
    // Still close on click far outside (e.g. clicking content area)
    const close = (e) => {
      const wrapper = document.querySelector('.settings-menu-wrapper');
      if (wrapper && wrapper.contains(e.target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [settingsOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    const close = () => setFilterOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [filterOpen]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this link?')) return;
    try {
      await deleteLink(id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
      setTotal((prev) => prev - 1);
    } catch (err) {
      alert('Delete error: ' + err.message);
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Delete unsaved media files? Saved media will be kept. Links will be kept, but unsaved videos will need to be re-downloaded.')) return;
    try {
      const res = await fetch(`${getApiBase()}/cache`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSettingsOpen(false);
      refresh();
      const msg = data.savedKept > 0
        ? `Cache cleared — ${data.deletedFiles} file${data.deletedFiles !== 1 ? 's' : ''} deleted, ${data.savedKept} saved file${data.savedKept !== 1 ? 's' : ''} kept.`
        : `Cache cleared — ${data.deletedFiles} file${data.deletedFiles !== 1 ? 's' : ''} deleted.`;
      alert(msg);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleClearAllCache = async () => {
    if (!confirm('Delete ALL media files including saved ones? This cannot be undone.')) return;
    try {
      const res = await fetch(`${getApiBase()}/cache/all`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSettingsOpen(false);
      refresh();
      alert(`All cache cleared — ${data.deletedFiles} file${data.deletedFiles !== 1 ? 's' : ''} deleted.`);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Bulk selection handlers
  const toggleBulkMode = () => {
    setBulkMode(!bulkMode);
    setSelectedLinks(new Set());
  };

  const toggleLinkSelection = (id) => {
    setSelectedLinks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkAddToCollection = async (collectionId) => {
    try {
      await addLinksToCollection(collectionId, [...selectedLinks]);
      setShowBulkCollectionPicker(false);
      setBulkMode(false);
      setSelectedLinks(new Set());
      loadCollections();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <>
      <AddLink onAdded={refresh} />

      {/* AI Status Warning Banner */}
      {aiStatus && !aiStatus.ok && (
        <div style={{
          background: aiStatus.errorType === 'rate_limit' ? 'rgba(251,191,36,0.12)' :
                      aiStatus.errorType === 'auth'       ? 'rgba(239,68,68,0.12)' :
                      aiStatus.errorType === 'billing'    ? 'rgba(249,115,22,0.12)' :
                                                            'rgba(148,163,184,0.12)',
          borderBottom: `1px solid ${
            aiStatus.errorType === 'rate_limit' ? 'rgba(251,191,36,0.3)' :
            aiStatus.errorType === 'auth'       ? 'rgba(239,68,68,0.3)' :
            aiStatus.errorType === 'billing'    ? 'rgba(249,115,22,0.3)' :
                                                  'rgba(148,163,184,0.2)'
          }`,
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13px',
          color: aiStatus.errorType === 'rate_limit' ? '#fbbf24' :
                 aiStatus.errorType === 'auth'       ? '#f87171' :
                 aiStatus.errorType === 'billing'    ? '#fb923c' :
                                                       '#94a3b8',
        }}>
          <span style={{ fontSize: '15px' }}>
            {aiStatus.errorType === 'rate_limit' ? '⏳' :
             aiStatus.errorType === 'auth'       ? '🔑' :
             aiStatus.errorType === 'billing'    ? '💳' :
             aiStatus.errorType === 'network'    ? '📡' : '⚠️'}
          </span>
          <span>
            <strong>AI tagging paused</strong> — {aiStatus.message}
            {aiStatus.provider && <span style={{ opacity: 0.6 }}> ({aiStatus.provider})</span>}
          </span>
          <button
            onClick={() => setAiStatus(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, color: 'inherit', fontSize: '16px', lineHeight: 1 }}
          >×</button>
        </div>
      )}

      <div className="sticky-top">
      <header className="header" style={{ position: 'relative' }}>
        <div className="header-left">
          <h1>MindVault</h1>
        </div>

        {/* Eye // Mind — centered in header row, no-drag so Electron doesn't intercept clicks */}
        <div style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '0',
          alignItems: 'flex-end',
          WebkitAppRegion: 'no-drag',
        }}>
          {[
            { label: 'Eye', value: 'eye' },
            { label: 'Mind', value: 'mind' },
          ].map(tab => (
            <button
              key={tab.label}
              onClick={() => { setActiveSpace(tab.value === activeSpace ? null : tab.value); setActiveSource(null); setActiveCollection(null); }}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeSpace === tab.value ? '2px solid #c8a84b' : '2px solid transparent',
                color: activeSpace === tab.value ? '#c8a84b' : '#555',
                padding: '4px 20px',
                fontSize: '11px',
                fontWeight: activeSpace === tab.value ? 600 : 400,
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s',
                WebkitAppRegion: 'no-drag',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="header-right">
          <button
            className={`header-btn ${bulkMode ? 'active' : ''}`}
            onClick={toggleBulkMode}
            title={bulkMode ? 'End selection' : 'Select multiple'}
          >
            {bulkMode ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg> Cancel</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg> Select</>}
          </button>
          <button
            className="header-btn"
            onClick={() => router.push('/collections')}
            title="Manage collections"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> Collections
          </button>
          <div className="settings-menu-wrapper" onClick={e => e.stopPropagation()} onMouseLeave={() => { if (settingsActioned) setSettingsOpen(false); }}>
            <button
              className={`header-btn settings-btn ${settingsOpen ? 'active' : ''}`}
              onClick={() => { setSettingsOpen(!settingsOpen); setSettingsActioned(false); setSettingsPage('main'); if (!settingsOpen) loadSettings(); }}
              title="Settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            {settingsOpen && (
              <div className="settings-dropdown" onClick={e => e.stopPropagation()}>
                {settingsPage === 'main' && (
                  <>
                    <div className="settings-section-label">Appearance</div>
                    <button className="settings-item" onClick={() => { handleToggleTheme(); setSettingsActioned(true); }}>
                      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                      <span className="settings-item-sub">Switch to {theme === 'dark' ? 'white' : 'black'} theme</span>
                    </button>

                    <div className="settings-section-label">Mobile</div>
                    <button className="settings-item" onClick={() => { setSettingsOpen(false); setShowQRModal(true); }}>
                      Connect phone
                      <span className="settings-item-sub">Scan QR code to install app</span>
                    </button>
                    <div className="settings-divider" />
                    <button className="settings-item" onClick={() => { setSettingsPage('tokens'); setSettingsActioned(false); }}>
                      Telegram
                      <span className="settings-item-sub">{settingsStatus.telegram_bot_token ? '● Connected' : '○ Not set'}</span>
                    </button>

                    <div className="settings-section-label">Settings</div>
                    <button className="settings-item" onClick={() => { setShowSettingsPanel(true); setSettingsActioned(true); }}>
                      AI Provider
                      <span className="settings-item-sub">
                        {settingsStatus.anthropic_api_key || settingsStatus.openai_api_key ? '● Connected' : '○ No key set'}
                      </span>
                    </button>
                    <div className="settings-divider" />
                    <button className="settings-item" onClick={() => { setSettingsPage('downloads'); setSettingsActioned(false); }}>
                      Downloads
                      <span className="settings-item-sub">Set save location</span>
                    </button>
                    <div className="settings-divider" />
                    <button className="settings-item" onClick={() => { setSettingsPage('tagging'); setSettingsActioned(false); }}>
                      AI Tagging
                      <span className="settings-item-sub">Tags, Ratio &amp; Prompt</span>
                    </button>

                    <div className="settings-section-label">Data</div>
                    <button className="settings-item" onClick={() => { setSettingsPage('backup'); setSettingsActioned(false); }}>
                      Backup
                      <span className="settings-item-sub">{settingsStatus.cloud_backup_path ? '☁️ Cloud sync active' : 'Backup & Import'}</span>
                    </button>
                    <div className="settings-divider" />
                    <button className="settings-item" onClick={() => { importRef.current?.click(); }}>
                      Import library
                      <span className="settings-item-sub">Restore from backup file</span>
                    </button>

                    <div className="settings-section-label">Maintenance</div>
                    <button className="settings-item" onClick={handleRepairThumbnails} disabled={repairStatus === 'running'}>
                      {repairStatus === 'running' ? 'Scanning…' : 'Repair thumbnails'}
                      <span className="settings-item-sub">
                        {repairStatus === 'running'
                          ? 'Checking all links…'
                          : repairStatus?.fixed !== undefined
                            ? repairStatus.fixed > 0
                              ? `✓ Fixed ${repairStatus.fixed} of ${repairStatus.missing} missing`
                              : repairStatus.missing === 0
                                ? '✓ All thumbnails OK'
                                : `${repairStatus.missing} missing, could not fix`
                            : repairStatus?.error
                              ? `Error: ${repairStatus.error}`
                              : 'Re-download missing thumbnails'}
                      </span>
                    </button>
                    <div className="settings-divider" />
                    <button className="settings-item" onClick={() => { handleClearCache(); setSettingsActioned(true); }}>
                      Clear cache
                      <span className="settings-item-sub">Delete unsaved media only</span>
                    </button>
                    <button className="settings-item settings-item-danger" onClick={() => { handleClearAllCache(); setSettingsActioned(true); }}>
                      Clear ALL cache
                      <span className="settings-item-sub">Delete everything including saved</span>
                    </button>
                  </>
                )}

                {settingsPage === 'tokens' && (
                  <>
                    <button className="settings-back" onClick={() => setSettingsPage('main')}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                      Back
                    </button>
                    <div className="settings-divider" />
                    <div className="settings-field">
                      <label>Telegram Bot Token</label>
                      <span className="settings-field-status">
                        {settingsStatus.telegram_bot_token ? '● Connected' : '○ Not set'}
                      </span>
                      {settingsStatus.telegram_bot_token && (
                        <span className="settings-field-masked">{settingsStatus.telegram_bot_token}</span>
                      )}
                      <div className="settings-field-row">
                        <input
                          type="password"
                          placeholder="Paste new token..."
                          value={telegramToken}
                          onChange={e => setTelegramToken(e.target.value)}
                        />
                        <button
                          disabled={!telegramToken.trim()}
                          onClick={() => {
                            if (telegramToken.trim()) {
                              handleSaveToken('telegram_bot_token', telegramToken);
                              setTelegramToken('');
                            }
                          }}
                        >
                          Save
                        </button>
                      </div>
                      <span className="settings-field-hint">Requires server restart to take effect</span>
                    </div>
                  </>
                )}

                {settingsPage === 'downloads' && (
                  <>
                    <button className="settings-back" onClick={() => setSettingsPage('main')}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                      Back
                    </button>
                    <div className="settings-divider" />
                    <div className="settings-field">
                      <label>Download folder</label>
                      <span className="settings-field-status">
                        {settingsStatus.download_path ? `● ${settingsStatus.download_path}` : '○ Default (~/Downloads)'}
                      </span>
                      <div className="settings-field-row">
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`${getApiBase()}/pick-folder`, { method: 'POST' });
                              const data = await res.json();
                              if (res.ok && data.path) loadSettings();
                            } catch (err) { console.error('Folder picker error:', err); }
                          }}
                          style={{ flex: 1 }}
                        >
                          Choose folder
                        </button>
                      </div>
                      <span className="settings-field-hint">Where clips, GIFs &amp; stills are saved</span>
                      {settingsStatus.download_path && (
                        <button
                          onClick={() => handleSaveToken('download_path', '')}
                          style={{ marginTop: '6px', background: 'none', border: 'none', color: '#888', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                        >
                          Reset to default (~/Downloads)
                        </button>
                      )}
                    </div>
                  </>
                )}

                {settingsPage === 'backup' && (
                  <>
                    <button className="settings-back" onClick={() => setSettingsPage('main')}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                      Back
                    </button>
                    <div className="settings-divider" />
                    <button className="settings-item" onClick={() => { window.open(`${getApiBase()}/backup`, '_blank'); setSettingsActioned(true); }}>
                      Create backup now
                      <span className="settings-item-sub">HTML with thumbnails + JSON download</span>
                    </button>
                    <div className="settings-divider" />
                    <div className="settings-field">
                      <label>Cloud backup folder</label>
                      <span className="settings-field-status">
                        {settingsStatus.cloud_backup_path ? `● ${settingsStatus.cloud_backup_path}` : '○ Not set'}
                      </span>
                      <div className="settings-field-row">
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`${getApiBase()}/pick-folder/cloud-backup`, { method: 'POST' });
                              const data = await res.json();
                              if (res.ok && data.path) loadSettings();
                            } catch (err) { console.error('Cloud backup error:', err); }
                          }}
                          style={{ flex: 1 }}
                        >
                          {settingsStatus.cloud_backup_path ? 'Change folder' : 'Choose folder'}
                        </button>
                      </div>
                      <span className="settings-field-hint">Google Drive, Dropbox, iCloud — auto-backup writes here on startup</span>
                      {settingsStatus.cloud_backup_path && (
                        <button
                          onClick={() => handleSaveToken('cloud_backup_path', '')}
                          style={{ marginTop: '6px', background: 'none', border: 'none', color: '#888', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                        >
                          Remove cloud backup
                        </button>
                      )}
                    </div>
                  </>
                )}

                {settingsPage === 'tagging' && (
                  <>
                    <button className="settings-back" onClick={() => setSettingsPage('main')}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                      Back
                    </button>
                    <div className="settings-divider" />

                    {/* Preferred Tags */}
                    <div className="settings-field">
                      <label>Preferred Tags</label>
                      <span className="settings-field-hint" style={{ marginBottom: '8px' }}>Tags that get higher priority when relevant to the content.</span>
                      <button
                        className="settings-item"
                        onClick={openTagModal}
                        style={{ borderRadius: '6px', border: '1px solid var(--border, #333)', margin: 0 }}
                      >
                        Manage preferred tags
                        <span className="settings-item-sub">
                          {(() => {
                            const count = (settingsStatus.custom_preferred_tags || '').split(',').filter(t => t.trim()).length;
                            return count > 0 ? `${count} tag${count !== 1 ? 's' : ''} selected` : 'None selected — all tags treated equally';
                          })()}
                        </span>
                      </button>
                    </div>
                    <div className="settings-divider" />

                    {/* Catalog Ratio Slider */}
                    <div className="settings-field">
                      <label>Catalog / Custom Ratio</label>
                      <span className="settings-field-hint" style={{ marginBottom: '6px' }}>
                        How many of the 15 tags come from the predefined catalog vs. AI-generated custom tags.
                      </span>
                      <style>{`
                        .mv-ratio-slider {
                          -webkit-appearance: none; appearance: none;
                          width: 100%; height: 4px; border-radius: 2px;
                          outline: none; cursor: pointer;
                          background: linear-gradient(to right, #E8A045 var(--ratio-pct, 80%), rgba(232,160,69,0.2) var(--ratio-pct, 80%));
                        }
                        .mv-ratio-slider::-webkit-slider-thumb {
                          -webkit-appearance: none; appearance: none;
                          width: 14px; height: 14px; border-radius: 50%;
                          background: #E8A045; cursor: pointer;
                          box-shadow: 0 0 0 3px rgba(232,160,69,0.2);
                        }
                        .mv-ratio-slider::-moz-range-thumb {
                          width: 14px; height: 14px; border-radius: 50%; border: none;
                          background: #E8A045; cursor: pointer;
                          box-shadow: 0 0 0 3px rgba(232,160,69,0.2);
                        }
                      `}</style>
                      {(() => {
                        const ratio = parseInt(settingsStatus.tag_catalog_ratio !== undefined && settingsStatus.tag_catalog_ratio !== '' ? settingsStatus.tag_catalog_ratio : '80', 10);
                        const catalogCount = Math.round(15 * ratio / 100);
                        const customCount = 15 - catalogCount;
                        return (
                          <div data-slider-box="">
                            <input
                              type="range"
                              className="mv-ratio-slider"
                              min="0"
                              max="100"
                              step="5"
                              defaultValue={ratio}
                              style={{ '--ratio-pct': `${ratio}%`, display: 'block', width: '100%', margin: '4px 0' }}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                const cCount = Math.round(15 * val / 100);
                                const cuCount = 15 - cCount;
                                e.target.style.setProperty('--ratio-pct', `${val}%`);
                                const wrapper = e.target.closest('[data-slider-box]');
                                if (wrapper) {
                                  wrapper.querySelector('[data-left]').textContent = `${val}% Catalog`;
                                  wrapper.querySelector('[data-right]').textContent = `${100 - val}% Custom`;
                                  wrapper.querySelector('[data-summary]').textContent = `= ${cCount} catalog tags + ${cuCount} custom tags per item`;
                                }
                              }}
                              onMouseUp={(e) => handleSaveToken('tag_catalog_ratio', e.target.value)}
                              onTouchEnd={(e) => handleSaveToken('tag_catalog_ratio', e.target.value)}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                              <span data-left="">{ratio}% Catalog</span>
                              <span data-right="">{100 - ratio}% Custom</span>
                            </div>
                            <div data-summary="" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                              = {catalogCount} catalog tags + {customCount} custom tags per item
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="settings-divider" />

                    {/* Custom AI Prompt */}
                    <div className="settings-field">
                      <label>Custom AI Prompt</label>
                      <span className="settings-field-hint" style={{ marginBottom: '6px' }}>
                        Additional instructions for the AI tagger. Gets appended to the standard prompt.
                      </span>
                      <div className="settings-field-row">
                        <input
                          type="text"
                          placeholder="Add instruction and press Enter..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              const newLine = e.target.value.trim();
                              const existing = (settingsStatus.custom_ai_prompt || '').split('\n').filter(Boolean);
                              const updated = [...existing, newLine].join('\n');
                              handleSaveToken('custom_ai_prompt', updated);
                              e.target.value = '';
                            }
                          }}
                          style={{ flex: 1 }}
                        />
                      </div>
                      {settingsStatus.custom_ai_prompt && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                          {settingsStatus.custom_ai_prompt.split('\n').filter(Boolean).map((line, i) => (
                            <span
                              key={i}
                              style={{ fontSize: '11px', background: 'rgba(106,163,232,0.12)', color: '#6aa3e8', padding: '4px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', cursor: 'pointer' }}
                              onClick={() => {
                                const existing = settingsStatus.custom_ai_prompt.split('\n').filter(Boolean);
                                const updated = existing.filter((_, idx) => idx !== i).join('\n');
                                handleSaveToken('custom_ai_prompt', updated);
                              }}
                              title="Click to remove"
                            >
                              <span style={{ flex: 1 }}>{line}</span>
                              <span style={{ fontSize: '9px', opacity: 0.6, flexShrink: 0 }}>✕</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

              </div>
            )}
          </div>
        </div>
      </header>
      <input
        ref={importRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImport}
      />

      <div className="toolbar">
        <div className="toolbar-row">
          <div className="search-bar">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              className="search-input"
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveSource(null);
                setActiveCollection(null);
              }}
            />
            {search && isSemanticSearch && (
              <span style={{
                fontSize: '10px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#7b9ea8',
                fontFamily: 'var(--font-display)',
                padding: '2px 6px',
                border: '1px solid #7b9ea830',
                borderRadius: '4px',
                whiteSpace: 'nowrap',
              }}>semantic</span>
            )}
            {search && (
              <button className="search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          {!search && sources.length > 0 && (
            <div className="filter-wrapper" onClick={e => e.stopPropagation()}>
              <button
                className={`filter-toggle ${filterOpen ? 'active' : ''} ${activeSource ? 'has-filter' : ''}`}
                onClick={() => setFilterOpen(!filterOpen)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M7 12h10M10 18h4"/></svg>
                {activeSource ? activeSource : 'Filter'}
              </button>
              {filterOpen && (
                <div className="filter-dropdown">
                  <SourceFilter sources={sources} active={activeSource} onChange={(s) => {
                    setActiveSource(s);
                    setActiveCollection(null);
                    setFilterOpen(false);
                  }} />
                </div>
              )}
            </div>
          )}

          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => handleViewMode('grid')}
              title="Grid view"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'large' ? 'active' : ''}`}
              onClick={() => handleViewMode('large')}
              title="Large view"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="8" rx="1"/><rect x="3" y="14" width="18" height="8" rx="1"/></svg>
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => handleViewMode('list')}
              title="List view"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Bulk toolbar */}
      {bulkMode && selectedLinks.size > 0 && (
        <div className="bulk-toolbar">
          <span className="bulk-count">{selectedLinks.size} selected</span>
          <button
            className="bulk-action-btn"
            onClick={() => setShowBulkCollectionPicker(true)}
          >
            📁 Add to collection
          </button>
          <button className="bulk-cancel-btn" onClick={toggleBulkMode}>Cancel</button>
        </div>
      )}

      {/* Bulk collection picker modal */}
      {showBulkCollectionPicker && (
        <div className="add-form-backdrop" onClick={() => setShowBulkCollectionPicker(false)}>
          <div className="add-form collection-picker" onClick={(e) => e.stopPropagation()}>
            <div className="add-form-header">
              <h2>Add {selectedLinks.size} links to collection</h2>
              <button className="add-form-close" onClick={() => setShowBulkCollectionPicker(false)}>✕</button>
            </div>
            <div className="collection-picker-list">
              {collections.map((c) => (
                <button
                  key={c.id}
                  className="collection-picker-item"
                  onClick={() => handleBulkAddToCollection(c.id)}
                >
                  <span className="collection-picker-name">{c.name}</span>
                  <span className="collection-picker-count">{c.link_count} Links</span>
                </button>
              ))}
              {collections.length === 0 && (
                <p style={{ padding: '1rem', color: 'var(--text-muted)' }}>No collections yet.</p>
              )}
            </div>
            <button
              className="collection-picker-new"
              onClick={() => {
                setShowBulkCollectionPicker(false);
                setShowCollectionForm(true);
              }}
            >
              + New collection
            </button>
          </div>
        </div>
      )}

      {loading && links.length === 0 ? (
        <div className="loading"><div className="spinner" /></div>
      ) : error ? (
        <div className="empty">
          <div className="empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.25}}>
              <path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
            </svg>
          </div>
          <h2>Backend not reachable</h2>
          <p>Start the backend with:<br /><code>cd backend && npm run dev</code></p>
        </div>
      ) : links.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.25}}>
              {search
                ? <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></>
                : activeCollection
                  ? <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></>
                  : <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8"/><path d="M8 12h8"/></>
              }
            </svg>
          </div>
          <h2>{search ? 'No results' : activeCollection ? 'No links in this collection' : 'Your vault is empty'}</h2>
          <p>
            {search
              ? `Nothing found for "${search}"`
              : activeCollection
                ? 'Add links via the collection button on the cards.'
                : 'Click + or drag a link / file here.'}
          </p>
        </div>
      ) : (
        <div className={`grid ${viewMode === 'list' ? 'grid-list' : viewMode === 'large' ? 'grid-large' : ''}`}>
          {links.map((link) => {
            const tags = (() => { try { return JSON.parse(link.tags || '[]'); } catch { return []; } })();
            const thumbSrc = link.local_thumbnail
              ? `${getApiBase()}/files/thumbnails/${link.local_thumbnail}`
              : link.thumbnail_url;
            return (
              <div key={link.id} className={`card-wrapper ${bulkMode ? 'bulk-mode' : ''}`}>
                {bulkMode && (
                  <div
                    className={`bulk-checkbox ${selectedLinks.has(link.id) ? 'checked' : ''}`}
                    onClick={() => toggleLinkSelection(link.id)}
                  >
                    {selectedLinks.has(link.id) ? '✓' : ''}
                  </div>
                )}
                {viewMode === 'list' ? (
                  <div className="list-row" onClick={() => setPreviewLink(link)}>
                    <div className="list-thumb">
                      {thumbSrc ? <img src={thumbSrc} alt="" loading="lazy" /> : <div className="list-thumb-empty" />}
                    </div>
                    <div className="list-info">
                      <span className="list-title">{link.title || 'Untitled'}</span>
                      <span className="list-source">{link.source}</span>
                    </div>
                    <div className="list-tags">
                      {tags.slice(0, 3).map((t, i) => <span key={i} className="list-tag">{t}</span>)}
                    </div>
                    <div className="list-actions">
                      <button className="list-action-btn" onClick={(e) => { e.stopPropagation(); handleDelete(link.id); }} title="Delete">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <LinkCard
                    link={link}
                    onDelete={handleDelete}
                    onRefresh={refresh}
                    onContextMenu={handleCardContextMenu}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCollectionForm && (
        <CollectionForm
          onClose={() => setShowCollectionForm(false)}
          onSaved={() => {
            setShowCollectionForm(false);
            loadCollections();
          }}
        />
      )}

      {previewLink && (
        <PreviewModal
          link={previewLink}
          onClose={() => setPreviewLink(null)}
        />
      )}

      {/* Tag Library Modal */}
      {showTagModal && (() => {
        const currentTags = (settingsStatus.custom_preferred_tags || '').split(',').map(t => t.trim()).filter(Boolean);

        const addTag = (tag) => {
          if (!tag.trim() || currentTags.includes(tag.trim())) return;
          handleSaveToken('custom_preferred_tags', [...currentTags, tag.trim()].join(', '));
        };

        const removeTag = (tag) => {
          handleSaveToken('custom_preferred_tags', currentTags.filter(t => t !== tag).join(', '));
        };

        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            onClick={() => setShowTagModal(false)}
          >
            <style>{`
              .mv-tag-modal { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; width: 100%; max-width: 500px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; }
              .mv-tag-modal-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
              .mv-tag-modal-title { font-size: 14px; font-weight: 600; color: var(--text); }
              .mv-tag-modal-count { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
              .mv-tag-modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; line-height: 1; padding: 4px; }
              .mv-tag-modal-addinput { padding: 12px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; display: flex; gap: 8px; }
              .mv-tag-modal-addinput input { flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 7px 12px; font-size: 12px; outline: none; font-family: inherit; }
              .mv-tag-modal-addinput input::placeholder { color: var(--text-muted); }
              .mv-tag-modal-addinput button { background: var(--accent); border: none; border-radius: 6px; color: #fff; font-weight: 600; font-size: 12px; padding: 7px 14px; cursor: pointer; flex-shrink: 0; }
              .mv-tag-list { overflow-y: auto; flex: 1; padding: 10px 16px 16px; display: flex; flex-direction: column; gap: 3px; }
              .mv-tag-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-radius: 6px; background: var(--surface-hover); }
              .mv-tag-row:hover { background: var(--border); }
              .mv-tag-label { font-size: 12px; color: var(--text); }
              .mv-tag-remove { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; opacity: 0.55; }
              .mv-tag-remove:hover { opacity: 1; color: var(--danger); }
              .mv-tag-modal-footer { padding: 12px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; flex-shrink: 0; }
              .mv-tag-modal-footer button { background: var(--accent); border: none; border-radius: 6px; color: #fff; font-weight: 600; font-size: 12px; padding: 7px 22px; cursor: pointer; }
            `}</style>
            <div className="mv-tag-modal" onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="mv-tag-modal-header">
                <div>
                  <div className="mv-tag-modal-title">Tag Library</div>
                  <div className="mv-tag-modal-count">{currentTags.length} tags active</div>
                </div>
                <button className="mv-tag-modal-close" onClick={() => setShowTagModal(false)}>✕</button>
              </div>

              {/* Add tag input */}
              <div className="mv-tag-modal-addinput">
                <input
                  type="text"
                  placeholder="Add custom tag..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { addTag(e.target.value); e.target.value = ''; }
                  }}
                />
                <button onMouseDown={(e) => {
                  const input = e.currentTarget.previousElementSibling;
                  addTag(input.value); input.value = ''; input.focus();
                }}>Add</button>
              </div>

              {/* Tag list */}
              <div className="mv-tag-list">
                {currentTags.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>No tags yet. Add one above.</div>
                ) : currentTags.map((tag, i) => (
                  <div key={i} className="mv-tag-row">
                    <span className="mv-tag-label">{tag}</span>
                    <button className="mv-tag-remove" onClick={() => removeTag(tag)} title="Remove">✕</button>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="mv-tag-modal-footer">
                <button
                  onClick={async () => {
                    if (!tagCatalog) return;
                    if (!confirm('Reset tag list to full catalog defaults?')) return;
                    const allCatalogTags = Object.values(tagCatalog).flatMap(cat => cat.tags.map(t => t.label));
                    await handleSaveToken('custom_preferred_tags', allCatalogTags.join(', '));
                    await loadSettings();
                  }}
                  style={{ marginRight: 'auto', background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: '400', borderRadius: '6px', fontSize: '11px', padding: '6px 12px', cursor: 'pointer' }}
                >
                  Reset to defaults
                </button>
                <button onClick={() => setShowTagModal(false)}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* New Settings Panel Modal */}
      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        settingsStatus={settingsStatus}
        onSettingsUpdate={loadSettings}
      />

      {/* QR Code Modal */}
      {showQRModal && (
        <div
          onClick={() => setShowQRModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
            animation: 'qrFadeIn 0.2s ease both',
          }}
        >
          <style>{`
            @keyframes qrFadeIn {
              from { opacity:0; }
              to   { opacity:1; }
            }
            @keyframes qrSlideUp {
              from { opacity:0; transform:translateY(16px) scale(0.97); }
              to   { opacity:1; transform:translateY(0)    scale(1);    }
            }
          `}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#141414',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px',
              padding: '28px 28px 24px',
              width: '100%',
              maxWidth: '300px',
              position: 'relative',
              animation: 'qrSlideUp 0.25s cubic-bezier(0.34,1.2,0.64,1) both',
              boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setShowQRModal(false)}
              style={{
                position: 'absolute', top: 14, right: 14,
                background: 'rgba(255,255,255,0.06)',
                border: 'none', borderRadius: '50%',
                width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#666',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.1)'; e.currentTarget.style.color='#aaa'; }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='#666'; }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: '#e8e8e8', fontSize: 15, fontWeight: 650, marginBottom: 4 }}>
                Connect phone
              </div>
              <div style={{ color: '#555', fontSize: 12, lineHeight: 1.5 }}>
                Scan to install the app and connect to your library
              </div>
            </div>

            {/* QR Section */}
            <MobileQRSection />
          </div>
        </div>
      )}
      {/* Right-click context menu — rendered at LinkGrid level, outside any card stacking context */}
      {cardContextMenu && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setCardContextMenu(null)}
          />
          {/* Menu */}
          <div
            className="card-context-menu"
            style={{ position: 'fixed', top: cardContextMenu.y, left: cardContextMenu.x, zIndex: 9999 }}
          >
            {cardContextMenu.link.space !== 'mind' && (
              <button className="card-context-item" onClick={() => handleMoveSpace('mind')}>
                Move to Mind
              </button>
            )}
            {cardContextMenu.link.space !== 'eye' && (
              <button className="card-context-item" onClick={() => handleMoveSpace('eye')}>
                Move to Eye
              </button>
            )}
            <button className="card-context-item card-context-cancel" onClick={() => setCardContextMenu(null)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </>
  );
}
