'use client';
import { useState } from 'react';

export default function WaitlistForm({ dark = false }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | success | error

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email) return;
    setState('loading');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? 'success' : 'error');
    } catch {
      setState('error');
    }
  }

  const inputStyle = {
    background: dark ? 'rgba(245,242,235,0.08)' : 'rgba(26,26,24,0.05)',
    border: `1px solid ${dark ? 'rgba(245,242,235,0.15)' : 'rgba(26,26,24,0.12)'}`,
    borderRadius: 10,
    padding: '11px 16px',
    fontSize: 14,
    color: dark ? 'rgba(245,242,235,0.7)' : '#1a1a18',
    fontFamily: 'inherit',
    outline: 'none',
    minWidth: 220,
  };

  const btnStyle = {
    background: '#C8861E',
    color: 'white',
    border: 'none',
    borderRadius: 10,
    padding: '11px 22px',
    fontSize: 14,
    fontWeight: 600,
    cursor: state === 'loading' ? 'default' : 'pointer',
    fontFamily: 'inherit',
    opacity: state === 'loading' ? 0.7 : 1,
    transition: 'opacity 0.15s',
    whiteSpace: 'nowrap',
  };

  if (state === 'success') {
    return (
      <p style={{ fontSize: 14, color: dark ? 'rgba(245,242,235,0.55)' : '#888880', marginTop: 4 }}>
        You're on the list — we'll be in touch.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
      <input
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="your@email.com"
        style={inputStyle}
      />
      <button type="submit" style={btnStyle} disabled={state === 'loading'}>
        {state === 'loading' ? 'Saving…' : 'Notify me'}
      </button>
      {state === 'error' && (
        <p style={{ width: '100%', textAlign: 'center', fontSize: 13, color: '#e05c5c', marginTop: 4 }}>
          Something went wrong. Please try again.
        </p>
      )}
    </form>
  );
}
