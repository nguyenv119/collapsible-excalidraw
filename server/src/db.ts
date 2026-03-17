import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'knowledge-canvas.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES nodes(id),
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    collapsed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    target_id TEXT,
    source_handle TEXT,
    target_handle TEXT,
    label TEXT,
    created_at TEXT NOT NULL
  );
`);

// Migration: add handle columns to existing databases
try {
  db.exec(`ALTER TABLE edges ADD COLUMN source_handle TEXT`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE edges ADD COLUMN target_handle TEXT`);
} catch { /* column already exists */ }

// Migration: add width/height columns to nodes for resize support
try {
  db.exec(`ALTER TABLE nodes ADD COLUMN width REAL`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE nodes ADD COLUMN height REAL`);
} catch { /* column already exists */ }

export default db;
