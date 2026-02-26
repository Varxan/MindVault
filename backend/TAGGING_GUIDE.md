# MindVault Auto-Tagging – Konfigurationsguide

Die Auto-Tagging-Funktion nutzt Claude Vision um Bilder automatisch zu analysieren und relevante Tags zu generieren.

## 🎯 Wie es funktioniert

1. **Automatisch**: Wenn du einen Link speicherst und Claude API Key gesetzt ist, werden Tags automatisch generiert
2. **Manuell**: Klick auf 🏷️ Button auf jeder Card um die Analyse zu triggern
3. **Konfigurierbar**: Du kannst den Prompt in `backend/src/tagging-config.js` bearbeiten

## 🔧 Prompt anpassen

Öffne `backend/src/tagging-config.js` und bearbeite die `TAGGING_PROMPT` Variable.

**Beispiele:**

### Für Design/Fotografie-Projekte:
```javascript
const TAGGING_PROMPT = `Du bist ein Fotografie und Design-Experte...
Zusätzlich beachte:
- Komposition (Rule of Thirds, Leading Lines, etc.)
- Lichtsetzung (Golden Hour, High Key, Low Key, etc.)
- Kamera-Einstellungen wenn sichtbar (Bokeh, Tiefenschärfe, etc.)
...`
```

### Für Content/Social Media:
```javascript
const TAGGING_PROMPT = `Du bist ein Social Media Content Experte...
Tags sollten sein:
- Hashtag-freundlich
- Trend-bezogen
- Viral-potential
...`
```

### Für E-Commerce/Produktfotos:
```javascript
const TAGGING_PROMPT = `Du bist ein Produktfotografie Experte...
Beschreibe:
- Produkt-Features
- Material & Textur
- Best-use-case
- Zielgruppe
...`
```

## 🔑 API Key Setup

```bash
# 1. Gehe zu https://console.anthropic.com/settings/keys
# 2. Erstelle einen neuen API Key
# 3. Kopiere ihn in backend/.env:

ANTHROPIC_API_KEY=sk-ant-api03-XXXXXXXXXXXX
```

## ✅ Testen

Nach der Konfiguration: Klick 🏷️ auf einer Card ohne Tags um die neue Config zu testen.

**Terminal-Output checken:**
```bash
cd backend && npm run dev
# Du solltest sehen:
# [AI] Tags für Link 5: tag1, tag2, tag3, ...
```

## 🎨 Tag-Best-Practices

**Was funktioniert gut:**
- ✅ Spezifisch: "Latte-Art-Kaffee" statt nur "Kaffee"
- ✅ Suchbar: Tags die echte Menschen suchen würden
- ✅ Vielfältig: Mix aus Deutsch + Englisch
- ✅ Actionable: Tags die beschreiben WAS zu sehen ist PLUS wie es wirkt

**Was nicht funktioniert:**
- ❌ Zu allgemein: "Bild", "Foto", "Content"
- ❌ Zu spezifisch: "Blonde Frau mit blauem Pulli im Park am 15.03."
- ❌ Spam: 50+ Tags oder irrelevante Keywords

## 🚀 Advanced: Custom Context

Der `buildPrompt()` Funktion übergibst du:
```javascript
{
  title: "Seitentitel",
  description: "Seiten-Beschreibung",
  source: "instagram", // oder "youtube", "vimeo", etc.
  note: "Benutzer-Notiz",
  url: "https://..."
}
```

Diese Info wird automatisch in den Prompt eingefügt für bessere Tag-Qualität.

---

**Fragen? Terminal Output checken für Fehler:**
```bash
# Fehlerhafte API Key:
[AI] API Error: 401 invalid_request_error

# Keine Bilder:
[AI] Could not fetch: https://... – Not Found

# Parse-Fehler:
[AI] Could not parse response: Invalid JSON
```
