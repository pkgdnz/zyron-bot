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

    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY,
        lid TEXT NOT NULL UNIQUE,
        pn TEXT UNIQUE,
        push_name TEXT,
        updated_at INTEGER
    ) STRICT;

    CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY,
        jid TEXT NOT NULL UNIQUE,
        name TEXT
    ) STRICT;

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
`);

const messagesExists = db
    .prepare(`
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name = 'messages'
    `)
    .get();

if (messagesExists) {
    const columns = db.prepare(`PRAGMA table_info(messages)`).all();
    const hasRemoteJid = columns.some(col => col.name === 'remote_jid');

    if (!hasRemoteJid) {
        let legacyName = 'messages_legacy';
        let suffix = 1;

        while (
            db
                .prepare(`
                    SELECT 1
                    FROM sqlite_master
                    WHERE type = 'table' AND name = :name
                `)
                .get({ name: legacyName })
        ) {
            legacyName = `messages_legacy_${suffix++}`;
        }

        db.exec(`ALTER TABLE messages RENAME TO ${legacyName}`);

        const legacyColumns = db.prepare(`PRAGMA table_info(${legacyName})`).all();
        const legacyColumnNames = new Set(legacyColumns.map(c => c.name));
        const hasJid = legacyColumnNames.has('jid');
        const hasKey = legacyColumnNames.has('key');
        const hasData = legacyColumnNames.has('data');

        if (hasJid && hasKey) {
            const insert = db.prepare(`
                INSERT OR IGNORE INTO messages (remote_jid, key_id, timestamp, raw)
                SELECT
                    jid,
                    key,
                    COALESCE(timestamp, 0),
                    COALESCE(data, '{}')
                FROM ${legacyName}
            `);

            const { changes } = insert.run();
            console.log(`[database] migrated ${changes} messages from ${legacyName}`);
        } else {
            console.log(`[database] legacy table ${legacyName} kept as-is (incompatible schema)`);
        }
    }
}

db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY,
        remote_jid TEXT NOT NULL,
        key_id TEXT NOT NULL,
        timestamp INTEGER,
        raw BLOB NOT NULL,
        UNIQUE (remote_jid, key_id)
    ) STRICT;
`);

export { db };