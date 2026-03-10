'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getApiBase } from '../lib/config';


function formatTimecode(seconds) {
  if (!seconds || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function VideoPlayerModal({ link, carouselFiles = [], onClose, onGifCreated, onSwitchFile }) {
  const videoRef = useRef(null);
  const timelineRef = useRef(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Mode: null (just player), 'clip', 'gif', 'still'
  const [mode, setMode] = useState(null);

  // Shared timeline state
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(0);
  const [dragging, setDragging] = useState(null);

  // Clip export
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [compressMode, setCompressMode] = useState(false);

  // Screenshot / Still grab
  const [screenshotting, setScreenshotting] = useState(false);
  const [screenshotResult, setScreenshotResult] = useState(null);
  const [screenshotError, setScreenshotError] = useState(null);
  const [shutterFlash, setShutterFlash] = useState(false);

  // GIF export
  const [gifExporting, setGifExporting] = useState(false);
  const [gifResult, setGifResult] = useState(null);
  const [gifError, setGifError] = useState(null);
  const [downloadSuccess, setDownloadSuccess] = useState(null); // brief success toast after download
  const [downloadFolder, setDownloadFolder] = useState(null);  // cached current download folder
  const [showDownloadMenu, setShowDownloadMenu] = useState(false); // split-button dropdown
  const [gifFps, setGifFps] = useState(25);
  const [gifWidth, setGifWidth] = useState(480);
  const [gifQuality, setGifQuality] = useState(256);
  const [gifs, setGifs] = useState([]);
  const [showGifList, setShowGifList] = useState(false);

  const videoSrc = link.media_path
    ? `${getApiBase()}/files/media/${link.media_path}`
    : null;

  const editMode = mode === 'clip' || mode === 'gif' || mode === 'still';
  const rangeMode = mode === 'clip' || mode === 'gif';

  // Lock body scroll + keyboard shortcuts
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Load download folder from Electron (only when running inside Electron)
  useEffect(() => {
    window.electron?.getDownloadFolder?.().then(setDownloadFolder).catch(() => {});
    // Listen for download-done events to show toast
    const onDone = (e) => {
      const name = e.detail?.filename || 'File';
      setDownloadSuccess(`✓ Saved: ${name}`);
      setTimeout(() => setDownloadSuccess(null), 3000);
    };
    window.addEventListener('mv:download-done', onDone);
    return () => window.removeEventListener('mv:download-done', onDone);
  }, []);

  // Load existing GIFs
  useEffect(() => {
    async function loadGifs() {
      try {
        const res = await fetch(`${getApiBase()}/links/${link.id}/video-info`);
        const data = await res.json();
        if (data.gifs && data.gifs.length > 0) setGifs(data.gifs);
      } catch (e) { /* ignore */ }
    }
    loadGifs();
  }, [link.id]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setOutPoint(dur);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const seekTo = useCallback((time) => {
    if (videoRef.current) {
      const clamped = Math.max(0, Math.min(time, duration || Infinity));
      videoRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    }
  }, [duration]);

  // Play/Pause
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  }, []);

  // Step frame (~1/30s)
  const stepFrame = useCallback((direction) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    const step = 1 / 30;
    seekTo(currentTime + direction * step);
  }, [currentTime, seekTo]);

  // Preview IN→OUT range
  const previewRange = useCallback(() => {
    seekTo(inPoint);
    if (videoRef.current) {
      videoRef.current.play();
      const checkEnd = setInterval(() => {
        if (videoRef.current && videoRef.current.currentTime >= outPoint) {
          videoRef.current.pause();
          clearInterval(checkEnd);
        }
      }, 50);
    }
  }, [inPoint, outPoint, seekTo]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      switch (e.key) {
        case 'Escape': onClose(); break;
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          stepFrame(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          stepFrame(1);
          break;
        case 'i': case 'I':
          if (rangeMode) { e.preventDefault(); setInPoint(currentTime); }
          break;
        case 'o': case 'O':
          if (rangeMode) { e.preventDefault(); setOutPoint(currentTime); }
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, editMode, currentTime, rangeMode, togglePlay, stepFrame]);

  // Timeline drag interaction
  const getTimeFromPosition = useCallback((clientX) => {
    if (!timelineRef.current || !duration) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return (x / rect.width) * duration;
  }, [duration]);

  const handleTimelineMouseDown = (e) => {
    const time = getTimeFromPosition(e.clientX);
    if (!rangeMode) {
      seekTo(time);
      if (editMode) setDragging('playhead');
      return;
    }
    const threshold = duration * 0.015;
    if (Math.abs(time - inPoint) < threshold) {
      setDragging('in');
    } else if (Math.abs(time - outPoint) < threshold) {
      setDragging('out');
    } else {
      seekTo(time);
      setDragging('playhead');
    }
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e) => {
      const time = getTimeFromPosition(e.clientX);
      if (dragging === 'in') setInPoint(Math.max(0, Math.min(time, outPoint - 0.1)));
      else if (dragging === 'out') setOutPoint(Math.min(duration, Math.max(time, inPoint + 0.1)));
      else if (dragging === 'playhead') seekTo(time);
    };
    const handleUp = () => setDragging(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, inPoint, outPoint, duration, getTimeFromPosition, seekTo]);

  // Switch mode — useCallback with [mode, duration] to avoid stale closures
  const switchMode = useCallback((newMode) => {
    setMode(prev => {
      if (prev === newMode) return null; // toggle off
      return newMode;
    });
    setInPoint(0);
    setOutPoint(prev => duration > 0 ? duration : prev);
    setExportResult(null);
    setExportError(null);
    setGifResult(null);
    setGifError(null);
    setScreenshotResult(null);
    setScreenshotError(null);
  }, [duration]);

  // ── Clip Export ──
  const handleExportClip = async () => {
    try {
      setExporting(true);
      setExportError(null);
      setExportResult(null);
      const res = await fetch(`${getApiBase()}/links/${link.id}/create-clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: inPoint, endTime: outPoint,
          ...(compressMode && { maxSizeMB: 4.9 }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export failed');
      setExportResult(data.clip);
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  };

  // ── GIF Export ──
  const handleExportGif = async () => {
    const clipDur = outPoint - inPoint;
    if (clipDur <= 0) { setGifError('IN must be before OUT'); return; }
    if (clipDur > 120) { setGifError('Max. 120 seconds for GIFs'); return; }
    try {
      setGifExporting(true);
      setGifError(null);
      setGifResult(null);
      const res = await fetch(`${getApiBase()}/links/${link.id}/create-gif`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: Math.round(inPoint * 100) / 100,
          endTime: Math.round(outPoint * 100) / 100,
          fps: gifFps, width: gifWidth, colors: gifQuality,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'GIF creation failed');
      setGifResult(data.gif);
      onGifCreated?.(data.gif);
    } catch (err) {
      setGifError(err.message);
    } finally {
      setGifExporting(false);
    }
  };

  // ── Still Grab ──
  const handleScreenshot = async () => {
    try {
      setScreenshotting(true);
      setScreenshotError(null);
      setScreenshotResult(null);
      const res = await fetch(`${getApiBase()}/links/${link.id}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time: Math.round(currentTime * 100) / 100 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Screenshot failed');
      // Auto-download immediately
      const screenshot = data.screenshot;
      setScreenshotResult(screenshot);
      // Shutter flash animation
      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 400);
      await forceDownload(`${getApiBase()}${screenshot.url}`, screenshot.filename, () => setScreenshotResult(null));
    } catch (err) {
      setScreenshotError(err.message);
    } finally {
      setScreenshotting(false);
    }
  };

  // Change the download folder via Electron native picker
  const handleChangeDownloadFolder = async () => {
  };

  // "Save As" — shows native macOS Save dialog, then streams file to chosen path.
  // Falls back to regular download if saveAsFile IPC is unavailable (older preload).
  const handleSaveAs = async (url, filename, onSuccess) => {
    setShowDownloadMenu(false);

    // Build streaming download URL
    const baseName = url.split('/').pop();
    let type;
    if (url.includes('/files/gifs/'))             type = 'gifs';
    else if (url.includes('/files/clips/'))       type = 'clips';
    else if (url.includes('/files/screenshots/')) type = 'screenshots';
    const downloadUrl = type ? `${getApiBase()}/download-file/${type}/${baseName}` : url;

    if (typeof window.electron?.saveAsFile === 'function') {
      try {
        const result = await window.electron.saveAsFile(downloadUrl, filename);
        if (!result?.canceled) {
          onSuccess?.();
          setDownloadSuccess(`✓ Saved: ${result.filename}`);
          setTimeout(() => setDownloadSuccess(null), 3000);
        }
        return;
      } catch (err) {
        // Fall through to regular download below
      }
    }

    // Fallback: regular auto-download to ~/Downloads
    forceDownload(downloadUrl, filename, onSuccess);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDownloadMenu) return;
    const close = (e) => {
      if (!e.target.closest('.vp-download-split')) setShowDownloadMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showDownloadMenu]);

  // Download a file — in Electron the will-download handler auto-saves to the
  // chosen folder with no dialog. In the browser it falls back to a normal
  // anchor-click download.
  const forceDownload = (url, filename, onSuccess) => {
    // Route through streaming endpoint so backend can clean up the temp file
    let type;
    if (url.includes('/files/gifs/'))             type = 'gifs';
    else if (url.includes('/files/clips/'))       type = 'clips';
    else if (url.includes('/files/screenshots/')) type = 'screenshots';

    const baseName   = url.split('/').pop();
    const downloadUrl = type
      ? `${getApiBase()}/download-file/${type}/${baseName}`
      : url;

    // Anchor click — Electron's will-download handler intercepts this and
    // saves directly to the download folder without showing a dialog.
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Update UI immediately — server deletes the temp file after streaming
    if (onSuccess) onSuccess();

    // In-browser (non-Electron) fallback: show a brief success toast
    if (!window.electron) {
      setDownloadSuccess(`✓ Downloading: ${filename}`);
      setTimeout(() => setDownloadSuccess(null), 3000);
    }
  };

  const handleDeleteGif = async (filename) => {
    if (!confirm('Delete this GIF?')) return;
    try {
      const res = await fetch(`${getApiBase()}/gifs/${filename}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      setGifs((prev) => prev.filter((g) => g.filename !== filename));
    } catch (err) {
      setGifError(err.message);
    }
  };

  if (!videoSrc) return null;

  const clipDuration = outPoint - inPoint;
  const pct = (t) => duration > 0 ? `${(t / duration) * 100}%` : '0%';

  const modal = (
    <div className="vp-overlay" onClick={onClose}>
      <div className="vp-workspace" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="vp-header">
          <div className="vp-header-left">
            <span className="vp-header-title">{link.title || 'Video'}</span>
            {carouselFiles.length > 1 && (
              <div className="vp-carousel-switcher">
                {carouselFiles.map((f, i) => {
                  const isActive = link.media_path === f.filename;
                  const isVideo = f.type === 'video';
                  return (
                    <button
                      key={f.filename}
                      className={`vp-carousel-item ${isActive ? 'active' : ''}`}
                      onClick={() => onSwitchFile?.(f.filename)}
                      title={`${f.type} ${i + 1} (${f.sizeFormatted})`}
                    >
                      {isVideo ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      )}
                      <span>{i + 1}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="vp-header-right">
            <button
              className={`vp-mode-btn ${mode === 'clip' ? 'active' : ''}`}
              onClick={() => switchMode('clip')}
              title="Export MP4 clip"
            >
              Trim
            </button>
            <button
              className={`vp-mode-btn ${mode === 'gif' ? 'active' : ''}`}
              onClick={() => switchMode('gif')}
              title="Create GIF"
            >
              GIF
            </button>
            <button
              className={`vp-mode-btn ${mode === 'still' ? 'active' : ''}`}
              onClick={() => switchMode('still')}
              title="Grab full-res frame"
            >
              Still
            </button>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="vp-source-link"
            >
              Source
            </a>
            {editMode && (
              <span className="vp-shortcut-hint">
                {rangeMode ? 'I = IN \u00a0 O = OUT \u00a0 ' : ''}Space = Play &nbsp; ← → = Frame
              </span>
            )}
            <button className="vp-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Video ── */}
        <div className="vp-video-container">
          <video
            ref={videoRef}
            src={videoSrc}
            className="vp-video"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            controls={!editMode}
            autoPlay
          />
          {/* Timecode overlay (edit mode) */}
          {editMode && (
            <div className="vp-timecode-overlay">
              {formatTimecode(currentTime)} / {formatTimecode(duration)}
            </div>
          )}
          {/* Shutter flash overlay for still grabs */}
          {shutterFlash && <div className="vp-shutter-flash" />}
        </div>

        {/* ── Edit Mode Panel ── */}
        {editMode && (
          <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto', maxHeight: '55vh' }}>
            {/* Transport Controls */}
            <div className="vp-transport">
              <button className="vp-transport-btn" onClick={() => stepFrame(-1)} title="Frame back">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 19 5 12 12 5"/><polyline points="19 19 12 12 19 5"/></svg>
              </button>
              <button className="vp-transport-btn vp-play-btn" onClick={togglePlay} title="Play/Pause">
                {isPlaying
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
                }
              </button>
              <button className="vp-transport-btn" onClick={() => stepFrame(1)} title="Frame forward">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 5 19 12 12 19"/><polyline points="5 5 12 12 5 19"/></svg>
              </button>
              <div className="vp-transport-spacer" />
              <button className="vp-transport-btn" onClick={() => seekTo(0)} title="Go to start">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="5" x2="5" y2="19"/><polyline points="18 18 9 12 18 6"/></svg>
              </button>
              {rangeMode && <button className="vp-transport-btn" onClick={() => seekTo(inPoint)} title="Go to IN point">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="5" x2="4" y2="19"/><polyline points="17 18 8 12 17 6"/><line x1="4" y1="12" x2="8" y2="12" strokeDasharray="2 2"/></svg>
              </button>}
              {rangeMode && <button className="vp-transport-btn vp-preview-btn" onClick={previewRange} title="Preview IN→OUT">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{marginRight: '4px'}}><polygon points="6,3 20,12 6,21"/></svg>
                Preview
              </button>}
              {rangeMode && <button className="vp-transport-btn" onClick={() => seekTo(outPoint)} title="Go to OUT point">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 6 16 12 7 18"/><line x1="20" y1="5" x2="20" y2="19"/><line x1="16" y1="12" x2="20" y2="12" strokeDasharray="2 2"/></svg>
              </button>}
              <button className="vp-transport-btn" onClick={() => seekTo(duration)} title="Go to end">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 6 15 12 6 18"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
              </button>
            </div>

            {/* Timeline */}
            <div className="vp-timeline-section">
              <div
                ref={timelineRef}
                className="vp-tl"
                onMouseDown={handleTimelineMouseDown}
              >
                {/* Selected range (clip/gif only) */}
                {rangeMode && (
                  <>
                    <div
                      className="vp-tl-range"
                      style={{ left: pct(inPoint), right: `${100 - (outPoint / duration) * 100}%` }}
                    />
                    <div
                      className="vp-tl-marker vp-tl-marker-in"
                      style={{ left: pct(inPoint) }}
                      onMouseDown={(e) => { e.stopPropagation(); setDragging('in'); }}
                      title={`IN: ${formatTimecode(inPoint)}`}
                    >
                      <span className="vp-tl-marker-label">IN</span>
                    </div>
                    <div
                      className="vp-tl-marker vp-tl-marker-out"
                      style={{ left: pct(outPoint) }}
                      onMouseDown={(e) => { e.stopPropagation(); setDragging('out'); }}
                      title={`OUT: ${formatTimecode(outPoint)}`}
                    >
                      <span className="vp-tl-marker-label">OUT</span>
                    </div>
                  </>
                )}
                {/* Playhead */}
                <div
                  className="vp-tl-playhead"
                  style={{ left: pct(currentTime) }}
                  onMouseDown={(e) => { e.stopPropagation(); setDragging('playhead'); }}
                >
                  <div className="vp-tl-playhead-head" />
                </div>
              </div>
            </div>

            {/* IN/OUT Controls (clip/gif only) */}
            {rangeMode && <div className="vp-inout-controls">
              <div className="vp-point-control">
                <button className="vp-set-point-btn vp-set-in" onClick={() => setInPoint(currentTime)}>Set IN</button>
                <div className="vp-point-time">
                  <span className="vp-point-label">IN</span>
                  <input
                    type="number"
                    className="vp-time-input"
                    value={inPoint.toFixed(2)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      if (val >= 0 && val < outPoint) setInPoint(val);
                    }}
                    step="0.1" min="0" max={duration}
                  />
                </div>
              </div>

              <div className="vp-duration-display">
                <span className="vp-duration-label">Duration</span>
                <span className="vp-duration-value">{formatTimecode(clipDuration)}</span>
              </div>

              <div className="vp-point-control">
                <button className="vp-set-point-btn vp-set-out" onClick={() => setOutPoint(currentTime)}>Set OUT</button>
                <div className="vp-point-time">
                  <span className="vp-point-label">OUT</span>
                  <input
                    type="number"
                    className="vp-time-input"
                    value={outPoint.toFixed(2)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || duration;
                      if (val > inPoint && val <= duration) setOutPoint(val);
                    }}
                    step="0.1" min="0" max={duration}
                  />
                </div>
              </div>
            </div>}

            {/* ── Mode-specific bottom bar ── */}
            <div className="vp-bottom-bar">

              {/* CLIP MODE */}
              {mode === 'clip' && (
                <>
                  <button
                    className={`vp-compress-toggle ${compressMode ? 'active' : ''}`}
                    onClick={() => setCompressMode(!compressMode)}
                    title="Compress to max. 4.9 MB (Lorenzonator)"
                  >
                    {compressMode ? '≤ 4.9 MB' : 'Compress'}
                  </button>
                  <div className="vp-bottom-spacer" />
                  <button
                    className="vp-create-btn"
                    onClick={handleExportClip}
                    disabled={exporting || clipDuration <= 0}
                  >
                    {exporting ? 'Exporting...' : 'Export MP4'}
                  </button>
                </>
              )}

              {/* GIF MODE */}
              {mode === 'gif' && (
                <>
                  <div className="vp-settings-row">
                    <div className="vp-setting-item">
                      <label>FPS</label>
                      <input type="number" value={gifFps}
                        onChange={(e) => setGifFps(parseInt(e.target.value) || 10)}
                        min="1" max="30"
                      />
                    </div>
                    <div className="vp-setting-item">
                      <label>Width</label>
                      <input type="number" value={gifWidth}
                        onChange={(e) => setGifWidth(parseInt(e.target.value) || 480)}
                        min="100" max="1920" step="10"
                      />
                      <span className="vp-unit">px</span>
                    </div>
                    <div className="vp-setting-item">
                      <label>Quality</label>
                      <select value={gifQuality}
                        onChange={(e) => setGifQuality(parseInt(e.target.value))}
                      >
                        <option value={256}>MAX</option>
                        <option value={128}>MID</option>
                        <option value={32}>LOW</option>
                      </select>
                    </div>
                  </div>
                  <div className="vp-bottom-spacer" />
                  <button
                    className="vp-create-btn"
                    onClick={handleExportGif}
                    disabled={gifExporting || clipDuration <= 0}
                  >
                    {gifExporting ? 'Creating GIF...' : 'Create GIF'}
                  </button>
                </>
              )}

              {/* STILL MODE */}
              {mode === 'still' && (
                <>
                  <span style={{ color: '#888', fontSize: '13px' }}>
                    Navigate to the frame you want, then grab it at full resolution.
                  </span>
                  <div className="vp-bottom-spacer" />
                  <button
                    className="vp-create-btn"
                    onClick={handleScreenshot}
                    disabled={screenshotting}
                  >
                    {screenshotting ? 'Grabbing...' : 'Grab Frame'}
                  </button>
                </>
              )}
            </div>

            {/* Error messages */}
            {(exportError || gifError || screenshotError) && (
              <div className="vp-error">{exportError || gifError || screenshotError}</div>
            )}

            {/* Download success toast */}
            {downloadSuccess && (
              <div className="vp-download-success">{downloadSuccess}</div>
            )}

            {/* Clip result */}
            {mode === 'clip' && exportResult && (
              <div className="vp-result-bar">
                <span>Clip created ({formatSize(exportResult.size)})</span>
                <div className="vp-download-split" style={{ marginLeft: 'auto' }}>
                  <button
                    className="vp-result-download vp-split-main"
                    onClick={() => forceDownload(`${getApiBase()}${exportResult.clipUrl}`, exportResult.filename, () => setExportResult(null))}
                    title={downloadFolder ? `Save to: ${downloadFolder}` : 'Save to Downloads'}
                  >
                    DOWNLOAD
                  </button>
                  <button
                    className="vp-result-download vp-split-arrow"
                    onClick={() => setShowDownloadMenu(m => !m)}
                    title="Download options"
                  >
                    ▾
                  </button>
                  {showDownloadMenu && (
                    <div className="vp-download-menu">
                      <button
                        className="vp-download-menu-item"
                        onClick={() => handleSaveAs(`${getApiBase()}${exportResult.clipUrl}`, exportResult.filename, () => setExportResult(null))}
                      >
                        <span className="vp-dmenu-icon">📁</span> Save As…
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* GIF result */}
            {mode === 'gif' && gifResult && (
              <div className="vp-result-bar">
                <span>GIF created ({formatSize(gifResult.size)})</span>
                <div className="vp-download-split" style={{ marginLeft: 'auto' }}>
                  <button
                    className="vp-result-download vp-split-main"
                    onClick={() => {
                      const url = `${getApiBase()}${gifResult.gifUrl?.replace('/api', '') || ''}`;
                      forceDownload(url, gifResult.filename, () => setGifResult(null));
                    }}
                    title={downloadFolder ? `Save to: ${downloadFolder}` : 'Save to Downloads'}
                  >
                    DOWNLOAD
                  </button>
                  <button
                    className="vp-result-download vp-split-arrow"
                    onClick={() => setShowDownloadMenu(m => !m)}
                    title="Download options"
                  >
                    ▾
                  </button>
                  {showDownloadMenu && (
                    <div className="vp-download-menu">
                      <button
                        className="vp-download-menu-item"
                        onClick={() => {
                          const url = `${getApiBase()}${gifResult.gifUrl?.replace('/api', '') || ''}`;
                          handleSaveAs(url, gifResult.filename, () => setGifResult(null));
                        }}
                      >
                        <span className="vp-dmenu-icon">📁</span> Save As…
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Screenshot result removed — auto-downloads with shutter flash animation */}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
