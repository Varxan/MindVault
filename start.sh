#!/bin/bash

# MindVault – Alles starten
# Dieses Script startet Backend, Frontend und ngrok gleichzeitig

echo ""
echo "🧠 MindVault wird gestartet..."
echo "================================"
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "⚠️  ngrok nicht gefunden. Installiere es mit: brew install ngrok"
    echo "   Ohne ngrok funktioniert der Telegram Webhook nicht."
    echo ""
fi

# Check if bot token is set
if grep -q "YOUR_TELEGRAM_BOT_TOKEN_HERE" backend/.env 2>/dev/null; then
    echo "⚠️  Telegram Bot Token noch nicht gesetzt!"
    echo "   1. Öffne Telegram und suche @BotFather"
    echo "   2. Sende /newbot und folge den Anweisungen"
    echo "   3. Kopiere den Token in backend/.env"
    echo ""
fi

# Start Backend
echo "📡 Backend starten (Port 3001)..."
cd backend && npm run dev &
BACKEND_PID=$!

# Wait for backend to start
sleep 2

# Start Frontend
echo "🎨 Frontend starten (Port 3000)..."
cd ../frontend && npm run dev &
FRONTEND_PID=$!

# Start ngrok
sleep 1
echo "🌐 ngrok starten (Tunnel zu Port 3001)..."
ngrok http 3001 &
NGROK_PID=$!

echo ""
echo "================================"
echo "✅ MindVault läuft!"
echo ""
echo "📊 Frontend:  http://localhost:3000"
echo "📡 Backend:   http://localhost:3001"
echo "🌐 ngrok:     http://localhost:4040 (Dashboard)"
echo ""
echo "Drücke Ctrl+C um alles zu stoppen."
echo "================================"
echo ""

# Wait and cleanup on exit
cleanup() {
    echo ""
    echo "🛑 MindVault wird gestoppt..."
    kill $BACKEND_PID $FRONTEND_PID $NGROK_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

wait
