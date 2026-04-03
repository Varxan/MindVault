# MindVault — Brain Document
> Dieses Dokument am Anfang jeder Claude-Session mitgeben. Laufend aktualisieren.
> Letzte Aktualisierung: 3. April 2026

---

## 🎯 Was ist MindVault?

**Vision:** Ein visuelles Referenz-Tool für Filmemacher, DoPs (Directors of Photography) und Treatment Designer. Eine Art "kreativer Tresor" für visuelle Inspiration und Referenzen.

**Kernkonzept — Eye vs. Mind:**
MindVault unterscheidet zwischen zwei Räumen:
- **EYE** = Rein visuelle Referenzen (Bilder, Stills, Cinematography-Referenzen)
- **MIND** = Konzeptuelle Referenzen (Videos, Artikel, Ideen, Wissen hinter dem Handwerk)

*Offene Frage: Ob diese Unterscheidung für andere Nutzer intuitiv ist, soll in der Beta getestet werden.*

**Zielgruppe:** Filmemacher, Regisseure, DoPs, Treatment Designer

**App-Name:** MindVault — ob dieser Name gut passt, wird in der Beta zur Diskussion gestellt.
Alternative Namen (intern, nicht für Tester): FrameVault, Vault, Stills, RefVault, VaultApp, Moodframe

---

## 🏗️ Tech Stack

### Electron App (Desktop, macOS)
- **Electron** + **Next.js** (App Router) als Frontend
- **SQLite** für lokale Datenspeicherung
- **Node.js Backend** (port 3001) läuft als lokaler Server im Electron-Prozess
- Build: `electron-builder`, signiert mit Apple Developer Certificate
- `npm run dist` = signierter Build (für User/Release)
- `npm run dist:test` = unsignierter Build (`CSC_IDENTITY_AUTO_DISCOVERY=false`) → für interne Tests, viel schneller

#### ⚠️ Build-Zeiten & Signing — wichtiger Kontext
- **Erster `npm run dist`** dauerte ~9.5 Stunden — weil Python-Testfiles mitgepackt wurden (~33'700 Dateien zu signieren)
- **Fix bereits implementiert** in `package.json`: Exclusions für `clip-env` (`__pycache__`, `tests`, `*.pyc` etc.) → reduziert von ~33'700 auf ~20'000 Dateien (~40% weniger)
- **Faustregel:** `npm run dist:test` für alle internen Test-Builds. `npm run dist` nur wenn ein echtes Release-DMG für User gebaut wird.
- **Mac-Sleep während Build verhindern:** `sudo pmset -a disablesleep 1` — danach wieder `sudo pmset -a disablesleep 0`

### Backend (`/backend/src/`)
- `index.js` — Entry Point
- `routes.js` — Alle API Endpoints
- `database.js` — SQLite Schema & Queries
- `ai.js` — Claude Vision API (Anthropic) für Auto-Tagging
- `thumbnails.js` — Lokales Thumbnail-Caching
- `downloader.js` — yt-dlp Integration (YouTube, Vimeo, Instagram)
- `embeddings.js` + `embedder.py` — CLIP Embeddings für semantische Suche
- `whisper.js` + `whisper_transcriber.py` — Whisper für Video-Transkription (lokal, offline)
- `gif-creator.js` — GIF-Erstellung aus Videos
- `tag-catalog.js` — Tag-Verwaltung
- `bot.js` — Telegram Bot Integration
- `supabase-poller.js` — Polling für Mobile-zu-Desktop Link-Sharing
- `library-sync.js` — Bibliotheks-Synchronisation
- `metadata.js` — Metadaten-Extraktion

### Frontend (`/frontend/`)
- **Next.js App Router** (Edge Runtime wo möglich)
- Wichtige Components:
  - `LinkGrid.js` — Haupt-UI, Card-Grid mit Suche/Filter
  - `LinkCard.js` — Einzelne Karte
  - `AddLink.js` — Link hinzufügen (Drag & Drop + URL + File Upload)
  - `GifCreatorModal.js` — GIF aus Video erstellen
  - `VideoPlayerModal.js` — Video-Player
  - `OnboardingModal.js` — Onboarding-Flow
  - `SettingsPanel.js` — Einstellungen (API Keys, etc.)
  - `MobileQRSection.js` — QR Code für Mobile Pairing
  - `CollectionsGrid.js` / `CollectionCard.js` — Collections

### Website / Landing Page (`/frontend/app/page.js`)
- Deployed auf **Cloudflare Pages** → **mindvault.ch** (via `git push`, automatisches Deploy)
- `page.js` = Hauptseite mit vollständigem SEO (OG, Twitter Cards, JSON-LD)
- `LandingBetaContent.js` = Client Component (React-Version der Landing Page)
- Inter Font: self-hosted via `next/font/google` (GDPR-konform, kein Cookie-Banner nötig)
- Eigene Fonts: `Harmony.otf`, `Humane-Medium.ttf` in `/public/fonts/`
- OG Image: `/public/og-image.png` (1200×630px)
- Sitemap: `/app/sitemap.js` → mindvault.ch/sitemap.xml
- Robots: `/app/robots.js`
- **WICHTIG URL-Routing:** Statische HTMLs in `public/` landen unter `/dateiname.html`, NIE an der Root `/`. Um die Root zu ändern muss `app/page.js` / `LandingBetaContent.js` ersetzt werden.

### Video Proposal Landing Page (13.03.2026)
- Datei: `/frontend/public/landing.html` + `/frontend/public/MV1.mp4`
- Erreichbar unter: **mindvault.ch/landing.html** (temporär für Review)
- Video: `MV1.mp4` — web-optimiert aus `MV1.mov` (32MB → 2.4MB, H.264 CRF26, 1920×1080, kein Audio, faststart)
- Font-System: **Humane** (Headlines/Display) + **Inter** (alle UI-Elemente + Inter 300 für Fließtext/Body) + kein Drittfont nötig
- Fonts in HTML als Base64 eingebettet (Humane), Google Fonts für Inter + Cormorant (Cormorant wurde wieder verworfen → Inter 300 gewählt)
- MindVault App-Icon (orange Flare) als Base64 in Nav eingebettet → lädt immer, unabhängig von Dateipfaden
- **Nächster Schritt:** `LandingBetaContent.js` durch das neue Design ersetzen → wird dann echte Homepage

### PWA / Mobile Pairing — Klarstellung
- PWA läuft auf **gleicher Domain** (`mindvault.ch`) aber eigener Route (z.B. `/pair`, `/app`)
- **Komplett getrennt** von der Landing Page / Marketing-Website
- QR-Code erzeugt einen **einmaligen Session-Token** → verbindet genau dieses Handy mit genau dieser Mac-Instanz
- Kein anderes Gerät kann dieselbe Session nutzen → unique 1:1 Verbindung

### Payments
- **LemonSqueezy** (nicht Stripe)
- Link zum Testen: Im LemonSqueezy Dashboard unter app.lemonsqueezy.com

### Waitlist / Datenbank
- **Supabase** — für Waitlist-Emails (`/api/waitlist`) und Mobile Share Queue
- Share Queue: Mobile → Supabase → Desktop App (temporärer Cloud-Speicher)

---

## 🔑 Wichtige Links & Accounts

| Service | URL / Info |
|---------|-----------|
| Website | https://mindvault.ch |
| Cloudflare Pages | Deployment via git push |
| LemonSqueezy | app.lemonsqueezy.com |
| Supabase | Waitlist + Share Queue |
| Google Search Console | Sitemap registrieren: mindvault.ch/sitemap.xml |
| Sentry | Error Tracking (sentry.client.config.js vorhanden) |

---

## ✅ Was funktioniert (fertig)

- Link Management (Add, Delete, Search, Filter)
- Collections System
- Video/Image Media Processing (ffmpeg)
- Dark/Light Mode
- Grid/List/Large View
- Telegram Bot Integration
- AI Auto-Tagging (Claude Vision + OpenAI GPT-4)
- SQLite lokale Datenbank
- Backup & Export / Import
- Mobile Pairing via QR Code + Share Queue (Supabase)
- GIF Creator aus Videos
- Landing Page auf mindvault.ch (SEO-optimiert, cookie-frei)
- Waitlist System (Supabase)
- Electron Build mit codesign
- `dist:test` Script (ohne Signing, für interne Tests)
- Beta-Feedback Dokument (`MindVault-Beta-Guide.docx`)

---

## 🚧 Offen / Unfertig / Loose Ends

### KRITISCH (blockiert User-Experience)
1. **python-standalone — Test noch ausstehend** (fix implementiert, noch nicht getestet)
   - Problem war: clip-env mit Homebrew Python → nicht portabel auf anderen Macs
   - Fix implementiert 12.03.2026:
     - `build-clip-bundle.sh` installiert Packages direkt in `python-standalone` (kein venv)
     - `ai.js`, `embeddings.js`, `whisper.js` suchen jetzt zuerst `python-standalone/bin/python3`
     - `package.json` bündelt `python-standalone` statt `clip-env`
   - Script erfolgreich gelaufen: CLIP ✅, sentence-transformers ✅, MPS ✅
   - **Nächster Schritt:** `npm run dist:test` → auf zweitem Mac-Account testen ob AI-Tags funktionieren

2. ~~**Datenbank-Verwechslung Dev vs. DMG**~~ ✅ BEHOBEN 12.03.2026
   - Fix: `database.js`, `library-sync.js`, `thumbnails.js` zeigen im Dev-Modus jetzt auch auf `~/Library/Application Support/MindVault/data/`
   - Dev und Production nutzen dieselbe DB pro User → keine Verwechslung mehr möglich

3. **Landing Page Panel 2 — Video fehlt**
   - Derzeit kein echtes App-Video eingebettet
   - Warten auf Screen Recording vom App
   - `LandingBetaContent.js` zeigt noch Placeholder-Bereich

2. **OG Image** — aktuelles ist generiert, aber ohne echten App-Screenshot
   - `/frontend/public/og-image.png` sollte mit echtem Screenshot aktualisiert werden

### MITTEL (sollte vor Launch bereinigt werden)
3b. **DMG fehlt professionelles Drag-&-Drop Layout** (nächster Build)
   - Aktuell: `hdiutil create -srcfolder` → einfaches Finder-Fenster, unschön
   - Gewünschter Zustand: App-Icon links, Applications-Pfeil rechts, schöner Hintergrund
   - Fix: `create-dmg` npm-Package einsetzen (https://github.com/sindresorhus/create-dmg) oder `node-appdmg`
   - In `notarize-only.js` Step 1 austauschen gegen `create-dmg` Call
   - Besprochen 13.03.2026


3. **`routes.js.tmp`** in `/backend/src/` — temp Datei, sollte gelöscht werden
4. **`tag-catalog.backup.js`** in `/backend/src/` — Backup-Datei, aufräumen
5. **12+ alte Landing Page HTML-Dateien** im Root-Ordner
   - `landing-option-A.html`, `landing-option-B.html`, `landing-C-v2.html` etc.
   - Alle können gelöscht oder in `/archive/` verschoben werden
6. **`HANDOVER.md`** — verweist auf alten Vercel-Link `mind-vault-chi.vercel.app`
   - `MobileQRSection.js` hat hardcoded `mind-vault-chi.vercel.app` → prüfen ob noch aktuell

### NIEDRIG (nice to have)
7. **`test-*.js`** Dateien im Backend-Root** (`test-image-post.js`, `test-carousel.js` etc.) — Test-Dateien aufräumen
8. **`landing-beta.html`** in `/frontend/public/` — verwendet noch Google Fonts (`@import`) → sollte auf self-hosted Inter umgestellt werden (Next.js-Version ist bereits GDPR-konform)
9. ~~**Whisper Integration**~~ ✅ VOLLSTÄNDIG GEFIXT 03.04.2026 — yt-dlp Pfad, Cookies, JSON-Parse, Sequential Queue
10. **CLIP Embeddings / semantische Suche** — ob vollständig integriert, unklar
11. **Activation System** (`electron/activation.html` + `preload-activation.js`) — ob fertig und aktiv, unklar
12. **`startup-analyzer.js`** — unklarer Status, was analysiert wird

---

## 📅 Nächste Schritte (Priorität)

1. [ ] **0.9.2 Distribution-Build fertigstellen** — auf Mac Terminal ausführen:
   ```bash
   cd ~/Documents/MindVault && npm run dist:resign
   APPLE_ID="marco.pro.frei@gmail.com" APPLE_APP_SPECIFIC_PASSWORD="jiti-iwzd-befe-gawr" APPLE_TEAM_ID="QKY47Z9SPY" npm run dist:notarize
   ```
2. [ ] Screen Recording der App machen → Panel 2 Video einbauen
3. [ ] OG Image mit echtem App-Screenshot aktualisieren
4. [ ] Google Search Console: Site verifizieren + Sitemap einreichen
5. [ ] Beta-Tester rekrutieren (MindVault-Beta-Guide.docx ist bereit)
6. [ ] Loose-End-Cleanup (alte Landing HTMLs, temp files)
7. [ ] Activation/Licensing System Status prüfen
8. [ ] MobileQRSection URL prüfen (`mind-vault-chi.vercel.app` → mindvault.ch?)
9. [ ] **Playwright E2E-Tests** einrichten — automatisiertes Testen aller Kernfunktionen nach jedem Build (statt manuell). Electron-Support vorhanden. Einmalig ~2-3h Aufwand, danach läuft alles in ~3 Min. automatisch. Besprochen am 11.03.2026.

---

## 💡 Wichtige Designentscheidungen & Kontext

- **Kein Cookie-Banner nötig** — weil: self-hosted Fonts, kein Google Analytics, kein Tracking
- **Cookie-freie Strategie beibehalten** — wenn Shop/Video später kommt: self-hosted oder privacy-friendly Lösungen wählen
- **SEO**: JSON-LD (SoftwareApplication), OG Tags, sitemap.xml, robots.txt — alles vorhanden
- **Kein Vercel** für die Hauptsite — deployed auf Cloudflare Pages via git push
- **Mind-Suche = Fuse.js** (clientseitige Fuzzy-Suche über Titel, Beschreibung, Transkript, Tags). Die frühere CLIP-Embedding-Suche wurde entfernt weil sie bei jedem Tastendruck die Reihenfolge neu sortierte → unruhiges Springen der Links. Fuse.js ist stabil und schnell. Whisper-Transkript ist als `transcript`-Key in Fuse integriert → durchsuchbarer Gesprächsinhalt von Videos.
- **Marco's Tendenz**: Von Idee zu Idee springen → Loose Ends entstehen. Dieses Dokument helfen gegenzusteuern.
- **Der Code ist nicht das Problem — der Input ist es.** (Claude, vor ~3 Wochen)
- **CI-REGEL: KEINE EMOJIS/ICONS** — MindVault CI ist minimalistisch und elegant. Keine Emoji-Icons in der UI verwenden. Wenn überhaupt Icons, dann dezent und typografisch (z.B. `—`, `·`, `+`, `✓`, `✕`, Buchstaben). Gilt für alle Komponenten: Onboarding, Settings, LinkGrid, CollectionsGrid, etc. Bereinigt am 12.03.2026 abends.

---

## 🔄 Update-Protokoll

| Datum | Was wurde geändert |
|-------|-------------------|
| 11.03.2026 | Dokument erstellt, Codebase-Scan, Loose Ends dokumentiert, Build-Zeiten-Problem dokumentiert, Google Drive Sync eingerichtet, Playwright als Test-Option besprochen |
| 12.03.2026 | Bugs entdeckt & fixes implementiert: python-standalone für portable AI, DB-Pfad fix, Keychain signing, Google Drive Sync, dist:test getestet. Pending: python-standalone auf zweitem Account testen → npm run dist:test |
| 12.03.2026 (abend) | Signing-Fix für `npm run dist` / `dist:test` implementiert:<br>• `afterPack.js`: Strip adhoc sigs NUR wenn `CSC_IDENTITY_AUTO_DISCOVERY !== 'false'` (echte Builds). Test-Builds überspringen das Stripping.<br>• `package.json dist:test`: `--config.mac.hardenedRuntime=false` hinzugefügt (hardenedRuntime + adhoc signing = Fehler "code has no resources")<br>• Root cause: codesign --remove-signature + hardenedRuntime + adhoc = inkompatibel. Getrenntes Verhalten je nach Build-Typ löst das. |
| 12.03.2026 (session 2) | **3 kritische Bugs gefixt:**<br>1. **CLIP CRASH im DMG**: `package.json` Filter `!python-standalone/**/test_*.py` entfernte `torch/_inductor/test_operators.py` — ist KEIN Testfile sondern echtes Modul. Fix: `test_*.py` und `*_test.py` Exclusions entfernt. Nur noch `tests/` Ordner werden excludiert.<br>2. **Backup/Import verlor Eye/Mind Space**: `INSERT OR IGNORE` im Import enthielt `space` Spalte nicht → alle Links landeten in Eye (DEFAULT). Fix: `space`, `media_path`, `media_type`, `media_saved`, `file_path` zum Import hinzugefügt.<br>3. **Instagram Thumbnail Repair**: Expired CDN URLs konnten nicht re-downloaded werden. Fix: Repair nutzt jetzt 3 Fallback-Stufen: (a) Original-URL, (b) lokale Media-Datei → ffmpeg Thumbnail, (c) yt-dlp frische URL.<br>Ausserdem: Whisper-Debug Endpoint (`/api/whisper-debug`) eingebaut. |
| 12.03.2026 (nachmittag) | **Emoji/Icon Cleanup** — Alle Emoji-Icons aus UI-Komponenten entfernt: OnboardingModal (👁️🧠⭐🔒☁️⚠️🖥️🌐 → typografische Alternativen), VideoPlayerModal (📁→↗), CollectionsGrid (⚡📁→—), CollectionFilter (📁→Text), LinkGrid (🔑💳📡⚠️→·, ☁️ entfernt), PWAInstallButton (📥 entfernt). CI-Regel in Brain dokumentiert: MindVault = minimalistisch, elegant, keine Emojis. |
| 12.03.2026 (session 3) | **Whisper fehlte in python-standalone**: `build-clip-bundle.sh` installierte nur torch+CLIP+sentence-transformers, aber NICHT openai-whisper. Fix: `pip install openai-whisper` zum Build-Script hinzugefügt. Whisper manuell in bestehende python-standalone nachinstalliert. YouTube-Titel-Bug (iOS Share Text überschreibt echten Titel) war bereits in Session 2 gefixt. |
| 13.03.2026 (nachmittag) | **Video Landing Page Proposal:** `landing.html` + `MV1.mp4` nach `frontend/public/` deployed. Video web-optimiert (32MB→2.4MB). Font-System: Humane + Inter 300. App-Icon base64 eingebettet. Erreichbar unter mindvault.ch/landing.html. Nächster Schritt: LandingBetaContent.js ersetzen für echte Homepage. |
| 13.03.2026 | **Release-Pipeline vollständig gefixt:** entitlements + disable-library-validation (Team ID crash), torch/testing Exclusion entfernt (CLIP fix), notarize-only.js ZIP-Bug + stderr fix + create-dmg (Homebrew) für schönes DMG-Layout, re-sign.js --force Flag-Parsing fix. Version 0.9.0-beta.1 notarisiert + an Tester gegeben. |
| 03.04.2026 | **Whisper vollständig gefixt + neue Features + 0.9.2 Distribution-Build vorbereitet:**<br><br>**Whisper-Fixes (`backend/src/whisper.js`):**<br>• `YTDLP` + `getCookieArgs` aus `downloader.js` importiert → yt-dlp wurde vorher als String `'yt-dlp'` aufgerufen, nicht als bundled Binary → crashed in .app<br>• Sequential Queue implementiert (`_runExclusive`, `_drainWhisperQueue`) → max. 1 Whisper-Job gleichzeitig, RAM-Kontrolle<br>• JSON-Parse-Fix: Whisper gibt `Detected language: X` vor dem JSON aus → stdout polluted. Fix: letzte Zeile die mit `{` beginnt nehmen statt alles parsen.<br>• `err.stderr` im catch-Block geloggt für besseres Debugging<br><br>**VideoPlayerModal — Set Thumbnail via Rechtsklick:**<br>• `POST /links/:id/set-thumbnail` Endpoint in `routes.js` → ffmpeg extrahiert Frame bei `time`-Sekunde → speichert als `local_thumbnail`<br>• Rechtsklick-Kontextmenu auf Video mit "Set as thumbnail" (kein Emoji — CI-Regel)<br>• **Kritischer Fix:** `e.stopPropagation()` auf `onContextMenu` des Video-Elements → React Portal Bubbling verursachte 2 Kontextmenus gleichzeitig<br>• Success-Toast im Video-Container<br><br>**Re-Analyse Progress-Indikator (`LinkGrid.js`, `LinkCard.js`, `globals.css`):**<br>• `analyzingIds` State (Set) in LinkGrid → ID wird beim Start des Re-Analyse hinzugefügt, bei SSE `link-updated` entfernt<br>• `isAnalyzing` Prop an LinkCard → pulsierende blaue Border-Animation (`card-analyzing` CSS class)<br>• Kontextmenu zeigt "⟳ Analysing…" (disabled) während Analyse läuft<br>• Transcript Modal zeigt Spinner während Analyse<br><br>**Media Cache Path Setting:**<br>• `getMediaCacheDir()` in `downloader.js` → prüft `media_cache_path` Setting zur Laufzeit, Fallback auf `MEDIA_DIR`<br>• `FFMPEG` aus `thumbnails.js` exportiert für `routes.js`<br>• `/files/media` → dynamischer Endpoint statt statischer Route (prüft media_cache_path)<br>• `resolveVideoPath` prüft auch media_cache_path für `media_path` Dateien<br>• `POST /pick-folder/media-cache`, `GET /media-cache-stats`, `POST /move-media-cache` Endpoints<br>• Settings-UI: "Media cache folder" Sektion in Import/Export Tab<br><br>**Test-DMG Script Fixes (`scripts/create-test-dmg.js`):**<br>• Stale `/Volumes/MindVault` Volume wird vor neuem Mount unmounted<br>• `-fs APFS` → `-fs HFS+` (APFS TCC Permission-Issues auf neueren macOS)<br><br>**0.9.2 Distribution-Build Status:**<br>• Frontend ✅, native rebuild ✅, packaging ✅, 282 Binaries signiert ✅<br>• Notarisierung ❌ — Apple lehnt ab: "The signature of the binary is invalid" für `MindVault` + `Electron Framework`<br>• Root Cause: Electron überschreibt seine eigenen Signaturen beim Packaging → muss danach komplett re-signiert werden<br>• **Lösung:** Zwei-Schritt-Flow: `npm run dist:resign` (MacOS Keychain nötig!) → dann `npm run dist:notarize`<br>• Diese zwei Befehle müssen direkt auf dem Mac ausgeführt werden (nicht in der Linux-VM)<br><br>**Apple Credentials (für Notarisierung):**<br>• `APPLE_ID`: marco.pro.frei@gmail.com<br>• `APPLE_APP_SPECIFIC_PASSWORD`: jiti-iwzd-befe-gawr (neu erstellt 03.04.2026, alter PW war locked)<br>• `APPLE_TEAM_ID`: QKY47Z9SPY<br>• Befehl: `cd ~/Documents/MindVault && npm run dist:resign && APPLE_ID="marco.pro.frei@gmail.com" APPLE_APP_SPECIFIC_PASSWORD="jiti-iwzd-befe-gawr" APPLE_TEAM_ID="QKY47Z9SPY" npm run dist:notarize` |
| 12.03.2026 (spät) | **GROSSER PATH-AUDIT + FIX** — alle Backend-Dateien zeigten im Dev-Modus auf `backend/data/` statt auf `~/Library/Application Support/mindvault/data/`.<br>**Root Cause:** Electron's `app.getPath('userData')` nutzt `mindvault` (lowercase aus package.json `name`), nicht `MindVault` (Grossschreibung). Unser Fix hatte versehentlich `MindVault` (gross) verwendet → falsche Ordner → Links weg.<br>**Gefixt:** 11 Dateien korrigiert auf `mindvault` (lowercase): database.js, backup.js, downloader.js, gif-creator.js, routes.js, startup-analyzer.js, supabase-poller.js, embeddings.js, ai.js, library-sync.js, thumbnails.js, bot.js<br>**Backup-System verbessert:** Jetzt alle 2h statt 1x/Tag, 14 statt 7 Backups, Timestamp statt Datum im Dateinamen<br>**Weitere Fixes:** yt-dlp Firefox-Cookie Bug (crashed wenn Firefox nicht installiert), bot.js Thumbnail-Pfad, routes.js Python-Pfad, downloader.js HOME-Variable<br>**WICHTIG für Zukunft:** Electron userData = `mindvault` (lowercase). JEDER neue Backend-Pfad muss `process.env.DATA_PATH` mit `~/Library/Application Support/mindvault/data` als Fallback nutzen. NIE `__dirname/../data`! |

---

> **Für Claude:** Dieses Dokument bitte nach jeder Session mit wichtigen Änderungen, neuen Entscheidungen oder neuen Loose Ends aktualisieren. Auch wenn der Kontext voll wird — vorher dieses Dokument updaten.
>
> **Git-Commits vorschlagen:** Wenn in einer Session wichtige oder gute Änderungen gemacht wurden (Bugfixes, neue Features, Script-Verbesserungen etc.), am Ende der Session proaktiv einen `git add` + `git commit` + `git push` vorschlagen. Marco committed nicht immer selbst — ein kurzer Hinweis hilft, damit keine Arbeit verloren geht.
>
> **Versionierung:** Vor jedem `npm run dist:notarize` (Release-Build) proaktiv fragen ob die Version gebumpt werden soll. Schema: `+0.0.1` pro Release (0.9.0 → 0.9.1 → 0.9.2 …). Nicht automatisch bumpen — immer fragen. Aktuelle Version: `0.9.2`.
