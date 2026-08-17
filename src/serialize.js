import { getContentType, unwrapMessage, toUserJid } from 'zapo-js';

import { resolveJidPair } from './helpers.js';

export function serializeMessage(message) {
    return Buffer.from(
        JSON.stringify(message, (key, value) => {
            if (value instanceof Uint8Array) {
                return {
                    __bytes: Buffer.from(value).toString('base64')
                };
            }

            return value;
        })
    );
}

export function deserializeMessage(raw) {
    return JSON.parse(raw.toString(), (key, value) => {
        if (
            value &&
            typeof value === 'object' &&
            typeof value.__bytes === 'string'
        ) {
            return new Uint8Array(
                Buffer.from(value.__bytes, 'base64')
            );
        }

        return value;
    });
}

export function serializeChat(chat) {
    if (!chat?.id?.endsWith('@g.us')) return undefined;

    return {
        jid: chat.id,
        name: chat.name ?? chat.subject ?? null
    };
}

export function serializeContactFromMessage(event) {
    const { key, pushName, timestampSeconds } = event ?? {};

    if (!key) return undefined;

    const { lid, pn } = key.isGroup
        ? resolveJidPair(key.participant, key.participantAlt)
        : resolveJidPair(key.remoteJid, key.remoteJidAlt);

    if (!lid && !pn) return undefined;

    return {
        lid,
        pn,
        pushName: pushName ?? null,
        updatedAt: timestampSeconds ?? null
    };
}

export function serializeSelfContact(sock) {
    const creds = sock?.getCredentials?.() ?? null;

    if (!creds) return undefined;

    const lid = creds.meLid ? toUserJid(creds.meLid) : null;
    const pn = creds.meJid ? toUserJid(creds.meJid) : null;

    if (!lid && !pn) return undefined;

    return {
        lid,
        pn,
        pushName: creds.meDisplayName ?? creds.pushName ?? null
    };
}

function reply(text) {
    return this.sock.message.send(
        this.key.remoteJid,
        text,
        { quote: this }
    );
}

const contentSerialize = event => {
    const message = unwrapMessage(event?.message ?? {});

    const content = getContentType(message);

    if (!content && event?.messageStubType) {
        return {
            content: 'messageStubType',
            type: event.messageStubType
        };
    }

    return {
        content,
        type: message?.[content]?.type
    };
};

const chatSerialize = event => {
    const remoteJid = event?.key?.remoteJid;

    if (!remoteJid?.endsWith('@g.us')) return;

    return {
        jid: remoteJid,
        name: event.pushName ?? null
    };
};

const contactSerialize = event => {
    const { key, pushName, timestampSeconds } = event ?? {};

    if (!key) return;

    const { lid, pn } = key.isGroup
        ? resolveJidPair(key.participant, key.participantAlt)
        : resolveJidPair(key.remoteJid, key.remoteJidAlt);

    if (!lid && !pn) return;

    return {
        lid,
        pn,
        pushName: pushName ?? null,
        updatedAt: timestampSeconds ?? null
    };
};

function resolveContactFromStore(key, contactStore) {
    if (!key || !contactStore) return null;

    const { lid, pn } = key.isGroup
        ? resolveJidPair(key.participant, key.participantAlt)
        : resolveJidPair(key.remoteJid, key.remoteJidAlt);

    if (lid) return contactStore.getByLid(lid);
    if (pn) return contactStore.getByPn(pn);
    return null;
}

const quotedSerialize = (event, sock, stores) => {
    const message = unwrapMessage(event.message ?? {});

    const content = getContentType(message);
    const contextInfo = message?.[content]?.contextInfo;
    const quotedMessage = contextInfo?.quotedMessage;

    if (!quotedMessage) return;

    const quotedContent = getContentType(unwrapMessage(quotedMessage ?? {}));
    const ct = quotedMessage?.[quotedContent];

    const q = {
        key: {
            id: contextInfo?.stanzaId,
            participant: contextInfo?.participant,
            remoteJid: event.key.remoteJid,
            fromMe: false,
            participantAlt: contextInfo?.participantAlt,
            isGroup: event.key?.isGroup
        },
        message: quotedMessage,
        content: quotedContent,
        text:
            quotedMessage?.conversation ??
            ct?.text ??
            ct?.caption ??
            ct?.body?.text ??
            null
    };

    const dbContact = resolveContactFromStore(q.key, stores?.contactStore);
    if (dbContact) {
        q.contact = {
            id: dbContact.id ?? null,
            lid: dbContact.lid ?? null,
            pn: dbContact.pn ?? null,
            pushName: dbContact.pushName ?? null,
            updatedAt: dbContact.updatedAt ?? null
        };
    }

    Object.defineProperty(q, 'sock', {
        value: sock,
        enumerable: false
    });

    Object.defineProperty(q, 'reply', {
        value: reply,
        enumerable: false
    });

    Object.defineProperty(q, Symbol.toPrimitive, {
        value(hint) {
            if (hint === 'number') return this.key?.id ? 1 : 0;
            return this.key?.id ? `[Quoted ${this.key.id}]` : '[Quoted empty]';
        },
        enumerable: false
    });

    return q;
};

const messageSerialize = (event, sock, stores) => {
    const m = { ...event };

    const chatBase = chatSerialize(m);
    if (chatBase) m.chat = chatBase;

    const contactBase = contactSerialize(m);
    if (contactBase) m.contact = contactBase;

    if (stores?.contactStore) {
        const dbContact = resolveContactFromStore(m.key, stores.contactStore);
        if (dbContact) {
            m.contact = {
                id: dbContact.id ?? null,
                lid: dbContact.lid ?? m.contact?.lid ?? null,
                pn: dbContact.pn ?? m.contact?.pn ?? null,
                pushName: dbContact.pushName ?? m.contact?.pushName ?? null,
                updatedAt: dbContact.updatedAt ?? m.contact?.updatedAt ?? null
            };
        }
    }

    if (typeof stores?.chatStore?.getById === 'function' && m.key?.remoteJid) {
        const dbChat = stores.chatStore.getById(m.key.remoteJid);
        if (dbChat) {
            m.chat = {
                jid: dbChat.jid ?? m.chat?.jid ?? m.key.remoteJid,
                name: dbChat.name ?? m.chat?.name ?? null
            };
        }
    }

    m.sender =
        m.contact?.lid ?? m.key?.participant ?? m.key?.remoteJid;

    const { content } = contentSerialize(m);
    m.content = content;

    const unwrapped = unwrapMessage(m.message ?? {});
    const ct = unwrapped?.[content];

    m.text =
        unwrapped?.conversation ??
        ct?.text ??
        ct?.caption ??
        ct?.body?.text ??
        null;

    Object.defineProperty(m, 'sock', {
        value: sock,
        enumerable: false
    });

    Object.defineProperty(m, 'reply', {
        value: reply,
        enumerable: false
    });

    Object.defineProperty(m, Symbol.toPrimitive, {
        value(hint) {
            if (hint === 'number') return 1;
            return `[Message id=${this.key?.id ?? '?'} remoteJid=${this.key?.remoteJid ?? '?'}]`;
        },
        enumerable: false
    });

    m.quoted = quotedSerialize(m, sock, stores);

    return m;
};

export {
    contentSerialize,
    chatSerialize,
    contactSerialize,
    quotedSerialize,
    messageSerialize
};
