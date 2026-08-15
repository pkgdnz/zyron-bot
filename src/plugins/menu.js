import { readFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import cfg from '../../config.js';
import { plugins } from '../plugin-registry.js';

const pkg = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')
);

const BOT_NAME = pkg.name || 'zyron-bot';
const BOT_DESC = pkg.description || 'Bot WhatsApp';
const BOT_NUMBER = (cfg.botNumber ?? '').replace(/\D/g, '');
const BOT_URL = BOT_NUMBER
    ? `https://wa.me/${BOT_NUMBER}`
    : 'https://www.whatsapp.com/';

const THUMB = {
    jpegThumbnail: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAQAAAAnOwc2AAAADElEQVR4nGNgGG4AAADSAAFQmYCvAAAAAElFTkSuQmCC',
        'base64'
    ),
    thumbnailDirectPath:
        '/o1/v/t24/f2/m231/AQNPz8QdnT5ybQz5sU20zE4aKK4lyWTELRD4MwrlcfbMuADUwTEII4WXHnrtphxj12_6u12Cog7OK3XJd-QHESyZ5Bc7Lta7UtWvf1xZOA?ccb=9-4&oh=01_Q5Aa5QEc0HEWaf-yB5EKtjl58k5qlsl4cGgyUOTQiNa_tMWc3w&oe=6AA6D999&_nc_sid=e6ed6c',
    thumbnailSha256: Buffer.from(
        'rIJ98LsQHBzL2GDsf7YlNi6vdr9c58ZAkMV0+nQcE7M=',
        'base64'
    ),
    thumbnailEncSha256: Buffer.from(
        'eg9R1/CzMl9HsqWrlWe0w6vHxcs8K6TrU54d1HGnEEk=',
        'base64'
    ),
    mediaKey: Buffer.from(
        'hrjQRppqI6DvEu7lxHBdDCg6C0Fu67Bk0x6PVE8cHR0=',
        'base64'
    ),
    mediaKeyTimestamp: { low: 1786731036, high: 0, unsigned: false },
    thumbnailHeight: 1075,
    thumbnailWidth: 736,
    faviconMmsMetadata: {
        thumbnailDirectPath:
            '/o1/v/t24/f2/m231/AQOb2_0NU4EvIpVSw41P_1ojRif6zvM--OwC2gxV1AbMPPPQf6WjC6mtsWA08ckWDepU8tSGDp6lZvRD4kdu31PbKTvCkGMyRpdmR27UYA?ccb=9-4&oh=01_Q5Aa5QFXVSi7ApsqlZ-AXfv-YroC5yuYcEXkJwNxP2ra-1dcbw&oe=6A9FF22D&_nc_sid=e6ed6c',
        thumbnailSha256: Buffer.from(
            'AAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAIGAAAAAAAAAwEAAAAAAAAAAAA=',
            'base64'
        ),
        thumbnailEncSha256: Buffer.from(
            'AAAAAAAAAAAAAAAJAAkAAAAAAAABAAAAAAAAAAADAAAEAAAAAAAAAQAAAAA=',
            'base64'
        ),
        mediaKey: Buffer.from(
            'AAAAAAAAAAAAAAEAAAAFAAAABwAAAAAAAAAAAAAAAAIIBAQFAAAAAAAAAAA=',
            'base64'
        ),
        mediaKeyTimestamp: { low: 1786282885, high: 0, unsigned: false },
        thumbnailHeight: 32,
        thumbnailWidth: 32
    }
};

const scanPluginsFromDisk = async () => {
    const files = await readdir(cfg.path.plugins);
    const found = [];

    for (const file of files) {
        if (!file.endsWith('.js')) continue;

        const filePath = resolve(cfg.path.plugins, file);

        try {
            const { mtimeMs } = await stat(filePath);
            const url = new URL(pathToFileURL(filePath).href);
            url.searchParams.set('t', String(mtimeMs));

            const mod = await import(url.href);
            const plugin = mod.default;

            if (plugin) found.push(plugin);
        } catch (err) {
            console.warn(`[menu] scan failed ${file}:`, err.message);
        }
    }

    return found;
};

const collectPlugins = source => {
    const seen = new Set();
    const list = [];

    for (const plugin of source) {
        if (!plugin || seen.has(plugin) || plugin.disabled) continue;
        seen.add(plugin);

        const commands = Array.isArray(plugin.command)
            ? plugin.command.filter(
                  c => typeof c === 'string' && c.trim().length > 0
              )
            : [];

        const name =
            typeof plugin.name === 'string' && plugin.name.trim().length > 0
                ? plugin.name.trim()
                : commands[0] ?? null;

        if (!name) continue;

        const aliases = Array.isArray(plugin.aliases)
            ? plugin.aliases.filter(
                  a => typeof a === 'string' && a.trim().length > 0
              )
            : [];

        const description =
            typeof plugin.description === 'string'
                ? plugin.description.trim()
                : '';

        const categories = (Array.isArray(plugin.category)
            ? plugin.category
            : typeof plugin.category === 'string'
              ? [plugin.category]
              : []
        )
            .filter(c => typeof c === 'string' && c.trim().length > 0)
            .map(c => c.trim().toLowerCase());

        list.push({
            name,
            command: commands,
            aliases,
            description,
            category: categories,
            ownerOnly: !!plugin.ownerOnly
        });
    }

    return list;
};

const groupByCategory = pluginList => {
    const groups = new Map();

    for (const plugin of pluginList) {
        const categories =
            plugin.category.length > 0 ? plugin.category : ['other'];

        for (const category of categories) {
            if (!groups.has(category)) groups.set(category, []);
            groups.get(category).push(plugin);
        }
    }

    for (const list of groups.values()) {
        list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return groups;
};

const formatHeader = () => `${BOT_URL}\n${BOT_NAME} - ${BOT_DESC}`;

const FOOTER = '> Gunakan menu <kategori> untuk melihat isi menu';

const formatCategories = categories => [
    formatHeader(),
    '',
    'Berikut kategori yang tersedia:',
    '',
    ...categories.map(c => `- ${c}`),
    '',
    FOOTER
].join('\n');

const describePlugin = plugin => {
    if (plugin.description) return plugin.description;

    return ' ';
};

const formatCategory = (category, list) => {
    const lines = [];

    for (const plugin of list) {
        const trigger = plugin.command[0] ?? plugin.name;
        lines.push(`• ${trigger}`);
        lines.push(`└─ ${describePlugin(plugin)}`);
    }

    return [
        formatHeader(),
        '',
        `Category: ${category}`,
        '',
        ...lines,
        '',
        FOOTER
    ].join('\n');
};

const formatNotFound = (query, categories) => [
    formatHeader(),
    '',
    `Kategori "${query}" tidak ditemukan.`,
    '',
    'Berikut kategori yang tersedia:',
    '',
    ...categories.map(c => `- ${c}`),
    '',
    FOOTER
].join('\n');

const buildMenuMessage = text => ({
    extendedTextMessage: {
        endCardTiles: [],
        text,
        matchedText: BOT_URL,
        description: BOT_DESC,
        title: BOT_NAME,
        previewType: 0,
        ...THUMB,
        inviteLinkGroupTypeV2: 0
    }
});

const run = async ({ sock, jid, m, text }) => {
    let source = [...plugins.values()];

    if (source.length === 0) {
        source = await scanPluginsFromDisk();
    }

    const groups = groupByCategory(collectPlugins(source));
    const categories = [...groups.keys()].sort();
    const query = (text ?? '').trim().toLowerCase();

    let body;

    if (!query) {
        body =
            categories.length > 0
                ? formatCategories(categories)
                : 'Tidak ada plugin terdaftar.';
    } else {
        const list = groups.get(query);
        body = list
            ? formatCategory(query, list)
            : formatNotFound(query, categories);
    }

    try {
        await sock.message.send(jid, buildMenuMessage(body));
    } catch (err) {
        console.error('[menu]', err);
        return m.reply(`Gagal mengirim menu: ${err?.message ?? err}`);
    }
};

const plugin = {
    run,
    name: 'menu',
    command: ['menu'],
    description: 'Tampilkan daftar kategori dan command yang tersedia.',
    category: ['core']
};

export default plugin;
