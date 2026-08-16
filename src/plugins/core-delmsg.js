import { delay } from 'zapo-js';

import { isOwner } from '../owner.js';

const run = async ctx => {
    const { sock, jid, m, q } = ctx;

    if (!q) return await m.reply('Reply pesan yang ingin dihapus.');
    if (!jid.endsWith('@g.us')) return await m.reply('Khusus grup.');
    if (!isOwner(m)) return await m.reply('Khusus owner.');

    const stanzaId = q.key?.id;
    if (!stanzaId) return await m.reply('Gagal dapetin id pesan');

    try {
        const temp = await sock.message.send(jid, {
            extendedTextMessage: {
                text: '',
                contextInfo: { isGroupStatus: true }
            }
        }, { quote: m });
        const tempId = temp?.id;
        if (!tempId) return await m.reply('Gagal buat pesan sementara');

        const edit = await sock.message.send(jid, {
            protocolMessage: {
                key: {
                    remoteJid: jid,
                    fromMe: true,
                    id: tempId
                },
                type: 14,
                editedMessage: {
                    extendedTextMessage: {
                        text: '\0',
                        contextInfo: { isGroupStatus: false }
                    }
                }
            }
        }, { id: stanzaId });
        const tempId2 = edit?.id;
        if (!tempId2) return await m.reply('Gagal buat pesan edit');

        await delay(100);

        await Promise.allSettled([
            sock.message.send(jid, {
                type: 'revoke',
                target: { id: tempId, fromMe: true }
            }),
            sock.message.send(jid, {
                type: 'revoke',
                target: { id: tempId2, fromMe: true }
            })
        ]);
    } catch (e) {
        return await m.reply(`Gagal delmsg: ${e?.message ?? e}`);
    }
};

const plugin = {
    run,
    name: 'delmsg',
    command: ['dmsg'],
    description: 'Hapus pesan yang di reply (owner only, group)',
    ownerOnly: true,
    category: ['core']
};

export default plugin;
