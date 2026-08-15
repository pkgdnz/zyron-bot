import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let config;
let plugins;
let loadPlugins;
let tempDir;

beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'zyron-plugin-test-'));
    config = {
        path: {
            plugins: path.join(tempDir, 'plugins')
        }
    };

    vi.doMock('../config.js', () => ({ default: config }));
    ({ plugins } = await import('../src/plugin-registry.js'));
    ({ loadPlugins } = await import('../handler.js'));
});

afterEach(async () => {
    plugins.clear();
    await rm(tempDir, { recursive: true, force: true });
});

describe('plugin loader', () => {
    it('loads valid plugins and normalizes metadata', async () => {
        await mkdir(config.path.plugins, { recursive: true });
        await writeFile(path.join(config.path.plugins, 'hello.js'), `
            const run = async () => {};
            export default {
                run,
                name: ' hello ',
                command: [' hello ', 'hello'],
                description: ' Test command ',
                category: [' Core ', ''],
                ownerOnly: 1
            };
        `);

        await loadPlugins();

        const plugin = plugins.get('hello');
        expect(plugin).toBeDefined();
        expect(plugin.name).toBe('hello');
        expect(plugin.command).toEqual(['hello']);
        expect(plugin.description).toBe('Test command');
        expect(plugin.category).toEqual(['core']);
        expect(plugin.ownerOnly).toBe(false);
    });

    it('skips invalid plugins and keeps valid ones', async () => {
        await mkdir(config.path.plugins, { recursive: true });
        await writeFile(path.join(config.path.plugins, 'valid.js'), `
            const run = async () => {};
            export default { run, command: ['valid'], name: 'valid' };
        `);
        await writeFile(path.join(config.path.plugins, 'invalid.js'), `
            export default { command: ['invalid'] };
        `);

        await loadPlugins();

        expect(plugins.has('valid')).toBe(true);
        expect(plugins.has('invalid')).toBe(false);
    });

    it('uses the last sorted plugin when commands collide', async () => {
        await mkdir(config.path.plugins, { recursive: true });
        await writeFile(path.join(config.path.plugins, 'a.js'), `
            const run = async () => {};
            export default { run, command: ['same'], name: 'a' };
        `);
        await writeFile(path.join(config.path.plugins, 'b.js'), `
            const run = async () => {};
            export default { run, command: ['same'], name: 'b' };
        `);

        await loadPlugins();

        expect(plugins.get('same').name).toBe('b');
    });
});
