import { beforeEach, describe, expect, it, vi } from 'vitest';

let state;
let groupState;
let settings;
let groups;

beforeEach(() => {
    vi.resetModules();

    state = { global: 0 };
    groupState = new Map();
    settings = {
        get: {
            get: vi.fn(() => ({ globalSelf: state.global }))
        },
        upsert: {
            get: vi.fn(({ globalSelf }) => {
                state.global = globalSelf;
                return { globalSelf };
            })
        }
    };
    groups = {
        selectAll: {
            iterate: vi.fn(() => groupState.values())
        },
        get: {
            get: vi.fn(({ groupId }) => groupState.get(groupId))
        },
        upsert: {
            get: vi.fn(({ groupId, selfOverride }) => {
                const row = { groupId, selfOverride };
                groupState.set(groupId, row);
                return row;
            })
        },
        delete: {
            run: vi.fn(({ groupId }) => groupState.delete(groupId))
        }
    };

    vi.doMock('../src/database/table.js', () => ({
        default: {
            selfSettings: settings,
            selfGroups: groups
        }
    }));
});

describe('self mode', () => {
    it('loads global mode and toggles it', async () => {
        const { selfStore, isSelfMode } = await import('../src/self-store.js');

        expect(selfStore.globalSelf).toBe(false);
        expect(isSelfMode('123@s.whatsapp.net')).toBe(false);

        selfStore.setGlobalSelf(true);

        expect(selfStore.globalSelf).toBe(true);
        expect(isSelfMode('123@s.whatsapp.net')).toBe(true);
    });

    it('allows a group override to supersede global mode', async () => {
        const { selfStore, isSelfMode } = await import('../src/self-store.js');
        const group = '123@g.us';

        selfStore.setGlobalSelf(true);
        selfStore.setGroupOverride(group, false);

        expect(isSelfMode(group)).toBe(false);
        expect(isSelfMode('456@g.us')).toBe(true);

        selfStore.setGroupOverride(group, null);
        expect(isSelfMode(group)).toBe(true);
    });

    it('ignores invalid group override targets', async () => {
        const { selfStore } = await import('../src/self-store.js');

        expect(() => selfStore.setGroupOverride('123@s.whatsapp.net', true)).not.toThrow();
        expect(groups.upsert.get).not.toHaveBeenCalled();
    });
});
