'use client';

import { useState, useRef, useEffect } from 'react';
import { createLink } from '../lib/api';
import { getApiBase } from '../lib/config';


export default function AddLink({ onAdded }) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const fileInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    try {
      setUploading(true);
      await createLink({ url: url.trim(), note: note.trim() || undefined });
      setUrl('');
      setNote('');
      setShowForm(false);
      onAdded?.();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      if (note.trim()) formData.append('note', note.trim());

      const res = await fetch(`${getApiBase()}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      setNote('');
      setShowForm(false);
      onAdded?.();
    } catch (err) {
      alert('Upload error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // Keep a ref so the document-level drop handler always has fresh access to handleFileUpload
  const handleFileUploadRef = useRef(handleFileUpload);
  handleFileUploadRef.current = handleFileUpload;
  const setUrlRef = useRef(setUrl);
  setUrlRef.current = setUrl;
  const setShowFormRef = useRef(setShowForm);
  setShowFormRef.current = setShowForm;

  // Register drag events on document so they fire even with pointer-events: none overlays
  useEffect(() => {
    let dragDepth = 0;

    const onDragEnter = (e) => {
      // Only react to external drags (files or URLs), not internal element drags
      if (!e.dataTransfer) return;
      dragDepth++;
      setDragging(true);
    };

    const onDragLeave = (e) => {
      dragDepth--;
      if (dragDepth <= 0) {
        dragDepth = 0;
        setDragging(false);
      }
    };

    const onDragOver = (e) => {
      e.preventDefault(); // required to allow drop
    };

    const onDrop = (e) => {
      e.preventDefault();
      dragDepth = 0;
      setDragging(false);

      // URL dropped (e.g. dragged from address bar or another tab)
      const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        // Ignore internal thumbnail/file drags from within the app itself
        if (text.includes('localhost') && (text.includes('/thumbnails/') || text.includes('/files/'))) {
          return;
        }
        setUrlRef.current(text.trim());
        setShowFormRef.current(true);
        return;
      }

      // File dropped
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFileUploadRef.current(files[0]);
      }
    };

    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);

    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
    };
  }, []);

  return (
    <>
      {/* Drop Zone Overlay — always mounted, shown via CSS when dragging */}
      <div className={`drop-zone ${dragging ? 'active' : ''}`}>
        {dragging && (
          <div className="drop-zone-overlay">
            <div className="drop-zone-content">
              <div className="drop-icon">
                <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M26 38V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M14 26L26 14L38 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 42H42" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div>Drop link or file here</div>
            </div>
          </div>
        )}
      </div>

      {/* Add Button */}
      <button
        className="add-button"
        onClick={() => setShowForm(!showForm)}
        title="Add link or file"
      >
        {showForm ? '✕' : '+'}
      </button>

      {/* Add Form */}
      {showForm && (
        <div className="add-form-backdrop" onClick={() => setShowForm(false)}>
          <div className="add-form" onClick={(e) => e.stopPropagation()}>
            <h3>Add</h3>

            <form onSubmit={handleSubmit}>
              <input
                type="url"
                placeholder="Paste URL (https://...)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="add-input"
                autoFocus
              />

              <input
                type="text"
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="add-input"
              />

              <div className="add-actions">
                <button
                  type="submit"
                  className="add-submit"
                  disabled={!url.trim() || uploading}
                >
                  {uploading ? 'Saving...' : 'Save link'}
                </button>

                <span className="add-divider">or</span>

                <button
                  type="button"
                  className="add-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{display:'inline',verticalAlign:'middle',marginRight:'5px',marginTop:'-1px'}}>
                    <path d="M7 10V2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M3.5 6L7 2.5L10.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M1.5 12H12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Upload file
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,.pdf"
                  onChange={(e) => handleFileUpload(e.target.files[0])}
                  style={{ display: 'none' }}
                />
              </div>
            </form>

            <div className="add-hint">
              Tip: You can also drag & drop links or files onto the page.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
