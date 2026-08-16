import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(async () => {
    vi.resetModules();

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
                message: {
                    extendedTextMessage: {
                        thumbnailDirectPath: '/mms/thumbnail-link/abc',
                        thumbnailHeight: 400
                    }
                }
            }))
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

        const [, content] = ctx.sock.message.send.mock.calls[0];
        const etm = content.extendedTextMessage;

        expect(etm.text).toContain('https://theme.example\nhai Andi! berikut kategori yang tersedia');
        expect(etm.text).toContain('* core');
        expect(etm.text).toContain('* owner');
        expect(etm.text).toContain('> gunakan menu <category> untuk liat isi menu');

        expect(etm.matchedText).toBe('https://theme.example');
        expect(etm.description).toBe('Deskripsi');
        expect(etm.title).toBe('Tema');
        expect(etm.thumbnailDirectPath).toBe('/mms/thumbnail-link/abc');
        expect(etm.thumbnailHeight).toBe(400);
    });

    it('falls back to bot defaults when the theme is empty', async () => {
        const { themeManager } = await import('../src/theme-manager.js');
        themeManager.getData.mockReturnValue({ title: null, description: null, url: null, message: null });

        const { run } = (await import('../src/plugins/menu.js')).default;
        const ctx = makeCtx();
        await run(ctx);

        const [, content] = ctx.sock.message.send.mock.calls[0];
        const etm = content.extendedTextMessage;

        expect(etm.matchedText).toBe('https://wa.me/6283851010908');
        expect(etm.title).toBe('zyron-bot');
        expect(etm.description).toBe('Base WhatsApp multi-device bot powered by Zapo JS.');
    });

    it('falls back to "kamu" when the sender has no contact name', async () => {
        const { run } = (await import('../src/plugins/menu.js')).default;
        const ctx = makeCtx();
        ctx.m.contact = undefined;
        await run(ctx);

        const [, content] = ctx.sock.message.send.mock.calls[0];
        expect(content.extendedTextMessage.text).toContain('hai kamu! berikut kategori yang tersedia');
    });

    it('lists every command grouped by category with menu all', async () => {
        const { run } = (await import('../src/plugins/menu.js')).default;
        const ctx = makeCtx();
        ctx.text = 'all';
        await run(ctx);

        const [, body] = ctx.sock.message.send.mock.calls[0];
        expect(body).toContain('* core');
        expect(body).toContain('• ping');
        expect(body).toContain('* owner');
        expect(body).toContain('• mem');
        expect(body).toContain('> gunakan command -h untuk melihat help.');
        expect(body).toMatch(/> contoh: (ping|mem|run) -h/);
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
