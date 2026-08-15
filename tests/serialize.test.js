import { afterEach, describe, expect, it, vi } from 'vitest';

vi.doMock('zapo-js', () => ({
    getContentType: message => Object.keys(message ?? {})[0],
    isLidJid: jid => typeof jid === 'string' && jid.endsWith('@lid'),
    unwrapMessage: message => message
}));

const chatStore = {
    upsertAndGet: vi.fn(value => value)
};

const contactStore = {
    upsertAndGet: vi.fn(value => ({
        id: 1,
        ...value
    })),
    getByPn: vi.fn(),
    getByLid: vi.fn()
};

vi.doMock('../src/chats-store.js', () => ({ chatStore }));
vi.doMock('../src/contacts-store.js', () => ({ contactStore }));

afterEach(() => {
    vi.clearAllMocks();
});

describe('message serialization', () => {
    it('serializes text messages and exposes reply helpers', async () => {
        const { messageSerialize } = await import('../src/serialize/serialize.js');
        const sock = { message: { send: vi.fn() } };

        const message = messageSerialize({
            key: {
                remoteJid: '628123@s.whatsapp.net'
            },
            message: {
                conversation: 'hello'
            },
            pushName: 'Dneon',
            timestampSeconds: 123
        }, sock);

        expect(message.content).toBe('conversation');
        expect(message.text).toBe('hello');
        expect(message.sender).toBe('628123@s.whatsapp.net');
        expect(message.sock).toBe(sock);
        expect(typeof message.reply).toBe('function');
    });

    it('serializes quoted text and provides q.reply()', async () => {
        const { messageSerialize } = await import('../src/serialize/serialize.js');
        const sock = { message: { send: vi.fn() } };

        const message = messageSerialize({
            key: {
                remoteJid: '123@g.us'
            },
            message: {
                extendedTextMessage: {
                    text: 'reply',
                    contextInfo: {
                        stanzaId: 'ABC',
                        participant: '456@s.whatsapp.net',
                        quotedMessage: {
                            conversation: 'quoted text'
                        }
                    }
                }
            }
        }, sock);

        expect(message.quoted).toBeDefined();
        expect(message.quoted.text).toBe('quoted text');
        expect(message.quoted.key.id).toBe('ABC');
        expect(message.quoted.sock).toBe(sock);
        expect(typeof message.quoted.reply).toBe('function');
    });
});
