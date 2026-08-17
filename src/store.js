import { stmt } from './db.js';
import { serializeMessage, deserializeMessage, serializeChat } from './serialize.js';
import { toTimestamp } from './helpers.js';

const UNSTORABLE = new Set([
    'protocolMessage',
    'senderKeyDistributionMessage',
    'messageContextInfo',
    'reactionMessage',
    'encReactionMessage',
    'unavailableMessage'
]);

class MessageStore {
    constructor() {
        const { count } = stmt.messages.count.get();
        console.log(`[message-store] loaded ${count} messages`);
    }

    insert(message) {
        const remoteJid = message.key?.remoteJid;
        const keyId = message.key?.id;

        if (!remoteJid || !keyId) return;

        const msgType = message.messageStubType;
        if (msgType && UNSTORABLE.has(msgType)) return;

        const raw = serializeMessage(message);

        return stmt.messages.upsert.run({
            remoteJid,
            keyId,
            timestamp: toTimestamp(
                message.messageTimestamp ?? message.timestampSeconds
            ),
            raw
        });
    }

    getByKey(remoteJid, keyId) {
        const row = stmt.messages.getByKey.get({ remoteJid, keyId });
        if (!row) return null;

        return { ...row, raw: deserializeMessage(row.raw) };
    }

    getByKeyId(keyId) {
        const row = stmt.messages.getByKeyId.get({ keyId });
        if (!row) return null;

        return { ...row, raw: deserializeMessage(row.raw) };
    }
}

class ContactStore {
    #map = new Map();
    #pnToLid = new Map();

    constructor() {
        for (const contact of stmt.contacts.selectAll.iterate()) {
            this.#map.set(contact.lid, contact);

            if (contact.pn) {
                this.#pnToLid.set(contact.pn, contact.lid);
            }
        }

        console.log(
            `[contact-store] loaded ${this.#map.size} contacts`
        );
    }

    upsertAndGet({ lid, pn, pushName, updatedAt } = {}) {
        if (!lid) return;

        const cached = this.#map.get(lid);

        if (cached) {
            const nameChanged =
                pushName && cached.pushName !== pushName;
            const pnChanged = pn && cached.pn !== pn;

            if (!nameChanged && !pnChanged) return cached;

            const updated = stmt.contacts.update.get({
                id: cached.id,
                pn: pn ?? null,
                pushName: pushName ?? null,
                updatedAt: updatedAt ?? null
            });

            this.#map.set(lid, updated);

            if (pn) {
                this.#pnToLid.set(pn, lid);
            }

            return updated;
        }

        if (!pushName && pushName !== null) return;

        const created = stmt.contacts.insert.get({
            lid,
            pn: pn ?? null,
            pushName,
            updatedAt: updatedAt ?? null
        });

        this.#map.set(lid, created);

        if (pn) {
            this.#pnToLid.set(pn, lid);
        }

        return created;
    }

    getByPn(pn) {
        const lid = this.#pnToLid.get(pn);
        return lid ? this.#map.get(lid) : undefined;
    }

    getByLid(lid) {
        return this.#map.get(lid);
    }
}

class ChatStore {
    #map = new Map();

    constructor() {
        for (const chat of stmt.chats.selectAll.iterate()) {
            this.#map.set(chat.jid, chat);
        }

        console.log(`[chat-store] loaded ${this.#map.size} chats`);
    }

    getById(jid) {
        return this.#map.get(jid);
    }

    upsertAndGet({ jid, name } = {}) {
        if (!jid) return;

        const cached = this.#map.get(jid);

        if (cached) {
            if (!name || cached.name === name) return cached;

            const updated = stmt.chats.updateName.get({
                id: cached.id,
                name
            });

            this.#map.set(jid, updated);
            return updated;
        }

        const created = stmt.chats.insert.get({
            jid,
            name: name ?? null
        });

        this.#map.set(jid, created);
        return created;
    }
}

class GroupStore {
    #map = new Map();

    upsertAndGet(metadata) {
        const id = metadata?.id ?? metadata?.jid;

        if (!id) return;

        const cached = this.#map.get(id);
        const merged = { ...cached, ...metadata, id };

        this.#map.set(id, merged);
        chatStore.upsertAndGet(serializeChat(merged));

        return merged;
    }

    remove(id) {
        return this.#map.delete(id);
    }

    getById(id) {
        return this.#map.get(id);
    }

    getAll() {
        return [...this.#map.values()];
    }

    get size() {
        return this.#map.size;
    }
}

class SelfStore {
    #globalSelf = false;
    #groups = new Map();

    constructor() {
        const row = stmt.selfSettings.get.get();
        this.#globalSelf = row?.globalSelf === 1;

        for (const row of stmt.selfGroups.selectAll.iterate()) {
            this.#groups.set(row.groupId, row);
        }

        console.log(
            `[self-store] loaded global=${this.#globalSelf ? 'on' : 'off'} ` +
            `${this.#groups.size} group override(s)`
        );
    }

    isSelfMode(chatId) {
        if (!chatId) return false;

        if (chatId.endsWith('@g.us')) {
            const override = this.#groups.get(chatId);

            if (override) {
                if (override.selfOverride === 1) return true;
                if (override.selfOverride === 0) return false;
            }
        }

        return this.#globalSelf;
    }

    setGlobalSelf(value) {
        const row = stmt.selfSettings.upsert.get({
            globalSelf: value ? 1 : 0
        });

        this.#globalSelf = row.globalSelf === 1;

        return this.#globalSelf;
    }

    setGroupOverride(groupId, override) {
        if (!groupId?.endsWith('@g.us')) return;

        if (override === null) {
            stmt.selfGroups.delete.run({ groupId });
            this.#groups.delete(groupId);
            return;
        }

        const row = stmt.selfGroups.upsert.get({
            groupId,
            selfOverride: override ? 1 : 0
        });

        this.#groups.set(groupId, row);
    }

    get globalSelf() {
        return this.#globalSelf;
    }

    getGroupOverride(groupId) {
        const row = this.#groups.get(groupId);
        return row ? row.selfOverride : null;
    }
}

export const messageStore = new MessageStore();
export const contactStore = new ContactStore();
export const chatStore = new ChatStore();
export const groupStore = new GroupStore();
export const selfStore = new SelfStore();

export function isSelfMode(chatId) {
    return selfStore.isSelfMode(chatId);
}

export async function fetchAllGroups(sock) {
    const groups = await sock.group.queryAllGroups();

    for (const metadata of groups) {
        groupStore.upsertAndGet(metadata);
    }

    console.log(`[group-store] loaded ${groupStore.size} groups`);
}

export function bindGroupEvents(sock) {
    sock.on('group', async event => {
        const groupJid = event.groupJid;

        if (!groupJid) return;

        const metadata = await sock.group
            .queryGroupMetadata(groupJid)
            .catch(() => null);

        groupStore.upsertAndGet(metadata ?? { id: groupJid });
    });
}
