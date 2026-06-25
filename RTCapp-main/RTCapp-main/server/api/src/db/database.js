const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'api.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Bootstrap schema
db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id          TEXT PRIMARY KEY,
    app_id      TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    closed_at   INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    channel_id  TEXT NOT NULL,
    app_id      TEXT NOT NULL,
    identity    TEXT NOT NULL,
    room        TEXT NOT NULL,
    joined_at   INTEGER NOT NULL,
    left_at     INTEGER,
    duration_ms INTEGER,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_channel ON sessions(channel_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_app ON sessions(app_id);
  CREATE INDEX IF NOT EXISTS idx_channels_app ON channels(app_id);
`);

module.exports = db;