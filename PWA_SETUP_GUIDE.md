# MindVault PWA Setup Guide

## Was wurde hinzugefügt:

### 1. **manifest.json** (`public/manifest.json`)
- App-Name, Beschreibung, Icons
- Display-Modus: "standalone" (öffnet ohne Browser-UI)
- Theme-Farben

### 2. **Service Worker** (`public/sw.js`)
- Offline-Support
- Caching-Strategie: Network-first für API, Cache-first für Assets

### 3. **Layout-Updates** (`app/layout.js`)
- PWA Meta-Tags
- Service Worker Registration
- Apple-spezifische Tags für iOS

### 4. **Install Button** (`components/PWAInstallButton.js`)
- Zeigt sich nur wenn Installation möglich ist
- Triggert Chrome/Edge native Install-Dialog

### 5. **Icons** (`public/icon.svg`)
- Einfaches SVG als Basis
- Wird von manifest.json referenziert

---

## Nächste Schritte:

### **Schritt 1: Icons generieren**
Aktuell ist nur `icon.svg` vorhanden. Browser brauchen aber PNG-Versionen. Nutze einen Online-Generator:
- https://realfavicongenerator.net/
- Oder: ImageMagick lokal
```bash
convert icon.svg -background none -resize 192x192 public/icon-192x192.png
convert icon.svg -background none -resize 512x512 public/icon-512x512.png
```

### **Schritt 2: Install Button einbauen**
In `frontend/app/page.js` oder einer Layout-Komponente:
```jsx
import PWAInstallButton from '@/components/PWAInstallButton';

export default function Home() {
  return (
    <main>
      <PWAInstallButton />
      {/* rest of your app */}
    </main>
  );
}
```

### **Schritt 3: Testen in Chrome**
1. Öffne `http://localhost:3000`
2. Klick auf die Adressleiste → "Install MindVault" Button sollte erscheinen
3. Oder: F12 → DevTools → Lighthouse → Test PWA
4. Nach Installation: öffnet sich wie native App (kein Browser-UI)

### **Schritt 4: Icon Masking (Optional)**
Einige Browser nutzen "maskable" Icons für adaptive Icons:
```bash
convert icon.svg -background none -resize 192x192 public/icon-192x192-maskable.png
convert icon.svg -background none -resize 512x512 public/icon-512x512-maskable.png
```

---

## PWA Verbesserungen (Später):

### **Offline Page**
Erstelle `public/offline.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <title>MindVault — Offline</title>
  <style>
    body { font-family: Arial; text-align: center; padding: 50px; }
    h1 { color: #4aef8a; }
  </style>
</head>
<body>
  <h1>🔴 No Connection</h1>
  <p>MindVault is offline. Some features may not work.</p>
</body>
</html>
```

### **Update Prompt**
Service Worker kann neue Updates anzeigen:
```javascript
// In sw.js, notify client when new version available
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

---

## Checklist:

- [ ] Icon-PNGs generieren (192x192, 512x512)
- [ ] Maskable Icons erstellen (optional)
- [ ] PWAInstallButton in App einbauen
- [ ] Offline Fallback Page erstellen (optional)
- [ ] Testen: Chrome/Edge Install-Button sollte erscheinen
- [ ] Testen: Offline-Mode prüfen
- [ ] Testen: Install funktioniert, App startet standalone

---

## Result:

Nach Install sieht es so aus:

```
Chrome: MindVault Installieren
    ↓
Nutzer klickt → Install Dialog
    ↓
Icon im Dock / Taskbar
    ↓
App startet ohne Browser-UI
    ↓
Professionell aussehend ✓
```

---

## Debugging:

```javascript
// Service Worker Status
navigator.serviceWorker.ready.then(() => console.log('SW ready'));

// App Installation Status
if (window.matchMedia('(display-mode: standalone)').matches) {
  console.log('App ist installiert und läuft standalone');
}

// Cache Status
caches.keys().then(names => console.log('Cached:', names));
```
