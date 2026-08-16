import { toUserJid } from 'zapo-js';

import { resolveJidPair } from '../helper/common.js';

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