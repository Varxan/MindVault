#!/bin/bash
# Doppelklick zum Patchen der installierten MindVault App.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_BACKEND="/Applications/MindVault.app/Contents/Resources/backend/src"
APP_FRONTEND="/Applications/MindVault.app/Contents/Resources/frontend-standalone/.next/static/chunks"
APP_CSS="/Applications/MindVault.app/Contents/Resources/frontend-standalone/.next/static/css"
DIST_FRONTEND="$SCRIPT_DIR/dist/mac-arm64/MindVault.app/Contents/Resources/frontend-standalone/.next/static/chunks"
DIST_CSS="$SCRIPT_DIR/dist/mac-arm64/MindVault.app/Contents/Resources/frontend-standalone/.next/static/css"

echo ""
echo "================================================"
echo "  MindVault Patch"
echo "================================================"

if [ ! -d "$APP_BACKEND" ]; then
  echo ""
  echo "❌  MindVault.app nicht gefunden in /Applications."
  echo ""
  echo "    Alternative: Ziehe die fertige App manuell:"
  echo "    $SCRIPT_DIR/dist/mac-arm64/MindVault.app"
  echo "    → nach /Applications/ (Finder, 'Ersetzen' bestaetigen)"
  echo ""
  read -p "Druecke Enter zum Schliessen..."
  exit 1
fi

# Warn if MindVault is running
if pgrep -x "MindVault" > /dev/null 2>&1; then
  echo ""
  echo "⚠️   MindVault laeuft gerade!"
  echo "    Bitte MindVault zuerst beenden (Cmd+Q), dann erneut ausfuehren."
  echo ""
  read -p "Druecke Enter zum Schliessen..."
  exit 1
fi

echo ""
echo "🔧  Patche /Applications/MindVault.app ..."

cp "$SCRIPT_DIR/backend/src/ai.js"              "$APP_BACKEND/ai.js"
cp "$SCRIPT_DIR/backend/src/bot.js"             "$APP_BACKEND/bot.js"
cp "$SCRIPT_DIR/backend/src/supabase-poller.js" "$APP_BACKEND/supabase-poller.js"
cp "$SCRIPT_DIR/backend/src/routes.js"          "$APP_BACKEND/routes.js"
cp "$SCRIPT_DIR/backend/src/metadata.js"        "$APP_BACKEND/metadata.js"
echo "   ✅  Backend  (ai.js, bot.js, supabase-poller.js, routes.js, metadata.js)"

APP_PAGE="$APP_FRONTEND/app"
DIST_PAGE="$DIST_FRONTEND/app"
if [ -d "$APP_FRONTEND" ] && [ -d "$DIST_FRONTEND" ]; then
  cp "$DIST_FRONTEND/627-b968bf5a9870efe5.js" "$APP_FRONTEND/627-b968bf5a9870efe5.js"
  cp "$DIST_PAGE/page-cc416b61b02bec00.js"    "$APP_PAGE/page-cc416b61b02bec00.js"
  echo "   ✅  Frontend JS  (loading=eager, draggable=false, onDragStart)"
else
  echo "   ⚠️   Frontend JS nicht gefunden — uebersprungen"
fi

if [ -d "$APP_CSS" ] && [ -d "$DIST_CSS" ]; then
  cp "$DIST_CSS/56ce6272ad07f819.css" "$APP_CSS/56ce6272ad07f819.css"
  echo "   ✅  Frontend CSS  (-webkit-user-drag:none, pointer-events:none)"
else
  echo "   ⚠️   Frontend CSS nicht gefunden — uebersprungen"
fi

echo ""
echo "================================================"
echo "  ✅  Fertig! Starte MindVault neu."
echo "================================================"
echo ""
read -p "Druecke Enter zum Schliessen..."
