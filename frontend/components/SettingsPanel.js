'use client';

import { useState, useEffect } from 'react';
import { getApiBase } from '../lib/config';


export default function SettingsPanel({ isOpen, onClose, settingsStatus, onSettingsUpdate }) {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [preferredProvider, setPreferredProvider] = useState('local_clip');
  const [savingAnthropic, setSavingAnthropic] = useState(false);
  const [savingOpenai, setSavingOpenai] = useState(false);
  const [anthropicStatus, setAnthropicStatus] = useState(null); // null | 'ok' | 'error'
  const [openaiStatus, setOpenaiStatus] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setAnthropicKey('');
      setOpenaiKey('');
      setAnthropicStatus(null);
      setOpenaiStatus(null);
      if (settingsStatus?.preferred_ai_provider) {
        setPreferredProvider(settingsStatus.preferred_ai_provider);
      }
    }
  }, [isOpen]);

  const saveKey = async (key, value, setSaving, setStatus) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setSaving(true);
    setStatus(null);

    try {
      const res = await fetch(`${getApiBase()}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setStatus('ok');
      if (key === 'anthropic_api_key') setAnthropicKey('');
      if (key === 'openai_api_key') setOpenaiKey('');
      if (onSettingsUpdate) onSettingsUpdate();
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus('error:' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveProvider = async (provider) => {
    setPreferredProvider(provider);
    await fetch(`${getApiBase()}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'preferred_ai_provider', value: provider }),
    });
    if (onSettingsUpdate) onSettingsUpdate();
  };

  if (!isOpen) return null;

  return (
    <div className="sp-overlay" onClick={onClose}>
      <div className="sp-box" onClick={e => e.stopPropagation()}>

        <div className="sp-header">
          <span>AI Provider</span>
          <button className="sp-close" onClick={onClose}>✕</button>
        </div>

        {/* Provider toggle */}
        <div className="sp-provider-row">
          <button
            className={`sp-provider-btn ${preferredProvider === 'local_clip' ? 'active' : ''}`}
            onClick={() => saveProvider('local_clip')}
          >
            Local CLIP
            <span className="sp-dot connected"/>
          </button>
          <button
            className={`sp-provider-btn ${preferredProvider === 'anthropic' ? 'active' : ''}`}
            onClick={() => saveProvider('anthropic')}
          >
            Anthropic
            {settingsStatus?.anthropic_api_key ? <span className="sp-dot connected"/> : <span className="sp-dot"/>}
          </button>
          <button
            className={`sp-provider-btn ${preferredProvider === 'openai' ? 'active' : ''}`}
            onClick={() => saveProvider('openai')}
          >
            OpenAI
            {settingsStatus?.openai_api_key ? <span className="sp-dot connected"/> : <span className="sp-dot"/>}
          </button>
        </div>

        <div className="sp-divider"/>

        {preferredProvider === 'local_clip' && (
          <div style={{ textAlign: 'center', color: '#666', fontSize: '13px', padding: '20px 0' }}>
            ✓ Local CLIP enabled<br/>
            <span style={{ fontSize: '12px', opacity: 0.7 }}>Private, offline, no API key needed</span>
          </div>
        )}

        {preferredProvider !== 'local_clip' && (
          <>
            {/* Anthropic Key */}
            {preferredProvider === 'anthropic' && (
              <div className="settings-field">
                <label>Anthropic API Key</label>
                {settingsStatus?.anthropic_api_key && (
                  <span className="settings-field-masked">{settingsStatus.anthropic_api_key}</span>
                )}
                <div className="settings-field-row">
                  <input
                    type="password"
                    placeholder="sk-ant-..."
                    value={anthropicKey}
                    onChange={e => setAnthropicKey(e.target.value)}
                    disabled={savingAnthropic}
                  />
                  <button
                    disabled={!anthropicKey.trim() || savingAnthropic}
                    onClick={() => saveKey('anthropic_api_key', anthropicKey, setSavingAnthropic, setAnthropicStatus)}
                  >
                    {savingAnthropic ? '...' : 'Save'}
                  </button>
                </div>
                {anthropicStatus === 'ok' && <span className="sp-ok">✓ Saved</span>}
                {anthropicStatus?.startsWith('error') && <span className="sp-err">✕ {anthropicStatus.slice(6)}</span>}
                <span className="settings-field-hint">console.anthropic.com</span>
              </div>
            )}

            {preferredProvider === 'openai' && (
              <div className="settings-field">
                <label>OpenAI API Key</label>
                {settingsStatus?.openai_api_key && (
                  <span className="settings-field-masked">{settingsStatus.openai_api_key}</span>
                )}
                <div className="settings-field-row">
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={openaiKey}
                    onChange={e => setOpenaiKey(e.target.value)}
                    disabled={savingOpenai}
                  />
                  <button
                    disabled={!openaiKey.trim() || savingOpenai}
                    onClick={() => saveKey('openai_api_key', openaiKey, setSavingOpenai, setOpenaiStatus)}
                  >
                    {savingOpenai ? '...' : 'Save'}
                  </button>
                </div>
                {openaiStatus === 'ok' && <span className="sp-ok">✓ Saved</span>}
                {openaiStatus?.startsWith('error') && <span className="sp-err">✕ {openaiStatus.slice(6)}</span>}
                <span className="settings-field-hint">platform.openai.com/api-keys</span>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
