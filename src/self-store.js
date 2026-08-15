import stmt from './database/table.js';

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

export const selfStore = new SelfStore();

export function isSelfMode(chatId) {
    return selfStore.isSelfMode(chatId);
}
