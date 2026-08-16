import { beforeEach, describe, expect, it, vi } from 'vitest';

let buildLinkPreview;

beforeEach(async () => {
    vi.resetModules();

    buildLinkPreview = vi.fn((body, fallback) => ({
        extendedTextMessage: {
            title: fallback.title,
            text: body
        }
    }));

    vi.doMock('../config.js', () => ({
        default: { botNumber: '628123456789' }
    }));

    vi.doMock('../src/plugin-registry.js', () => ({
        plugins: new Map([
            ['ping', {
                name: 'ping',
                command: ['ping'],
                description: 'Check latency',
                category: ['core']
            }],
            ['run', {
                name: 'run',
                command: ['run'],
                description: 'Execute code',
                category: ['core'],
                ownerOnly: true
            }],
            ['mem', {
                name: 'mem',
                command: ['mem'],
                description: 'Show memory usage',
                category: ['owner']
            }]
        ])
    }));

    vi.doMock('../src/theme-manager.js', () => ({
        themeManager: {
            getData: vi.fn(() => ({
                title: 'Tema',
                description: 'Deskripsi',
                url: 'https://theme.example',
                message: null
            })),
            buildLinkPreview
        }
    }));
});

const makeCtx = () => {
    const sock = { message: { send: vi.fn(async () => ({})) } };
    const m = {
        key: { remoteJid: '123@s.whatsapp.net' },
        contact: { pushName: 'Andi' },
        reply: vi.fn(async value => value)
    };

    return { sock, jid: '123@s.whatsapp.net', m, text: '' };
};

describe('menu plugin', () => {
    it('greets the sender and lists the categories with a theme preview', async () => {
        const { run } = (await import('../src/plugins/menu.js')).default;
        const ctx = makeCtx();
        await run(ctx);

        expect(buildLinkPreview).toHaveBeenCalledTimes(1);
        const [body, fallback] = buildLinkPreview.mock.calls[0];

        expect(body).toContain('hai Andi! berikut kategori yang tersedia');
        expect(body).toContain('* core');
        expect(body).toContain('* owner');
        expect(body).toContain('> gunakan menu <category> untuk liat isi menu');

        expect(fallback).toEqual({
            title: 'zyron-bot',
            description: 'Base WhatsApp multi-device bot powered by Zapo JS.',
            url: 'https://theme.example'
        });

        expect(ctx.sock.message.send).toHaveBeenCalledWith(
            '123@s.whatsapp.net',
            expect.objectContaining({
                extendedTextMessage: expect.objectContaining({ title: 'zyron-bot' })
            })
        );
    });

    it('falls back to "kamu" when the sender has no contact name', async () => {
        const { run } = (await import('../src/plugins/menu.js')).default;
        const ctx = makeCtx();
        ctx.m.contact = undefined;
        await run(ctx);

        const [body] = buildLinkPreview.mock.calls[0];
        expect(body).toContain('hai kamu! berikut kategori yang tersedia');
    });

    it('lists every command grouped by category with menu all', async () => {
        const { run } = (await import('../src/plugins/menu.js')).default;
        const ctx = makeCtx();
        ctx.text = 'all';
        await run(ctx);

        const [, body] = ctx.sock.message.send.mock.calls[0];
        expect(body).toContain('* core');
        expect(body).toContain('• ping');
        expect(body).toContain('• mem');
        expect(body).toContain('> gunakan command -h untuk melihat help.');
        expect(body).toContain('-h');
    });

    it('lists the commands of a requested category', async () => {
        const { run } = (await import('../src/plugins/menu.js')).default;
        const ctx = makeCtx();
        ctx.text = 'core';
        await run(ctx);

        const [, body] = ctx.sock.message.send.mock.calls[0];
        expect(body).toContain('* core');
        expect(body).toContain('• ping');
        expect(body).toContain('Execute code');
        expect(body).toContain('🔐');
    });

    it('reports an unknown category', async () => {
        const { run } = (await import('../src/plugins/menu.js')).default;
        const ctx = makeCtx();
        ctx.text = 'nope';
        await run(ctx);

        expect(ctx.m.reply).toHaveBeenCalledWith('tidak ada kategori *nope*');
    });

    it('replies when sending the preview fails', async () => {
        const { run } = (await import('../src/plugins/menu.js')).default;
        const ctx = makeCtx();
        ctx.sock.message.send.mockRejectedValue(new Error('boom'));
        await run(ctx);

        expect(ctx.m.reply).toHaveBeenCalledWith(
            expect.stringContaining('Failed to send menu')
        );
    });
});
