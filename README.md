# MindVault

Dein persönliches visuelles Inspirations- und Referenz-Tool.
Links speichern, automatisch taggen, visuell wiederfinden.

## Quick Start

### 1. Dependencies installieren
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Telegram Bot einrichten
1. Öffne Telegram und suche **@BotFather**
2. Sende `/newbot` und folge den Anweisungen
3. Kopiere den Token in `backend/.env`:
```
TELEGRAM_BOT_TOKEN=dein_token_hier
```

### 3. Starten
```bash
# Option A: Alles auf einmal
./start.sh

# Option B: Einzeln
cd backend && npm run dev    # Terminal 1
cd frontend && npm run dev   # Terminal 2
```

### 4. Nutzen
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001/api/links
- **Telegram:** Sende einen Link an deinen Bot

## Features (Phase 1)
- Telegram Bot empfängt Links
- Automatische Source-Erkennung (Instagram, Vimeo, YouTube, etc.)
- Automatisches Metadata-Fetching (Titel, Beschreibung, Thumbnail)
- Notizen zu Links hinzufügen
- Visuelles Grid mit Masonry-Layout
- Suche über alle Felder
- Filter nach Source/Plattform
- SQLite Datenbank (eine Datei, kein Server nötig)

## Tech Stack
- **Backend:** Node.js + Express
- **Bot:** Telegraf (Telegram Bot API)
- **Datenbank:** SQLite (better-sqlite3)
- **Frontend:** Next.js 14 + React 18
- **Metadata:** cheerio + node-fetch (Open Graph Parsing)
