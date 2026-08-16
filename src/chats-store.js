import stmt from './database/table.js';

class ChatStore {
    #map = new Map();

    constructor() {
        for (const chat of stmt.chats.selectAll.iterate()) {
            this.#map.set(chat.jid, chat);
        }

        console.log(`[chat-store] loaded ${this.#map.size} chats`);
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

export const chatStore = new ChatStore();