const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// In production (Electron), DATA_PATH is set to app.getPath('userData')/data
// In development, falls back to backend/data/ as before
const DATA_ROOT = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_ROOT, 'mindvault.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    source TEXT DEFAULT 'web',
    title TEXT,
    description TEXT,
    thumbnail_url TEXT,
    tags TEXT DEFAULT '[]',
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration: add columns if they don't exist (safe for existing DBs)
const columns = db.prepare("PRAGMA table_info(links)").all().map(c => c.name);
if (!columns.includes('note')) {
  db.exec('ALTER TABLE links ADD COLUMN note TEXT');
}
if (!columns.includes('thumbnail_url') && !columns.includes('image_url')) {
  db.exec('ALTER TABLE links ADD COLUMN thumbnail_url TEXT');
}
if (columns.includes('image_url') && !columns.includes('thumbnail_url')) {
  db.exec('ALTER TABLE links RENAME COLUMN image_url TO thumbnail_url');
}
if (!columns.includes('local_thumbnail')) {
  db.exec('ALTER TABLE links ADD COLUMN local_thumbnail TEXT');
}
if (!columns.includes('media_path')) {
  db.exec('ALTER TABLE links ADD COLUMN media_path TEXT');
}
if (!columns.includes('media_type')) {
  db.exec('ALTER TABLE links ADD COLUMN media_type TEXT');
}
if (!columns.includes('file_path')) {
  db.exec('ALTER TABLE links ADD COLUMN file_path TEXT');
}
if (!columns.includes('author_url')) {
  db.exec('ALTER TABLE links ADD COLUMN author_url TEXT');
}
if (!columns.includes('media_saved')) {
  db.exec('ALTER TABLE links ADD COLUMN media_saved INTEGER DEFAULT 0');
}
if (!columns.includes('sort_position')) {
  db.exec('ALTER TABLE links ADD COLUMN sort_position INTEGER');
  // Initialize existing links: sort_position based on created_at DESC
  db.exec(`
    UPDATE links SET sort_position = (
      SELECT COUNT(*) FROM links AS l2 WHERE l2.created_at > links.created_at
    )
  `);
}

// Cleanup: remove "Watch..." notes that were accidentally saved from Vimeo link previews
db.exec(`UPDATE links SET note = NULL WHERE source = 'vimeo' AND note LIKE 'Watch%'`);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Collections tables
db.exec(`
  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS collection_links (
    collection_id INTEGER NOT NULL,
    link_id INTEGER NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (collection_id, link_id),
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
  )
`);

// Migration: add sort_position to collection_links
const clColumns = db.prepare("PRAGMA table_info(collection_links)").all().map(c => c.name);
if (!clColumns.includes('sort_position')) {
  db.exec('ALTER TABLE collection_links ADD COLUMN sort_position INTEGER DEFAULT 0');
}

// Settings table (key-value store for app config)
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSetting = db.prepare(`
  INSERT INTO settings (key, value) VALUES (@key, @value)
  ON CONFLICT(key) DO UPDATE SET value = @value
`);
const getAllSettings = db.prepare('SELECT key, value FROM settings');

// Prepared statements
const insertLink = db.prepare(`
  INSERT INTO links (url, source, title, description, thumbnail_url, tags, note)
  VALUES (@url, @source, @title, @description, @thumbnail_url, @tags, @note)
  ON CONFLICT(url) DO UPDATE SET
    title = COALESCE(@title, links.title),
    description = COALESCE(@description, links.description),
    thumbnail_url = COALESCE(@thumbnail_url, links.thumbnail_url),
    tags = CASE WHEN @tags != '[]' THEN @tags ELSE links.tags END,
    note = COALESCE(@note, links.note),
    updated_at = CURRENT_TIMESTAMP
`);

const getAllLinks = db.prepare('SELECT * FROM links ORDER BY created_at DESC');

const getLinksPaginated = db.prepare(
  'SELECT * FROM links ORDER BY created_at DESC LIMIT @limit OFFSET @offset'
);

const getLinkById = db.prepare('SELECT * FROM links WHERE id = @id');

const updateLink = db.prepare(`
  UPDATE links SET
    title = COALESCE(@title, title),
    description = COALESCE(@description, description),
    thumbnail_url = COALESCE(@thumbnail_url, thumbnail_url),
    tags = CASE WHEN @tags IS NOT NULL THEN @tags ELSE tags END,
    note = CASE WHEN @note IS NOT NULL THEN @note ELSE note END,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = @id
`);

const deleteLink = db.prepare('DELETE FROM links WHERE id = @id');

const searchLinks = db.prepare(`
  SELECT * FROM links
  WHERE url LIKE @query
    OR title LIKE @query
    OR description LIKE @query
    OR tags LIKE @query
    OR note LIKE @query
  ORDER BY created_at DESC
`);

const filterBySource = db.prepare(
  'SELECT * FROM links WHERE source = @source ORDER BY created_at DESC'
);

const countLinks = db.prepare('SELECT COUNT(*) as total FROM links');

// ── Collection Prepared Statements ──

const createCollection = db.prepare(`
  INSERT INTO collections (name, description)
  VALUES (@name, @description)
`);

const updateCollection = db.prepare(`
  UPDATE collections SET
    name = COALESCE(@name, name),
    description = COALESCE(@description, description),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = @id
`);

const deleteCollection = db.prepare('DELETE FROM collections WHERE id = @id');

const getCollectionById = db.prepare(`
  SELECT c.*, COUNT(cl.link_id) as link_count
  FROM collections c
  LEFT JOIN collection_links cl ON c.id = cl.collection_id
  WHERE c.id = @id
  GROUP BY c.id
`);

const getAllCollections = db.prepare(`
  SELECT c.*, COUNT(cl.link_id) as link_count
  FROM collections c
  LEFT JOIN collection_links cl ON c.id = cl.collection_id
  GROUP BY c.id
  ORDER BY c.updated_at DESC
`);

const addLinkToCollection = db.prepare(`
  INSERT OR IGNORE INTO collection_links (collection_id, link_id)
  VALUES (@collection_id, @link_id)
`);

const removeLinkFromCollection = db.prepare(`
  DELETE FROM collection_links
  WHERE collection_id = @collection_id AND link_id = @link_id
`);

const getCollectionLinks = db.prepare(`
  SELECT l.* FROM links l
  INNER JOIN collection_links cl ON l.id = cl.link_id
  WHERE cl.collection_id = @collection_id
  ORDER BY cl.added_at DESC
`);

const getCollectionThumbnails = db.prepare(`
  SELECT l.local_thumbnail, l.thumbnail_url FROM links l
  INNER JOIN collection_links cl ON l.id = cl.link_id
  WHERE cl.collection_id = @collection_id
    AND (l.local_thumbnail IS NOT NULL OR l.thumbnail_url IS NOT NULL)
  ORDER BY cl.added_at ASC
  LIMIT 4
`);

const getCollectionsForLink = db.prepare(`
  SELECT c.id, c.name FROM collections c
  INNER JOIN collection_links cl ON c.id = cl.collection_id
  WHERE cl.link_id = @link_id
  ORDER BY c.name ASC
`);

const filterByCollection = db.prepare(`
  SELECT l.* FROM links l
  INNER JOIN collection_links cl ON l.id = cl.link_id
  WHERE cl.collection_id = @collection_id
  ORDER BY cl.sort_position ASC, cl.added_at DESC
`);

// Bulk add links to collection (transaction)
const bulkAddLinksToCollection = db.transaction((collectionId, linkIds) => {
  for (const linkId of linkIds) {
    addLinkToCollection.run({ collection_id: collectionId, link_id: linkId });
  }
});

module.exports = {
  db,
  getSetting,
  setSetting,
  getAllSettings,
  insertLink,
  getAllLinks,
  getLinksPaginated,
  getLinkById,
  updateLink,
  deleteLink,
  searchLinks,
  filterBySource,
  countLinks,
  // Collections
  createCollection,
  updateCollection,
  deleteCollection,
  getCollectionById,
  getAllCollections,
  addLinkToCollection,
  removeLinkFromCollection,
  getCollectionLinks,
  getCollectionThumbnails,
  getCollectionsForLink,
  filterByCollection,
  bulkAddLinksToCollection,
};
