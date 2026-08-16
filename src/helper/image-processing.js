export function getImageDimensions(buffer) {
    if (!buffer || buffer.length < 24) return undefined;

    // PNG: width @ 16, height @ 20 (big-endian)
    if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
        return {
            width: buffer.readUInt32BE(16),
            height: buffer.readUInt32BE(20)
        };
    }

    // GIF: width @ 6, height @ 8 (little-endian)
    if (buffer.length > 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
        return {
            width: buffer.readUInt16LE(6),
            height: buffer.readUInt16LE(8)
        };
    }

    // WebP: RIFF....WEBP
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

    // JPEG: scan SOF markers (FFC0-FFC3, FFC5-FFC7, FFC9-FFCB, FFCD-FFCF)
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
