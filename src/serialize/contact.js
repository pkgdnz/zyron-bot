import { isLidJid, toUserJid } from 'zapo-js';

const resolveJidPair = (primary, alt) => {
    let lid = null;
    let pn = null;

    if (primary && isLidJid(primary)) {
        lid = primary;
        pn = alt && !isLidJid(alt) ? alt : null;
    } else if (primary) {
        pn = primary;
        lid = alt && isLidJid(alt) ? alt : null;
    } else if (alt) {
        if (isLidJid(alt)) {
            lid = alt;
        } else {
            pn = alt;
        }
    }

    return { lid, pn };
};

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