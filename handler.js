import { readdir, stat } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import cfg from './config.js';
import { plugins } from './src/plugin-registry.js';
import { messageSerialize } from './src/serialize.js';
import { isOwner } from './src/owner.js';
import { isSelfMode } from './src/store.js';

const pluginCache = new Map();

const normalizePlugin = (plugin, file) => {
    if (!plugin || typeof plugin !== 'object') {
        throw new TypeError('default export must be an object');
    }

    if (!Array.isArray(plugin.command) || plugin.command.length === 0) {
        throw new TypeError('command must be a non-empty array');
    }

    if (typeof plugin.run !== 'function') {
        throw new TypeError('run must be a function');
    }

    const command = [...new Set(
        plugin.command
            .filter(value => typeof value === 'string')
            .map(value => value.trim())
            .filter(Boolean)
    )];

    if (command.length === 0) {
        throw new TypeError('command must contain at least one non-empty string');
    }

    return {
        ...plugin,
        command,
        name: typeof plugin.name === 'string' && plugin.name.trim()
            ? plugin.name.trim()
            : file.replace(/\.js$/, ''),
        description: typeof plugin.description === 'string'
            ? plugin.description.trim()
            : '',
        category: Array.isArray(plugin.category)
            ? plugin.category
                .filter(value => typeof value === 'string')
                .map(value => value.trim().toLowerCase())
                .filter(Boolean)
            : [],
        ownerOnly: plugin.ownerOnly === true
    };
};

const registerPlugin = (map, plugin) => {
    for (const command of plugin.command) {
        const previous = map.get(command);

        if (previous && previous !== plugin) {
            console.warn(
                `[plugins] command collision: "${command}" ` +
                `${previous.name ?? 'unknown'} -> ${plugin.name}`
            );
        }

        map.set(command, plugin);
    }
};

async function loadPlugins() {
    if (!existsSync(cfg.path.plugins)) {
        plugins.clear();
        pluginCache.clear();
        console.warn(`[plugins] directory not found: ${cfg.path.plugins}`);
        return;
    }

    const files = await readdir(cfg.path.plugins);
    const next = new Map();
    const newCache = new Map();

    for (const file of files.sort()) {
        if (!file.endsWith('.js')) continue;

        const filePath = resolve(cfg.path.plugins, file);
        const { mtimeMs } = await stat(filePath);
        const cached = pluginCache.get(file);

        if (cached?.mtimeMs === mtimeMs) {
            registerPlugin(next, cached.plugin);
            newCache.set(file, cached);
            continue;
        }

        const url = new URL(pathToFileURL(filePath).href);
        url.searchParams.set('t', String(mtimeMs));

        try {
            const mod = await import(url.href);
            const plugin = normalizePlugin(mod.default, file);

            registerPlugin(next, plugin);
            newCache.set(file, { plugin, mtimeMs });
        } catch (err) {
            console.warn(`[plugins] failed to load ${file}:`, err.message);

            if (cached) {
                registerPlugin(next, cached.plugin);
                newCache.set(file, cached);
            }
        }
    }

    plugins.clear();
    for (const [command, plugin] of next) {
        plugins.set(command, plugin);
    }

    pluginCache.clear();
    for (const [file, entry] of newCache) {
        pluginCache.set(file, entry);
    }

    console.log(`[plugins] loaded ${plugins.size} command(s)`);
}

let reloading = false;

function watchPlugins() {
    watch(cfg.path.plugins, { recursive: true }, async () => {
        if (reloading) return;
        reloading = true;

        try {
            await loadPlugins();
            console.log('[plugins] reloaded');
        } catch (err) {
            console.error('[plugins] reload failed:', err);
        } finally {
            reloading = false;
        }
    });
}

if (existsSync(cfg.path.plugins)) {
    await loadPlugins();
    watchPlugins();
}

const handleMessage = async (event, sock) => {
    if (!event?.message) return;

    const m = messageSerialize(event, sock);
    const jid = m.key?.remoteJid;

    if (!jid) return;

    const owner = isOwner(m);

    const reaction = m.message?.reactionMessage;
    if (reaction?.text === '🏳️‍🌈' && owner && jid.endsWith('@g.us')) {
        const targetKey = reaction.targetMessageKey;
        if (!targetKey?.id) return;

        const ctx = {
            sock,
            jid,
            m,
            q: {
                key: {
                    id: targetKey.id,
                    remoteJid: targetKey.remoteJid ?? jid,
                    fromMe: false
                }
            },
            text: ''
        };

        const plugin = plugins.get('dmsg');
        if (!plugin) return;

        if (plugin.ownerOnly && !owner) return;
        if (isSelfMode(jid) && !owner) return;

        try {
            await plugin.run(ctx);
        } catch (err) {
            console.error(
                `[handler] error in reaction plugin "${plugin.name}":`,
                err
            );
        }

        return;
    }

    const rawText = (m.text ?? '').trim();
    if (!rawText) return;

    const [command, ...args] = rawText.split(/\s+/);
    const plugin = plugins.get(command);

    if (!plugin) return;

    if (plugin.ownerOnly && !owner) return;
    if (isSelfMode(jid) && !owner) return;

    const ctx = {
        sock,
        jid,
        m,
        q: m.quoted,
        text: args.join(' ')
    };

    try {
        await plugin.run(ctx);
    } catch (err) {
        console.error(
            `[handler] error in plugin "${plugin.name}":`,
            err
        );
    }
};

export { handleMessage, loadPlugins };
