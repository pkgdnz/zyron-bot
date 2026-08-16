import { describe, it } from 'node:test';
import assert from 'node:assert';

import { resolveEvent, enrichChain, resolveMessageContent } from '../src/message-resolve.js';
import { messageStore } from '../src/messages-store.js';

const mockMessageStore = (records) => {
    const map = new Map(records.map(r => [r.id, { ...r, raw: r.raw }]));
    const originalGetByKey = messageStore.getByKey.bind(messageStore);
    const originalGetByKeyId = messageStore.getByKeyId.bind(messageStore);

    messageStore.getByKey = (remoteJid, keyId) => {
        const row = map.get(keyId);
        if (!row || row.threadJid !== remoteJid) return null;
        return row;
    };
    messageStore.getByKeyId = (keyId) => map.get(keyId) || null;

    return () => {
        messageStore.getByKey = originalGetByKey;
        messageStore.getByKeyId = originalGetByKeyId;
    };
};

describe('resolveEvent', () => {
    it('returns null when keyId is missing', () => {
        assert.strictEqual(resolveEvent('jid', null), null);
        assert.strictEqual(resolveEvent('jid', undefined), null);
    });

    it('looks up by remoteJid and keyId', () => {
        const cleanup = mockMessageStore([{
            id: 'msg-1',
            threadJid: '123@g.us',
            raw: { message: { conversation: 'hello' } }
        }]);

        const result = resolveMessageContent({
            key: { id: 'msg-1', remoteJid: '123@g.us' },
            message: { conversation: 'shallow' }
        });

        cleanup();
        assert.ok(result);
        assert.strictEqual(result.type, 'conversation');
        assert.strictEqual(result.content?.conversation, 'hello');
    });

    it('falls back to getByKeyId when remoteJid lookup misses', () => {
        const cleanup = mockMessageStore([{
            id: 'msg-2',
            threadJid: '456@g.us',
            raw: { message: { conversation: 'fallback' } }
        }]);

        const result = resolveMessageContent({
            key: { id: 'msg-2', remoteJid: 'wrong@g.us' },
            message: { conversation: 'shallow' }
        });

        cleanup();
        assert.ok(result);
        assert.strictEqual(result.content?.conversation, 'fallback');
    });

    it('returns null when store has no record', () => {
        const cleanup = mockMessageStore([]);

        const result = resolveMessageContent({
            key: { id: 'missing', remoteJid: '123@g.us' },
            message: { conversation: 'shallow' }
        });

        cleanup();
        assert.ok(result);
        assert.strictEqual(result.content?.conversation, 'shallow');
    });
});

describe('enrichChain', () => {
    it('returns message unchanged when no quotedMessage', () => {
        const msg = { conversation: 'hi' };
        const out = enrichChain(msg, '123@g.us', 0);
        assert.deepStrictEqual(out, { conversation: 'hi' });
    });

    it('does not mutate the original message object', () => {
        const msg = { extendedTextMessage: { text: 'x' } };
        enrichChain(msg, '123@g.us', 0);
        assert.deepStrictEqual(msg, { extendedTextMessage: { text: 'x' } });
    });

    it('enriches a single level quote', () => {
        const fullEvent = {
            key: { id: 'parent-id', remoteJid: '123@g.us', participant: '550@s.whatsapp.net', fromMe: false },
            message: { conversation: 'parent text' }
        };
        const cleanup = mockMessageStore([{ id: 'parent-id', threadJid: '123@g.us', raw: fullEvent }]);

        const msg = {
            extendedTextMessage: {
                text: 'reply',
                contextInfo: { stanzaId: 'parent-id', quotedMessage: { conversation: 'old' } }
            }
        };

        const out = enrichChain(msg, '123@g.us', 0);

        cleanup();
        assert.strictEqual(out.extendedTextMessage?.text, 'reply');
        assert.strictEqual(out.extendedTextMessage?.contextInfo?.quotedMessage?.conversation, 'parent text');
    });

    it('enriches a deep quote chain', () => {
        const parentEvent = {
            key: { id: 'parent-id', remoteJid: '123@g.us', participant: '550@s.whatsapp.net', fromMe: false },
            message: {
                extendedTextMessage: {
                    text: 'parent text',
                    contextInfo: { stanzaId: 'grandparent-id', quotedMessage: { conversation: 'grandparent text' } }
                }
            }
        };
        const grandparentEvent = {
            key: { id: 'grandparent-id', remoteJid: '123@g.us', participant: '550@s.whatsapp.net', fromMe: false },
            message: { conversation: 'grandparent text' }
        };
        const cleanup = mockMessageStore([
            { id: 'parent-id', threadJid: '123@g.us', raw: parentEvent },
            { id: 'grandparent-id', threadJid: '123@g.us', raw: grandparentEvent }
        ]);

        const msg = {
            extendedTextMessage: {
                text: 'reply',
                contextInfo: { stanzaId: 'parent-id', quotedMessage: { conversation: 'old' } }
            }
        };

        const out = enrichChain(msg, '123@g.us', 0);

        cleanup();
        assert.strictEqual(out.extendedTextMessage?.text, 'reply');
        const child = out.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage;
        assert.strictEqual(child?.text, 'parent text');
        const grandchild = child?.contextInfo?.quotedMessage?.conversation;
        assert.strictEqual(grandchild, 'grandparent text');
    });

    it('stops recursion at depth > 10', () => {
        const deepMsg = { conversation: 'deep' };
        const cleanup = mockMessageStore([{ id: 'x', threadJid: '123@g.us', raw: { message: deepMsg } }]);

        const msg = {
            extendedTextMessage: {
                text: 'reply',
                contextInfo: { stanzaId: 'x', quotedMessage: { conversation: 'old' } }
            }
        };

        const out = enrichChain(msg, '123@g.us', 0);
        cleanup();
        assert.ok(out);
    });
});

describe('resolveMessageContent', () => {
    it('returns null when q has no key.id', () => {
        assert.strictEqual(resolveMessageContent({}, null), null);
        assert.strictEqual(resolveMessageContent({ message: { conversation: 'x' } }, null), null);
        assert.strictEqual(resolveMessageContent(null, null), null);
    });

    it('returns the stored full message for a quoted key', () => {
        const quotedRecord = {
            id: 'quoted-id',
            threadJid: '123@g.us',
            raw: {
                message: {
                    extendedTextMessage: {
                        text: 'original quoted message',
                        contextInfo: { stanzaId: 'grandparent', quotedMessage: { conversation: 'gp' } }
                    }
                }
            }
        };
        const cleanup = mockMessageStore([quotedRecord]);

        const q = {
            key: { id: 'quoted-id', remoteJid: '123@g.us' },
            message: { conversation: 'shallow quotedMessage' }
        };

        const resolved = resolveMessageContent(q);

        cleanup();
        assert.ok(resolved);
        assert.strictEqual(resolved.type, 'extendedTextMessage');
        assert.strictEqual(resolved.content?.extendedTextMessage?.text, 'original quoted message');
    });

    it('falls back to q.message when the store has no record', () => {
        const cleanup = mockMessageStore([]);

        const q = {
            key: { id: 'missing', remoteJid: '123@g.us' },
            message: { extendedTextMessage: { text: 'shallow' } }
        };

        const resolved = resolveMessageContent(q);

        cleanup();
        assert.ok(resolved);
        assert.strictEqual(resolved.type, 'extendedTextMessage');
        assert.strictEqual(resolved.content?.extendedTextMessage?.text, 'shallow');
    });

    it('enriches a deep quote chain from the store', () => {
        const parentMsg = {
            extendedTextMessage: {
                text: 'second level',
                contextInfo: {
                    stanzaId: 'first-level',
                    quotedMessage: { conversation: 'first level text' }
                }
            }
        };
        const firstLevelMsg = {
            extendedTextMessage: {
                text: 'first level',
                contextInfo: { stanzaId: 'root', quotedMessage: { conversation: 'root text' } }
            }
        };
        const records = [
            { id: 'second-level', threadJid: '123@g.us', raw: { message: parentMsg } },
            { id: 'first-level', threadJid: '123@g.us', raw: { message: firstLevelMsg } },
            { id: 'root', threadJid: '123@g.us', raw: { message: { conversation: 'root text' } } }
        ];
        const cleanup = mockMessageStore(records);

        const q = {
            key: { id: 'second-level', remoteJid: '123@g.us' },
            message: { conversation: 'shallow' }
        };

        const resolved = resolveMessageContent(q);

        cleanup();
        assert.strictEqual(resolved.type, 'extendedTextMessage');
        const chain = resolved.content;
        assert.strictEqual(chain.extendedTextMessage?.text, 'second level');
        const child = chain.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage;
        assert.strictEqual(child?.text, 'first level');
        const grandchild = child?.contextInfo?.quotedMessage?.conversation;
        assert.strictEqual(grandchild, 'root text');
    });

    it('returns null when neither stored nor q.message resolves to content', () => {
        const cleanup = mockMessageStore([]);
        const q = { key: { id: 'nope', remoteJid: '123@g.us' }, message: {} };
        assert.strictEqual(resolveMessageContent(q), null);
        cleanup();
    });

    it('returns null when q has no key.id', () => {
        const cleanup = mockMessageStore([]);
        assert.strictEqual(resolveMessageContent({ message: { conversation: 'x' } }), null);
        assert.strictEqual(resolveMessageContent({}), null);
        assert.strictEqual(resolveMessageContent(null), null);
        cleanup();
    });
});
