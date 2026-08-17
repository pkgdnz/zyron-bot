import { describe, it } from 'node:test';
import assert from 'node:assert';

import plugin from '../src/plugins/core-cat.js';

const OWNER_JID = '6283187820160@s.whatsapp.net';
const JID = '123456789@g.us';

const baseCtx = (overrides = {}) => {
    const sent = [];
    const q = Object.prototype.hasOwnProperty.call(overrides, 'q')
        ? overrides.q
        : {
            content: 'documentMessage',
            message: {
                documentMessage: {
                    mimetype: 'text/plain',
                    fileName: 'notes.txt',
                    url: 'https://cdn.example/notes.txt',
                    mediaKey: new Uint8Array(32)
                }
            }
        };
    const m = {
        key: { remoteJid: JID, id: 'in-id', fromMe: false },
        sender: OWNER_JID,
        reply: async () => {}
    };
    const sock = {
        message: {
            send: async (to, content, opts) => {
                sent.push({ to, content, opts });
                return { id: 'out-id' };
            },
            downloadBytes: async () => Buffer.from('hello from file\n')
        }
    };
    const ctx = {
        sock,
        jid: JID,
        m,
        q
    };
    return { ctx, sent };
};

describe('cat plugin definition', () => {
    it('registers the cat command and is owner-only', () => {
        assert.ok(plugin.command.includes('cat'));
        assert.strictEqual(plugin.ownerOnly, true);
        assert.strictEqual(typeof plugin.run, 'function');
    });
});

describe('cat guards', () => {
    it('replies when no document is quoted', async () => {
        const { ctx, sent } = baseCtx({ q: null });
        await plugin.run(ctx);
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].content, 'Reply ke dokumen yang mau di-cat isinya.');
    });

    it('replies when the quoted message is not a document', async () => {
        const { ctx, sent } = baseCtx({
            q: { content: 'conversation', message: { conversation: 'x' } }
        });
        await plugin.run(ctx);
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].content, 'Reply ke dokumen yang mau di-cat isinya.');
    });

    it('does nothing for non-owner senders', async () => {
        const { ctx, sent } = baseCtx();
        ctx.m.sender = '550@s.whatsapp.net';
        await plugin.run(ctx);
        assert.strictEqual(sent.length, 0);
    });
});

describe('cat happy path', () => {
    it('downloads the document and sends its content to the chat', async () => {
        const { ctx, sent } = baseCtx();
        await plugin.run(ctx);

        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].to, JID);
        assert.strictEqual(sent[0].content, 'hello from file\n');
        assert.deepStrictEqual(sent[0].opts, { quote: ctx.m });
    });

    it('surfaces download errors as a reply', async () => {
        const { ctx, sent } = baseCtx();
        ctx.sock.message.downloadBytes = async () => {
            throw new Error('boom');
        };
        await plugin.run(ctx);

        assert.strictEqual(sent.length, 1);
        assert.match(sent[0].content, /Gagal download dokumen: boom/);
    });

    it('replies when the file content is empty', async () => {
        const { ctx, sent } = baseCtx();
        ctx.sock.message.downloadBytes = async () => new Uint8Array(0);
        await plugin.run(ctx);

        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].content, 'Isi dokumen kosong.');
    });
});
