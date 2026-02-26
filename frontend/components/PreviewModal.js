'use client';

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getApiBase } from '../lib/config';


// Platforms with reliable iframe embeds
const EMBEDDABLE = ['youtube', 'vimeo'];

/**
 * Extract embed URL from a link's source URL.
 * Only for platforms with reliable embed support.
 */
function getEmbedUrl(url, source) {
  if (!EMBEDDABLE.includes(source)) return null;

  try {
    const u = new URL(url);

    if (source === 'youtube') {
      let videoId = u.searchParams.get('v');
      if (!videoId && u.hostname === 'youtu.be') {
        videoId = u.pathname.slice(1);
      }
      if (!videoId) {
        const shortsMatch = u.pathname.match(/\/shorts\/([^/?]+)/);
        if (shortsMatch) videoId = shortsMatch[1];
      }
      if (videoId) {
        const start = u.searchParams.get('t') || '';
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0${start ? `&start=${parseInt(start)}` : ''}`;
      }
    }

    if (source === 'vimeo') {
      const match = u.pathname.match(/\/(\d+)/);
      if (match) {
        return `https://player.vimeo.com/video/${match[1]}?autoplay=1&title=0&byline=0&portrait=0`;
      }
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Extract Instagram embed URL from a post URL.
 * Returns embed URL for image-only posts (no downloaded video).
 */
function getInstagramEmbedUrl(url) {
  try {
    const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (match) {
      return `https://www.instagram.com/p/${match[2]}/embed/`;
    }
  } catch {}
  return null;
}

/**
 * Determine the best preview strategy for a link
 */
function getPreviewType(link) {
  // Downloaded video → play locally
  if (link.media_path && link.media_type === 'video') {
    return 'local-video';
  }
  // Downloaded image → show locally
  if (link.media_path && link.media_type === 'image') {
    return 'local-image';
  }
  // Embeddable platform (YouTube, Vimeo) → iframe
  if (getEmbedUrl(link.url, link.source)) {
    return 'embed';
  }
  // Instagram post without downloaded media → use Instagram embed (carousel support!)
  if (link.source === 'instagram' && getInstagramEmbedUrl(link.url)) {
    return 'instagram-embed';
  }
  // Upload image → show directly
  if (link.source === 'upload' && link.file_path && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(link.file_path)) {
    return 'local-image';
  }
  // Upload file (non-image) or no local media → show thumbnail + open link
  return 'thumbnail';
}

export default function PreviewModal({ link, onClose }) {
  const previewType = getPreviewType(link);
  const embedUrl = previewType === 'embed' ? getEmbedUrl(link.url, link.source) : null;
  const igEmbedUrl = previewType === 'instagram-embed' ? getInstagramEmbedUrl(link.url) : null;

  // Build thumbnail src
  const thumbSrc = link.local_thumbnail
    ? (link.source === 'upload'
      ? `${getApiBase()}/files/uploads/${link.local_thumbnail}`
      : `${getApiBase()}/files/thumbnails/${link.local_thumbnail}`)
    : link.thumbnail_url || null;

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const content = (
    <div className="preview-backdrop" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="preview-header">
          <div className="preview-title">{link.title || 'Preview'}</div>
          <div className="preview-header-actions">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="preview-open-btn"
              title="Open in new tab"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
            <button className="preview-close-btn" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="preview-content">
          {previewType === 'embed' && (
            <iframe
              src={embedUrl}
              className="preview-iframe"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              frameBorder="0"
            />
          )}

          {previewType === 'instagram-embed' && (
            <iframe
              src={igEmbedUrl}
              className="preview-iframe instagram-embed"
              frameBorder="0"
              scrolling="no"
              allowTransparency="true"
            />
          )}

          {previewType === 'local-video' && (
            <video
              src={`${getApiBase()}/files/media/${link.media_path}`}
              className="preview-video"
              controls
              autoPlay
            />
          )}

          {previewType === 'local-image' && (
            <img
              src={link.media_path
                ? `${getApiBase()}/files/media/${link.media_path}`
                : `${getApiBase()}/files/uploads/${link.file_path}`}
              alt={link.title || ''}
              className="preview-image"
            />
          )}

          {previewType === 'thumbnail' && (
            <div className="preview-thumbnail-view">
              {thumbSrc && (
                <img
                  src={thumbSrc}
                  alt={link.title || ''}
                  className="preview-thumb-large"
                />
              )}
              <div className="preview-thumb-actions">
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="preview-fallback-link">
                  Open on {link.source || 'source'}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
