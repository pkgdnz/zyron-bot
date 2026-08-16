import { stmt } from './db.js';
import { JPEG_THUMB } from './helpers.js';
import { deserializeMessage, serializeMessage } from './serialize.js';

const hasMediaKey = etm =>
    etm?.mediaKey instanceof Uint8Array && etm.mediaKey.byteLength > 0;

const validateUrl = url => {
    try {
        const parsed = new URL(String(url ?? '').trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return undefined;
        }
        return parsed.toString();
    } catch {
        return undefined;
    }
};

class ThemeManager {
    #title = null;
    #description = null;
    #url = null;
    #message = null;

    constructor() {
        const row = stmt.theme.get.get();

        this.#title = row?.title ?? null;
        this.#description = row?.description ?? null;
        this.#url = row?.url ?? null;
        this.#message = row?.message
            ? deserializeMessage(row.message)
            : null;

        console.log(
            `[theme-manager] loaded title=${this.#title ? 'on' : 'off'} ` +
            `description=${this.#description ? 'on' : 'off'} ` +
            `url=${this.#url ? 'on' : 'off'} ` +
            `thumbnail=${hasMediaKey(this.#message?.extendedTextMessage) ? 'on' : 'off'} ` +
            `favicon=${this.#message?.extendedTextMessage?.faviconMMSMetadata?.mediaKey ? 'on' : 'off'}`
        );
    }

    #persist() {
        stmt.theme.upsert.run({
            title: this.#title,
            description: this.#description,
            url: this.#url,
            message: this.#message
                ? serializeMessage(this.#message)
                : null
        });
    }

    getData() {
        return {
            title: this.#title,
            description: this.#description,
            url: this.#url,
            message: this.#message
        };
    }

    buildLinkPreview(bodyText, fallback = {}) {
        const { title, description, url, message } = this.getData();
        const etm = message?.extendedTextMessage ?? {};

        return {
            extendedTextMessage: {
                ...etm,
                title: title ?? fallback.title,
                description: description ?? fallback.description,
                text: bodyText,
                matchedText: url ?? fallback.url,
                previewType: 0,
                inviteLinkGroupTypeV2: 0,
                jpegThumbnail: etm?.jpegThumbnail ?? Buffer.from(JPEG_THUMB, 'base64'),
                contextInfo: {
                    mentionedJid: [],
                    groupMentions: [],
                    statusAttributions: []
                }
            }
        };
    }

    exportData() {
        return {
            title: this.#title,
            description: this.#description,
            url: this.#url,
            message: this.#message
                ? JSON.parse(serializeMessage(this.#message).toString('utf8'))
                : null
        };
    }

    setTitle(value) {
        if (value == null) {
            this.#title = null;
            this.#persist();
            return {};
        }

        if (typeof value !== 'string' || !value.trim()) {
            return { error: 'title harus berupa teks' };
        }

        this.#title = value.trim();
        this.#persist();
        return {};
    }

    setDescription(value) {
        if (value == null) {
            this.#description = null;
            this.#persist();
            return {};
        }

        if (typeof value !== 'string' || !value.trim()) {
            return { error: 'description harus berupa teks' };
        }

        this.#description = value.trim();
        this.#persist();
        return {};
    }

    setUrl(value) {
        const url = validateUrl(value);
        if (!url) {
            return { error: 'url harus berupa link http/https yang valid' };
        }

        this.#url = url;
        this.#persist();
        return {};
    }

    setMessage(value) {
        if (value == null) {
            this.#message = null;
            this.#persist();
            return { data: 'thumbnail kembali ke stock' };
        }

        if (!hasMediaKey(value?.extendedTextMessage)) {
            return { error: 'thumbnail tidak valid' };
        }

        this.#message = value;
        this.#persist();
        return {};
    }

    overrideHeightByRatio(value) {
        const ratio = Number(value);
        const message = this.#message;
        const etm = message?.extendedTextMessage;
        const width = etm?.thumbnailWidth;

        if (!Number.isFinite(ratio) || ratio < 0.2 || ratio > 1) {
            return { error: 'ratio harus angka antara 0.2 dan 1' };
        }

        if (!etm || typeof width !== 'number') {
            return { error: 'set thumbnail dulu sebelum atur height' };
        }

        this.#message = {
            ...message,
            extendedTextMessage: {
                ...etm,
                thumbnailHeight: Math.round(width * ratio)
            }
        };
        this.#persist();
        return {};
    }

    setFavicon(value) {
        if (value == null) {
            const etm = this.#message?.extendedTextMessage;
            if (etm?.faviconMMSMetadata) {
                const next = { ...etm };
                delete next.faviconMMSMetadata;
                this.#message = { extendedTextMessage: next };
            }
            this.#persist();
            return {};
        }

        const source = value?.extendedTextMessage;
        if (!source?.thumbnailDirectPath || !hasMediaKey(source)) {
            return { error: 'favicon tidak valid' };
        }

        const faviconMMSMetadata = {
            thumbnailDirectPath: source.thumbnailDirectPath,
            thumbnailSha256: source.thumbnailSha256,
            thumbnailEncSha256: source.thumbnailEncSha256,
            mediaKey: source.mediaKey,
            mediaKeyTimestamp: source.mediaKeyTimestamp,
            mimetype: source.mimetype ?? 'image/jpeg'
        };

        const etm = this.#message?.extendedTextMessage ?? {};
        this.#message = {
            extendedTextMessage: {
                ...etm,
                faviconMMSMetadata
            }
        };
        this.#persist();
        return {};
    }

    useExternalJson(json) {
        if (!json || typeof json !== 'object') {
            return { error: 'format theme tidak valid' };
        }

        const { title, description, url, message } = json;

        if (title != null && (typeof title !== 'string' || !title.trim())) {
            return { error: 'title di file tidak valid' };
        }

        if (
            description != null &&
            (typeof description !== 'string' || !description.trim())
        ) {
            return { error: 'description di file tidak valid' };
        }

        if (url != null && !validateUrl(url)) {
            return { error: 'url di file tidak valid' };
        }

        let parsedMessage = null;
        if (message != null) {
            parsedMessage = deserializeMessage(JSON.stringify(message));
            const etm = parsedMessage?.extendedTextMessage;
            if (!hasMediaKey(etm)) {
                return { error: 'message di file tidak valid' };
            }
        }

        this.#title = title ?? null;
        this.#description = description ?? null;
        this.#url = url != null ? validateUrl(url) : null;
        this.#message = parsedMessage;
        this.#persist();
        return {};
    }
}

export const themeManager = new ThemeManager();
