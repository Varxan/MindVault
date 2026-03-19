#!/bin/bash
# MindVault — Patch installed app with latest source fixes
#
# Führe dieses Script aus deinem Mac-Terminal aus:
#   bash /DEIN/PFAD/ZU/MindVault/patch-installed-app.sh
#
# Danach MindVault neu starten!

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_BACKEND="/Applications/MindVault.app/Contents/Resources/backend/src"
APP_FRONTEND="/Applications/MindVault.app/Contents/Resources/frontend-standalone/.next/static/chunks"
APP_CSS="/Applications/MindVault.app/Contents/Resources/frontend-standalone/.next/static/css"
DIST_FRONTEND="$SCRIPT_DIR/dist/mac-arm64/MindVault.app/Contents/Resources/frontend-standalone/.next/static/chunks"
DIST_CSS="$SCRIPT_DIR/dist/mac-arm64/MindVault.app/Contents/Resources/frontend-standalone/.next/static/css"

if [ ! -d "$APP_BACKEND" ]; then
  echo "❌ MindVault.app not found in /Applications. Please install it first."
  exit 1
fi

echo "🔧 Patching MindVault in /Applications..."

# ── Backend fixes ──────────────────────────────────────────────────────────
cp "$SCRIPT_DIR/backend/src/ai.js"              "$APP_BACKEND/ai.js"
cp "$SCRIPT_DIR/backend/src/bot.js"             "$APP_BACKEND/bot.js"
cp "$SCRIPT_DIR/backend/src/supabase-poller.js" "$APP_BACKEND/supabase-poller.js"

# ── Frontend fixes ─────────────────────────────────────────────────────────
APP_PAGE="$APP_FRONTEND/app"
DIST_PAGE="$DIST_FRONTEND/app"
if [ -d "$APP_FRONTEND" ] && [ -d "$DIST_FRONTEND" ]; then
  cp "$DIST_FRONTEND/627-b968bf5a9870efe5.js"          "$APP_FRONTEND/627-b968bf5a9870efe5.js"
  cp "$DIST_PAGE/page-cc416b61b02bec00.js"              "$APP_PAGE/page-cc416b61b02bec00.js"
  FRONTEND_PATCHED="✅"
else
  FRONTEND_PATCHED="⚠️  (frontend chunk not found — skip)"
fi

if [ -d "$APP_CSS" ] && [ -d "$DIST_CSS" ]; then
  cp "$DIST_CSS/56ce6272ad07f819.css"                   "$APP_CSS/56ce6272ad07f819.css"
  CSS_PATCHED="✅"
else
  CSS_PATCHED="⚠️  (CSS file not found — skip)"
fi

echo ""
echo "✅ Patch applied! Changes:"
echo "   • ai.js           — CLIP timeout 30s→120s + text-only Anthropic fallback"
echo "   • bot.js          — Added missing space='eye' field"
echo "   • supabase-poller — Service-role key for polling (bypasses RLS) + 30s fallback"
echo "   • frontend JS     — loading='eager' + draggable=false (fixes scroll-jump & thumb-drag) $FRONTEND_PATCHED"
echo "   • frontend CSS    — -webkit-user-drag:none + pointer-events:none (fixes thumb-drag) $CSS_PATCHED"
echo ""
echo "Please restart MindVault to apply the changes."
