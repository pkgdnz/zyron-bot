import { resolveMessageContent } from '../message-resolve.js';

const run = async ({ sock, jid, m, q, text }) => {
    const targetQuoted = text?.trim() === '-q';

    if (targetQuoted) {
        if (!q?.quoted?.key?.id) {
            return m.reply('Pesan yang kamu reply tidak memiliki quoted message.');
        }

        const quoted = q.quoted;
        const resolved = resolveMessageContent(quoted);

        if (!resolved) {
            return m.reply('Format quoted message tidak bisa dikirim ulang.');
        }

        try {
            await sock.message.send(jid, resolved.content);
        } catch (err) {
            console.error('[resend]', err);
            return m.reply(`Gagal kirim ulang quoted: ${err?.message ?? err}`);
        }

        return;
    }

    if (!q?.key?.id) {
        return m.reply('Reply ke pesan yang mau dikirim ulang.');
    }

    const resolved = resolveMessageContent(q);
    if (!resolved) {
        return m.reply('Format pesan ini tidak bisa dikirim ulang.');
    }

    try {
        await sock.message.send(jid, resolved.content);
    } catch (err) {
        console.error('[resend]', err);
        return m.reply(`Gagal kirim ulang: ${err?.message ?? err}`);
    }
};

const plugin = {
    run,
    name: 'resend',
    command: ['resend'],
    description: 'Mengirim ulang pesan. Gunakan resend -q untuk mengirim quoted message.',
    ownerOnly: true,
    category: ['core']
};

export default plugin;
