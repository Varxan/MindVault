'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function PairContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const [status, setStatus] = useState('pairing'); // 'pairing' | 'success' | 'error' | 'already'

  useEffect(() => {
    const id = searchParams.get('id');

    if (!id || id.length < 10) {
      setStatus('error');
      return;
    }

    const existing = localStorage.getItem('mindvault_device_id');
    if (existing === id) {
      setStatus('already');
      setTimeout(() => router.replace('/library'), 1500);
      return;
    }

    // Store device ID
    localStorage.setItem('mindvault_device_id', id);
    setStatus('success');

    // Redirect to library after short delay
    setTimeout(() => router.replace('/library'), 2000);
  }, [searchParams, router]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0e0e0e',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
      padding: '20px',
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: '320px',
        width: '100%',
      }}>
        {/* Logo */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          width: '56px',
          height: '56px',
          margin: '0 auto 24px',
        }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              background: '#c9a84c',
              borderRadius: '5px',
            }} />
          ))}
        </div>

        <h1 style={{ color: '#fff', fontSize: '22px', fontWeight: 600, margin: '0 0 8px' }}>
          MindVault
        </h1>

        {status === 'pairing' && (
          <>
            <p style={{ color: '#888', fontSize: '14px', margin: '0 0 32px' }}>
              Establishing connection…
            </p>
            <Spinner />
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{
              width: '56px', height: '56px',
              background: 'rgba(74,222,128,0.12)',
              border: '2px solid rgba(74,222,128,0.4)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: '24px',
            }}>
              ✓
            </div>
            <p style={{ color: '#4ade80', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>
              Connected!
            </p>
            <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>
              Redirecting to your library…
            </p>
          </>
        )}

        {status === 'already' && (
          <>
            <p style={{ color: '#c9a84c', fontSize: '15px', fontWeight: 500, margin: '0 0 8px' }}>
              Already connected
            </p>
            <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>
              Redirecting to library…
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{
              width: '56px', height: '56px',
              background: 'rgba(220,60,60,0.12)',
              border: '2px solid rgba(220,60,60,0.3)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: '24px',
            }}>
              ✕
            </div>
            <p style={{ color: '#f87171', fontSize: '15px', fontWeight: 500, margin: '0 0 8px' }}>
              Invalid link
            </p>
            <p style={{ color: '#666', fontSize: '13px', margin: '0 0 24px' }}>
              Please scan the QR code again<br />from the MindVault desktop app.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: '28px', height: '28px',
      border: '2px solid #333',
      borderTopColor: '#c9a84c',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      margin: '0 auto',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function PairPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#0e0e0e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#888', fontSize: '14px' }}>Loading…</div>
      </div>
    }>
      <PairContent />
    </Suspense>
  );
}
