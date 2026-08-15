import { beforeEach, describe, expect, it, vi } from 'vitest';

let plugins;
let handleMessage;
let owner;
let selfMode;

beforeEach(async () => {
    vi.resetModules();

    owner = false;
    selfMode = false;

    vi.doMock('../config.js', () => ({
        default: {
            path: {
                plugins: '/path/that/does/not/exist'
            }
        }
    }));
    vi.doMock('../src/serialize/serialize.js', () => ({
        messageSerialize: vi.fn(event => ({
            ...event,
            text: event.testText ?? ''
        }))
    }));
    vi.doMock('../src/owner.js', () => ({
        isOwner: vi.fn(() => owner)
    }));
    vi.doMock('../src/self-store.js', () => ({
        isSelfMode: vi.fn(() => selfMode)
    }));

    ({ plugins } = await import('../src/plugin-registry.js'));
    ({ handleMessage } = await import('../handler.js'));
    plugins.clear();
});

describe('message handler', () => {
    it('routes a command to its plugin with the expected context', async () => {
        const run = vi.fn();
        plugins.set('ping', {
            name: 'ping',
            command: ['ping'],
            ownerOnly: false,
            run
        });

        const sock = { message: { send: vi.fn() } };
        await handleMessage({
            message: {},
            key: { remoteJid: '123@s.whatsapp.net' },
            testText: 'ping hello world'
        }, sock);

        expect(run).toHaveBeenCalledWith(expect.objectContaining({
            sock,
            jid: '123@s.whatsapp.net',
            text: 'hello world'
        }));
    });

    it('blocks owner-only commands for non-owners', async () => {
        const run = vi.fn();
        plugins.set('secret', {
            name: 'secret',
            command: ['secret'],
            ownerOnly: true,
            run
        });

        await handleMessage({
            message: {},
            key: { remoteJid: '123@s.whatsapp.net' },
            testText: 'secret'
        }, {});

        expect(run).not.toHaveBeenCalled();
    });

    it('allows owner-only commands for the owner', async () => {
        owner = true;
        const run = vi.fn();
        plugins.set('secret', {
            name: 'secret',
            command: ['secret'],
            ownerOnly: true,
            run
        });

        await handleMessage({
            message: {},
            key: { remoteJid: '123@s.whatsapp.net' },
            testText: 'secret'
        }, {});

        expect(run).toHaveBeenCalledOnce();
    });

    it('blocks non-owner messages while self mode is enabled', async () => {
        selfMode = true;
        const run = vi.fn();
        plugins.set('ping', {
            name: 'ping',
            command: ['ping'],
            ownerOnly: false,
            run
        });

        await handleMessage({
            message: {},
            key: { remoteJid: '123@g.us' },
            testText: 'ping'
        }, {});

        expect(run).not.toHaveBeenCalled();
    });
});
