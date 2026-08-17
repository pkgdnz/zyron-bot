import { delay } from 'zapo-js';

async function silentDelete(sock, key) {
    const { jid, id: stanzaId } = key ?? {};
    if (!sock || !jid || !stanzaId) return;

    try {
        const temp = await sock.message.send(jid, {
            groupStatusMessageV2: {
                message: {
                    extendedTextMessage: {
                        text: '',
                        contextInfo: { isGroupStatus: true }
                    }
                }
            }
        }, {
            additionalAttributes: { type: 'text' }
        });
        const tempId = temp?.id;
        if (!tempId) return;

        const edit = await sock.message.send(jid, {
            extendedTextMessage: {
                text: '\0',
                contextInfo: { isGroupStatus: false }
            }
        }, {
            editKey: { id: tempId },
            id: stanzaId
        });
        const editId = edit?.id;
        if (!editId) return;

        await delay(100);

        await Promise.allSettled([
            sock.message.send(jid, {
                type: 'revoke',
                target: { remoteJid: jid, id: tempId, fromMe: true }
            }),
            sock.message.send(jid, {
                type: 'revoke',
                target: { remoteJid: jid, id: editId, fromMe: true }
            })
        ]);
    } catch (e) {
        console.error('[silentDelete] gagal', e);
    }
}

export { silentDelete };
