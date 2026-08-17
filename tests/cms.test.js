import { describe, it } from 'node:test';
import assert from 'node:assert';

import plugin, {
    literal,
    buildSendPayload,
    buildSendOptions,
    generateCode
} from '../src/plugins/core-cms.js';
import { messageStore } from '../src/store.js';

const bytes = new Uint8Array([1, 2, 3, 4]);

describe('cms literal', () => {
    it('serializes primitives with single quotes', () => {
        assert.strictEqual(literal('hello'), "'hello'");
        assert.strictEqual(literal("it's"), "'it\\'s'");
        assert.strictEqual(literal(42), '42');
        assert.strictEqual(literal(true), 'true');
        assert.strictEqual(literal(null), 'null');
        assert.strictEqual(literal(undefined), 'null');
        assert.strictEqual(literal(10n), '10n');
    });

    it('serializes Uint8Array as Buffer.from base64', () => {
        assert.strictEqual(
            literal(new Uint8Array([1, 2, 3])),
            "Buffer.from('AQID', 'base64')"
        );
    });

    it('serializes ArrayBuffer as Buffer.from base64', () => {
        const buf = new Uint8Array([9, 8, 7]).buffer;
        assert.strictEqual(literal(buf), "Buffer.from('CQgH', 'base64')");
    });

    it('indents arrays and nested objects with 4 spaces', () => {
        const out = literal({ a: [1, 'x'], b: { c: true } });
        assert.strictEqual(
            out,
            [
                '{',
                "    a: [",
                "        1,",
                "        'x'",
                '    ],',
                '    b: {',
                '        c: true',
                '    }',
                '}'
            ].join('\n')
        );
    });
});

describe('cms buildSendPayload', () => {
    it('maps conversation to a typed text payload', () => {
        assert.deepStrictEqual(
            buildSendPayload({ conversation: 'hello' }, 'conversation'),
            { type: 'text', text: 'hello' }
        );
    });

    it('maps extendedTextMessage and keeps mentions only', () => {
        const content = {
            extendedTextMessage: {
                text: 'hai @member',
                contextInfo: {
                    mentionedJid: ['628111@s.whatsapp.net'],
                    stanzaId: 'parent-id',
                    quotedMessage: { conversation: 'parent' }
                }
            }
        };
        assert.deepStrictEqual(
            buildSendPayload(content, 'extendedTextMessage'),
            {
                type: 'text',
                text: 'hai @member',
                contextInfo: { mentionedJids: ['628111@s.whatsapp.net'] }
            }
        );
    });

    it('maps extendedTextMessage without mentions to plain text', () => {
        assert.deepStrictEqual(
            buildSendPayload({ extendedTextMessage: { text: 'x' } }, 'extendedTextMessage'),
            { type: 'text', text: 'x' }
        );
    });

    it('maps imageMessage to typed image with caption', () => {
        const content = {
            imageMessage: {
                mimetype: 'image/jpeg',
                caption: 'foto',
                url: 'https://cdn.example/x',
                mediaKey: bytes
            }
        };
        assert.deepStrictEqual(
            buildSendPayload(content, 'imageMessage', bytes),
            {
                type: 'image',
                media: bytes,
                mimetype: 'image/jpeg',
                caption: 'foto'
            }
        );
    });

    it('maps documentMessage to typed document with fileName', () => {
        const content = {
            documentMessage: { mimetype: 'application/pdf', fileName: 'a.pdf' }
        };
        assert.deepStrictEqual(
            buildSendPayload(content, 'documentMessage', bytes),
            {
                type: 'document',
                media: bytes,
                mimetype: 'application/pdf',
                fileName: 'a.pdf'
            }
        );
    });

    it('preserves ptt on audio and gifPlayback on video', () => {
        assert.strictEqual(
            buildSendPayload({ audioMessage: { ptt: true } }, 'audioMessage', bytes).ptt,
            true
        );
        assert.strictEqual(
            buildSendPayload({ videoMessage: { gifPlayback: true } }, 'videoMessage', bytes).gifPlayback,
            true
        );
    });

    it('falls back to the raw proto for unsupported kinds', () => {
        const content = { locationMessage: { degreesLatitude: 1 } };
        assert.strictEqual(buildSendPayload(content, 'locationMessage'), content);
    });

    it('strips messageContextInfo from raw proto reproductions', () => {
        const content = {
            messageContextInfo: {
                threadId: [],
                messageSecret: Buffer.from('7jefq4BRl4/bPMz1Uu+8lXkkWYPn+74KX5NvSr+hZHQ=', 'base64'),
                limitSharingV2: { sharingLimited: true }
            },
            interactiveMessage: {
                body: { text: 'Please share your contact information' },
                nativeFlowMessage: {
                    buttons: [{ name: 'request_contact_info' }],
                    messageParamsJson: '{}'
                }
            }
        };

        const payload = buildSendPayload(content, 'interactiveMessage');
        assert.strictEqual(payload.messageContextInfo, undefined);
        assert.ok(payload.interactiveMessage);
        assert.strictEqual(
            payload.interactiveMessage.nativeFlowMessage.buttons[0].name,
            'request_contact_info'
        );
    });
});

describe('cms buildSendOptions', () => {
    it('forces type text for botForwardedMessage', () => {
        assert.deepStrictEqual(
            buildSendOptions({ botForwardedMessage: {} }, 'botForwardedMessage'),
            { additionalAttributes: { type: 'text' } }
        );
    });

    it('returns null when no extra options are needed', () => {
        assert.strictEqual(buildSendOptions({}, 'conversation'), null);
        assert.strictEqual(buildSendOptions({}, 'imageMessage'), null);
        assert.strictEqual(buildSendOptions({}, 'locationMessage'), null);
    });
});

describe('cms generateCode', () => {
    it('emits a clean typed send call for text', () => {
        const code = generateCode({ type: 'text', text: 'hello' });
        assert.strictEqual(
            code,
            [
                'await sock.message.send(jid, {',
                "    type: 'text',",
                "    text: 'hello'",
                '});',
                ''
            ].join('\n')
        );
    });

    it('embeds media bytes as base64', () => {
        const code = generateCode({
            type: 'image',
            media: new Uint8Array([1, 2, 3]),
            mimetype: 'image/jpeg',
            caption: 'foto'
        });
        assert.match(code, /Buffer\.from\('AQID', 'base64'\)/);
        assert.match(code, /type: 'image'/);
        assert.match(code, /caption: 'foto'/);
        assert.doesNotMatch(code, /downloadBytes/);
    });

    it('downloads large media from the quoted message at runtime', () => {
        const code = generateCode({
            type: 'video',
            media: new Uint8Array([1, 2, 3]),
            mimetype: 'video/mp4'
        }, { embed: false });

        assert.match(code, /const media = await sock\.message\.downloadBytes\(q\.message, \{/);
        assert.match(code, /maxBytes: 104857600/);
        assert.match(code, /type: 'video'/);
        assert.match(code, /\n {4}media,?\n/);
    });

    it('emits sendOptions as the third argument', () => {
        const code = generateCode(
            { botForwardedMessage: { message: { conversation: 'x' } } },
            { sendOptions: { additionalAttributes: { type: 'text' } } }
        );
        assert.match(code, /botForwardedMessage/);
        assert.match(code, /additionalAttributes:\s*\{\s*type: 'text'/);
        assert.match(code, /\}, \{/);
    });

    it('emits raw proto for fallback payloads', () => {
        const code = generateCode({ locationMessage: { degreesLatitude: 1 } });
        assert.match(code, /locationMessage/);
        assert.doesNotMatch(code, /downloadBytes/);
    });

    it('omits messageContextInfo from interactive reproductions', () => {
        const code = generateCode({
            interactiveMessage: {
                body: { text: 'Please share your contact information' },
                nativeFlowMessage: {
                    buttons: [{ name: 'request_contact_info' }],
                    messageParamsJson: '{}'
                }
            }
        });
        assert.match(code, /interactiveMessage/);
        assert.match(code, /request_contact_info/);
        assert.doesNotMatch(code, /messageContextInfo/);
        assert.doesNotMatch(code, /messageSecret/);
    });
});

describe('cms plugin flow', () => {
    const mockMessageStore = (record) => {
        const originalGetByKey = messageStore.getByKey.bind(messageStore);
        const originalGetByKeyId = messageStore.getByKeyId.bind(messageStore);

        messageStore.getByKey = () => record ?? null;
        messageStore.getByKeyId = () => record ?? null;

        return () => {
            messageStore.getByKey = originalGetByKey;
            messageStore.getByKeyId = originalGetByKeyId;
        };
    };

    const makeSock = (sent) => ({
        message: {
            send: async (to, content, opts) => {
                sent.push({ to, content, opts });
                return { id: 'out-id' };
            },
            downloadBytes: async () => bytes
        }
    });

    const baseCtx = (sock) => ({
        sock,
        jid: '123456789@g.us',
        m: {
            key: { remoteJid: '123456789@g.us', id: 'in-id', fromMe: false },
            reply: async () => {}
        },
        q: {
            key: { id: 'quoted-id', remoteJid: '123456789@g.us' }
        }
    });

    it('registers the cms command and is owner-only', () => {
        assert.ok(plugin.command.includes('cms'));
        assert.strictEqual(plugin.ownerOnly, true);
        assert.strictEqual(typeof plugin.run, 'function');
    });

    it('replies when no message is quoted', async () => {
        const replies = [];
        const ctx = baseCtx(makeSock([]));
        ctx.m.reply = async text => replies.push(text);
        ctx.q = null;

        await plugin.run(ctx);
        assert.deepStrictEqual(replies, ['Reply ke pesan yang mau di-generate codenya.']);
    });

    it('generates a document with the code and reproduces the text message', async () => {
        const cleanup = mockMessageStore({
            raw: {
                key: { remoteJid: '123456789@g.us', id: 'quoted-id' },
                message: { conversation: 'reproduce me' }
            }
        });
        const sent = [];
        const ctx = baseCtx(makeSock(sent));

        await plugin.run(ctx);
        cleanup();

        assert.strictEqual(sent.length, 2);

        const [doc, repro] = sent;
        assert.strictEqual(doc.to, '123456789@g.us');
        assert.strictEqual(doc.content.type, 'document');
        assert.strictEqual(doc.content.mimetype, 'text/javascript');
        assert.ok(doc.content.fileName.endsWith('.js'));
        assert.strictEqual(doc.opts.quote, ctx.q);

        assert.deepStrictEqual(repro.content, { type: 'text', text: 'reproduce me' });
        assert.deepStrictEqual(repro.opts, {});
    });

    it('downloads media and reproduces it with the typed API', async () => {
        const cleanup = mockMessageStore({
            raw: {
                key: { remoteJid: '123456789@g.us', id: 'quoted-id' },
                message: {
                    imageMessage: {
                        mimetype: 'image/jpeg',
                        caption: 'foto',
                        url: 'https://cdn.example/x',
                        mediaKey: bytes
                    }
                }
            }
        });
        const sent = [];
        const sock = makeSock(sent);
        const ctx = baseCtx(sock);

        await plugin.run(ctx);
        cleanup();

        assert.strictEqual(sent.length, 2);
        const repro = sent[1];
        assert.deepStrictEqual(repro.content, {
            type: 'image',
            media: bytes,
            mimetype: 'image/jpeg',
            caption: 'foto'
        });
    });

    it('reproduces interactiveMessage without stale messageContextInfo', async () => {
        const cleanup = mockMessageStore({
            raw: {
                key: { remoteJid: '123456789@g.us', id: 'quoted-id' },
                message: {
                    messageContextInfo: {
                        threadId: [],
                        messageSecret: Buffer.from('AAAA', 'base64'),
                        limitSharingV2: { sharingLimited: true }
                    },
                    interactiveMessage: {
                        body: { text: 'Please share your contact information' },
                        nativeFlowMessage: {
                            buttons: [{ name: 'request_contact_info' }],
                            messageParamsJson: '{}'
                        }
                    }
                }
            }
        });
        const sent = [];
        const ctx = baseCtx(makeSock(sent));

        await plugin.run(ctx);
        cleanup();

        assert.strictEqual(sent.length, 2);
        const repro = sent[1];
        assert.strictEqual(repro.content.messageContextInfo, undefined);
        assert.strictEqual(
            repro.content.interactiveMessage.nativeFlowMessage.buttons[0].name,
            'request_contact_info'
        );
    });

    it('reproduces botForwardedMessage with the additionalAttributes option', async () => {
        const cleanup = mockMessageStore({
            raw: {
                key: { remoteJid: '123456789@g.us', id: 'quoted-id' },
                message: {
                    botForwardedMessage: {
                        message: { conversation: 'forwarded text' }
                    }
                }
            }
        });
        const sent = [];
        const ctx = baseCtx(makeSock(sent));

        await plugin.run(ctx);
        cleanup();

        assert.strictEqual(sent.length, 2);
        const repro = sent[1];
        assert.deepStrictEqual(repro.content, {
            botForwardedMessage: { message: { conversation: 'forwarded text' } }
        });
        assert.deepStrictEqual(repro.opts, { additionalAttributes: { type: 'text' } });
    });

    it('replies when media download fails', async () => {
        const cleanup = mockMessageStore({
            raw: {
                key: { remoteJid: '123456789@g.us', id: 'quoted-id' },
                message: {
                    imageMessage: { mimetype: 'image/jpeg', mediaKey: bytes, url: 'x' }
                }
            }
        });
        const replies = [];
        const sock = {
            message: {
                send: async () => ({ id: 'x' }),
                downloadBytes: async () => {
                    throw new Error('media gone');
                }
            }
        };
        const ctx = baseCtx(sock);
        ctx.m.reply = async text => replies.push(text);

        await plugin.run(ctx);
        cleanup();

        assert.strictEqual(replies.length, 1);
        assert.match(replies[0], /media gone/);
    });

    it('surfaces send errors as a reply', async () => {
        const cleanup = mockMessageStore({
            raw: {
                key: { remoteJid: '123456789@g.us', id: 'quoted-id' },
                message: { conversation: 'x' }
            }
        });
        const replies = [];
        const sock = {
            message: {
                send: async () => {
                    throw new Error('boom');
                },
                downloadBytes: async () => bytes
            }
        };
        const ctx = baseCtx(sock);
        ctx.m.reply = async text => replies.push(text);

        await plugin.run(ctx);
        cleanup();

        assert.strictEqual(replies.length, 1);
        assert.match(replies[0], /boom/);
    });
});
