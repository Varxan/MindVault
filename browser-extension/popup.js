const API_BASE = 'http://localhost:3001/api';

// ── Smart space detection based on URL ──────────────────────────────────────
// Visual / inspiration sites → EYE
// Knowledge / reference sites → MIND

const EYE_PATTERNS = [
  'instagram.com',
  'vimeo.com',
  'youtube.com',
  'youtu.be',
  'behance.net',
  'dribbble.com',
  'pinterest.com',
  'are.na',
  'flickr.com',
  'unsplash.com',
  'pexels.com',
  '500px.com',
  'tiktok.com',
  'artstation.com',
  'deviantart.com',
  'tumblr.com',
];

const MIND_PATTERNS = [
  'github.com',
  'stackoverflow.com',
  'medium.com',
  'substack.com',
  'notion.so',
  'wikipedia.org',
  'arxiv.org',
  'hackernews',
  'news.ycombinator.com',
  'reddit.com',
  'docs.',
  'developer.',
  'readthedocs',
  'npmjs.com',
  'pypi.org',
];

function detectSpace(url) {
  const lower = url.toLowerCase();
  if (MIND_PATTERNS.some(p => lower.includes(p))) return 'mind';
  if (EYE_PATTERNS.some(p => lower.includes(p))) return 'eye';
  return 'eye'; // default
}

// ── State ───────────────────────────────────────────────────────────────────

let selectedSpace = 'eye';
let currentTab = null;

function selectSpace(space) {
  selectedSpace = space;
  document.getElementById('btnEye').classList.toggle('active', space === 'eye');
  document.getElementById('btnMind').classList.toggle('active', space === 'mind');
}

// ── Init ────────────────────────────────────────────────────────────────────

async function init() {
  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Show page info
  document.getElementById('pageTitle').textContent = tab.title || tab.url;
  document.getElementById('pageUrl').textContent = new URL(tab.url).hostname;

  // Auto-detect space
  const detected = detectSpace(tab.url);
  selectSpace(detected);

  // Check if MindVault is running
  try {
    const res = await fetch(`${API_BASE.replace('/api', '')}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      document.getElementById('statusDot').classList.add('online');
    } else {
      showOffline();
    }
  } catch {
    showOffline();
  }
}

function showOffline() {
  document.getElementById('statusDot').classList.add('offline');
  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('stateOffline').style.display = 'block';
}

// ── Save ────────────────────────────────────────────────────────────────────

async function saveLink() {
  if (!currentTab) return;

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = 'Saving…';

  try {
    const res = await fetch(`${API_BASE}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: currentTab.url,
        title: currentTab.title || '',
        space: selectedSpace,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Show success
    document.getElementById('mainContent').style.display = 'none';
    const successEl = document.getElementById('stateSuccess');
    successEl.style.display = 'flex';
    document.getElementById('successSpace').textContent =
      selectedSpace === 'eye' ? 'Eye Space' : 'Mind Space';

    // Auto-close after 1.5s
    setTimeout(() => window.close(), 1500);

  } catch (err) {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = 'Save to MindVault';

    if (err.message.includes('fetch') || err.name === 'TimeoutError') {
      showOffline();
    } else {
      btn.textContent = 'Error — try again';
      setTimeout(() => { btn.textContent = 'Save to MindVault'; }, 2000);
    }
  }
}

// ── Event listeners (inline onclick blocked by MV3 CSP) ─────────────────────
document.getElementById('btnEye').addEventListener('click', () => selectSpace('eye'));
document.getElementById('btnMind').addEventListener('click', () => selectSpace('mind'));
document.getElementById('saveBtn').addEventListener('click', saveLink);

// ── Run ─────────────────────────────────────────────────────────────────────
init();
