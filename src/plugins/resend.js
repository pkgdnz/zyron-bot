import { resolveMessageContent } from '../message-resolve.js';

const UNRESENDABLE = new Set([
    'protocolMessage',
    'senderKeyDistributionMessage',
    'messageContextInfo',
    'reactionMessage',
    'encReactionMessage',
    'unavailableMessage'
]);

const run = async ({ sock, jid, m, q }) => {
    if (!q?.key?.id) {
        return m.reply('Reply ke pesan yang mau dikirim ulang.');
    }

    const resolved = resolveMessageContent(q);
    if (!resolved) {
        return m.reply('Format pesan ini tidak bisa dikirim ulang.');
    }

    const { content, type } = resolved;

    if (UNRESENDABLE.has(type)) {
        return m.reply('Format pesan ini tidak bisa dikirim ulang.');
    }

    try {
        await sock.message.send(jid, content);
    } catch (err) {
        console.error('[resend]', err);
        return m.reply(`Gagal kirim ulang: ${err?.message ?? err}`);
    }
};

const plugin = {
    run,
    name: 'resend',
    command: ['resend'],
    description: 'Mengirim ulang pesan yang di-quote dengan konteks penuh.',
    ownerOnly: true,
    category: ['core']
};

export default plugin;
