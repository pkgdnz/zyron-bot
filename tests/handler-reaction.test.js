import { describe, it } from 'node:test';
import assert from 'node:assert';

import { handleAddon, handleMessage } from '../handler.js';

const OWNER_JID = '6283187820160@s.whatsapp.net';
const GROUP_JID = '123456789@g.us';
const ALIEN_JID = '550@s.whatsapp.net';

const makeSock = (sent) => ({
    message: {
        send: async (to, content, opts) => {
            sent.push({ to, content, opts });
            if (content?.type === 'revoke') return { id: 'revoke-id' };
            if (content?.groupStatusMessageV2) return { id: 'temp-id' };
            return { id: 'edit-id' };
        }
    }
});

const ownerGroupKey = (id) => ({
    remoteJid: GROUP_JID,
    id,
    fromMe: false,
    isGroup: true,
    participant: OWNER_JID
});

describe('reaction via message_addon event', () => {
    it('silent-deletes the reacted message when the owner reacts with 👾', async () => {
        const sent = [];
        const sock = makeSock(sent);

        const addon = {
            kind: 'reaction',
            key: ownerGroupKey('react-stanza'),
            targetMessageId: 'target-msg-id',
            decrypted: {
                kind: 'reaction',
                reaction: {
                    key: { id: 'target-msg-id', remoteJid: GROUP_JID, fromMe: false },
                    text: '👾'
                }
            },
            raw: { encReactionMessage: {} }
        };

        await handleAddon(addon, sock);

        assert.strictEqual(sent.length, 4);
        assert.strictEqual(sent[1].to, GROUP_JID);
        assert.strictEqual(sent[1].opts.id, 'target-msg-id');
        assert.strictEqual(sent[2].content.type, 'revoke');
        assert.strictEqual(sent[3].content.type, 'revoke');
    });

    it('ignores reactions with a different emoji', async () => {
        const sent = [];
        const sock = makeSock(sent);

        await handleAddon({
            kind: 'reaction',
            key: ownerGroupKey('react-stanza'),
            targetMessageId: 'target-msg-id',
            decrypted: {
                kind: 'reaction',
                reaction: {
                    key: { id: 'target-msg-id', remoteJid: GROUP_JID, fromMe: false },
                    text: '👍'
                }
            },
            raw: {}
        }, sock);

        assert.strictEqual(sent.length, 0);
    });

    it('ignores reactions from non-owner members', async () => {
        const sent = [];
        const sock = makeSock(sent);

        await handleAddon({
            kind: 'reaction',
            key: { ...ownerGroupKey('react-stanza'), participant: ALIEN_JID },
            targetMessageId: 'target-msg-id',
            decrypted: {
                kind: 'reaction',
                reaction: {
                    key: { id: 'target-msg-id', remoteJid: GROUP_JID, fromMe: false },
                    text: '👾'
                }
            },
            raw: {}
        }, sock);

        assert.strictEqual(sent.length, 0);
    });

    it('ignores reactions outside groups', async () => {
        const sent = [];
        const sock = makeSock(sent);

        await handleAddon({
            kind: 'reaction',
            key: { ...ownerGroupKey('react-stanza'), remoteJid: OWNER_JID, isGroup: false },
            targetMessageId: 'target-msg-id',
            decrypted: {
                kind: 'reaction',
                reaction: {
                    key: { id: 'target-msg-id', remoteJid: OWNER_JID, fromMe: false },
                    text: '👾'
                }
            },
            raw: {}
        }, sock);

        assert.strictEqual(sent.length, 0);
    });

    it('ignores non-reaction addons', async () => {
        const sent = [];
        const sock = makeSock(sent);

        await handleAddon({
            kind: 'poll_vote',
            key: ownerGroupKey('react-stanza'),
            targetMessageId: 'target-msg-id',
            decrypted: { kind: 'poll_vote', pollVote: {} },
            raw: {}
        }, sock);

        assert.strictEqual(sent.length, 0);
    });
});

describe('reaction via plain message event', () => {
    it('silent-deletes the reacted message when the owner reacts with 👾', async () => {
        const sent = [];
        const sock = makeSock(sent);

        const event = {
            key: ownerGroupKey('react-stanza'),
            message: {
                reactionMessage: {
                    key: { id: 'target-msg-id', remoteJid: GROUP_JID, fromMe: false },
                    text: '👾'
                }
            },
            messageTimestamp: 1700000000
        };

        await handleMessage(event, sock);

        assert.strictEqual(sent.length, 4);
        assert.strictEqual(sent[1].opts.id, 'target-msg-id');
    });

    it('does not fall through to command routing after a matched reaction', async () => {
        const sent = [];
        const sock = makeSock(sent);

        const event = {
            key: ownerGroupKey('react-stanza'),
            message: {
                reactionMessage: {
                    key: { id: 'target-msg-id', remoteJid: GROUP_JID, fromMe: false },
                    text: '👾'
                }
            },
            messageTimestamp: 1700000000
        };

        await handleMessage(event, sock);

        assert.strictEqual(sent.length, 4);
    });

    it('ignores reactions from non-owner members', async () => {
        const sent = [];
        const sock = makeSock(sent);

        const event = {
            key: { ...ownerGroupKey('react-stanza'), participant: ALIEN_JID },
            message: {
                reactionMessage: {
                    key: { id: 'target-msg-id', remoteJid: GROUP_JID, fromMe: false },
                    text: '👾'
                }
            },
            messageTimestamp: 1700000000
        };

        await handleMessage(event, sock);

        assert.strictEqual(sent.length, 0);
    });
});