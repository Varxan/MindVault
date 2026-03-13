/**
 * MindVault Auto-Backup
 * Saves a JSON backup to ~/Library/Application Support/mindvault/data/backups/
 * Runs on startup AND periodically (every 2 hours while app is open).
 * Optionally also writes to a cloud backup folder (e.g. Google Drive).
 * Keeps max 14 backups per location, oldest deleted automatically.
 *
 * Backup filenames include a timestamp so multiple backups per day are kept.
 * Example: mindvault-backup-2026-03-12T14-30.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { db, getSetting } = require('./database');

const DEV_DATA_ROOT = path.join(os.homedir(), 'Library', 'Application Support', 'mindvault', 'data');
const DATA_ROOT = process.env.DATA_PATH || DEV_DATA_ROOT;
const BACKUP_DIR = path.join(DATA_ROOT, 'backups');
const THUMB_DIR  = path.join(DATA_ROOT, 'thumbnails');
const MAX_BACKUPS = 14;
const EXPORT_VERSION = 2;
const BACKUP_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

let _backupTimer = null;

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
 * Returns true if written, false on error.
 */
function writeBackupToDir(dir, filename, content) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, content, 'utf8');

    // Rotate: keep only MAX_BACKUPS newest files
    const allBackups = fs.readdirSync(dir)
      .filter(f => f.startsWith('mindvault-backup-') && f.endsWith('.json'))
      .sort(); // chronological by name

    if (allBackups.length > MAX_BACKUPS) {
      const toDelete = allBackups.slice(0, allBackups.length - MAX_BACKUPS);
      for (const old of toDelete) {
        try {
          fs.unlinkSync(path.join(dir, old));
        } catch {}
      }
    }

    return true;
  } catch (err) {
    console.warn(`⚠️  Backup in "${dir}" fehlgeschlagen: ${err.message}`);
    return false;
  }
}

/**
 * Build the backup JSON content from the current database state.
 */
function buildBackupContent() {
  const links = db.prepare('SELECT * FROM links ORDER BY created_at DESC').all();
  const collections = db.prepare('SELECT * FROM collections ORDER BY created_at DESC').all();
  const assignments = db.prepare('SELECT * FROM collection_links').all();
  const linkColumns = db.prepare('PRAGMA table_info(links)').all().map(c => c.name);
  const collectionColumns = db.prepare('PRAGMA table_info(collections)').all().map(c => c.name);

  // Embed thumbnails as base64 so the backup is fully self-contained
  const linksWithThumbs = links.map(link => {
    const data = thumbToBase64(link.local_thumbnail);
    return data ? { ...link, thumbnail_data: data } : link;
  });

  // Export non-sensitive settings — API keys never exported
  const EXPORTABLE_SETTINGS = ['custom_preferred_tags', 'tag_catalog_ratio', 'custom_ai_prompt', 'download_path', 'cloud_backup_path'];
  const settingsRows = db.prepare(
    `SELECT key, value FROM settings WHERE key IN (${EXPORTABLE_SETTINGS.map(() => '?').join(',')})`
  ).all(...EXPORTABLE_SETTINGS);
  const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));

  return {
    content: JSON.stringify({
      version: EXPORT_VERSION,
      exported_at: new Date().toISOString(),
      schema: { link_fields: linkColumns, collection_fields: collectionColumns },
      settings,
      links: linksWithThumbs,
      collections,
      collection_links: assignments,
    }, null, 2),
    linkCount: links.length,
  };
}

function runAutoBackup() {
  try {
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace(':', '-'); // 2026-03-12T14-30
    const filename = `mindvault-backup-${timestamp}.json`;

    const cloudSetting = getSetting.get('cloud_backup_path');
    const cloudDir = (cloudSetting && cloudSetting.value) ? cloudSetting.value : null;

    const { content, linkCount } = buildBackupContent();

    // Write to local backup dir
    const wroteLocal = writeBackupToDir(BACKUP_DIR, filename, content);
    if (wroteLocal) {
      console.log(`💾 Auto-Backup: ${filename} (${linkCount} Links)`);
    }

    // Write to cloud backup dir (e.g. Google Drive folder)
    if (cloudDir) {
      const wroteCloud = writeBackupToDir(cloudDir, filename, content);
      if (wroteCloud) {
        console.log(`☁️  Cloud-Backup: ${cloudDir}/${filename}`);
      }
    }
  } catch (err) {
    console.warn(`⚠️  Auto-Backup fehlgeschlagen: ${err.message}`);
  }
}

/**
 * Start the backup system: run immediately + schedule periodic backups.
 */
function startBackupSystem() {
  // Run backup immediately on startup
  runAutoBackup();

  // Then every 2 hours while the app is running
  _backupTimer = setInterval(runAutoBackup, BACKUP_INTERVAL_MS);
  console.log(`💾 Backup-System aktiv: alle ${BACKUP_INTERVAL_MS / 3600000}h`);
}

/**
 * Stop the periodic backup timer (call on app shutdown).
 */
function stopBackupSystem() {
  if (_backupTimer) {
    clearInterval(_backupTimer);
    _backupTimer = null;
  }
}

module.exports = { runAutoBackup, startBackupSystem, stopBackupSystem, BACKUP_DIR };
