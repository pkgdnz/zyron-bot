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

const formatCategoryText = categories =>
    categories.map(category => `* ${category}`).join('\n');

const formatAllMenu = groups => {
    const sections = [];

    for (const [category, list] of groups) {
        sections.push(`* ${category}`);
        sections.push(...formatCommandLines(list));
        sections.push('');
    }

    return sections.join('\n').trimEnd();
};

const formatCategoryMenu = (category, list) => [
    `* ${category}`,
    ...formatCommandLines(list)
].join('\n');

async function run(ctx) {
    const { sock, jid, m, text } = ctx;

    const { firstString, restString } = getFirstStringAndRest(text);
    const groups = groupByCategory(normalizePlugins([...plugins.values()]));
    const categories = [...groups.keys()].sort();

    if (!text) {
        const senderName = m.contact?.pushName || 'kamu';

        const header = `hai ${senderName}! berikut kategori yang tersedia\n\n`;
        const body = `${formatCategoryText(categories)}\n\n`;
        const footer = '> gunakan menu <category> untuk liat isi menu';
        const content = header + body + footer;

        const { url } = themeManager.getData();
        const link = url ?? MENU_URL;

        const message = themeManager.buildLinkPreview(`${link}\n${content}`, {
            title: BOT_NAME,
            description: BOT_DESC,
            url: link
        });

        try {
            await sock.message.send(jid, message);
        } catch (err) {
            console.error('[menu]', err);
            return m.reply(`Failed to send menu: ${err?.message ?? err}`);
        }

        return;
    }

    if (firstString === 'all' && !restString) {
        const randomCategory = getOneRandomElemenFrom(categories);
        const list = groups.get(randomCategory) ?? [];
        const randomPlugin = getOneRandomElemenFrom(list);
        const randomCommand = randomPlugin?.command?.[0];

        await sock.message.send(jid, buatKataKata('', randomCommand, formatAllMenu(groups)));
        return;
    }

    const userCategory = text.trim();
    const list = groups.get(userCategory);

    if (!list) return m.reply(`tidak ada kategori *${text}*`);

    const randomPlugin = getOneRandomElemenFrom(list);
    const randomCommand = randomPlugin?.command?.[0];

    await sock.message.send(jid, buatKataKata('', randomCommand, formatCategoryMenu(userCategory, list)));
}

const plugin = {
    run,
    name: 'menu',
    command: ['menu'],
    description: 'Menampilkan menu.',
    category: ['core']
};

export default plugin;
