import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { getFirstStringAndRest, streamToBuffer } from '../src/helper/common.js';
import { getImageDimensions } from '../src/helper/image-processing.js';

describe('getFirstStringAndRest', () => {
    it('splits a command line into first token and the rest', () => {
        expect(getFirstStringAndRest('title set halo dunia')).toEqual({
            firstString: 'title',
            restString: ' set halo dunia'
        });
        expect(getFirstStringAndRest(' set halo dunia')).toEqual({
            firstString: 'set',
            restString: ' halo dunia'
        });
    });

    it('handles empty and single-token input', () => {
        expect(getFirstStringAndRest('')).toEqual({
            firstString: '',
            restString: ''
        });
        expect(getFirstStringAndRest('title')).toEqual({
            firstString: 'title',
            restString: ''
        });
        expect(getFirstStringAndRest(undefined)).toEqual({
            firstString: '',
            restString: ''
        });
    });
});

describe('streamToBuffer', () => {
    it('collects stream chunks into a buffer', async () => {
        const readable = Readable.from(['halo ', 'dunia']);

        expect((await streamToBuffer(readable)).toString('utf8'))
            .toBe('halo dunia');
    });
});

describe('getImageDimensions', () => {
    it('reads PNG dimensions', () => {
        const png = Buffer.alloc(25);
        png.writeUInt32BE(0x89504e47, 0);
        png.writeUInt32BE(400, 16);
        png.writeUInt32BE(300, 20);

        expect(getImageDimensions(png)).toEqual({ width: 400, height: 300 });
    });

    it('reads GIF dimensions', () => {
        const gif = Buffer.alloc(25);
        gif.write('GIF89a', 0);
        gif.writeUInt16LE(640, 6);
        gif.writeUInt16LE(480, 8);

        expect(getImageDimensions(gif)).toEqual({ width: 640, height: 480 });
    });

    it('reads VP8X WebP dimensions', () => {
        const webp = Buffer.alloc(31);
        webp.write('RIFF', 0);
        webp.write('WEBP', 8);
        webp.write('VP8X', 12);
        webp.writeUIntLE(399, 24, 3);
        webp.writeUIntLE(299, 27, 3);

        expect(getImageDimensions(webp)).toEqual({ width: 400, height: 300 });
    });

    it('reads JPEG dimensions from a SOF marker', () => {
        const jpeg = Buffer.alloc(32);
        jpeg[0] = 0xff;
        jpeg[1] = 0xd8;
        jpeg[2] = 0xff;
        jpeg[3] = 0xe0;
        jpeg.writeUInt16BE(16, 4);
        jpeg[20] = 0xff;
        jpeg[21] = 0xc0;
        jpeg.writeUInt16BE(17, 22);
        jpeg[24] = 8;
        jpeg.writeUInt16BE(480, 25);
        jpeg.writeUInt16BE(640, 27);
        jpeg[29] = 3;

        expect(getImageDimensions(jpeg)).toEqual({ width: 640, height: 480 });
    });

    it('returns undefined for unknown or short input', () => {
        expect(getImageDimensions(Buffer.alloc(4))).toBeUndefined();
        expect(getImageDimensions(null)).toBeUndefined();
    });
});
