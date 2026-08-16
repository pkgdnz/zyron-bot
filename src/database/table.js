import { db } from "./database.js";

const stmt = {
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
    }
};

export default stmt;
