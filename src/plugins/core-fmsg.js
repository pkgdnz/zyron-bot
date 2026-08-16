import { delay } from 'zapo-js';

import { isOwner } from '../owner.js';

const FAKE_EDIT = 14;

const run = async ctx => {
    const { sock, jid, m, q, text } = ctx;

    if (!q) return await m.reply('reply pesan yang mau di fake edit :v');
    if (!text) return await m.reply('masukkan teksnya');
    if (!jid.endsWith('@g.us')) return await m.reply('khusus group');
    if (!isOwner(m)) return await m.reply('khusus owner');

    const stanzaId = q.key?.id;
    if (!stanzaId) return await m.reply('gagal dapetin id pesan');

    try {
        const temp = await sock.message.send(jid, {
            extendedTextMessage: {
                text: '',
                contextInfo: { isGroupStatus: true }
            }
        }, { quote: m });
        const tempId = temp?.id;

        const edit = await sock.message.send(jid, {
            protocolMessage: {
                key: {
                    remoteJid: jid,
                    fromMe: true,
                    id: tempId
                },
                type: FAKE_EDIT,
                editedMessage: {
                    extendedTextMessage: {
                        text,
                        contextInfo: { isGroupStatus: false }
                    }
                }
            }
        }, { id: stanzaId });
        const tempId2 = edit?.id;

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
        return await m.reply(`gagal fakemsg ${e?.message ?? e}`);
    }
};

const plugin = {
    run,
    name: 'fmsg',
    command: ['fmsg'],
    description: 'fake edit pesan yang di reply (khusus owner & group)',
    ownerOnly: true,
    category: ['core']
};

export default plugin;
