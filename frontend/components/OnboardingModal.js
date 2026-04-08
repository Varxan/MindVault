'use client';

import { useState } from 'react';
import MobileQRSection from './MobileQRSection';
import { getApiBase } from '../lib/config';

const TOTAL_STEPS = 7;

export default function OnboardingModal({ onComplete }) {
  const [step, setStep] = useState(1);
  const [telegramToken, setTelegramToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [wantsTelegram, setWantsTelegram] = useState(null); // null = not answered, true/false
  const [apiKey, setApiKey] = useState('');
  const [apiProvider, setApiProvider] = useState('openai');
  const [savingApi, setSavingApi] = useState(false);
  const [apiSaved, setApiSaved] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const progress = ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  const saveSetting = async (key, value) => {
    await fetch(`${getApiBase()}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
  };

  const handleFinish = async () => {
    await saveSetting('onboarding_complete', 'true');
    onComplete?.();
  };

  const handleSaveTelegram = async () => {
    if (!telegramToken.trim()) return;
    setSavingToken(true);
    try {
      await saveSetting('telegram_bot_token', telegramToken.trim());
      setTokenSaved(true);
    } catch {}
    setSavingToken(false);
  };

  const handleSaveApi = async () => {
    if (!apiKey.trim()) return;
    setSavingApi(true);
    try {
      const keyField = apiProvider === 'openai' ? 'openai_api_key' : 'anthropic_api_key';
      await saveSetting(keyField, apiKey.trim());
      await saveSetting('preferred_ai_provider', apiProvider);
      setApiSaved(true);
    } catch {}
    setSavingApi(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <style>{`
        .ob-modal {
          width: 100%; max-width: 520px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          overflow: hidden;
          display: flex; flex-direction: column;
        }
        .ob-progress-bar {
          height: 2px;
          background: var(--border);
          flex-shrink: 0;
        }
        .ob-progress-fill {
          height: 100%;
          background: #c8a84b;
          transition: width 0.4s ease;
        }
        .ob-body {
          padding: 40px 40px 32px;
          flex: 1;
        }
        .ob-step-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #c8a84b;
          margin-bottom: 10px;
        }
        .ob-title {
          font-family: var(--font-display);
          font-size: 22px;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 10px;
          line-height: 1.2;
        }
        .ob-desc {
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.65;
          margin-bottom: 24px;
        }
        .ob-footer {
          padding: 20px 40px 28px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid var(--border);
        }
        .ob-btn-primary {
          background: #c8a84b;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          padding: 10px 24px;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .ob-btn-primary:hover { opacity: 0.85; }
        .ob-btn-skip {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 12px;
          cursor: pointer;
          padding: 4px 0;
          transition: color 0.15s;
        }
        .ob-btn-skip:hover { color: var(--text); }
        .ob-input {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-size: 13px;
          padding: 10px 14px;
          outline: none;
          font-family: monospace;
          box-sizing: border-box;
          margin-bottom: 10px;
        }
        .ob-input:focus { border-color: #c8a84b; }
        .ob-input::placeholder { color: var(--text-muted); font-family: var(--font-body); }
        .ob-saved-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(72, 199, 142, 0.12);
          color: #48c78e;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          padding: 5px 10px;
          margin-top: 4px;
        }
        .ob-instruction-list {
          list-style: none;
          padding: 0; margin: 0 0 18px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .ob-instruction-list li {
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 12px; color: var(--text-muted); line-height: 1.5;
        }
        .ob-step-num {
          flex-shrink: 0;
          width: 18px; height: 18px;
          border-radius: 50%;
          background: rgba(200,168,75,0.15);
          color: #c8a84b;
          font-size: 9px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          margin-top: 1px;
        }
        .ob-provider-tabs {
          display: flex; gap: 8px; margin-bottom: 14px;
        }
        .ob-provider-tab {
          flex: 1; padding: 8px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg);
          color: var(--text-muted);
          font-size: 12px; font-weight: 500;
          cursor: pointer; text-align: center;
          transition: all 0.15s;
        }
        .ob-provider-tab.active {
          border-color: #c8a84b;
          background: rgba(200,168,75,0.1);
          color: #c8a84b;
        }
        .ob-backup-info {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px 16px;
          margin-bottom: 16px;
          display: flex; align-items: flex-start; gap: 12px;
        }
        .ob-backup-icon {
          font-size: 20px; flex-shrink: 0; margin-top: 2px;
        }
        .ob-backup-text { font-size: 12px; color: var(--text-muted); line-height: 1.55; }
        .ob-backup-text strong { color: var(--text); font-weight: 600; }
      `}</style>

      <div className="ob-modal">
        {/* Progress bar */}
        <div className="ob-progress-bar">
          <div className="ob-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* ── Step 1: Welcome ── */}
        {step === 1 && (
          <>
            <div className="ob-body">
              <div className="ob-step-label">Step 1 of {TOTAL_STEPS}</div>
              <div className="ob-title">Welcome to MindVault</div>
              <div className="ob-desc">
                MindVault is your personal visual reference library, built for filmmakers, directors, and creative professionals.<br /><br />
                It has two spaces:
              </div>
              <div className="ob-backup-info" style={{marginBottom: 12}}>
                <div className="ob-backup-text">
                  <strong>Eye</strong><br />
                  For visual inspiration: images, stills, clips, moods. The AI analyzes your content visually and tags it based on what it sees.
                </div>
              </div>
              <div className="ob-backup-info" style={{marginBottom: 16}}>
                <div className="ob-backup-text">
                  <strong>Mind</strong><br />
                  For knowledge: articles, tutorials, references. The AI goes deeper and also analyzes the actual content, not just what it looks like.
                </div>
              </div>
              <div className="ob-desc" style={{marginBottom: 0}}>
                Everything is stored locally on your machine. Nothing leaves your computer unless you choose to back it up.
              </div>
            </div>
            <div className="ob-footer">
              <span />
              <button className="ob-btn-primary" onClick={() => setStep(2)}>Get Started →</button>
            </div>
          </>
        )}

        {/* ── Step 2: Connect Phone (PWA) ── */}
        {step === 2 && (
          <>
            <div className="ob-body">
              <div className="ob-step-label">Step 2 of {TOTAL_STEPS}</div>
              <div className="ob-title">Connect your phone</div>
              <div className="ob-desc">
                MindVault has a companion mobile app (PWA). Scan the QR code below to install it on your phone, no App Store needed.
              </div>
              <MobileQRSection />
              <div className="ob-backup-info" style={{marginTop: 16}}>
                <span className="ob-backup-icon" style={{fontSize: 11, fontWeight: 600, color: '#c8a84b'}}>tip</span>
                <div className="ob-backup-text">
                  <strong>Tip: Add MindVault to your share favorites</strong><br />
                  On your phone, open any content and tap the <strong>Share</strong> button. Find MindVault in the app row — on iOS tap <strong>More</strong> to add it to favorites, on Android long-press to pin it. This way MindVault always shows up first when you share something.
                </div>
              </div>
            </div>
            <div className="ob-footer">
              <button className="ob-btn-skip" onClick={() => setStep(3)}>Skip for now</button>
              <button className="ob-btn-primary" onClick={() => setStep(3)}>Connected →</button>
            </div>
          </>
        )}

        {/* ── Step 3: Telegram Bot (Optional) ── */}
        {step === 3 && (
          <>
            <div className="ob-body">
              <div className="ob-step-label">Step 3 of {TOTAL_STEPS} (Optional)</div>
              <div className="ob-title">Save links via Telegram</div>
              {wantsTelegram === null ? (
                <>
                  <div className="ob-desc">
                    You can connect a Telegram bot to send links directly to MindVault from any device. This is completely optional.
                  </div>
                  <div className="ob-desc" style={{fontWeight: 600, color: 'var(--text)', marginBottom: 16}}>
                    Do you want to set up a Telegram bot?
                  </div>
                  <div style={{display: 'flex', gap: 10}}>
                    <button
                      className="ob-btn-primary"
                      style={{flex: 1, background: 'rgba(200,168,75,0.15)', color: '#c8a84b'}}
                      onClick={() => setWantsTelegram(true)}
                    >
                      Yes, set it up
                    </button>
                    <button
                      className="ob-btn-primary"
                      style={{flex: 1, background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)'}}
                      onClick={() => setStep(4)}
                    >
                      No, skip this
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ob-desc">
                    Great! Follow these steps to create your bot:
                  </div>
                  <ul className="ob-instruction-list">
                    <li>
                      <span className="ob-step-num">1</span>
                      <span>Open Telegram and search for <strong style={{color:'var(--text)'}}>@BotFather</strong></span>
                    </li>
                    <li>
                      <span className="ob-step-num">2</span>
                      <span>Send <code style={{background:'var(--bg)',padding:'1px 5px',borderRadius:'4px',fontSize:'11px'}}>/newbot</code> and follow the prompts</span>
                    </li>
                    <li>
                      <span className="ob-step-num">3</span>
                      <span>Copy the token and paste it below</span>
                    </li>
                    <li>
                      <span className="ob-step-num">4</span>
                      <span>Open your bot in Telegram and send <code style={{background:'var(--bg)',padding:'1px 5px',borderRadius:'4px',fontSize:'11px'}}>/start</code></span>
                    </li>
                  </ul>
                  <input
                    className="ob-input"
                    type="text"
                    placeholder="Paste your bot token here..."
                    value={telegramToken}
                    onChange={e => setTelegramToken(e.target.value)}
                  />
                  {tokenSaved ? (
                    <div className="ob-saved-badge">✓ Bot connected successfully</div>
                  ) : (
                    <button
                      className="ob-btn-primary"
                      style={{ fontSize: '12px', padding: '8px 18px' }}
                      onClick={handleSaveTelegram}
                      disabled={savingToken || !telegramToken.trim()}
                    >
                      {savingToken ? 'Connecting…' : 'Connect Bot'}
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="ob-footer">
              {wantsTelegram !== null ? (
                <>
                  <button className="ob-btn-skip" onClick={() => setStep(4)}>Skip</button>
                  <button className="ob-btn-primary" onClick={() => setStep(4)}>
                    {tokenSaved ? 'Next →' : 'Continue →'}
                  </button>
                </>
              ) : <span />}
            </div>
          </>
        )}

        {/* ── Step 4: Backup & Terms ── */}
        {step === 4 && (
          <>
            <div className="ob-body">
              <div className="ob-step-label">Step 4 of {TOTAL_STEPS}</div>
              <div className="ob-title">Your data, your control</div>
              <div className="ob-desc">
                All your links, tags, and media are stored <strong style={{color:'var(--text)'}}>locally on your Mac</strong>. Nothing is sent to any server by default.
              </div>
              <div className="ob-backup-info">
                <span className="ob-backup-icon" style={{fontSize: 14, color: 'var(--text-muted)', fontFamily: 'var(--font-body)'}}>—</span>
                <div className="ob-backup-text">
                  <strong>Local storage</strong><br />
                  Your database lives in <code style={{fontSize:'10px'}}>~/Library/Application Support/mindvault/</code>. It&apos;s yours. You can open, copy, or migrate it anytime.
                </div>
              </div>
              <div className="ob-backup-info">
                <span className="ob-backup-icon" style={{fontSize: 14, color: 'var(--text-muted)', fontFamily: 'var(--font-body)'}}>—</span>
                <div className="ob-backup-text">
                  <strong>Cloud Backup (optional)</strong><br />
                  Point MindVault to a folder inside your Google Drive, iCloud, or Dropbox and it will automatically save backups there. Set this up in <strong>Settings → Backup Path</strong> at any time.
                </div>
              </div>
              <div className="ob-backup-info" style={{borderColor: 'rgba(200,168,75,0.3)', background: 'rgba(200,168,75,0.05)'}}>
                <span className="ob-backup-icon" style={{fontSize: 14, color: '#c8a84b', fontFamily: 'var(--font-body)'}}>—</span>
                <div className="ob-backup-text">
                  <strong>Please note</strong><br />
                  MindVault stores everything locally on your computer. While we do our best to keep your data safe, we cannot guarantee against data loss. We strongly recommend setting up a cloud backup. By continuing, you acknowledge that you are responsible for backing up your own data.
                </div>
              </div>
              {!termsAccepted && (
                <button
                  className="ob-btn-primary"
                  style={{width: '100%', marginTop: 8}}
                  onClick={() => setTermsAccepted(true)}
                >
                  I understand, let&apos;s go
                </button>
              )}
              {termsAccepted && (
                <div className="ob-saved-badge" style={{marginTop: 8}}>✓ Accepted</div>
              )}
            </div>
            <div className="ob-footer">
              <span />
              <button
                className="ob-btn-primary"
                onClick={() => setStep(5)}
                disabled={!termsAccepted}
                style={{opacity: termsAccepted ? 1 : 0.4, cursor: termsAccepted ? 'pointer' : 'not-allowed'}}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {/* ── Step 5: AI Tagging ── */}
        {step === 5 && (
          <>
            <div className="ob-body">
              <div className="ob-step-label">Step 5 of {TOTAL_STEPS}</div>
              <div className="ob-title">Smart tagging with AI</div>
              <div className="ob-desc">
                MindVault automatically tags your saved content using AI. You can use the <strong style={{color:'var(--text)'}}>local CLIP model</strong> (no internet, no key needed) or connect an API for more powerful tagging.
              </div>
              <div className="ob-backup-info" style={{marginBottom: 20}}>
                <span className="ob-backup-icon" style={{fontSize: 14, color: 'var(--text-muted)', fontFamily: 'var(--font-body)'}}>—</span>
                <div className="ob-backup-text">
                  <strong>Local CLIP</strong> works offline, no cost, good quality. Runs on your machine.<br />
                  <strong>API (OpenAI / Anthropic)</strong> higher accuracy, custom tags, video understanding.
                </div>
              </div>
              <div className="ob-provider-tabs">
                <div className={`ob-provider-tab${apiProvider==='openai'?' active':''}`} onClick={()=>setApiProvider('openai')}>OpenAI</div>
                <div className={`ob-provider-tab${apiProvider==='anthropic'?' active':''}`} onClick={()=>setApiProvider('anthropic')}>Anthropic</div>
              </div>
              <input
                className="ob-input"
                type="password"
                placeholder={apiProvider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              {apiSaved ? (
                <div className="ob-saved-badge">✓ API key saved</div>
              ) : (
                <button
                  className="ob-btn-primary"
                  style={{ fontSize: '12px', padding: '8px 18px' }}
                  onClick={handleSaveApi}
                  disabled={savingApi || !apiKey.trim()}
                >
                  {savingApi ? 'Saving…' : 'Save API Key'}
                </button>
              )}
            </div>
            <div className="ob-footer">
              <button className="ob-btn-skip" onClick={() => setStep(6)}>Use local CLIP only</button>
              <button className="ob-btn-primary" onClick={() => setStep(6)}>Next →</button>
            </div>
          </>
        )}

        {/* ── Step 6: Chrome Extension ── */}
        {step === 6 && (
          <>
            <div className="ob-body">
              <div className="ob-step-label">Step 6 of {TOTAL_STEPS}</div>
              <div className="ob-title">Browser Extension</div>
              <div className="ob-desc">
                The MindVault browser extension lets you save any page, image, or video to your library with one click, without leaving your browser.
              </div>
              <div className="ob-backup-info" style={{marginBottom: 12}}>
                <span className="ob-backup-icon" style={{fontSize: 14, color: 'var(--text-muted)', fontFamily: 'var(--font-body)'}}>—</span>
                <div className="ob-backup-text">
                  <strong>Chrome &amp; Edge</strong><br />
                  Click the button below to install the extension. After installing, pin it to your toolbar for quick access. Use <strong>⌘⇧E</strong> (Eye) or <strong>⌘⇧M</strong> (Mind) to save pages instantly.
                </div>
              </div>
              <button
                className="ob-btn-primary"
                style={{width: '100%', marginBottom: 12, padding: '12px 24px'}}
                onClick={() => {
                  window.open('https://chromewebstore.google.com/detail/mindvault/nbpidmgodflgpbjjfkahailfaaogfoln', '_blank');
                }}
              >
                Download Browser Extension
              </button>
              <div style={{fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'center'}}>
                Works with Chrome, Edge, Brave, and other Chromium browsers.
              </div>
            </div>
            <div className="ob-footer">
              <button className="ob-btn-skip" onClick={() => setStep(7)}>Skip for now</button>
              <button className="ob-btn-primary" onClick={() => setStep(7)}>Next →</button>
            </div>
          </>
        )}

        {/* ── Step 7: Done ── */}
        {step === 7 && (
          <>
            <div className="ob-body" style={{textAlign:'center', paddingTop: 52}}>
              <div className="ob-title" style={{textAlign:'center'}}>You&apos;re all set</div>
              <div className="ob-desc" style={{textAlign:'center'}}>
                MindVault is ready. Start saving links, building collections, and let AI tag your references automatically.<br /><br />
                You can change any of these settings at any time from the <strong style={{color:'var(--text)'}}>Settings panel</strong>.
              </div>
            </div>
            <div className="ob-footer" style={{justifyContent:'center'}}>
              <button className="ob-btn-primary" style={{padding:'12px 40px', fontSize:'14px'}} onClick={handleFinish}>
                Start using MindVault →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
