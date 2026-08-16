import { describe, it } from 'node:test';
import assert from 'node:assert';

import plugin from '../src/plugins/fakemsg.js';

const OWNER_JID = '6283187820160@s.whatsapp.net';

const baseCtx = (overrides = {}) => {
    const q = Object.prototype.hasOwnProperty.call(overrides, 'q') ? overrides.q : {
        key: { id: 'quoted-stanza', remoteJid: '123456789@g.us', fromMe: false }
    };
    const jid = overrides.jid ?? '123456789@g.us';
    const m = {
        key: {
            id: 'incoming-id',
            remoteJid: overrides.ownerAsSender ? OWNER_JID : jid,
            fromMe: false,
            participant: '550@s.whatsapp.net'
        },
        reply: () => {}
    };
    return {
        sock: {
            message: {
                send: async () => ({ id: 'out-id' })
            }
        },
        jid,
        m,
        q,
        text: overrides.text ?? 'fake text'
    };
};

describe('fakemsg plugin definition', () => {
    it('registers command aliases and is owner-only', () => {
        assert.strictEqual(typeof plugin.run, 'function');
        assert.ok(plugin.command.includes('fakemsg'));
        assert.ok(plugin.command.includes('fake'));
        assert.ok(plugin.command.includes('fakeedit'));
        assert.strictEqual(plugin.ownerOnly, true);
    });
});

describe('fakemsg guards', () => {
    it('replies when no message is quoted', async () => {
        const replyCalls = [];
        const ctx = baseCtx({ q: undefined });
        ctx.m.reply = (text) => replyCalls.push(text);

        await plugin.run(ctx);

        assert.strictEqual(replyCalls.length, 1);
        assert.strictEqual(replyCalls[0], 'reply pesan yang mau di fake edit :v');
        assert.strictEqual(ctx.sock.message.send.mock?.callCount ?? 0, 0);
    });

    it('replies when text is missing', async () => {
        const replyCalls = [];
        const ctx = baseCtx({ q: { key: { id: 'q1', remoteJid: 'g@g.us' } }, text: '' });
        ctx.m.reply = (text) => replyCalls.push(text);

        await plugin.run(ctx);

        assert.strictEqual(replyCalls.length, 1);
        assert.strictEqual(replyCalls[0], 'masukkan teksnya');
    });

    it('replies when not in a group', async () => {
        const replyCalls = [];
        const ctx = baseCtx({
            jid: '5511900000000@s.whatsapp.net',
            q: { key: { id: 'q1', remoteJid: '5511900000000@s.whatsapp.net' } },
            text: 'hi'
        });
        ctx.m.reply = (text) => replyCalls.push(text);

        await plugin.run(ctx);

        assert.strictEqual(replyCalls.length, 1);
        assert.strictEqual(replyCalls[0], 'khusus group');
    });

    it('replies when not owner', async () => {
        const replyCalls = [];
        const ctx = baseCtx({ ownerAsSender: false });
        ctx.m.reply = (text) => replyCalls.push(text);

        await plugin.run(ctx);

        assert.strictEqual(replyCalls.length, 1);
        assert.strictEqual(replyCalls[0], 'khusus owner');
    });
});

describe('fakemsg happy path', () => {
    it('emits the empty temp message, the MESSAGE_EDIT protocol message, then revokes both', async () => {
        const sent = [];
        const sock = {
            message: {
                send: async (to, content, opts) => {
                    sent.push({ to, content, opts });
                    const id = content?.protocolMessage
                        ? opts?.id ?? 'edit-id'
                        : 'temp-id';
                    return { id };
                }
            }
        };

        const ctx = baseCtx({
            jid: '123456789@g.us',
            text: 'faked text',
            ownerAsSender: true
        });
        ctx.sock = sock;

        await plugin.run(ctx);

        assert.strictEqual(sent.length, 4);

        const [temp, edit, revokeA, revokeB] = sent;

        assert.deepStrictEqual(temp.content, {
            extendedTextMessage: {
                text: '',
                contextInfo: { isGroupStatus: true }
            }
        });
        assert.deepStrictEqual(temp.opts, { quote: ctx.m });
        assert.strictEqual(temp.to, '123456789@g.us');

        assert.ok(edit.content?.protocolMessage);
        assert.strictEqual(edit.content.protocolMessage.type, 14);
        assert.deepStrictEqual(edit.content.protocolMessage.key, {
            remoteJid: '123456789@g.us',
            fromMe: true,
            id: 'temp-id'
        });
        assert.strictEqual(edit.content.protocolMessage.editedMessage.extendedTextMessage.text, 'faked text');
        assert.deepStrictEqual(edit.opts, { id: 'quoted-stanza' });

        assert.deepStrictEqual(revokeA.content, { type: 'revoke', target: { id: 'temp-id', fromMe: true } });
        assert.deepStrictEqual(revokeB.content, { type: 'revoke', target: { id: 'quoted-stanza', fromMe: true } });
        assert.strictEqual(revokeA.to, '123456789@g.us');
        assert.strictEqual(revokeB.to, '123456789@g.us');
    });

    it('surfaces send errors as a reply', async () => {
        const sock = {
            message: {
                send: async () => {
                    throw new Error('boom');
                }
            }
        };
        const replyCalls = [];
        const ctx = {
            sock,
            jid: 'g@g.us',
            m: {
                key: { remoteJid: 'g@g.us' },
                reply: (text) => replyCalls.push(text)
            },
            q: { key: { id: 'q1', remoteJid: 'g@g.us' } },
            text: 'x'
        };
        ctx.m.key.remoteJid = '6283187820160@s.whatsapp.net';

        await plugin.run(ctx);

        assert.strictEqual(replyCalls.length, 1);
        assert.ok(replyCalls[0].startsWith('gagal fakemsg'));
    });
});
