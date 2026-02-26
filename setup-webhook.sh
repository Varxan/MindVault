#!/bin/bash

# MindVault – Telegram Webhook Setup
# Setzt den Telegram Webhook auf die aktuelle ngrok URL

echo ""
echo "🔗 Telegram Webhook Setup"
echo "========================="
echo ""

# Check for bot token
source backend/.env 2>/dev/null

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ "$TELEGRAM_BOT_TOKEN" = "YOUR_TELEGRAM_BOT_TOKEN_HERE" ]; then
    echo "❌ Kein Bot Token gefunden!"
    echo "   Trage deinen Token in backend/.env ein."
    exit 1
fi

# Get ngrok URL
echo "📡 Hole ngrok URL..."
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | cut -d'"' -f4)

if [ -z "$NGROK_URL" ]; then
    echo "❌ ngrok läuft nicht!"
    echo "   Starte ngrok mit: ngrok http 3001"
    exit 1
fi

echo "🌐 ngrok URL: $NGROK_URL"
echo ""

# Set webhook (not needed for polling mode, but good to have)
# Telegraf uses polling by default with bot.launch()
# If you want webhook mode, uncomment the following:
# WEBHOOK_URL="$NGROK_URL/bot${TELEGRAM_BOT_TOKEN}"
# curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}"

echo "✅ MindVault nutzt Polling-Modus (Standard)."
echo "   Der Bot verbindet sich automatisch mit Telegram."
echo "   ngrok wird nur für zukünftige Webhook-Migration benötigt."
echo ""
echo "🧪 Test: Sende einen Link an deinen Bot auf Telegram!"
echo ""
