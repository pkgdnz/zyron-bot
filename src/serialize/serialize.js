import { getContentType, unwrapMessage } from 'zapo-js';

import { resolveJidPair } from '../helper/common.js';

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
