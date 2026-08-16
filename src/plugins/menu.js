import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getFirstStringAndRest, getOneRandomElemenFrom } from '../helper/common.js';
import { JPEG_THUMB } from '../helper/thumbnail-link.js';
import { plugins } from '../plugin-registry.js';
import { themeManager } from '../theme-manager.js';

const pkg = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')
);

const BOT_NAME = pkg.name || 'zyron-bot';
const BOT_DESC = pkg.description || 'WhatsApp Bot';
const MENU_URL = 'https://wa.me/6283851010908';

const buatKataKata = (displayPrefix, randomCommand, content) => `${content ?? ''}

> gunakan command -h untuk melihat help.
> contoh: ${displayPrefix ?? ''}${randomCommand ?? ''} -h`;

const normalizePlugins = source => {
    const seen = new Set();
    const list = [];

    for (const plugin of source) {
        if (!plugin || plugin.disabled || seen.has(plugin)) continue;
        seen.add(plugin);

        const commands = Array.isArray(plugin.command)
            ? plugin.command.filter(
                command => typeof command === 'string' && command.trim()
            )
            : [];

        if (commands.length === 0) continue;

        const name = typeof plugin.name === 'string' && plugin.name.trim()
            ? plugin.name.trim()
            : commands[0];

        const category = Array.isArray(plugin.category)
            ? plugin.category
                .filter(value => typeof value === 'string')
                .map(value => value.trim().toLowerCase())
                .filter(Boolean)
            : [];

        list.push({
            name,
            command: [...new Set(commands.map(value => value.trim()))],
            description: typeof plugin.description === 'string'
                ? plugin.description.trim()
                : '',
            category: [...new Set(category)],
            ownerOnly: plugin.ownerOnly === true
        });
    }

    return list;
};

const buildMenuManager = pluginList => {
    const categoryMap = new Map();
    const categoryArray = [];
    let categoryText;
    let allMenuText;

    const pluginRowNormalize = pluginList
        .map(plugin => ({
            pluginRow: `- ${[...plugin.command].sort().join(', ')} (${plugin.name})`,
            plugin
        }))
        .sort((a, b) => a.pluginRow.localeCompare(b.pluginRow));

    for (const { pluginRow, plugin } of pluginRowNormalize) {
        for (const category of plugin.category) {
            const current = categoryMap.get(category) ?? {
                textArray: [],
                commandArray: [],
                finalText: undefined
            };

            current.textArray.push(pluginRow);
            plugin.command.forEach(command => current.commandArray.push(command));
            categoryMap.set(category, current);
        }
    }

    categoryArray.push(...[...categoryMap.keys()].sort());

    categoryText = categoryArray.map(category => `- ${category}`).join('\n');

    categoryArray.forEach(category => {
        const entry = categoryMap.get(category);
        entry.finalText = `*${category}*\n${entry.textArray.join('\n')}`;
    });

    allMenuText = categoryArray
        .map(category => categoryMap.get(category).finalText)
        .join('\n\n');

    return { categoryMap, categoryArray, categoryText, allMenuText };
};

async function run(ctx) {
    const { sock, jid, m, text } = ctx;

    const { firstString, restString } = getFirstStringAndRest(text);
    const menuManager = buildMenuManager(normalizePlugins([...plugins.values()]));

    if (!text) {
        const themeConfig = themeManager.getData();
        const senderName = m.contact?.pushName || 'kamu';

        const prefixCommand = 'menu';
        const header = `hai ${senderName}! berikut kategori yang tersedia\n\n`;
        const body = menuManager.categoryText + '\n\n';
        const footer = `> gunakan ${prefixCommand} <category> untuk liat isi menu`;
        const content = header + body + footer;

        const link = themeConfig?.url ?? MENU_URL;
        const etm = themeConfig?.message?.extendedTextMessage ?? {};
        const hasValidThumbnail =
            etm?.mediaKey instanceof Uint8Array && etm.mediaKey.byteLength > 0;

        const thumbnailFields = hasValidThumbnail
            ? {
                thumbnailDirectPath: etm.thumbnailDirectPath,
                thumbnailSha256: etm.thumbnailSha256,
                thumbnailEncSha256: etm.thumbnailEncSha256,
                mediaKey: etm.mediaKey,
                mediaKeyTimestamp: etm.mediaKeyTimestamp,
                thumbnailWidth: etm.thumbnailWidth,
                thumbnailHeight: etm.thumbnailHeight
            }
            : {};

        const message = {
            extendedTextMessage: {
                title: themeConfig?.title ?? BOT_NAME,
                description: themeConfig?.description ?? BOT_DESC,
                text: `${link}\n${content}`,
                matchedText: link,
                previewType: 0,
                inviteLinkGroupTypeV2: 0,
                endCardTiles: [],
                jpegThumbnail: etm?.jpegThumbnail ?? Buffer.from(JPEG_THUMB, 'base64'),
                contextInfo: {
                    mentionedJid: [],
                    groupMentions: [],
                    statusAttributions: []
                },
                ...thumbnailFields
            }
        };

        try {
            await sock.message.send(jid, message, { quote: m });
        } catch (err) {
            console.error('[menu]', err);
            return m.reply(`Failed to send menu: ${err?.message ?? err}`);
        }

        return;
    }

    if (firstString === 'all' && !restString) {
        const randomCategory = getOneRandomElemenFrom(menuManager.categoryArray);
        const randomCommand = getOneRandomElemenFrom(
            menuManager.categoryMap.get(randomCategory).commandArray
        );

        await sock.message.send(jid, buatKataKata('', randomCommand, menuManager.allMenuText));
        return;
    }

    const userCategory = text.trim();
    const choosenCategory = menuManager.categoryMap.get(userCategory);

    if (!choosenCategory) return m.reply(`tidak ada kategori *${text}*`);

    const randomCommand = getOneRandomElemenFrom(choosenCategory.commandArray);

    await sock.message.send(jid, buatKataKata('', randomCommand, choosenCategory.finalText));
}

const plugin = {
    run,
    name: 'menu',
    command: ['menu'],
    description: 'Menampilkan menu.',
    category: ['core']
};

export default plugin;