'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './GifCreatorModal.module.css';
import { getApiBase } from '../lib/config';


export default function GifCreatorModal({ link, onClose, onGifCreated }) {
  const videoRef = useRef(null);
  const timelineRef = useRef(null);

  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(5);
  const [fps, setFps] = useState(25);
  const [width, setWidth] = useState(480);
  const [compression, setCompression] = useState(256); // max colors: 32, 64, 128, 256
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gifs, setGifs] = useState([]);
  const [showGifList, setShowGifList] = useState(false);
  const [dragging, setDragging] = useState(null); // 'playhead', 'start', 'end'
  const [isPlaying, setIsPlaying] = useState(false);

  // Fetch video info on mount
  useEffect(() => {
    fetchVideoInfo();
    // Lock body scroll
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [link.id]);

  async function fetchVideoInfo() {
    try {
      const response = await fetch(`${getApiBase()}/links/${link.id}/video-info`);
      const data = await response.json();
      if (data.hasVideo && data.videoDuration) {
        setVideoDuration(data.videoDuration);
        setEndTime(Math.min(5, data.videoDuration));
      }
      if (data.gifs && data.gifs.length > 0) {
        setGifs(data.gifs);
      }
    } catch (err) {
      console.error('Error fetching video info:', err);
      setError('Could not load video information');
    }
  }

  // Video time update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Seek video to specific time
  const seekTo = useCallback((time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  // Play/Pause toggle
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Step frame by frame (approx ~1/30s)
  const stepFrame = (direction) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setIsPlaying(false);
    const step = 1 / 30;
    const newTime = Math.max(0, Math.min(videoDuration, currentTime + direction * step));
    seekTo(newTime);
  };

  // ── SET IN / OUT with current playhead ──
  const setInPoint = () => setStartTime(currentTime);
  const setOutPoint = () => setEndTime(currentTime);

  // ── Timeline interactions ──
  const getTimeFromEvent = useCallback((e) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return (pos / rect.width) * videoDuration;
  }, [videoDuration]);

  const handleTimelineClick = (e) => {
    // Ignore if we were dragging a marker
    if (dragging) return;
    const time = getTimeFromEvent(e);
    seekTo(time);
  };

  // Drag handlers for playhead, start marker, end marker
  const handlePlayheadDown = (e) => {
    e.stopPropagation();
    setDragging('playhead');
  };
  const handleStartDown = (e) => {
    e.stopPropagation();
    setDragging('start');
  };
  const handleEndDown = (e) => {
    e.stopPropagation();
    setDragging('end');
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const time = getTimeFromEvent(e);
    if (dragging === 'playhead') {
      seekTo(time);
    } else if (dragging === 'start') {
      if (time < endTime) setStartTime(time);
    } else if (dragging === 'end') {
      if (time > startTime) setEndTime(time);
    }
  }, [dragging, startTime, endTime, getTimeFromEvent, seekTo]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      switch (e.key) {
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
        case 'i':
        case 'I':
          e.preventDefault();
          setInPoint();
          break;
        case 'o':
        case 'O':
          e.preventDefault();
          setOutPoint();
          break;
        case 'Escape':
          onClose();
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentTime, isPlaying, togglePlay, stepFrame, setInPoint, setOutPoint, onClose]);

  // ── Create GIF ──
  const handleCreateGif = async () => {
    if (startTime >= endTime) {
      setError('IN point must be before OUT point');
      return;
    }
    if (endTime - startTime > 120) {
      setError('GIF duration can be max. 120 seconds');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBase()}/links/${link.id}/create-gif`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: Math.round(startTime * 100) / 100,
          endTime: Math.round(endTime * 100) / 100,
          fps,
          width,
          colors: compression,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Creation failed');

      setGifs([data.gif, ...gifs]);
      setShowGifList(true);
      onGifCreated?.(data.gif);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGif = async (filename) => {
    if (!confirm('Delete this GIF?')) return;
    try {
      const res = await fetch(`${getApiBase()}/gifs/${filename}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      setGifs(gifs.filter(g => g.filename !== filename));
    } catch (err) {
      setError(err.message);
    }
  };

  // Download via native browser anchor — shows in Chrome download bar, deletes backend copy after streaming
  const forceDownload = (gif) => {
    const baseName = gif.filename;
    const downloadUrl = `${getApiBase()}/download-file/gifs/${baseName}`;

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = gif.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Remove from list — server deletes backend copy after stream completes
    setGifs(prev => prev.filter(g => g.filename !== gif.filename));
  };

  // Preview the selected range
  const previewRange = () => {
    seekTo(startTime);
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
      // Stop at out point
      const checkEnd = setInterval(() => {
        if (videoRef.current && videoRef.current.currentTime >= endTime) {
          videoRef.current.pause();
          setIsPlaying(false);
          clearInterval(checkEnd);
        }
      }, 50);
    }
  };

  const duration = endTime - startTime;
  const pct = (t) => videoDuration > 0 ? `${(t / videoDuration) * 100}%` : '0%';

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.workspace} onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2>GIF Creator</h2>
            {link.title && <span className={styles.headerTitle}>{link.title}</span>}
          </div>
          <div className={styles.headerRight}>
            <span className={styles.shortcutHint}>
              I = Set IN &nbsp; O = Set OUT &nbsp; Space = Play/Pause &nbsp; ← → = Frame
            </span>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Main area: Video + Controls ── */}
        <div className={styles.main}>

          {/* Video */}
          <div className={styles.videoContainer}>
            <video
              ref={videoRef}
              className={styles.video}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => {
                if (!videoDuration) {
                  setVideoDuration(e.target.duration);
                  setEndTime(Math.min(5, e.target.duration));
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            >
              {link.media_path && (
                <source src={`${getApiBase()}/files/media/${link.media_path}`} type="video/mp4" />
              )}
            </video>

            {/* Timecode overlay */}
            <div className={styles.timecodeOverlay}>
              {formatTimecode(currentTime)} / {formatTimecode(videoDuration)}
            </div>
          </div>

          {/* ── Transport Controls ── */}
          <div className={styles.transport}>
            <button className={styles.transportBtn} onClick={() => stepFrame(-1)} title="Frame back">⏪</button>
            <button className={styles.transportBtn + ' ' + styles.playBtn} onClick={togglePlay} title="Play/Pause">
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className={styles.transportBtn} onClick={() => stepFrame(1)} title="Frame vor">⏩</button>
            <div className={styles.transportSpacer} />
            <button className={styles.transportBtn} onClick={() => seekTo(0)} title="Go to start">⏮</button>
            <button className={styles.transportBtn} onClick={() => seekTo(startTime)} title="Go to IN point">|◀</button>
            <button className={styles.transportBtn + ' ' + styles.previewBtn} onClick={previewRange} title="Preview IN→OUT">▶ Preview</button>
            <button className={styles.transportBtn} onClick={() => seekTo(endTime)} title="Go to OUT point">▶|</button>
            <button className={styles.transportBtn} onClick={() => seekTo(videoDuration)} title="Go to end">⏭</button>
          </div>

          {/* ── Timeline ── */}
          <div className={styles.timelineSection}>
            <div
              ref={timelineRef}
              className={styles.timeline}
              onClick={handleTimelineClick}
            >
              {/* Selected range (green area) */}
              <div
                className={styles.selectedRange}
                style={{ left: pct(startTime), right: `${100 - (endTime / videoDuration) * 100}%` }}
              />

              {/* IN marker */}
              <div
                className={`${styles.marker} ${styles.inMarker}`}
                style={{ left: pct(startTime) }}
                onMouseDown={handleStartDown}
                title={`IN: ${formatTimecode(startTime)}`}
              >
                <span className={styles.markerLabel}>IN</span>
              </div>

              {/* OUT marker */}
              <div
                className={`${styles.marker} ${styles.outMarker}`}
                style={{ left: pct(endTime) }}
                onMouseDown={handleEndDown}
                title={`OUT: ${formatTimecode(endTime)}`}
              >
                <span className={styles.markerLabel}>OUT</span>
              </div>

              {/* Playhead (orange/red line) */}
              <div
                className={styles.playhead}
                style={{ left: pct(currentTime) }}
                onMouseDown={handlePlayheadDown}
                title={formatTimecode(currentTime)}
              >
                <div className={styles.playheadHead} />
              </div>
            </div>
          </div>

          {/* ── IN/OUT Controls ── */}
          <div className={styles.inOutControls}>
            {/* Set IN */}
            <div className={styles.pointControl}>
              <button className={styles.setPointBtn + ' ' + styles.setInBtn} onClick={setInPoint}>
                Set IN
              </button>
              <div className={styles.pointTime}>
                <span className={styles.pointLabel}>IN</span>
                <input
                  type="number"
                  value={startTime.toFixed(2)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    if (val >= 0 && val < endTime) setStartTime(val);
                  }}
                  step="0.1"
                  min="0"
                  max={videoDuration}
                  className={styles.timeInput}
                />
              </div>
            </div>

            {/* Duration display */}
            <div className={styles.durationDisplay}>
              <span className={styles.durationLabel}>Duration</span>
              <span className={styles.durationValue}>{formatTimecode(duration)}</span>
            </div>

            {/* Set OUT */}
            <div className={styles.pointControl}>
              <button className={styles.setPointBtn + ' ' + styles.setOutBtn} onClick={setOutPoint}>
                Set OUT
              </button>
              <div className={styles.pointTime}>
                <span className={styles.pointLabel}>OUT</span>
                <input
                  type="number"
                  value={endTime.toFixed(2)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || videoDuration;
                    if (val > startTime && val <= videoDuration) setEndTime(val);
                  }}
                  step="0.1"
                  min="0"
                  max={videoDuration}
                  className={styles.timeInput}
                />
              </div>
            </div>
          </div>

          {/* ── Bottom bar: Settings + Create ── */}
          <div className={styles.bottomBar}>
            <div className={styles.settingsRow}>
              <div className={styles.settingItem}>
                <label>FPS</label>
                <input
                  type="number" value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value) || 10)}
                  min="1" max="30"
                />
              </div>
              <div className={styles.settingItem}>
                <label>Width</label>
                <input
                  type="number" value={width}
                  onChange={(e) => setWidth(parseInt(e.target.value) || 480)}
                  min="100" max="1920" step="10"
                />
                <span className={styles.unit}>px</span>
              </div>
              <div className={styles.settingItem}>
                <label>Quality</label>
                <select
                  value={compression}
                  onChange={(e) => setCompression(parseInt(e.target.value))}
                  className={styles.selectInput}
                >
                  <option value={256}>MAX</option>
                  <option value={128}>MID</option>
                  <option value={32}>LOW</option>
                </select>
              </div>
            </div>

            <button
              className={styles.createBtn}
              onClick={handleCreateGif}
              disabled={loading}
            >
              {loading ? 'Creating GIF...' : 'Create GIF'}
            </button>

            {/* GIF list toggle */}
            {gifs.length > 0 && (
              <button className={styles.gifToggle} onClick={() => setShowGifList(!showGifList)}>
                {showGifList ? '▼' : '▶'} {gifs.length} GIF{gifs.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {/* GIF List with Download Buttons */}
          {showGifList && gifs.length > 0 && (
            <div className={styles.gifList}>
              {gifs.map((gif) => (
                <div key={gif.filename} className={styles.gifItem}>
                  <span className={styles.gifName}>{gif.filename}</span>
                  <small>{formatSize(gif.size)}</small>
                  <button
                    className={styles.downloadBtn}
                    onClick={() => forceDownload(gif)}
                  >
                    Download
                  </button>
                  <button
                    className={styles.gifDeleteBtn}
                    onClick={() => handleDeleteGif(gif.filename)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

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
