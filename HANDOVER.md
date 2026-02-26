# MindVault – Handover an Claude Code (v1.1)

## Status: Phase 1 + Erweiterungen komplett gebaut

### Neue Dependencies installieren:

```bash
cd backend
npm install   # neu: multer (für File Upload)
```

### Neue Features konfigurieren:

**1. Claude API Key für Auto-Tagging (optional aber empfohlen):**
```bash
# In backend/.env hinzufügen:
ANTHROPIC_API_KEY=sk-ant-api03-xxx
# Key holen von: https://console.anthropic.com/settings/keys
```

**2. yt-dlp für Video/Foto-Download (optional):**
```bash
brew install yt-dlp
```

### Neue Dateien:

**Backend (neu):**
- `src/ai.js` – Claude Vision API für Bildanalyse & Auto-Tagging
- `src/thumbnails.js` – Thumbnails lokal herunterladen & cachen
- `src/downloader.js` – yt-dlp Integration (Instagram, YouTube, Vimeo)

**Backend (aktualisiert):**
- `src/routes.js` – Neue Endpoints: POST /upload, POST /links/:id/download, POST /links/:id/analyze
- `src/bot.js` – Automatisches Thumbnail-Download & AI-Tagging
- `src/database.js` – Neue Spalten: local_thumbnail, media_path, media_type, file_path
- `package.json` – Neue Dependency: multer

**Frontend (neu):**
- `components/AddLink.js` – Drag & Drop + Link-Eingabe + File Upload

**Frontend (aktualisiert):**
- `components/LinkCard.js` – Download-Button, AI-Analyse-Button, lokale Thumbnails
- `components/LinkGrid.js` – AddLink Integration
- `app/globals.css` – Styles für alle neuen Komponenten

### Neue API Endpoints:

```
POST /api/upload          – Datei hochladen (multipart/form-data)
POST /api/links/:id/download  – Media via yt-dlp herunterladen
POST /api/links/:id/analyze   – AI-Analyse manuell triggern
GET  /api/links/:id/files     – Heruntergeladene Dateien anzeigen
GET  /api/status               – System-Status (AI, yt-dlp verfügbar?)

GET  /api/files/thumbnails/:filename  – Lokale Thumbnails
GET  /api/files/uploads/:filename     – Hochgeladene Dateien
GET  /api/files/media/:filename       – Heruntergeladene Media
```

### Testen:

```bash
# Backend neu starten
cd backend && npm run dev

# Status prüfen
curl http://localhost:3001/api/status

# Frontend
cd frontend && npm run dev
# Browser: http://localhost:3000

# Test: Link über UI hinzufügen (+ Button)
# Test: Datei per Drag & Drop hochladen
# Test: Download-Button auf YouTube/Vimeo/Instagram Cards
# Test: AI-Tag Button (🏷️) auf Cards ohne Tags
```
