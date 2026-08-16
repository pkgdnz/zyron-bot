import { WaMediaTransferClient } from 'zapo-js';

import { getImageDimensions } from './image-processing.js';

const JPEG_THUMB =
    'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAQAAAAnOwc2AAAADElEQVR4nGNgGG4AAADSAAFQmYCvAAAAAElFTkSuQmCC';

/**
 * @typedef {object} ThumbnailContent
 * @property {string} [url]
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [text]
 */

const extractMediaFields = uploaded => ({
    thumbnailDirectPath: uploaded.directPath,
    thumbnailSha256: uploaded.fileSha256,
    thumbnailEncSha256: uploaded.fileEncSha256,
    mediaKey: uploaded.mediaKey,
    mediaKeyTimestamp: uploaded.mediaKeyTimestamp
});

/**
 * Mengupload gambar sebagai thumbnail-link dan mengembalikan
 * `extendedTextMessage` siap pakai untuk theme.
 *
 * @param {import('zapo-js').WaClient} client
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {ThumbnailContent} [thumbnailContent]
 * @returns {Promise<object>}
 */
export const createThumbnailLink = async (
    client,
    buffer,
    mimetype,
    thumbnailContent = {}
) => {
    const {
        text = 'text',
        description = 'description',
        title = 'title',
        url = 'https://example.com/'
    } = thumbnailContent;

    const uploaded = await client.message.upload(buffer, {
        type: 'thumbnail-link',
        mimetype
    });

    const dims = getImageDimensions(buffer);

    return {
        extendedTextMessage: {
            title,
            description,
            text: `${url}\n${text}`,
            matchedText: url,

            previewType: 0,
            inviteLinkGroupTypeV2: 0,

            ...extractMediaFields(uploaded),

            mimetype,

            thumbnailWidth: dims?.width,
            thumbnailHeight: dims?.height,

            jpegThumbnail: Buffer.from(JPEG_THUMB, 'base64')
        }
    };
};

/**
 * Mengambil field media dari sebuah `extendedTextMessage` yang dibuat oleh
 * {@link createThumbnailLink}. Mengembalikan `undefined` bila media tidak
 * lengkap.
 *
 * @param {object|undefined} wamc
 * @returns {{directPath: string, mediaKey: Uint8Array, fileSha256?: Uint8Array, fileEncSha256?: Uint8Array, mimetype?: string}|undefined}
 */
export const extractThumbnailFields = wamc => {
    const etm = wamc?.extendedTextMessage;
    if (!etm?.thumbnailDirectPath || !etm?.mediaKey) return undefined;

    return {
        directPath: etm.thumbnailDirectPath,
        mediaKey: etm.mediaKey,
        fileSha256: etm.thumbnailSha256,
        fileEncSha256: etm.thumbnailEncSha256,
        mimetype: etm.mimetype
    };
};

/**
 * Download sebuah thumbnail-link yang di-upload oleh
 * {@link createThumbnailLink} dan mengembalikannya sebagai stream.
 *
 * @param {{directPath: string, mediaKey: Uint8Array, fileSha256?: Uint8Array, fileEncSha256?: Uint8Array}} fields
 * @param {{timeoutMs?: number, signal?: AbortSignal, maxBytes?: number}} [options]
 * @returns {Promise<import('node:stream').Readable>}
 */
export const downloadThumbnailLink = async (fields, options = {}) => {
    if (!fields?.mediaKey || !fields?.directPath) {
        throw new Error('thumbnail-link media tidak lengkap');
    }

    const transfer = new WaMediaTransferClient();
    const { plaintext } = await transfer.downloadAndDecryptStream({
        directPath: fields.directPath,
        mediaType: 'thumbnail-link',
        mediaKey: new Uint8Array(fields.mediaKey),
        fileSha256: fields.fileSha256,
        fileEncSha256: fields.fileEncSha256,
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        maxBytes: options.maxBytes
    });

    return plaintext;
};
