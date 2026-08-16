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

const quotedSerialize = (event, sock) => {
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
            participantAlt: contextInfo?.participantAlt
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

    Object.defineProperty(q, 'sock', {
        value: sock,
        enumerable: false
    });

    Object.defineProperty(q, 'reply', {
        value: reply,
        enumerable: false
    });

    return q;
};

const messageSerialize = (event, sock) => {
    const m = { ...event };

    const chatBase = chatSerialize(m);
    if (chatBase) m.chat = chatBase;

    const contactBase = contactSerialize(m);
    if (contactBase) m.contact = contactBase;

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

    m.quoted = quotedSerialize(m, sock);

    return m;
};

export {
    contentSerialize,
    chatSerialize,
    contactSerialize,
    quotedSerialize,
    messageSerialize
};
