import { isOwner } from '../owner.js';

const MAX_BYTES = 10 * 1024 * 1024;

const run = async ({ m, q, sock, jid }) => {
    if (!isOwner(m)) return;

    if (q?.content !== 'documentMessage' || !q?.message) {
        return await sock.message.send(
            jid,
            'Reply ke dokumen yang mau di-cat isinya.',
            { quote: m }
        );
    }

    let bytes;
    try {
        bytes = await sock.message.downloadBytes(q.message, {
            maxBytes: MAX_BYTES
        });
    } catch (err) {
        console.error('[cat] download dokumen:', err);
        return await sock.message.send(
            jid,
            `Gagal download dokumen: ${err?.message ?? err}`,
            { quote: m }
        );
    }

    const text = Buffer.from(bytes).toString('utf8');

    if (!text.trim()) {
        return await sock.message.send(jid, 'Isi dokumen kosong.', {
            quote: m
        });
    }

    return await sock.message.send(jid, text, { quote: m });
};

const plugin = {
    run,
    name: 'cat',
    command: ['cat'],
    description: 'Mengirim isi file dari dokumen yang di-reply ke chat.',
    ownerOnly: true,
    category: ['core']
};

export default plugin;
