import { getContentType, unwrapMessage } from 'zapo-js';

import { messageStore } from './messages-store.js';

export const resolveEvent = (remoteJid, keyId) => {
    if (!keyId) return null;

    let row = remoteJid ? messageStore.getByKey(remoteJid, keyId) : null;
    if (!row) row = messageStore.getByKeyId(keyId);

    return row?.raw ?? null;
};

export const enrichChain = (msg, remoteJid, depth = 0) => {
    if (depth > 10) return msg;

    const unwrapped = unwrapMessage(msg ?? {});
    const type = getContentType(unwrapped);
    if (!type) return msg;

    const ct = unwrapped[type];
    const ci = ct?.contextInfo;
    if (!ci?.quotedMessage) return msg;

    const fullEvent = resolveEvent(remoteJid, ci.stanzaId);
    const fullMsg = fullEvent?.message ?? null;

    const target = enrichChain(fullMsg ?? ci.quotedMessage, remoteJid, depth + 1);

    const newCi = { ...ci, quotedMessage: target };

    const key = fullEvent?.key;
    if (key) {
        if (newCi.stanzaId == null) newCi.stanzaId = key.id;
        if (newCi.participant == null) newCi.participant = key.participant;
        if (newCi.remoteJid == null) newCi.remoteJid = key.remoteJid;
    }

    return { ...unwrapped, [type]: { ...ct, contextInfo: newCi } };
};

export const resolveMessageContent = (q) => {
    if (!q?.key?.id) return null;

    const row =
        messageStore.getByKey(q.key.remoteJid, q.key.id) ??
        messageStore.getByKeyId(q.key.id);
    const rawMessage = row?.raw?.message ?? q.message;

    let content = unwrapMessage(rawMessage ?? {});
    const type = getContentType(content);
    if (!type) return null;

    content = enrichChain(content, q.key.remoteJid, 0);

    return { content, type };
};
