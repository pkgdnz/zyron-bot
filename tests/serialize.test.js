import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
    chatSerialize,
    contactSerialize,
    contentSerialize,
    messageSerialize
} from '../src/serialize.js';

const makeEvent = (overrides = {}) => ({
    key: {
        remoteJid: '5511900000000@s.whatsapp.net',
        id: 'test-id',
        fromMe: false
    },
    message: { conversation: 'hello' },
    messageTimestamp: 1700000000,
    pushName: 'Taro',
    ...overrides
});

describe('serialize helpers', () => {
    it('contactSerialize extracts lid/pn/pushName from a LID key', () => {
        const event = makeEvent({
            key: {
                remoteJid: '123@lid',
                remoteJidAlt: '5511900000000@s.whatsapp.net',
                id: 'k1',
                fromMe: false,
                isGroup: false
            },
            pushName: 'Taro',
            timestampSeconds: 1700000000
        });

        const c = contactSerialize(event);
        assert.ok(c);
        assert.strictEqual(c.lid, '123@lid');
        assert.strictEqual(c.pn, '5511900000000@s.whatsapp.net');
        assert.strictEqual(c.pushName, 'Taro');
        assert.strictEqual(c.updatedAt, 1700000000);
    });

    it('contactSerialize extracts pn when only the phone form is present', () => {
        const event = makeEvent({
            key: {
                remoteJid: '5511900000000@s.whatsapp.net',
                id: 'k1',
                fromMe: false,
                isGroup: false
            },
            pushName: 'Sita'
        });

        const c = contactSerialize(event);
        assert.strictEqual(c.lid, null);
        assert.strictEqual(c.pn, '5511900000000@s.whatsapp.net');
        assert.strictEqual(c.pushName, 'Sita');
    });

    it('contactSerialize resolves the group participant jid pair', () => {
        const event = makeEvent({
            key: {
                remoteJid: 'group@g.us',
                participant: '123@lid',
                participantAlt: '5511900000000@s.whatsapp.net',
                id: 'k1',
                fromMe: false,
                isGroup: true
            }
        });

        const c = contactSerialize(event);
        assert.strictEqual(c.lid, '123@lid');
        assert.strictEqual(c.pn, '5511900000000@s.whatsapp.net');
    });

    it('contactSerialize returns undefined when neither lid nor pn is present', () => {
        const event = makeEvent({
            key: { remoteJid: undefined, id: 'k1', fromMe: false, isGroup: false }
        });
        assert.strictEqual(contactSerialize(event), undefined);
    });

    it('chatSerialize is undefined for non-group chats', () => {
        const event = makeEvent({
            key: { remoteJid: '5511900000000@s.whatsapp.net', id: 'k1' }
        });
        assert.strictEqual(chatSerialize(event), undefined);
    });

    it('chatSerialize builds a group chat ref for group chats', () => {
        const event = makeEvent({
            key: { remoteJid: 'group@g.us', id: 'k1' },
            pushName: 'Group Name'
        });
        assert.deepStrictEqual(chatSerialize(event), { jid: 'group@g.us', name: 'Group Name' });
    });

    it('contentSerialize identifies the message content type', () => {
        const event = makeEvent();
        assert.deepStrictEqual(contentSerialize(event), { content: 'conversation', type: undefined });

        const etm = makeEvent({
            message: { extendedTextMessage: { text: 'hi', contextInfo: {} } }
        });
        assert.strictEqual(contentSerialize(etm).content, 'extendedTextMessage');
    });

    it('contentSerialize maps messageStubType when there is no content', () => {
        const event = makeEvent({
            message: {},
            messageStubType: 25
        });
        assert.deepStrictEqual(contentSerialize(event), { content: 'messageStubType', type: 25 });
    });

    it('messageSerialize assembles contact, sender, text and a quoted ref', () => {
        const sock = {};

        const event = makeEvent({
            key: {
                remoteJid: 'group@g.us',
                participant: '123@lid',
                participantAlt: '5511900000000@s.whatsapp.net',
                id: 'k1',
                fromMe: false,
                isGroup: true
            },
            message: {
                extendedTextMessage: {
                    text: 'reply here',
                    contextInfo: {
                        stanzaId: 'parent-id',
                        quotedMessage: { conversation: 'parent' }
                    }
                }
            }
        });

        const m = messageSerialize(event, sock, {});

        assert.ok(m.chat);
        assert.strictEqual(m.chat.jid, 'group@g.us');
        assert.strictEqual(m.chat.name, 'Taro');
        assert.ok(m.contact);
        assert.strictEqual(m.contact.lid, '123@lid');
        assert.strictEqual(m.contact.pn, '5511900000000@s.whatsapp.net');
        assert.strictEqual(m.contact.pushName, 'Taro');
        assert.strictEqual(m.sender, '123@lid');
        assert.strictEqual(m.text, 'reply here');
        assert.strictEqual(m.content, 'extendedTextMessage');

        assert.ok(m.quoted);
        assert.strictEqual(m.quoted.key.id, 'parent-id');
        assert.strictEqual(m.quoted.key.remoteJid, 'group@g.us');
        assert.strictEqual(m.quoted.text, 'parent');
        assert.strictEqual(m.quoted.content, 'conversation');
        assert.deepStrictEqual(m.quoted.message, { conversation: 'parent' });
    });

    it('messageSerialize leaves chat/contact/quoted undefined when absent', () => {
        const m = messageSerialize(makeEvent(), {}, {});
        assert.strictEqual(m.chat, undefined);
        assert.ok(m.contact);
        assert.strictEqual(m.quoted, undefined);
    });

    it('messageSerialize exposes sock and reply on the message and on quoted', () => {
        const sock = { __tag: 'sock' };
        const event = makeEvent({
            message: {
                extendedTextMessage: {
                    text: 'x',
                    contextInfo: {
                        stanzaId: 'p',
                        quotedMessage: { conversation: 'parent' }
                    }
                }
            }
        });
        const m = messageSerialize(event, sock, {});

        assert.strictEqual(m.sock, sock);

        assert.strictEqual(typeof m.reply, 'function');
        assert.strictEqual(typeof m.quoted.reply, 'function');
    });

    it('reply() sends text to the message remoteJid quoted on the message', async () => {
        const replyCalls = [];
        const sock = {
            message: {
                send: (to, content, opts) => {
                    replyCalls.push({ to, content, opts });
                    return Promise.resolve({ id: 'x' });
                }
            }
        };

        const event = makeEvent({
            key: { remoteJid: '5511900000000@s.whatsapp.net', id: 'm1', fromMe: false }
        });

        const m = messageSerialize(event, sock, {});
        await m.reply('hi there');

        assert.strictEqual(replyCalls.length, 1);
        assert.strictEqual(replyCalls[0].to, '5511900000000@s.whatsapp.net');
        assert.strictEqual(replyCalls[0].content, 'hi there');
        assert.deepStrictEqual(replyCalls[0].opts, { quote: m });
    });
});

describe('serialize database enrichment', () => {
    const contactStore = {
        getByLid: (lid) => {
            if (lid === '123@lid') {
                return { id: 1, lid, pn: '5511900000000@s.whatsapp.net', pushName: 'DB Name', updatedAt: 9999 };
            }
            return undefined;
        },
        getByPn: (pn) => {
            if (pn === '5511900000000@s.whatsapp.net') {
                return { id: 1, lid: '123@lid', pn, pushName: 'DB Name', updatedAt: 9999 };
            }
            return undefined;
        }
    };

    const chatStore = {
        getById: (jid) => {
            if (jid === 'group@g.us') {
                return { jid, name: 'DB Group' };
            }
            return undefined;
        }
    };

    it('enriches m.contact from contactStore', () => {
        const event = makeEvent({
            key: {
                remoteJid: '123@lid',
                remoteJidAlt: '5511900000000@s.whatsapp.net',
                id: 'k1',
                fromMe: false,
                isGroup: false
            },
            pushName: 'Event Name',
            timestampSeconds: 1000
        });

        const m = messageSerialize(event, {}, { contactStore, chatStore });

        assert.ok(m.contact);
        assert.strictEqual(m.contact.id, 1);
        assert.strictEqual(m.contact.lid, '123@lid');
        assert.strictEqual(m.contact.pn, '5511900000000@s.whatsapp.net');
        assert.strictEqual(m.contact.pushName, 'DB Name');
        assert.strictEqual(m.contact.updatedAt, 9999);
    });

    it('enriches m.chat from chatStore', () => {
        const event = makeEvent({
            key: {
                remoteJid: 'group@g.us',
                id: 'k1',
                fromMe: false,
                isGroup: true
            },
            pushName: 'Event Name'
        });

        const m = messageSerialize(event, {}, { contactStore, chatStore });

        assert.ok(m.chat);
        assert.strictEqual(m.chat.jid, 'group@g.us');
        assert.strictEqual(m.chat.name, 'DB Group');
    });

    it('enriches q.contact from contactStore for quoted messages', () => {
        const event = makeEvent({
            key: {
                remoteJid: 'group@g.us',
                participant: '123@lid',
                participantAlt: '5511900000000@s.whatsapp.net',
                id: 'k1',
                fromMe: false,
                isGroup: true
            },
            message: {
                extendedTextMessage: {
                    text: 'reply here',
                    contextInfo: {
                        stanzaId: 'parent-id',
                        participant: '123@lid',
                        participantAlt: '5511900000000@s.whatsapp.net',
                        quotedMessage: { conversation: 'parent' }
                    }
                }
            }
        });

        const m = messageSerialize(event, {}, { contactStore, chatStore });

        assert.ok(m.quoted);
        assert.ok(m.quoted.contact);
        assert.strictEqual(m.quoted.contact.id, 1);
        assert.strictEqual(m.quoted.contact.lid, '123@lid');
        assert.strictEqual(m.quoted.contact.pn, '5511900000000@s.whatsapp.net');
        assert.strictEqual(m.quoted.contact.pushName, 'DB Name');
        assert.strictEqual(m.quoted.contact.updatedAt, 9999);
    });
});
