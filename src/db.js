import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

import cfg from '../config.js';

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

    CREATE TABLE IF NOT EXISTS theme (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        title TEXT,
        description TEXT,
        url TEXT,
        message BLOB,
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

const stmt = {
    chats: {
        selectAll: db.prepare(`
            SELECT *
            FROM chats
        `),

        insert: db.prepare(`
            INSERT INTO chats (
                jid,
                name
            )
            VALUES (
                :jid,
                :name
            )
            RETURNING *
        `),

        updateName: db.prepare(`
            UPDATE chats
            SET
                name = COALESCE(:name, name)
            WHERE id = :id
            RETURNING *
        `)
    },

    contacts: {
        insert: db.prepare(`
            INSERT INTO contacts (
                lid,
                pn,
                push_name,
                updated_at
            )
            VALUES (
                :lid,
                :pn,
                :pushName,
                COALESCE(:updatedAt, unixepoch('now'))
            )
            RETURNING
                id,
                lid,
                pn,
                push_name AS pushName
        `),

        selectAll: db.prepare(`
            SELECT
                id,
                lid,
                pn,
                push_name AS pushName
            FROM contacts
        `),

        getById: db.prepare(`
            SELECT
                id,
                lid,
                pn,
                push_name AS pushName
            FROM contacts
            WHERE id = :id
        `),

        update: db.prepare(`
            UPDATE contacts
            SET
                pn = COALESCE(:pn, pn),
                push_name = COALESCE(:pushName, push_name),
                updated_at = COALESCE(:updatedAt, unixepoch('now'))
            WHERE id = :id
            RETURNING
                id,
                lid,
                pn,
                push_name AS pushName
        `)
    },

    selfSettings: {
        get: db.prepare(`
            SELECT
                id,
                global_self AS globalSelf,
                updated_at AS updatedAt
            FROM self_settings
            WHERE id = 1
        `),

        upsert: db.prepare(`
            INSERT INTO self_settings (
                id,
                global_self,
                updated_at
            )
            VALUES (
                1,
                :globalSelf,
                unixepoch('now')
            )
            ON CONFLICT (id) DO UPDATE SET
                global_self = excluded.global_self,
                updated_at = unixepoch('now')
            RETURNING
                id,
                global_self AS globalSelf,
                updated_at AS updatedAt
        `)
    },

    selfGroups: {
        selectAll: db.prepare(`
            SELECT
                group_id AS groupId,
                self_override AS selfOverride,
                updated_at AS updatedAt
            FROM self_groups
        `),

        get: db.prepare(`
            SELECT
                group_id AS groupId,
                self_override AS selfOverride,
                updated_at AS updatedAt
            FROM self_groups
            WHERE group_id = :groupId
        `),

        upsert: db.prepare(`
            INSERT INTO self_groups (
                group_id,
                self_override,
                updated_at
            )
            VALUES (
                :groupId,
                :selfOverride,
                unixepoch('now')
            )
            ON CONFLICT (group_id) DO UPDATE SET
                self_override = excluded.self_override,
                updated_at = unixepoch('now')
            RETURNING
                group_id AS groupId,
                self_override AS selfOverride,
                updated_at AS updatedAt
        `),

        delete: db.prepare(`
            DELETE FROM self_groups
            WHERE group_id = :groupId
        `)
    },

    theme: {
        get: db.prepare(`
            SELECT
                id,
                title,
                description,
                url,
                message,
                updated_at AS updatedAt
            FROM theme
            WHERE id = 1
        `),

        upsert: db.prepare(`
            INSERT INTO theme (
                id,
                title,
                description,
                url,
                message,
                updated_at
            )
            VALUES (
                1,
                :title,
                :description,
                :url,
                :message,
                unixepoch('now')
            )
            ON CONFLICT (id) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                url = excluded.url,
                message = excluded.message,
                updated_at = unixepoch('now')
            RETURNING
                id,
                title,
                description,
                url,
                message
        `)
    },

    messages: {
        upsert: db.prepare(`
            INSERT INTO messages (
                remote_jid,
                key_id,
                timestamp,
                raw
            )
            VALUES (
                :remoteJid,
                :keyId,
                :timestamp,
                :raw
            )
            ON CONFLICT (remote_jid, key_id) DO UPDATE SET
                raw = excluded.raw,
                timestamp = COALESCE(excluded.timestamp, timestamp)
        `),

        getByKey: db.prepare(`
            SELECT *
            FROM messages
            WHERE remote_jid = :remoteJid AND key_id = :keyId
        `),

        getByKeyId: db.prepare(`
            SELECT *
            FROM messages
            WHERE key_id = :keyId
            ORDER BY timestamp DESC
            LIMIT 1
        `),

        count: db.prepare(`
            SELECT COUNT(*) AS count
            FROM messages
        `)
    }
};

export { db, stmt };
