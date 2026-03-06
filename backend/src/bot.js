const { Telegraf } = require('telegraf');
const path = require('path');
const { insertLink, db } = require('./database');
const { detectSource, fetchMetadata, fetchSmartMetadata } = require('./metadata');
const { downloadThumbnail } = require('./thumbnails');
const { analyzeContent } = require('./ai');
const { getMediaInfo } = require('./downloader');

// Track last saved link per chat for tag follow-ups
const lastSavedLink = new Map();

function createBot(token) {
  const bot = new Telegraf(token);

  bot.start((ctx) => {
    ctx.reply(
      '🧠 *Willkommen bei MindVault!*\n\n' +
      'Sende mir einen Link und ich speichere ihn für dich.\n\n' +
      '*Befehle:*\n' +
      '/start – Diese Nachricht\n' +
      '/help – Hilfe & Tipps\n\n' +
      '_Tipp: Füge nach dem Link eine Notiz hinzu!_\n' +
      '`https://example.com Tolles Projekt`',
      { parse_mode: 'Markdown' }
    );
  });

  bot.help((ctx) => {
    ctx.reply(
      '📌 *So nutzt du MindVault:*\n\n' +
      '*Link speichern:*\n' +
      'Einfach URL senden – fertig!\n\n' +
      '*Link + Notiz:*\n' +
      '`https://vimeo.com/123 Schöne Lichtstimmung`\n\n' +
      '*Tags hinzufügen:*\n' +
      'Nach dem Speichern einfach Tags als nächste Nachricht senden:\n' +
      '`portrait warm tones cinematic`\n' +
      'oder: `#portrait #warm-tones #cinematic`\n\n' +
      '*Was passiert:*\n' +
      '• Source wird erkannt (Instagram, Vimeo, YouTube...)\n' +
      '• Titel & Thumbnail werden automatisch geholt\n' +
      '• AI analysiert das Bild und generiert Tags\n' +
      '• Deine manuellen Tags werden hinzugefügt\n\n' +
      'Unterstützte Plattformen: Instagram, Vimeo, YouTube, TikTok, Pinterest, Behance, Dribbble, Flickr, Unsplash, Twitter/X + alle Webseiten',
      { parse_mode: 'Markdown' }
    );
  });

  // Handle messages
  bot.on('message', async (ctx) => {
    const text = ctx.message.text || '';
    const chatId = ctx.chat.id;

    // Extract URLs from message
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = text.match(urlRegex);

    // No URL found — check if this is a tag follow-up
    if (!urls || urls.length === 0) {
      const last = lastSavedLink.get(chatId);

      // Only accept tags within 5 minutes of last saved link
      if (last && (Date.now() - last.timestamp) < 5 * 60 * 1000) {
        const userTags = parseTags(text);

        if (userTags.length === 0) {
          ctx.reply('🤔 Ich konnte keinen Link finden.\nSende mir eine URL!');
          return;
        }

        // Merge with existing AI tags
        try {
          const row = db.prepare('SELECT tags FROM links WHERE id = ?').get(last.linkId);
          const existingTags = row ? JSON.parse(row.tags || '[]') : [];
          const mergedTags = [...new Set([...userTags, ...existingTags])];

          db.prepare('UPDATE links SET tags = ? WHERE id = ?')
            .run(JSON.stringify(mergedTags), last.linkId);

          console.log(`[Bot] Manual tags for Link ${last.linkId}: ${userTags.join(', ')}`);

          const tagReply = `🏷 *${userTags.length} Tags hinzugefügt:*\n` +
            userTags.map(t => `\`${t}\``).join(' ') +
            (existingTags.length > 0 ? `\n\n_+ ${existingTags.length} AI-Tags_` : '');
          ctx.reply(tagReply, { parse_mode: 'Markdown' })
            .catch(() => ctx.reply(tagReply.replace(/[_*`\[\]]/g, '')));

          // Clear so same tags aren't added twice
          lastSavedLink.delete(chatId);
        } catch (err) {
          console.error('Error adding tags:', err);
          ctx.reply('❌ Fehler beim Hinzufügen der Tags');
        }
        return;
      }

      ctx.reply('🤔 Ich konnte keinen Link finden.\nSende mir eine URL!');
      return;
    }

    // Extract note (text without URLs)
    let note = text;
    urls.forEach((url) => {
      note = note.replace(url, '').trim();
    });
    // Filter out auto-generated share texts from apps (e.g. Vimeo "Watch...", Instagram "photo by...")
    if (note) {
      const autoTitlePatterns = [
        /^Watch\s/i,                                          // Vimeo share: "Watch XYZ on Vimeo"
        /on Vimeo\.?$/i,                                      // "... on Vimeo"
        /^Instagram\s(photo|video|post|reel)\s/i,             // Instagram share text
        /^.+\s[-–|]\s(YouTube|TikTok|Pinterest|Behance|Dribbble)\.?$/i,  // "Title - YouTube"
        /^Shared?\s(from|via)\s/i,                            // "Shared from TikTok" etc.
        /^Check out/i,                                        // "Check out this video..."
      ];
      if (autoTitlePatterns.some(p => p.test(note))) {
        note = null;
      }
    }
    note = note || null;

    // Process each URL
    const saved = [];
    const errors = [];
    let lastLinkId = null;

    for (const url of urls) {
      try {
        // Detect platform
        const source = detectSource(url);

        // Send "working" feedback for first URL
        if (urls.length === 1) {
          ctx.sendChatAction('typing');
        }

        // Fetch metadata — yt-dlp first for video platforms (correct aspect ratio)
        const meta = await fetchSmartMetadata(url, source);

        // Download thumbnail locally
        let localThumb = null;
        if (meta.thumbnail_url) {
          localThumb = await downloadThumbnail(meta.thumbnail_url);
        }

        // Save to database
        const result = insertLink.run({
          url: url,
          source: source,
          title: meta.title || null,
          description: meta.description || null,
          thumbnail_url: meta.thumbnail_url || null,
          tags: '[]',
          note: note,
          space: 'eye',
        });

        const linkId = result.lastInsertRowid;
        lastLinkId = linkId;

        // Save local thumbnail and author URL
        if (localThumb) {
          db.prepare('UPDATE links SET local_thumbnail = ? WHERE id = ?').run(localThumb, linkId);
        }
        if (meta.author_url) {
          db.prepare('UPDATE links SET author_url = ? WHERE id = ?').run(meta.author_url, linkId);
        }

        // AI-Analyse async (nicht blockierend)
        // Use local thumbnail file if available (remote URLs are often blocked)
        const aiImageSource = localThumb
          ? path.join(__dirname, '..', 'data', 'thumbnails', localThumb)
          : meta.thumbnail_url;
        if (aiImageSource) {
          analyzeContent(aiImageSource, {
            title: meta.title,
            description: meta.description,
            source,
            url,
          }).then((aiResult) => {
            if (aiResult.tags.length > 0) {
              db.prepare('UPDATE links SET tags = ? WHERE id = ?')
                .run(JSON.stringify(aiResult.tags), linkId);
              console.log(`[AI] Tags für Link ${linkId}: ${aiResult.tags.join(', ')}`);
            }
            if (aiResult.description && !meta.description) {
              db.prepare('UPDATE links SET description = ? WHERE id = ?')
                .run(aiResult.description, linkId);
            }
          }).catch(() => {});
        }

        const icon = sourceIcon(source);
        saved.push(`${icon} ${meta.title || url}`);
      } catch (err) {
        console.error('Error saving link:', err);
        errors.push(url);
      }
    }

    // Remember last saved link for tag follow-up
    if (lastLinkId) {
      lastSavedLink.set(chatId, {
        linkId: lastLinkId,
        timestamp: Date.now(),
      });
    }

    // Build response
    let reply = '';

    if (saved.length > 0) {
      reply += `✅ ${saved.length === 1 ? 'Gespeichert!' : saved.length + ' Links gespeichert!'}\n\n`;
      reply += saved.join('\n');
      if (note) {
        reply += `\n\n📝 _${note}_`;
      }
      reply += '\n\n🏷 _Tags? Sende sie als nächste Nachricht_';
    }

    if (errors.length > 0) {
      reply += `\n\n❌ Fehler bei: ${errors.join(', ')}`;
    }

    ctx.reply(reply, { parse_mode: 'Markdown', disable_web_page_preview: true })
      .catch(() => {
        // Fallback: send without Markdown if parsing fails (e.g. usernames with underscores)
        ctx.reply(reply.replace(/[_*`\[\]]/g, ''), { disable_web_page_preview: true });
      });
  });

  return bot;
}

/**
 * Parse tags from user message.
 * Supports: "#tag1 #tag2", "tag1, tag2, tag3", "tag1 tag2 tag3"
 */
function parseTags(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Hashtag format: #tag1 #tag2
  if (trimmed.includes('#')) {
    return trimmed
      .split(/\s+/)
      .filter(w => w.startsWith('#'))
      .map(w => w.replace(/^#+/, '').replace(/-/g, ' ').toLowerCase())
      .filter(t => t.length > 0);
  }

  // Comma-separated: tag1, tag2, tag3
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);
  }

  // Space-separated: tag1 tag2 tag3
  // Multi-word tags not possible in this mode
  return trimmed
    .split(/\s+/)
    .map(t => t.toLowerCase())
    .filter(t => t.length > 0);
}

function sourceIcon(source) {
  const icons = {
    instagram: '📸',
    vimeo: '🎬',
    youtube: '▶️',
    tiktok: '🎵',
    pinterest: '📌',
    behance: '🎨',
    dribbble: '🏀',
    flickr: '📷',
    unsplash: '🖼',
    twitter: '🐦',
    web: '🌐',
  };
  return icons[source] || '🌐';
}

module.exports = { createBot };
