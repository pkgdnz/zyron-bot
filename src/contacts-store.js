import stmt from './database/table.js';

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

export const contactStore = new ContactStore();