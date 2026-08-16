import { getContentType, unwrapMessage } from 'zapo-js';

import { getFirstStringAndRest, streamToBuffer } from '../helper/common.js';
import {
    createThumbnailLink,
    downloadThumbnailLink,
    extractThumbnailFields
} from '../helper/thumbnail-link.js';
import { themeManager } from '../theme-manager.js';

const Emoji = Object.freeze({
    SUCCESS: '✅'
});

const String = Object.freeze({
    INVALID_SUBCOMMAND: 'invalid subcommand',
    TEXT_REQUIRE: 'masukkan teks',
    NO_SUBCOMMAND_1: `opsi tersedia:
- title
- description
- url
- thumbnail
- export
- use
- preview (wip)`,
    SGC: `opsi tersedia
- set <text>
- get
- clear`,
    URL: `opsi tersedia
- set <urls>
- get`,
    THUMB: `opsi tersedia
- set <url>
- set (reply ke image / thumbnail)
- get`
});

const checkUrl = url => {
    try {
        return new URL(url)?.toString();
    } catch {
        return undefined;
    }
};

const sanitizeFileName = s =>
    s?.replaceAll(/[-./\\]+/g, '')?.match(/\S+/g)?.join('-');

const react = async ({ sock, jid, m }, emoji) => {
    try {
        await sock.message.send(jid, {
            type: 'reaction',
            emoji,
            target: m.key
        });
    } catch (e) {
        console.error('[theme] gagal react:', e?.message ?? e);
    }
};

const getImageFromMessage = async (sock, msg) => {
    try {
        const normalize = unwrapMessage(msg?.message ?? {});
        const ct = getContentType(normalize);
        const media = normalize?.[ct];

        if (
            (ct === 'imageMessage' || ct === 'documentMessage') &&
            media?.mimetype?.startsWith('image/')
        ) {
            const stream = await sock.message.download(msg.message);
            const buffer = await streamToBuffer(stream);
            if (buffer?.length) return { buffer, mimetype: media.mimetype };
        }

        if (ct === 'extendedTextMessage' && media?.mediaKey) {
            const fields = extractThumbnailFields({
                extendedTextMessage: media
            });
            if (fields) {
                const stream = await downloadThumbnailLink(fields);
                const buffer = await streamToBuffer(stream);
                if (buffer?.length) {
                    return {
                        buffer,
                        mimetype: fields.mimetype ?? 'image/jpeg'
                    };
                }
            }
        }
    } catch (e) {
        console.error('gagal download image', e?.message ?? e);
    }
    return undefined;
};

const resolveImageInput = async (ctx, param2) => {
    const { m, q, sock } = ctx;

    const validUrl = checkUrl(param2);
    let validQuoted = false;

    if (q) {
        const normalize = unwrapMessage(q?.message ?? {});
        const ct = getContentType(normalize);
        const mime = normalize?.[ct]?.mimetype;

        if (
            (ct === 'imageMessage' || ct === 'documentMessage') &&
            mime?.startsWith('image/')
        ) {
            validQuoted = true;
        } else if (ct === 'extendedTextMessage') {
            validQuoted = Boolean(normalize?.extendedTextMessage?.mediaKey);
        }
    }

    if (validUrl && validQuoted) {
        return { error: 'gak boleh reply dan url' };
    }

    if (validQuoted) {
        const got = await getImageFromMessage(sock, q);
        if (got?.buffer) return got;
    } else {
        const normalize = unwrapMessage(m?.message ?? {});
        const ct = getContentType(normalize);
        const media = normalize?.[ct];

        if (
            (ct === 'imageMessage' || ct === 'documentMessage') &&
            media?.mimetype?.startsWith('image/')
        ) {
            const got = await getImageFromMessage(sock, m);
            if (got?.buffer) return got;
        } else {
            if (!param2) {
                return {
                    error: 'isikan url atau reply ke sebuah gambar / thumbnail'
                };
            }
            if (param2 && !validUrl) return { error: 'invalid url' };

            const response = await fetch(validUrl);
            if (!response.ok) {
                return { error: `respond dari server ${response.status}` };
            }
            const ct = response.headers.get('content-type');
            if (!ct?.startsWith('image/')) {
                return {
                    error:
                        `aku kurang yakin dengan content type ${ct}. ` +
                        'mungkin kamu bisa download gambarnya dulu baru set as thumbnail'
                };
            }

            return {
                buffer: Buffer.from(await response.arrayBuffer()),
                mimetype: ct
            };
        }
    }

    return {
        error: 'gagal ambil gambar. coba pakai url atau upload gambar langsung'
    };
};

const handleTitle = async (ctx, subCommand2, param2) => {
    const { m } = ctx;

    if (subCommand2 === 'set') {
        if (!param2) return await m.reply(String.TEXT_REQUIRE);
        const r = await themeManager.setTitle(param2);
        if (r.error) return await m.reply(r.error);
        return await react(ctx, Emoji.SUCCESS);
    }

    if (subCommand2 === 'get') {
        const title = themeManager.getData()?.title ?? '(title kosong)';
        return await m.reply(title);
    }

    if (subCommand2 === 'clear') {
        const r = await themeManager.setTitle(undefined);
        if (r.error) return await m.reply(r.error);
        return await react(ctx, Emoji.SUCCESS);
    }

    return await m.reply(String.SGC);
};

const handleDescription = async (ctx, subCommand2, param2) => {
    const { m } = ctx;

    if (subCommand2 === 'set') {
        if (!param2) return await m.reply(String.TEXT_REQUIRE);
        const r = await themeManager.setDescription(param2);
        if (r.error) return await m.reply(r.error);
        return await react(ctx, Emoji.SUCCESS);
    }

    if (subCommand2 === 'get') {
        const description =
            themeManager.getData()?.description ?? '(description kosong)';
        return await m.reply(description);
    }

    if (subCommand2 === 'clear') {
        const r = await themeManager.setDescription(undefined);
        if (r.error) return await m.reply(r.error);
        return await react(ctx, Emoji.SUCCESS);
    }

    return await m.reply(String.SGC);
};

const handleUrl = async (ctx, subCommand2, param2) => {
    const { m } = ctx;

    if (subCommand2 === 'set') {
        const r = await themeManager.setUrl(param2);
        if (r.error) return await m.reply(r.error);
        return await react(ctx, Emoji.SUCCESS);
    }

    if (subCommand2 === 'get') {
        const url = themeManager.getData()?.url ?? '(url kosong)';
        return await m.reply(url);
    }

    return await m.reply(String.URL);
};

const handleThumbnail = async (ctx, subCommand2, param2) => {
    const { m, jid, sock } = ctx;

    if (subCommand2 === 'set') {
        const input = await resolveImageInput(ctx, param2);
        if (input.error) return await m.reply(input.error);

        const wamc = await createThumbnailLink(
            sock,
            input.buffer,
            input.mimetype ?? 'image/jpeg'
        );
        const r = await themeManager.setMessage(wamc);
        if (r.error) return await m.reply(r.error);
        return await react(ctx, Emoji.SUCCESS);
    }

    if (subCommand2 === 'get') {
        const WAMessageContent = themeManager.getData()?.message;
        const fields = extractThumbnailFields(WAMessageContent);
        if (!fields) return await m.reply('gak bisa download tamnel :v');

        const stream = await downloadThumbnailLink(fields);
        return await sock.message.send(jid, {
            type: 'image',
            media: stream,
            mimetype: fields.mimetype ?? 'image/jpeg'
        }, { quote: m });
    }

    if (subCommand2 === 'height') {
        const r = await themeManager.overrideHeightByRatio(param2);
        if (r.error) return await m.reply(r.error);
        return await react(ctx, Emoji.SUCCESS);
    }

    if (subCommand2 === 'stock') {
        const r = await themeManager.setMessage(undefined);
        if (r.error) return await m.reply(r.error);
        return await m.reply(r.data);
    }

    return await m.reply(`command invalid opsi tersedia
- set <url>
- set <reply ke image, thumbnail, doc image>
- set <upload image, thumbnail, doc image>
- get
- height <0.2 - 1>
- stock`);
};

const handleFavicon = async (ctx, subCommand2, param2) => {
    const { m, jid, sock } = ctx;

    if (subCommand2 === 'set') {
        const input = await resolveImageInput(ctx, param2);
        if (input.error) return await m.reply(input.error);

        const wamc = await createThumbnailLink(
            sock,
            input.buffer,
            input.mimetype ?? 'image/jpeg'
        );
        const r = await themeManager.setFavicon(wamc);
        if (r.error) return await m.reply(r.error);
        return await react(ctx, Emoji.SUCCESS);
    }

    if (subCommand2 === 'get') {
        const favicon =
            themeManager.getData()?.message?.extendedTextMessage
                ?.faviconMMSMetadata;
        if (!favicon?.mediaKey) return await m.reply('gak ada favicon. set dulu');

        const stream = await downloadThumbnailLink({
            directPath: favicon.thumbnailDirectPath,
            mediaKey: favicon.mediaKey,
            fileSha256: favicon.thumbnailSha256,
            fileEncSha256: favicon.thumbnailEncSha256
        });

        return await sock.message.send(jid, {
            type: 'image',
            media: stream,
            mimetype: 'image/jpeg'
        }, { quote: m });
    }

    if (subCommand2 === 'clear') {
        const result = await themeManager.setFavicon(undefined);
        if (result?.error) return await m.reply(result.error);
        return await react(ctx, Emoji.SUCCESS);
    }

    return await m.reply(`opsi tersedia
- set <url>
- set <reply ke image, thumbnail, doc image>
- set <upload image, thumbnail, doc image>
- get
- clear`);
};

const handleExport = async (ctx, split1) => {
    const { jid, sock } = ctx;

    const data = JSON.stringify(themeManager.exportData(), null, 2);
    const prefixFileName = sanitizeFileName(split1?.restString) ?? 'theme';
    const fileName = `${prefixFileName}-${Date.now()}.json`;

    return await sock.message.send(jid, {
        type: 'document',
        media: Buffer.from(data),
        fileName,
        mimetype: 'application/json',
        caption: 'nih :v'
    });
};

const handleUse = async ctx => {
    const { m, q, sock } = ctx;

    if (!q) {
        return await m.reply('reply ke message, pastiin dokumen message json');
    }

    const qNormalized = unwrapMessage(q?.message);
    const qContent = getContentType(qNormalized);
    if (qContent !== 'documentMessage') {
        return await m.reply('musti dokumen message');
    }
    if (qNormalized?.documentMessage?.mimetype !== 'application/json') {
        return await m.reply('gak mau mime nya kurang meyakinkan');
    }

    try {
        const stream = await sock.message.download(q.message);
        const text = (await streamToBuffer(stream)).toString('utf8');
        const json = JSON.parse(text);

        const r = await themeManager.useExternalJson(json);
        if (r?.error) return await m.reply(r.error);

        return await m.reply('sip theme berhasil di ganti. coba test');
    } catch (e) {
        return await m.reply(`gagal use theme ${e?.message ?? e}`);
    }
};

const run = async ctx => {
    const { m, text } = ctx;

    const split1 = getFirstStringAndRest(text);
    const split2 = getFirstStringAndRest(split1.restString);

    const subCommand1 = split1.firstString;
    const subCommand2 = split2.firstString;
    const param2 = split2?.restString?.substring(1);

    if (!subCommand1) {
        return await m.reply(String.NO_SUBCOMMAND_1);
    }

    if (subCommand1 === 'title') {
        return await handleTitle(ctx, subCommand2, param2);
    }

    if (subCommand1 === 'desc' || subCommand1 === 'description') {
        return await handleDescription(ctx, subCommand2, param2);
    }

    if (subCommand1 === 'url') {
        return await handleUrl(ctx, subCommand2, param2);
    }

    if (subCommand1 === 'thumb' || subCommand1 === 'thumbnail') {
        return await handleThumbnail(ctx, subCommand2, param2);
    }

    if (subCommand1 === 'fav' || subCommand1 === 'favicon') {
        return await handleFavicon(ctx, subCommand2, param2);
    }

    if (subCommand1 === 'export') {
        return await handleExport(ctx, split1);
    }

    if (subCommand1 === 'use') {
        return await handleUse(ctx);
    }

    if (subCommand1 === 'preview') {
        return await m.reply('masih di buat');
    }

    return await m.reply(String.INVALID_SUBCOMMAND);
};

const plugin = {
    run,
    name: 'theme manager',
    command: ['theme'],
    description:
        'buat ubah title, description, thumbnail, url. dll. malas jelasin ' +
        'coba aja langsung panggil command nya :v',
    category: ['core']
};

export default plugin;
