import { isOwner } from '../owner.js';
import { selfStore } from '../store.js';

const usage =
    'self on | self off\n' +
    'self -gc on | self -gc off';

const run = async ({ m, text }) => {
    if (!isOwner(m)) return;

    const [flag, value] = (text ?? '').trim().split(/\s+/);

    if (flag === '-gc') {
        if (value === 'on') {
            selfStore.setGroupOverride(m.key?.remoteJid, 1);
            return m.reply('Self mode aktif untuk grup ini.');
        }
        if (value === 'off') {
            selfStore.setGroupOverride(m.key?.remoteJid, 0);
            return m.reply('Self mode nonaktif untuk grup ini.');
        }
        return m.reply('Format: self -gc on | self -gc off');
    }

    if (flag === 'on') {
        selfStore.setGlobalSelf(true);
        return m.reply('Self mode global aktif.');
    }
    if (flag === 'off') {
        selfStore.setGlobalSelf(false);
        return m.reply('Self mode global nonaktif.');
    }
    return m.reply(usage);
};

const plugin = {
    run,
    name: 'self',
    command: ['self'],
    description: 'Mengalihkan self mode (global atau per grup).',
    ownerOnly: true,
    category: ['core']
};

export default plugin;
