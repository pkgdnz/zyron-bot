import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { plugins } from '../plugin-registry.js';
import { themeManager } from '../theme-manager.js';

const pkg = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')
);

const BOT_NAME = pkg.name || 'zyron-bot';
const BOT_DESC = pkg.description || 'WhatsApp Bot';
const MENU_URL = 'https://wa.me/6283851010908';

const FOOTER = [
    '> Use menu <category> to view sub-menu.',
    '> Use menu all to view all menu.'
].join('\n');

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

const formatCategories = (categories, link, greeting) => [
    link,
    '',
    greeting,
    '',
    'Menu List:',
    '',
    ...categories.map(category => `* ${category}`),
    '',
    FOOTER
].join('\n');

const formatCategory = (category, list, link, greeting) => [
    link,
    '',
    greeting,
    '',
    `*Menu ${category}:*`,
    '',
    ...formatCommandLines(list),
    '',
    FOOTER
].join('\n');

const formatAll = (groups, link, greeting) => {
    const sections = [];

    for (const [category, list] of groups) {
        sections.push(`*${category}:*`);
        sections.push(...formatCommandLines(list));
        sections.push('');
    }

    return [
        link,
        '',
        greeting,
        '',
        '*Menu All:*',
        '',
        ...sections,
        FOOTER
    ].join('\n');
};

const formatNotFound = (query, categories, link, greeting) => [
    link,
    '',
    greeting,
    '',
    `*Menu ${query}:* category not found.`,
    '',
    'Available categories:',
    '',
    ...categories.map(category => `* ${category}`),
    '',
    FOOTER
].join('\n');

const run = async ({ sock, jid, m, text }) => {
    const groups = groupByCategory(normalizePlugins([...plugins.values()]));
    const categories = [...groups.keys()].sort();
    const query = (text ?? '').trim().toLowerCase();

    const senderJid = m.key?.participant ?? m.key?.remoteJid;
    const senderNumber = (senderJid ?? '').split('@')[0];
    const greeting = senderNumber ? `Hello @${senderNumber}` : 'Hello';

    const { url } = themeManager.getData();
    const link = url ?? MENU_URL;

    let body;

    if (query === 'all') {
        body = categories.length > 0
            ? formatAll(groups, link, greeting)
            : '⚠️ No plugins are currently registered.';
    } else if (!query) {
        body = categories.length > 0
            ? formatCategories(categories, link, greeting)
            : '⚠️ No plugins are currently registered.';
    } else {
        const list = groups.get(query);
        body = list
            ? formatCategory(query, list, link, greeting)
            : formatNotFound(query, categories, link, greeting);
    }

    const content = themeManager.buildLinkPreview(body, {
        title: BOT_NAME,
        description: BOT_DESC,
        url: MENU_URL
    });

    try {
        const options = senderJid ? { mentions: [senderJid] } : undefined;
        await sock.message.send(jid, content, options);
    } catch (err) {
        console.error('[menu]', err);
        return m.reply(`Failed to send menu: ${err?.message ?? err}`);
    }
};

const plugin = {
    run,
    name: 'menu',
    command: ['menu'],
    description: 'Show available categories and commands.',
    category: ['core']
};

export default plugin;
