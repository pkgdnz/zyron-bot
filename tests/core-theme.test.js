import { beforeEach, describe, expect, it, vi } from 'vitest';

let run;
let tm;
let sock;

const makeCtx = ({ text, q } = {}) => ({
    sock,
    jid: '123@s.whatsapp.net',
    m: {
        key: {
            remoteJid: '123@s.whatsapp.net',
            id: 'abc123',
            fromMe: false
        },
        message: {},
        reply: vi.fn(async value => value)
    },
    q,
    text: text ?? ''
});

beforeEach(async () => {
    vi.resetModules();

    tm = {
        getData: vi.fn(() => ({
            title: 'halo',
            description: null,
            url: null,
            message: null
        })),
        setTitle: vi.fn(async () => ({})),
        setDescription: vi.fn(async () => ({})),
        setUrl: vi.fn(async () => ({})),
        setMessage: vi.fn(async () => ({})),
        overrideHeightByRatio: vi.fn(async () => ({})),
        setFavicon: vi.fn(async () => ({})),
        useExternalJson: vi.fn(async () => ({})),
        exportData: vi.fn(() => ({ title: 'halo' }))
    };

    vi.doMock('../src/theme-manager.js', () => ({ themeManager: tm }));

    sock = {
        message: {
            send: vi.fn(async () => ({ id: 'sent' })),
            download: vi.fn(),
            upload: vi.fn()
        }
    };

    ({ run } = (await import('../src/plugins/core-theme.js')).default);
});

describe('theme plugin', () => {
    it('shows available subcommands without arguments', async () => {
        const ctx = makeCtx({ text: '' });
        await run(ctx);

        expect(ctx.m.reply).toHaveBeenCalledWith(
            expect.stringContaining('opsi tersedia')
        );
        expect(ctx.m.reply).toHaveBeenCalledWith(
            expect.stringContaining('preview')
        );
    });

    it('sets the title and reacts with success', async () => {
        const ctx = makeCtx({ text: 'title set halo dunia' });
        await run(ctx);

        expect(tm.setTitle).toHaveBeenCalledWith('halo dunia');
        expect(ctx.m.reply).not.toHaveBeenCalled();
        expect(sock.message.send).toHaveBeenCalledWith('123@s.whatsapp.net', {
            type: 'reaction',
            emoji: '✅',
            target: ctx.m.key
        });
    });

    it('requires text for title set', async () => {
        const ctx = makeCtx({ text: 'title set' });
        await run(ctx);

        expect(ctx.m.reply).toHaveBeenCalledWith('masukkan teks');
        expect(tm.setTitle).not.toHaveBeenCalled();
    });

    it('gets the current title', async () => {
        const ctx = makeCtx({ text: 'title get' });
        await run(ctx);

        expect(ctx.m.reply).toHaveBeenCalledWith('halo');
    });

    it('clears the title', async () => {
        const ctx = makeCtx({ text: 'title clear' });
        await run(ctx);

        expect(tm.setTitle).toHaveBeenCalledWith(undefined);
        expect(sock.message.send).toHaveBeenCalledTimes(1);
    });

    it('parses multi-word descriptions', async () => {
        const ctx = makeCtx({ text: 'description set halo dunia' });
        await run(ctx);

        expect(tm.setDescription).toHaveBeenCalledWith('halo dunia');
    });

    it('forwards the url to the theme manager', async () => {
        const ctx = makeCtx({ text: 'url set https://example.com' });
        await run(ctx);

        expect(tm.setUrl).toHaveBeenCalledWith('https://example.com');
    });

    it('replies when no thumbnail can be downloaded', async () => {
        const ctx = makeCtx({ text: 'thumb get' });
        await run(ctx);

        expect(ctx.m.reply).toHaveBeenCalledWith(
            expect.stringContaining('gak bisa download')
        );
    });

    it('overrides the thumbnail height ratio', async () => {
        const ctx = makeCtx({ text: 'thumb height 0.5' });
        await run(ctx);

        expect(tm.overrideHeightByRatio).toHaveBeenCalledWith('0.5');
        expect(sock.message.send).toHaveBeenCalledTimes(1);
    });

    it('restores the stock thumbnail', async () => {
        tm.setMessage.mockResolvedValue({ data: 'thumbnail kembali ke stock' });

        const ctx = makeCtx({ text: 'thumb stock' });
        await run(ctx);

        expect(tm.setMessage).toHaveBeenCalledWith(undefined);
        expect(ctx.m.reply).toHaveBeenCalledWith('thumbnail kembali ke stock');
    });

    it('exports the theme as a json document', async () => {
        const ctx = makeCtx({ text: 'export haloz' });
        await run(ctx);

        expect(tm.exportData).toHaveBeenCalledOnce();
        expect(sock.message.send).toHaveBeenCalledWith(
            '123@s.whatsapp.net',
            expect.objectContaining({
                type: 'document',
                mimetype: 'application/json'
            })
        );

        const [, content] = sock.message.send.mock.calls[0];
        expect(content.fileName).toMatch(/^haloz-\d+\.json$/);
        expect(content.media).toBeInstanceOf(Buffer);
    });

    it('requires a quoted document for theme use', async () => {
        const ctx = makeCtx({ text: 'use' });
        await run(ctx);

        expect(ctx.m.reply).toHaveBeenCalledWith(
            expect.stringContaining('reply ke message')
        );
    });

    it('clears the favicon', async () => {
        const ctx = makeCtx({ text: 'fav clear' });
        await run(ctx);

        expect(tm.setFavicon).toHaveBeenCalledWith(undefined);
        expect(sock.message.send).toHaveBeenCalledTimes(1);
    });

    it('keeps preview as a wip stub', async () => {
        const ctx = makeCtx({ text: 'preview' });
        await run(ctx);

        expect(ctx.m.reply).toHaveBeenCalledWith('masih di buat');
    });

    it('rejects an unknown subcommand', async () => {
        const ctx = makeCtx({ text: 'bogus' });
        await run(ctx);

        expect(ctx.m.reply).toHaveBeenCalledWith('invalid subcommand');
    });
});
