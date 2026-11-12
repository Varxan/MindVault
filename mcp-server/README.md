# MindVault MCP Server

Verbindet MindVault mit Claude (Desktop, Cowork, Claude Code): Bibliothek
durchsuchen, Links speichern, Collections füllen — und **Deep Scene Analysis**:
Claude zieht Frames aus heruntergeladenen Videos, schaut sie selbst an und
schreibt Szenen-Beschreibungen mit Timestamps zurück in MindVault. Kein
API-Key nötig — die Vision-Analyse läuft über die Claude-Session des Users.

**Voraussetzung:** MindVault läuft (der Server spricht mit `localhost:3001`).

## Einrichtung (einmalig)

```bash
cd ~/Documents/MindVault/mcp-server
npm install
```

Dann in Claude registrieren — eine der Varianten:

**Claude Code / CLI:**
```bash
claude mcp add mindvault -- node ~/Documents/MindVault/mcp-server/index.js
```

**Claude Desktop / Cowork** (Settings → Developer → MCP-Konfiguration):
```json
{
  "mcpServers": {
    "mindvault": {
      "command": "node",
      "args": ["/Users/DEIN-USER/Documents/MindVault/mcp-server/index.js"]
    }
  }
}
```

## Tools

| Tool | Zweck |
|---|---|
| `search_links` | Volltextsuche über Titel, Tags, Notizen, Transkripte, Scene-Analysen |
| `get_link` | Alle Details eines Links inkl. Transkript + Scene-Analyse |
| `add_link` | Link speichern (Metadaten/Tags kommen automatisch) |
| `list_links_needing_analysis` | Heruntergeladene Videos ohne Deep-Analyse |
| `get_frames` | Stills mit Timestamps aus einem lokalen Video (1–30 Frames) |
| `save_scene_analysis` | Szenen-Beschreibung zurückschreiben (durchsuchbar) |
| `list_collections` / `add_to_collection` | Collections verwalten |

## Beispiel-Prompts

- *"Such in MindVault nach Referenzen mit Rim Light in Innenräumen."*
- *"Geh alle Videos ohne Deep-Analyse durch: zieh dir pro Video 8 Frames,
  beschreib die Szenen mit Timestamps und speichere die Analyse."*
- *"Welches meiner Videos hat die Skateboard-Szene mit dem Kickflip?
  Schau notfalls in die Frames rein."*
- *"Leg eine Collection 'Uhren-Spot Treatment' an und füll sie mit passenden
  Referenzen zu melancholischer Stimmung."*

## Wiederkehrende Analyse (optional)

In Claude eine geplante Aufgabe anlegen, z.B. alle 2 Tage:
*"Frag MindVault via MCP nach Videos ohne Scene-Analyse (list_links_needing_analysis),
analysiere jedes mit get_frames (8 Frames) und speichere die Ergebnisse mit
save_scene_analysis. Fasse kurz zusammen, was du analysiert hast."*
Bedingung: Mac wach + MindVault läuft zum geplanten Zeitpunkt.
