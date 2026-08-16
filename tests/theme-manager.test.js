import { beforeEach, describe, expect, it, vi } from 'vitest';

let themeState;
let theme;

beforeEach(() => {
    vi.resetModules();

    themeState = {
        title: null,
        description: null,
        url: null,
        message: null
    };

    theme = {
        get: {
            get: vi.fn(() => ({
                title: themeState.title,
                description: themeState.description,
                url: themeState.url,
                message: themeState.message
            }))
        },
        upsert: {
            run: vi.fn(({ title, description, url, message }) => {
                themeState.title = title;
                themeState.description = description;
                themeState.url = url;
                themeState.message = message;
                return {};
            })
        }
    };

    vi.doMock('../src/database/table.js', () => ({
        default: { theme }
    }));
});

const wamc = {
    extendedTextMessage: {
        thumbnailDirectPath: '/mms/thumbnail-link/abc',
        thumbnailSha256: new Uint8Array(32).fill(1),
        thumbnailEncSha256: new Uint8Array(32).fill(2),
        mediaKey: new Uint8Array(32).fill(3),
        mediaKeyTimestamp: 123,
        mimetype: 'image/png',
        thumbnailWidth: 400,
        thumbnailHeight: 300,
        jpegThumbnail: new Uint8Array(16).fill(9)
    }
};

describe('theme manager', () => {
    it('loads with empty defaults', async () => {
        const { themeManager } = await import('../src/theme-manager.js');

        expect(themeManager.getData()).toEqual({
            title: null,
            description: null,
            url: null,
            message: null
        });
    });

    it('sets, gets, and clears the title', async () => {
        const { themeManager } = await import('../src/theme-manager.js');

        expect(themeManager.setTitle('halo dunia')).toEqual({});
        expect(themeManager.getData().title).toBe('halo dunia');

        expect(themeManager.setTitle(undefined)).toEqual({});
        expect(themeManager.getData().title).toBeNull();
    });

    it('rejects an empty title', async () => {
        const { themeManager } = await import('../src/theme-manager.js');

        const r = themeManager.setTitle('   ');
        expect(r.error).toBeTruthy();
        expect(themeManager.getData().title).toBeNull();
    });

    it('sets and clears the description', async () => {
        const { themeManager } = await import('../src/theme-manager.js');

        themeManager.setDescription('deskripsi bot');
        expect(themeManager.getData().description).toBe('deskripsi bot');

        themeManager.setDescription(undefined);
        expect(themeManager.getData().description).toBeNull();
    });

    it('validates and normalizes the url', async () => {
        const { themeManager } = await import('../src/theme-manager.js');

        expect(themeManager.setUrl('bukan url').error).toBeTruthy();

        themeManager.setUrl('https://example.com/');
        expect(themeManager.getData().url).toBe('https://example.com/');
    });

    it('stores a valid thumbnail message and resets to stock', async () => {
        const { themeManager } = await import('../src/theme-manager.js');

        expect(themeManager.setMessage(wamc)).toEqual({});
        expect(themeManager.getData().message).toEqual(wamc);

        const stock = themeManager.setMessage(undefined);
        expect(stock.error).toBeFalsy();
        expect(stock.data).toBeTruthy();
        expect(themeManager.getData().message).toBeNull();
    });

    it('rejects a thumbnail without a media key', async () => {
        const { themeManager } = await import('../src/theme-manager.js');

        const r = themeManager.setMessage({ extendedTextMessage: {} });
        expect(r.error).toBeTruthy();
        expect(themeManager.getData().message).toBeNull();
    });

    it('overrides the thumbnail height by ratio', async () => {
        const { themeManager } = await import('../src/theme-manager.js');

        expect(themeManager.overrideHeightByRatio('0.5').error).toBeTruthy();

        themeManager.setMessage(wamc);
        const r = themeManager.overrideHeightByRatio('0.5');
        expect(r.error).toBeFalsy();
        expect(themeManager.getData().message.extendedTextMessage.thumbnailHeight)
            .toBe(200);

        expect(themeManager.overrideHeightByRatio('9').error).toBeTruthy();
    });

    it('sets, gets, and clears the favicon', async () => {
        const { themeManager } = await import('../src/theme-manager.js');

        expect(themeManager.setFavicon(wamc)).toEqual({});
        const favicon =
            themeManager.getData().message.extendedTextMessage.faviconMMSMetadata;

        expect(favicon.mediaKey).toEqual(wamc.extendedTextMessage.mediaKey);
        expect(favicon.thumbnailDirectPath).toBe(
            wamc.extendedTextMessage.thumbnailDirectPath
        );

        themeManager.setFavicon(undefined);
        expect(
            themeManager.getData().message.extendedTextMessage
                .faviconMMSMetadata
        ).toBeUndefined();
    });

    it('rejects an invalid favicon source', async () => {
        const { themeManager } = await import('../src/theme-manager.js');

        expect(themeManager.setFavicon({ extendedTextMessage: {} }).error)
            .toBeTruthy();
    });

    it('exports and restores an external json', async () => {
        const { themeManager } = await import('../src/theme-manager.js');

        themeManager.setTitle('judul');
        themeManager.setDescription('deskripsi');
        themeManager.setUrl('https://example.com/');
        themeManager.setMessage(wamc);
        themeManager.setFavicon(wamc);

        const exported = themeManager.exportData();
        expect(JSON.parse(JSON.stringify(exported))).toEqual(exported);

        themeManager.setTitle(undefined);
        themeManager.setMessage(undefined);

        const r = themeManager.useExternalJson(exported);
        expect(r.error).toBeFalsy();

        const data = themeManager.getData();
        expect(data.title).toBe('judul');
        expect(data.description).toBe('deskripsi');
        expect(data.message.extendedTextMessage.mediaKey)
            .toBeInstanceOf(Uint8Array);
        expect(data.message.extendedTextMessage.faviconMMSMetadata.mediaKey)
            .toBeInstanceOf(Uint8Array);
    });

    it('rejects malformed external json', async () => {
        const { themeManager } = await import('../src/theme-manager.js');

        expect(themeManager.useExternalJson(null).error).toBeTruthy();
        expect(themeManager.useExternalJson('nope').error).toBeTruthy();
        expect(themeManager.useExternalJson({
            title: 123
        }).error).toBeTruthy();
        expect(themeManager.useExternalJson({
            message: { extendedTextMessage: {} }
        }).error).toBeTruthy();
    });
});
