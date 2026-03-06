const API_BASE = 'http://localhost:3001/api';

// ── Keyboard shortcut handler ────────────────────────────────────────────────
// Cmd+Shift+E → save to Eye (silent, no popup)
// Cmd+Shift+M → save to Mind (silent, no popup)

chrome.commands.onCommand.addListener(async (command) => {
  const space = command === 'save-to-eye' ? 'eye' : 'mind';

  // "tabs" permission required to access tab.url / tab.title from service worker
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  try {
    const res = await fetch(`${API_BASE}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: tab.url,
        title: tab.title || '',
        space,
      }),
    });

    if (res.ok) {
      showBadge(tab.id, '✓', space === 'eye' ? '#3d3d7a' : '#3a6a3a');
    } else {
      showBadge(tab.id, '!', '#7a2a2a');
    }
  } catch {
    // MindVault not running
    showBadge(tab.id, '!', '#7a2a2a');
  }
});

// ── Badge helper ─────────────────────────────────────────────────────────────
// Uses chrome.alarms instead of setTimeout — service workers can be terminated
// before a setTimeout fires, alarms are persistent.

function showBadge(tabId, text, color) {
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });

  // Store tabId so the alarm handler can clear it
  chrome.storage.session.set({ badgeClearTabId: tabId });
  chrome.alarms.create('clearBadge', { delayInMinutes: 1 / 30 }); // ~2 seconds
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'clearBadge') {
    const data = await chrome.storage.session.get('badgeClearTabId');
    if (data.badgeClearTabId !== undefined) {
      chrome.action.setBadgeText({ text: '', tabId: data.badgeClearTabId });
      chrome.storage.session.remove('badgeClearTabId');
    }
  }
});
