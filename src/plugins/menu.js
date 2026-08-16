import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getFirstStringAndRest, getOneRandomElemenFrom } from '../helper/common.js';
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

const groupByCategory = pluginList => {
    const groups = new Map();

    for (const plugin of pluginList) {
        const categories = plugin.category.length > 0
            ? plugin.category
            : ['other'];

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

const formatCommandLines = list => {
    const lines = [];

    for (const plugin of list) {
        const trigger = plugin.command[0] ?? plugin.name;
        const badge = plugin.ownerOnly ? ' 🔐' : '';
        lines.push(`• ${trigger}${badge}`);
        lines.push(`└─ ${plugin.description || 'No description.'}`);
    }

    return lines;
};

const buildMenuManager = groups => {
    const categoryArray = [...groups.keys()].sort();
    const categoryText = categoryArray
        .map(category => `* ${category}`)
        .join('\n');
    const allMenuText = [...groups.entries()]
        .map(([category, list]) => [
            `* ${category}`,
            ...formatCommandLines(list)
        ].join('\n'))
        .join('\n\n');
    const categoryMap = new Map();

    for (const [category, list] of groups) {
        categoryMap.set(category, {
            commandArray: list.flatMap(plugin => plugin.command),
            finalText: [
                `* ${category}`,
                ...formatCommandLines(list)
            ].join('\n')
        });
    }

    return { categoryArray, categoryText, allMenuText, categoryMap };
};

async function run(ctx) {
    const { sock, jid, m, text } = ctx;

    const { firstString, restString } = getFirstStringAndRest(text);
    const menuManager = buildMenuManager(
        groupByCategory(normalizePlugins([...plugins.values()]))
    );

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

        const message = {
            extendedTextMessage: {
                ...etm,
                text: `${link}\n${content}`,
                matchedText: link,
                description: themeConfig?.description ?? BOT_DESC,
                title: themeConfig?.title ?? BOT_NAME,
                thumbnailHeight: etm?.thumbnailHeight
            }
        };

        try {
            await sock.message.send(jid, message);
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
