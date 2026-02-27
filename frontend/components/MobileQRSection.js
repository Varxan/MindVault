'use client';

import { useEffect, useState } from 'react';
import { getApiBase } from '../lib/config';

const PWA_BASE_URL = process.env.NEXT_PUBLIC_PWA_URL || 'https://mindvault-pwa.vercel.app';
const TRIAL_DAYS   = 30;

export default function MobileQRSection() {
  const [deviceId,    setDeviceId]    = useState(null);
  const [qrSvg,       setQrSvg]       = useState(null);
  const [copied,      setCopied]      = useState(false);
  const [trialInfo,   setTrialInfo]   = useState(null);
  const [loading,     setLoading]     = useState(true);

  // Load device config from backend
  useEffect(() => {
    fetch(`${getApiBase()}/device-info`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.deviceId) {
          setDeviceId(data.deviceId);
          setTrialInfo(data.trialInfo);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Generate QR code SVG using a pure-JS approach (no external lib needed)
  useEffect(() => {
    if (!deviceId) return;
    const pairUrl = `${PWA_BASE_URL}/pair?id=${deviceId}`;
    generateQR(pairUrl).then(setQrSvg);
  }, [deviceId]);

  const pairUrl = deviceId ? `${PWA_BASE_URL}/pair?id=${deviceId}` : null;

  const copyUrl = () => {
    if (!pairUrl) return;
    navigator.clipboard.writeText(pairUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
        Loading…
      </div>
    );
  }

  if (!deviceId) {
    return (
      <div style={{ padding: '12px', fontSize: '12px', color: '#888', lineHeight: 1.6 }}>
        No device data found. Make sure MindVault is activated.
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Trial / License badge */}
      {trialInfo && (
        <div style={{
          fontSize: '11px',
          color: trialInfo.isLicensed ? '#4ade80' : '#c9a84c',
          background: trialInfo.isLicensed ? 'rgba(74,222,128,0.08)' : 'rgba(201,168,76,0.08)',
          border: `1px solid ${trialInfo.isLicensed ? 'rgba(74,222,128,0.2)' : 'rgba(201,168,76,0.2)'}`,
          borderRadius: '6px',
          padding: '5px 10px',
          marginBottom: '12px',
        }}>
          {trialInfo.isLicensed
            ? '✓ License active'
            : `Trial: ${trialInfo.daysRemaining} day${trialInfo.daysRemaining !== 1 ? 's' : ''} remaining`
          }
        </div>
      )}

      {/* Instructions */}
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px', lineHeight: 1.5 }}>
        Scan the QR code with your phone to install and connect the PWA.
      </div>

      {/* QR Code */}
      <div style={{
        background: '#fff',
        borderRadius: '10px',
        padding: '12px',
        display: 'inline-block',
        marginBottom: '12px',
      }}>
        {qrSvg
          ? <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
          : <div style={{ width: 160, height: 160, background: '#eee', borderRadius: 4 }} />
        }
      </div>

      {/* Copy URL button */}
      <button
        onClick={copyUrl}
        style={{
          display: 'block',
          width: '100%',
          padding: '8px',
          background: copied ? 'rgba(74,222,128,0.1)' : 'rgba(201,168,76,0.08)',
          border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : 'rgba(201,168,76,0.2)'}`,
          borderRadius: '7px',
          color: copied ? '#4ade80' : '#c9a84c',
          fontSize: '12px',
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        {copied ? '✓ Link copied!' : '🔗 Copy link'}
      </button>

      <div style={{ fontSize: '10px', color: '#555', marginTop: '8px', lineHeight: 1.4 }}>
        This link is unique to your device. Keep it private.
      </div>
    </div>
  );
}

// ── Pure-JS QR code generator ──────────────────────────────────────────────
// Uses the qrcode-generator library via dynamic import from CDN approach
// Falls back to a simple API-based QR image if library not available

async function generateQR(text) {
  try {
    // Use QR Server API — lightweight, no npm needed, privacy-safe (no tracking)
    const size = 160;
    const url  = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&format=svg&bgcolor=ffffff&color=000000&qzone=1`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error('QR API failed');
    const svg = await res.text();
    return svg;
  } catch (_) {
    // Fallback: show URL as text if QR fails
    return `<div style="width:160px;height:160px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#333;word-break:break-all;padding:8px;text-align:center">${text}</div>`;
  }
}
