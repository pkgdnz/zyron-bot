import { isLidJid, WaMediaTransferClient } from 'zapo-js';

export function toTimestamp(value) {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    if (typeof value.toNumber === 'function') return value.toNumber();
    return Number(value);
}

export function getFirstStringAndRest(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return { firstString: '', restString: '' };

    const index = trimmed.indexOf(' ');
    if (index === -1) {
        return { firstString: trimmed, restString: '' };
    }

    return {
        firstString: trimmed.slice(0, index),
        restString: trimmed.slice(index)
    };
}

export function getOneRandomElemenFrom(array) {
    if (!Array.isArray(array) || array.length === 0) return undefined;
    return array[Math.floor(Math.random() * array.length)];
}

export async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

export function resolveJidPair(primary, alt) {
    let lid = null;
    let pn = null;

    if (primary && isLidJid(primary)) {
        lid = primary;
        pn = alt && !isLidJid(alt) ? alt : null;
    } else if (primary) {
        pn = primary;
        lid = alt && isLidJid(alt) ? alt : null;
    } else if (alt) {
        if (isLidJid(alt)) {
            lid = alt;
        } else {
            pn = alt;
        }
    }

    return { lid, pn };
}

export const JPEG_THUMB =
    'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAQAAAAnOwc2AAAADElEQVR4nGNgGG4AAADSAAFQmYCvAAAAAElFTkSuQmCC';

const extractMediaFields = uploaded => ({
    thumbnailDirectPath: uploaded.directPath,
    thumbnailSha256: uploaded.fileSha256,
    thumbnailEncSha256: uploaded.fileEncSha256,
    mediaKey: uploaded.mediaKey,
    mediaKeyTimestamp: uploaded.mediaKeyTimestamp
});

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

export function getImageDimensions(buffer) {
    if (!buffer || buffer.length < 24) return undefined;

    if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
        return {
            width: buffer.readUInt32BE(16),
            height: buffer.readUInt32BE(20)
        };
    }

    if (buffer.length > 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
        return {
            width: buffer.readUInt16LE(6),
            height: buffer.readUInt16LE(8)
        };
    }

    if (
        buffer.length > 30 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
        const chunk = buffer.toString('ascii', 12, 16);
        if (chunk === 'VP8X') {
            return {
                width: 1 + buffer.readUIntLE(24, 3),
                height: 1 + buffer.readUIntLE(27, 3)
            };
        }
        if (chunk === 'VP8 ' || chunk === 'VP8L') {
            return { width: 0, height: 0 };
        }
    }

    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        let offset = 2;
        while (offset + 9 < buffer.length) {
            if (buffer[offset] !== 0xff) {
                offset++;
                continue;
            }
            const marker = buffer[offset + 1];
            if (
                marker === 0xd8 ||
                marker === 0xd9 ||
                (marker >= 0xd0 && marker <= 0xd7)
            ) {
                offset += 2;
                continue;
            }
            const length = buffer.readUInt16BE(offset + 2);
            if (
                marker >= 0xc0 &&
                marker <= 0xcf &&
                marker !== 0xc4 &&
                marker !== 0xc8 &&
                marker !== 0xcc
            ) {
                return {
                    height: buffer.readUInt16BE(offset + 5),
                    width: buffer.readUInt16BE(offset + 7)
                };
            }
            offset += 2 + length;
        }
    }

    return undefined;
}
