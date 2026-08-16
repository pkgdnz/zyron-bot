import { chatStore } from './chats-store.js';
import { serializeChat } from './serialize/chat.js';

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

export const groupStore = new GroupStore();

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