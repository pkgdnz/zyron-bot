import cfg from '../config.js';

const ownerJid = `${cfg.owner}@s.whatsapp.net`;

export function isOwnerJid(jid) {
    return jid === ownerJid;
}

export function isOwner(m) {
    if (!m) return false;

    return (
        isOwnerJid(m.contact?.pn) ||
        isOwnerJid(m.contact?.lid) ||
        isOwnerJid(m.sender) ||
        isOwnerJid(m.key?.participant) ||
        isOwnerJid(m.key?.participantAlt) ||
        isOwnerJid(m.key?.remoteJid) ||
        isOwnerJid(m.key?.remoteJidAlt)
    );
}
