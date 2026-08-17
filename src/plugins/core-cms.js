import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveMessageContent } from '../message-resolve.js';

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// Media larger than this is not embedded into the generated code; the code
// downloads it from the quoted message at runtime instead.
const MAX_EMBED_BYTES = 8 * 1024 * 1024;
// Hard cap for downloading media from the quoted message.
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

const MEDIA_SEND_TYPES = {
    imageMessage: 'image',
    videoMessage: 'video',
    ptvMessage: 'ptv',
    audioMessage: 'audio',
    documentMessage: 'document',
    stickerMessage: 'sticker'
};

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

const singleQuote = value => {
    const escaped = JSON.stringify(String(value)).slice(1, -1);
    return `'${escaped.replace(/'/g, "\\'")}'`;
};

/**
 * Renders any value as a clean JavaScript expression. Strings use single
 * quotes, objects/arrays are indented with 4 spaces, and `Uint8Array` / bytes
 * become `Buffer.from('<base64>', 'base64')` so the generated code is
 * self-contained and can be re-run anywhere.
 */
export function literal(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return singleQuote(value);
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    if (typeof value === 'bigint') return `${value}n`;
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
        const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
        return `Buffer.from('${Buffer.from(bytes).toString('base64')}', 'base64')`;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value.map(v => indent(literal(v), 4));
        return `[\n${items.join(',\n')}\n]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value).filter(key => value[key] !== undefined);
        if (keys.length === 0) return '{}';
        const parts = keys.map(key => {
            const label = IDENT_RE.test(key) ? key : singleQuote(key);
            return `    ${label}: ${indentExceptFirst(literal(value[key]), 4)}`;
        });
        return `{\n${parts.join(',\n')}\n}`;
    }
    return 'null';
}

/**
 * Renders an object literal, substituting a bare expression for the `media`
 * key (used when the generated code downloads media at runtime).
 */
const renderObject = (value, mediaExpr = null) => {
    const keys = Object.keys(value).filter(key => value[key] !== undefined);
    if (keys.length === 0) return '{}';

    const parts = keys.map(key => {
        if (key === 'media' && mediaExpr) {
            return '    media';
        }
        const label = IDENT_RE.test(key) ? key : singleQuote(key);
        return `    ${label}: ${indentExceptFirst(literal(value[key]), 4)}`;
    });

    return `{\n${parts.join(',\n')}\n}`;
};

/**
 * Builds a zapo-js typed send payload from a resolved proto message content.
 * Text messages use `{ type: 'text' }`, media messages use the typed media
 * kinds (`image`, `video`, `audio`, `document`, `sticker`, `ptv`), and any
 * other content type falls back to the raw proto so it can still be sent.
 */
export function buildSendPayload(content, type, mediaBytes = null) {
    if (type === 'conversation') {
        return { type: 'text', text: content.conversation ?? '' };
    }

    if (type === 'extendedTextMessage') {
        const etm = content.extendedTextMessage ?? {};
        const payload = { type: 'text', text: etm.text ?? '' };
        const mentioned = etm.contextInfo?.mentionedJid;
        if (Array.isArray(mentioned) && mentioned.length > 0) {
            payload.contextInfo = { mentionedJids: mentioned };
        }
        return payload;
    }

    const mediaType = MEDIA_SEND_TYPES[type];
    if (mediaType) {
        const meta = content[type] ?? {};
        const payload = {
            type: mediaType,
            media: mediaBytes,
            mimetype: meta.mimetype
        };
        if (meta.caption != null) payload.caption = meta.caption;
        if (meta.fileName != null) payload.fileName = meta.fileName;
        if (meta.ptt === true) payload.ptt = true;
        if (meta.gifPlayback === true) payload.gifPlayback = true;
        return payload;
    }

    return stripMessageContextInfo(content);
}

/**
 * Drops per-send runtime metadata from a raw proto message before it is
 * reproduced. `messageContextInfo` carries fields tied to the original send
 * (`messageSecret`, `threadId`, `limitSharingV2`, `deviceListMetadata`, ...)
 * that the library regenerates automatically (`messageSecret`,
 * `deviceListMetadata`) or that must not be reused (`limitSharingV2`,
 * `threadId`). Re-sending them can make the reproduced message get rejected
 * or render as an unsupported/blank message.
 */
const stripMessageContextInfo = content => {
    if (
        !content ||
        typeof content !== 'object' ||
        !('messageContextInfo' in content)
    ) {
        return content;
    }

    const rest = { ...content };
    delete rest.messageContextInfo;
    return rest;
};

/**
 * Builds the send options (3rd argument of `message.send`) a message type
 * needs to reproduce correctly. `botForwardedMessage` is a future-proof
 * wrapper whose stanza type would otherwise be resolved as `media`; forcing
 * `type: 'text'` via `additionalAttributes` keeps the send valid.
 */
export function buildSendOptions(content, type) {
    if (type === 'botForwardedMessage') {
        return { additionalAttributes: { type: 'text' } };
    }

    return null;
}

/**
 * Renders a send payload as clean reproduction code. When the payload carries
 * an embeddable `media` value, the media is inlined as base64. For a `media`
 * that is too large to embed, the code downloads it from the quoted message at
 * runtime before sending. `sendOptions` (e.g. `additionalAttributes`) are
 * emitted as the third argument of the send call when present.
 */
export function generateCode(payload, options = {}) {
    const { embed = true, sendOptions = null } = options;

    const optionsSuffix =
        sendOptions && Object.keys(sendOptions).length > 0
            ? `, ${literal(sendOptions)}`
            : '';

    if (payload && typeof payload === 'object' && payload.media) {
        if (embed && payload.media instanceof Uint8Array) {
            return `await sock.message.send(jid, ${literal(payload)}${optionsSuffix});\n`;
        }

        const arg = renderObject(payload, 'media');

        return [
            'const media = await sock.message.downloadBytes(q.message, {',
            `    maxBytes: ${MAX_DOWNLOAD_BYTES}`,
            '});',
            '',
            `await sock.message.send(jid, ${arg}${optionsSuffix});`
        ].join('\n');
    }

    return `await sock.message.send(jid, ${literal(payload)}${optionsSuffix});\n`;
}

export const randomId = () => randomBytes(4).toString('hex');

const run = async ({ sock, jid, m, q }) => {
    if (!q?.key?.id) return m.reply('Reply ke pesan yang mau di-generate codenya.');

    const resolved = await resolveMessageContent(q);
    if (!resolved) return m.reply('Format pesan ini tidak bisa di-generate.');

    const { content, type } = resolved;

    let mediaBytes = null;
    if (MEDIA_SEND_TYPES[type]) {
        try {
            mediaBytes = await sock.message.downloadBytes(content, {
                maxBytes: MAX_DOWNLOAD_BYTES
            });
        } catch (err) {
            console.error('[cms] download media:', err);
            return m.reply(`Gagal download media: ${err?.message ?? err}`);
        }
    }

    const payload = buildSendPayload(content, type, mediaBytes);
    if (!payload) return m.reply('Format pesan ini tidak bisa di-generate.');

    const sendOptions = buildSendOptions(content, type);
    const embed = !mediaBytes || mediaBytes.byteLength <= MAX_EMBED_BYTES;
    const code = generateCode(payload, { embed, sendOptions });
    const filename = `${type}-${randomId()}.js`;
    const dir = mkdtempSync(join(tmpdir(), 'cms-'));
    const filePath = join(dir, filename);

    try {
        writeFileSync(filePath, code);
        await sock.message.send(jid, {
            type: 'document',
            media: filePath,
            mimetype: 'text/javascript',
            fileName: filename
        }, { quote: q });

        // Reproduce the message in the chat using the same payload + options,
        // so the generated code is verified to work against the live client.
        await sock.message.send(jid, payload, sendOptions ?? {});
    } catch (err) {
        console.error('[cms]', err);
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
