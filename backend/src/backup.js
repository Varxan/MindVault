/**
 * MindVault Auto-Backup
 * Saves a JSON backup on startup to backend/data/backups/
 * Optionally also writes to a cloud backup folder (e.g. Google Drive).
 * Keeps max 7 backups per location, oldest deleted automatically.
 */

const fs = require('fs');
const path = require('path');
const { db, getSetting } = require('./database');

const DATA_ROOT = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(DATA_ROOT, 'backups');
const THUMB_DIR  = path.join(DATA_ROOT, 'thumbnails');
const MAX_BACKUPS = 7;
const EXPORT_VERSION = 2;

/** Read a thumbnail file and return a base64 data URI, or null if missing. */
function thumbToBase64(filename) {
  if (!filename) return null;
  try {
    const buf = fs.readFileSync(path.join(THUMB_DIR, filename));
    const ext = path.extname(filename).slice(1).toLowerCase() || 'jpg';
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null; // file missing — skip
  }
}

/**
 * Write one backup JSON to a directory, rotate old files.
 * Returns true if written, false if skipped (already exists today).
 */
function writeBackupToDir(dir, filename, content) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filepath = path.join(dir, filename);

    // Skip if today's backup already exists
    if (fs.existsSync(filepath)) {
      return false;
    }

    fs.writeFileSync(filepath, content, 'utf8');

    // Rotate: keep only MAX_BACKUPS newest files
    const allBackups = fs.readdirSync(dir)
      .filter(f => f.startsWith('mindvault-backup-') && f.endsWith('.json'))
      .sort(); // YYYY-MM-DD alphabetical = chronological

    if (allBackups.length > MAX_BACKUPS) {
      const toDelete = allBackups.slice(0, allBackups.length - MAX_BACKUPS);
      for (const old of toDelete) {
        try {
          fs.unlinkSync(path.join(dir, old));
          console.log(`🗑  Altes Backup gelöscht (${path.basename(dir)}): ${old}`);
        } catch {}
      }
    }

    return true;
  } catch (err) {
    console.warn(`⚠️  Backup in "${dir}" fehlgeschlagen: ${err.message}`);
    return false;
  }
}

function runAutoBackup() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const filename = `mindvault-backup-${today}.json`;

    // Build export data (same format as manual export)
    const localPath = path.join(BACKUP_DIR, filename);
    const cloudSetting = getSetting.get('cloud_backup_path');
    const cloudDir = (cloudSetting && cloudSetting.value) ? cloudSetting.value : null;

    // If both targets already have today's backup, nothing to do
    const localExists = fs.existsSync(localPath);
    const cloudExists = cloudDir ? fs.existsSync(path.join(cloudDir, filename)) : true;
    if (localExists && cloudExists) {
      console.log(`💾 Auto-Backup bereits vorhanden für heute: ${filename}`);
      return;
    }

    // Build export JSON (only if at least one target needs it)
    const links = db.prepare('SELECT * FROM links ORDER BY created_at DESC').all();
    const collections = db.prepare('SELECT * FROM collections ORDER BY created_at DESC').all();
    const assignments = db.prepare('SELECT * FROM collection_links').all();
    const linkColumns = db.prepare('PRAGMA table_info(links)').all().map(c => c.name);
    const collectionColumns = db.prepare('PRAGMA table_info(collections)').all().map(c => c.name);

    // Embed thumbnails as base64 so the backup is fully self-contained.
    // This ensures thumbnails survive migration to a new machine or fresh install.
    const linksWithThumbs = links.map(link => {
      const data = thumbToBase64(link.local_thumbnail);
      return data ? { ...link, thumbnail_data: data } : link;
    });

    // Export non-sensitive settings (tag config, paths) — API keys never exported
    const EXPORTABLE_SETTINGS = ['custom_preferred_tags', 'tag_catalog_ratio', 'custom_ai_prompt', 'download_path', 'cloud_backup_path'];
    const settingsRows = db.prepare(
      `SELECT key, value FROM settings WHERE key IN (${EXPORTABLE_SETTINGS.map(() => '?').join(',')})`
    ).all(...EXPORTABLE_SETTINGS);
    const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));

    const exportData = {
      version: EXPORT_VERSION,
      exported_at: new Date().toISOString(),
      schema: { link_fields: linkColumns, collection_fields: collectionColumns },
      settings,
      links: linksWithThumbs,
      collections,
      collection_links: assignments,
    };

    const content = JSON.stringify(exportData, null, 2);

    // Write to local backup dir
    const wroteLocal = writeBackupToDir(BACKUP_DIR, filename, content);
    if (wroteLocal) {
      console.log(`💾 Auto-Backup lokal: ${filename} (${links.length} Links)`);
    }

    // Write to cloud backup dir (e.g. Google Drive folder)
    if (cloudDir) {
      const wroteCloud = writeBackupToDir(cloudDir, filename, content);
      if (wroteCloud) {
        console.log(`☁️  Auto-Backup Cloud: ${cloudDir}/${filename}`);
      }
    }
  } catch (err) {
    console.warn(`⚠️  Auto-Backup fehlgeschlagen: ${err.message}`);
  }
}

module.exports = { runAutoBackup, BACKUP_DIR };
