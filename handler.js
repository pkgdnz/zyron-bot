import { readdir, stat } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import cfg from './config.js';
import { plugins } from './src/plugin-registry.js';
import { messageSerialize } from './src/serialize/serialize.js';
import { isOwner } from './src/owner.js';
import { isSelfMode } from './src/self-store.js';

const pluginCache = new Map();

async function loadPlugins() {
    if (!existsSync(cfg.path.plugins)) return;

    const files = await readdir(cfg.path.plugins);
    const next = new Map();
    const newCache = new Map();

    for (const file of files) {
        if (!file.endsWith('.js')) continue;

        const filePath = resolve(cfg.path.plugins, file);
        const { mtimeMs } = await stat(filePath);
        const cached = pluginCache.get(file);

        if (cached && cached.mtimeMs === mtimeMs) {
            for (const cmd of cached.plugin.command) {
                next.set(cmd, cached.plugin);
            }
            newCache.set(file, cached);
            continue;
        }

        const url = new URL(pathToFileURL(filePath).href);
        url.searchParams.set('t', String(mtimeMs));

        try {
            const mod = await import(url.href);
            const plugin = mod.default;

            if (
                !plugin?.command?.length ||
                typeof plugin.run !== 'function'
            ) {
                console.warn(
                    `[plugins] skipping ${file}: missing command or run`
                );
                if (cached) {
                    for (const cmd of cached.plugin.command) {
                        next.set(cmd, cached.plugin);
                    }
                    newCache.set(file, cached);
                }
                continue;
            }

            for (const cmd of plugin.command) {
                next.set(cmd, plugin);
            }
            newCache.set(file, { plugin, mtimeMs });
        } catch (err) {
            console.warn(`[plugins] failed to load ${file}:`, err.message);
            if (cached) {
                for (const cmd of cached.plugin.command) {
                    next.set(cmd, cached.plugin);
                }
                newCache.set(file, cached);
            }
        }
    }

    for (const [file, cached] of pluginCache) {
        if (!newCache.has(file)) {
            for (const cmd of cached.plugin.command) {
                next.delete(cmd);
            }
        }
    }

    plugins.clear();
    for (const [cmd, plugin] of next) {
        plugins.set(cmd, plugin);
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
} else {
    console.log(`[plugins] directory not found: ${cfg.path.plugins}`);
}

const handleMessage = async (event, sock) => {
    if (!event.message) {
        console.log('[handler] no event.message');
        return;
    }

    const m = messageSerialize(event, sock);
    const jid = m.key?.remoteJid;

    if (!jid) {
        console.log('[handler] no jid');
        return;
    }

    const rawText = (m.text ?? '').trim();
    if (!rawText) return;

    const [command, ...args] = rawText.split(/\s+/);
    const plugin = plugins.get(command);

    if (!plugin) return;

    const owner = isOwner(m);

    if (plugin.ownerOnly && !owner) {
        return;
    }

    if (isSelfMode(jid) && !owner) {
        return;
    }

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

export { handleMessage };