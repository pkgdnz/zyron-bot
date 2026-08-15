import { db } from "./database.js";

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

export default stmt;