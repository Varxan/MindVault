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
      '🧠 *Welcome to MindVault!*\n\n' +
      'Send me a link and I\'ll save it for you.\n\n' +
      '*Commands:*\n' +
      '/start – This message\n' +
      '/help – Help & tips\n\n' +
      '_Tip: Add a note after the link!_\n' +
      '`https://example.com Great project`',
      { parse_mode: 'Markdown' }
    );
  });

  bot.help((ctx) => {
    ctx.reply(
      '📌 *How to use MindVault:*\n\n' +
      '*Save a link:*\n' +
      'Just send a URL – done!\n\n' +
      '*Link + note:*\n' +
      '`https://vimeo.com/123 Beautiful lighting`\n\n' +
      '*Add tags:*\n' +
      'After saving, just send tags as your next message:\n' +
      '`portrait warm tones cinematic`\n' +
      'or: `#portrait #warm-tones #cinematic`\n\n' +
      '*What happens:*\n' +
      '• Source is detected (Instagram, Vimeo, YouTube...)\n' +
      '• Title & thumbnail are fetched automatically\n' +
      '• AI analyzes the image and generates tags\n' +
      '• Your manual tags are added on top\n\n' +
      'Supported platforms: Instagram, Vimeo, YouTube, TikTok, Pinterest, Behance, Dribbble, Flickr, Unsplash, Twitter/X + all websites',
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
          ctx.reply('🤔 No link found.\nSend me a URL!');
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

          const tagReply = `🏷 *${userTags.length} tag${userTags.length === 1 ? '' : 's'} added:*\n` +
            userTags.map(t => `\`${t}\``).join(' ') +
            (existingTags.length > 0 ? `\n\n_+ ${existingTags.length} AI tags_` : '');
          ctx.reply(tagReply, { parse_mode: 'Markdown' })
            .catch(() => ctx.reply(tagReply.replace(/[_*`\[\]]/g, '')));

          // Clear so same tags aren't added twice
          lastSavedLink.delete(chatId);
        } catch (err) {
          console.error('Error adding tags:', err);
          ctx.reply('❌ Error adding tags');
        }
        return;
      }

      ctx.reply('🤔 No link found.\nSend me a URL!');
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

        // AI analysis async (non-blocking)
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
              console.log(`[AI] Tags for Link ${linkId}: ${aiResult.tags.join(', ')}`);
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
      reply += `✅ ${saved.length === 1 ? 'Saved!' : saved.length + ' links saved!'}\n\n`;
      reply += saved.join('\n');
      if (note) {
        reply += `\n\n📝 _${note}_`;
      }
      reply += '\n\n🏷 _Tags? Send them as your next message_';
    }

    if (errors.length > 0) {
      reply += `\n\n❌ Failed: ${errors.join(', ')}`;
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
