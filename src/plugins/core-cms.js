import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveMessageContent } from '../message-resolve.js';

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const indent = (str, spaces) => {
    const pad = ' '.repeat(spaces);
    return str
        .split('\n')
        .map(line => pad + line)
        .join('\n');
};

const indentExceptFirst = (str, spaces) => {
    const pad = ' '.repeat(spaces);
    return str
        .split('\n')
        .map((line, i) => (i === 0 ? line : pad + line))
        .join('\n');
};

export function literal(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    if (typeof value === 'bigint') return `${value}n`;
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
        const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
        return JSON.stringify(Buffer.from(bytes).toString('base64'));
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value.map(v => indent(literal(v), 2));
        return `[\n${items.join(',\n')}\n]`;
    }
    if (typeof value === 'object') {
        const parts = [];
        for (const key of Object.keys(value)) {
            const v = value[key];
            if (v === undefined) continue;
            const label = IDENT_RE.test(key) ? key : JSON.stringify(key);
            parts.push(`${'  '}${label}: ${indentExceptFirst(literal(v), 2)}`);
        }
        if (parts.length === 0) return '{}';
        return `{\n${parts.join(',\n')}\n}`;
    }
    return 'null';
}

export function buildCode(content, options = null) {
    const opt = options ? `, ${literal(options)}` : '';
    return `await sock.message.send(jid, ${literal(content)}${opt});\n`;
}

export const randomId = () => randomBytes(4).toString('hex');

const BOT_FORWARD_ATTRS = { additionalAttributes: { type: 'text' } };

const run = async ({ sock, jid, m, q }) => {
    if (!q?.key?.id) return m.reply('Reply ke pesan yang mau di-generate codenya.');

    const resolved = await resolveMessageContent(q);
    if (!resolved) return m.reply('Format pesan ini tidak bisa di-generate.');

    const { content, type } = resolved;
    const filename = `${type}-${randomId()}.js`;
    const dir = mkdtempSync(join(tmpdir(), 'crm-'));
    const filePath = join(dir, filename);

    try {
        const options = type === 'botForwardedMessage' ? BOT_FORWARD_ATTRS : null;
        writeFileSync(filePath, buildCode(content, options));
        await sock.message.send(jid, {
            type: 'document',
            media: filePath,
            mimetype: 'text/javascript',
            fileName: filename
        }, { quote: q });
        await sock.message.send(jid, content, options ?? {});
    } catch (err) {
        console.error('[crm]', err);
        return m.reply(`Gagal generate: ${err?.message ?? err}`);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
};

const plugin = {
    run,
    name: 'cms',
    command: ['cms'],
    description: 'Menghasilkan kode reproduksi untuk pesan yang di-quote.',
    ownerOnly: true,
    category: ['core']
};

export default plugin;
