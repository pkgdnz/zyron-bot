import util from 'node:util';
import { isOwner } from '../owner.js';

const CODE_TYPES = new Set(['conversation', 'extendedTextMessage']);

const run = async ({ m, q, text, sock, jid }) => {
    if (!isOwner(m)) return;

    const target = q || m;
    let code;

    if (q?.message && q.content) {
        if (q.content === 'documentMessage') {
            try {
                const bytes = await sock.message.downloadBytes(q.message, {
                    maxBytes: 10 * 1024 * 1024
                });
                code = Buffer.from(bytes).toString('utf8');
            } catch (err) {
                console.error('[run] download dokumen:', err);
                return await sock.message.send(jid, `Gagal download dokumen: ${err?.message ?? err}`, { quote: target });
            }
        } else if (CODE_TYPES.has(q.content)) {
            code = q.text;
        } else {
            return await sock.message.send(jid, 'Reply ke pesan kode teks atau dokumen .js berisi kode.', { quote: target });
        }
    } else if (text) {
        code = text;
    } else {
        return await sock.message.send(jid, 'Reply ke pesan kode teks atau dokumen .js berisi kode.', { quote: target });
    }

    if (!code || !String(code).trim()) {
        return await sock.message.send(jid, 'Kode kosong.', { quote: target });
    }

    try {
        let result = await eval("(async () => { " + code + " })()");
        if (typeof result !== 'string') result = util.inspect(result);
        return await sock.message.send(jid, result, { quote: target });
    } catch (err) {
        console.error('[run]', err);
        return await sock.message.send(jid, err.stack || err.message, { quote: target });
    }
};

const plugin = {
    run,
    name: 'run',
    command: ['run'],
    description: 'Menjalankan JavaScript async dari balasan teks atau dokumen.',
    ownerOnly: true,
    category: ['core']
};

export default plugin;
