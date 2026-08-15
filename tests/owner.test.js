import { beforeEach, describe, expect, it, vi } from 'vitest';

let config;

beforeEach(() => {
    vi.resetModules();
    config = { owner: '628123456789' };
    vi.doMock('../config.js', () => ({ default: config }));
});

describe('owner detection', () => {
    it('matches owner JID exactly', async () => {
        const { isOwnerJid } = await import('../src/owner.js');

        expect(isOwnerJid('628123456789@s.whatsapp.net')).toBe(true);
        expect(isOwnerJid('628999999999@s.whatsapp.net')).toBe(false);
    });

    it('recognizes owner through supported message identities', async () => {
        const { isOwner } = await import('../src/owner.js');

        expect(isOwner({ sender: '628123456789@s.whatsapp.net' })).toBe(true);
        expect(isOwner({ key: { participantAlt: '628123456789@s.whatsapp.net' } })).toBe(true);
        expect(isOwner({ contact: { lid: '628123456789@s.whatsapp.net' } })).toBe(true);
        expect(isOwner({ sender: '628999999999@s.whatsapp.net' })).toBe(false);
        expect(isOwner(null)).toBe(false);
    });
});
