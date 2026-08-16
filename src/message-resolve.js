import { getContentType, proto, unwrapMessage } from 'zapo-js';

import { messageStore } from './zapo-store.js';

const decodeMessage = record => {
    if (!record?.messageBytes) return null;

    try {
        const message = proto.Message.decode(record.messageBytes);

        return {
            key: {
                id: record.id,
                remoteJid: record.threadJid,
                participant: record.participantJid ?? undefined,
                fromMe: record.fromMe
            },
            message,
            messageTimestamp: record.timestampMs
                ? Math.floor(record.timestampMs / 1000)
                : undefined
        };
    } catch {
        return null;
    }
};

export const resolveEvent = async (remoteJid, keyId) => {
    if (!keyId) return null;

    try {
        const record = await messageStore().getById(keyId);
        return decodeMessage(record);
    } catch {
        return null;
    }
};

export const enrichChain = async (msg, remoteJid, depth = 0) => {
    if (depth > 10) return msg;

    const unwrapped = unwrapMessage(msg ?? {});
    const type = getContentType(unwrapped);
    if (!type) return msg;

    const ct = unwrapped[type];
    const ci = ct?.contextInfo;
    if (!ci?.quotedMessage) return msg;

    const fullEvent = await resolveEvent(remoteJid, ci.stanzaId);
    const fullMsg = fullEvent?.message ?? null;

    const target = await enrichChain(
        fullMsg ?? ci.quotedMessage,
        remoteJid,
        depth + 1
    );

    const newCi = { ...ci, quotedMessage: target };

    const key = fullEvent?.key;
    if (key) {
        if (newCi.stanzaId == null) newCi.stanzaId = key.id;
        if (newCi.participant == null) newCi.participant = key.participant;
        if (newCi.remoteJid == null) newCi.remoteJid = key.remoteJid;
    }

    return { ...unwrapped, [type]: { ...ct, contextInfo: newCi } };
};

export const resolveMessageContent = async (q) => {
    if (!q?.key?.id) return null;

    let rawMessage = q.message;

    try {
        const record = await messageStore().getById(q.key.id);
        const decoded = decodeMessage(record);
        if (decoded) {
            rawMessage = decoded.message;
        }
    } catch {
        // fall back to the shallow quoted message carried on the event
    }

    let content = unwrapMessage(rawMessage ?? {});
    const type = getContentType(content);
    if (!type) return null;

    content = await enrichChain(content, q.key.remoteJid, 0);

    return { content, type };
};
