#!/usr/bin/env node
/**
 * MindVault MCP Server
 * ────────────────────
 * Exposes the local MindVault backend (http://localhost:3001) as MCP tools,
 * so Claude (Desktop, Code, Cowork) can search the reference library, add
 * links, and run DEEP SCENE ANALYSIS: Claude pulls frames from downloaded
 * videos, looks at them itself, and writes timestamped scene descriptions
 * back into MindVault — no API key in the app, the vision analysis runs in
 * the user's own Claude session.
 *
 * Requirements: MindVault must be running (the backend starts with the app).
 *
 * Setup (Claude Desktop / Cowork → Settings → MCP / connectors, or CLI):
 *   claude mcp add mindvault -- node /path/to/MindVault/mcp-server/index.js
 *
 * Or in a JSON MCP config:
 *   { "mcpServers": { "mindvault": {
 *       "command": "node",
 *       "args": ["/path/to/MindVault/mcp-server/index.js"] } } }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';

const API = process.env.MINDVAULT_API || 'http://localhost:3001/api';

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (e) {
    throw new Error(
      `MindVault ist nicht erreichbar (${API}). Läuft die App? (${e.message})`,
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const text = (s) => ({ content: [{ type: 'text', text: s }] });
const err = (e) => ({ content: [{ type: 'text', text: `Fehler: ${e.message}` }], isError: true });

// Compact representation for list results — keeps token usage low
function compactLink(l) {
  let tags = [];
  try { tags = JSON.parse(l.tags || '[]'); } catch {}
  return {
    id: l.id,
    title: l.title || '(ohne Titel)',
    source: l.source,
    space: l.space,
    url: l.url,
    tags,
    has_local_video: !!l.media_path,
    has_transcript: !!l.transcript,
    has_scene_analysis: !!l.scene_analysis,
    created_at: l.created_at,
  };
}

// ── Server + tools ────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'mindvault', version: '1.0.0' });

server.tool(
  'search_links',
  'Search the MindVault library. Matches title, description, tags, notes, URL, ' +
  'Whisper transcripts and scene analyses (every word must match somewhere). ' +
  'Returns compact results — use get_link for full details.',
  {
    query: z.string().describe('Search words, e.g. "skateboard kickflip" or "rim light interior"'),
    space: z.enum(['eye', 'mind']).optional().describe('Limit to a space: eye (visual) or mind (knowledge)'),
    limit: z.number().optional().describe('Max results (default 20)'),
  },
  async ({ query, space, limit }) => {
    try {
      const params = new URLSearchParams({ search: query });
      if (space) params.set('space', space);
      const data = await api(`/links?${params}`);
      const links = (data.links || []).slice(0, limit || 20).map(compactLink);
      return text(JSON.stringify({ total: data.total, shown: links.length, links }, null, 2));
    } catch (e) { return err(e); }
  },
);

server.tool(
  'get_link',
  'Full details of one link: description, notes, tags, Whisper transcript and ' +
  'scene analysis (timestamped descriptions, if present).',
  { id: z.number().describe('Link ID (from search_links)') },
  async ({ id }) => {
    try {
      const l = await api(`/links/${id}`);
      let tags = [];
      try { tags = JSON.parse(l.tags || '[]'); } catch {}
      return text(JSON.stringify({
        id: l.id, title: l.title, url: l.url, source: l.source, space: l.space,
        description: l.description, note: l.note, tags,
        has_local_video: !!l.media_path,
        transcript: l.transcript || null,
        scene_analysis: l.scene_analysis || null,
        created_at: l.created_at,
      }, null, 2));
    } catch (e) { return err(e); }
  },
);

server.tool(
  'add_link',
  'Save a new link into MindVault. Metadata, thumbnail and AI tags are fetched ' +
  'automatically in the background.',
  {
    url: z.string().describe('The URL to save'),
    space: z.enum(['eye', 'mind']).optional().describe('Target space (default eye)'),
    tags: z.array(z.string()).optional().describe('Optional initial tags'),
  },
  async ({ url, space, tags }) => {
    try {
      const l = await api('/links', {
        method: 'POST',
        body: JSON.stringify({ url, space, tags }),
      });
      return text(`Gespeichert: [${l.id}] ${l.title || url} (Space: ${l.space})`);
    } catch (e) { return err(e); }
  },
);

server.tool(
  'list_links_needing_analysis',
  'List downloaded videos that have NO deep scene analysis yet. Use this to ' +
  'find candidates for analyze-with-frames (get_frames → save_scene_analysis).',
  {},
  async () => {
    try {
      const data = await api('/links-needing-analysis');
      const links = (data.links || []).map((l) => ({
        id: l.id, title: l.title || '(ohne Titel)', source: l.source,
        space: l.space, created_at: l.created_at,
      }));
      return text(JSON.stringify({ count: data.count, links }, null, 2));
    } catch (e) { return err(e); }
  },
);

server.tool(
  'get_frames',
  'Extract evenly spaced still frames from a downloaded video and return them ' +
  'as images with timestamps. Look at them, then write a timestamped scene ' +
  'description with save_scene_analysis. Only works for links with a local ' +
  'video (has_local_video). Default 8 frames; use more for long/varied videos.',
  {
    id: z.number().describe('Link ID'),
    count: z.number().optional().describe('Number of frames (1–30, default 8)'),
  },
  async ({ id, count }) => {
    try {
      const data = await api(`/links/${id}/extract-frames`, {
        method: 'POST',
        body: JSON.stringify({ count }),
      });
      const content = [{
        type: 'text',
        text: `"${data.title || 'Video'}" — Dauer ${Math.round(data.duration)}s, ${data.frames.length} Frames. ` +
              `Timestamps: ${data.frames.map((f) => `#${f.index}=${f.timestamp}s`).join(', ')}`,
      }];
      for (const f of data.frames) {
        try {
          const b64 = fs.readFileSync(f.path).toString('base64');
          content.push({ type: 'image', data: b64, mimeType: 'image/jpeg' });
        } catch {
          content.push({ type: 'text', text: `(Frame #${f.index} bei ${f.timestamp}s konnte nicht gelesen werden)` });
        }
      }
      return { content };
    } catch (e) { return err(e); }
  },
);

server.tool(
  'save_scene_analysis',
  'Save a deep scene analysis for a link (overwrites any existing one). ' +
  'Write timestamped prose, one line per scene/moment, e.g. ' +
  '"0:00–0:12 — Drone over coastline at dusk, cold blue palette". ' +
  'The text becomes searchable via search_links and the in-app search.',
  {
    id: z.number().describe('Link ID'),
    analysis: z.string().describe('Timestamped scene descriptions (plain text)'),
  },
  async ({ id, analysis }) => {
    try {
      const r = await api(`/links/${id}/scene-analysis`, {
        method: 'PATCH',
        body: JSON.stringify({ analysis }),
      });
      return text(`Scene-Analyse gespeichert für Link ${r.id} (${r.length} Zeichen).`);
    } catch (e) { return err(e); }
  },
);

server.tool(
  'list_collections',
  'List all collections (id, name, link count).',
  {},
  async () => {
    try {
      const cols = await api('/collections');
      return text(JSON.stringify(
        (cols || []).map((c) => ({ id: c.id, name: c.name, links: c.link_count ?? c.count ?? undefined })),
        null, 2,
      ));
    } catch (e) { return err(e); }
  },
);

server.tool(
  'add_to_collection',
  'Add a link to a collection.',
  {
    collection_id: z.number().describe('Collection ID (from list_collections)'),
    link_id: z.number().describe('Link ID'),
  },
  async ({ collection_id, link_id }) => {
    try {
      await api(`/collections/${collection_id}/links`, {
        method: 'POST',
        body: JSON.stringify({ linkId: link_id }),
      });
      return text(`Link ${link_id} zur Collection ${collection_id} hinzugefügt.`);
    } catch (e) { return err(e); }
  },
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[mindvault-mcp] ready — backend:', API);
