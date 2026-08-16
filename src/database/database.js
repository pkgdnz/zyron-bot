import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

import cfg from '../../config.js';

mkdirSync(path.dirname(cfg.path.database), {
    recursive: true
});

const db = new Database(cfg.path.database);

db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS self_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        global_self INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
    ) STRICT;

    CREATE TABLE IF NOT EXISTS self_groups (
        group_id TEXT NOT NULL PRIMARY KEY,
        self_override INTEGER,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
    ) STRICT;

    CREATE TABLE IF NOT EXISTS theme (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        title TEXT,
        description TEXT,
        url TEXT,
        message BLOB,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
    ) STRICT;
`);

export { db };
