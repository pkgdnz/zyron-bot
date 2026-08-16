import { config } from 'dotenv';
import path from 'node:path';

import { createStore } from 'zapo-js';
import { createSqliteStore } from '@zapo-js/store-sqlite';

config();

const requiredEnv = Object.freeze([
    'OWNER',
    'BOT_NUMBER',
    'PAIRING_CODE',
    'SESSION_ID'
]);

const missing = requiredEnv.filter(key => !process.env[key]?.trim());

if (missing.length > 0) {
    throw new Error(
        `Missing required environment variables: ${missing.join(', ')}`
    );
}

const normalizeNumber = value => value.replace(/\D/g, '');

const owner = normalizeNumber(process.env.OWNER);
const botNumber = normalizeNumber(process.env.BOT_NUMBER);

if (!owner) {
    throw new Error('OWNER must contain a valid WhatsApp number.');
}

if (!botNumber) {
    throw new Error('BOT_NUMBER must contain a valid WhatsApp number.');
}

const res = (...paths) => path.resolve(import.meta.dirname, ...paths);

const pathConfig = Object.freeze({
    authState: res('data', 'auth.db'),
    database: res('data', 'database.db'),
    plugins: res('src', 'plugins')
});

const store = createStore({
    backends: {
        sqlite: createSqliteStore({
            path: pathConfig.authState,
            driver: 'auto'
        })
    },
    providers: {
        auth: 'sqlite',
        signal: 'sqlite',
        preKey: 'sqlite',
        session: 'sqlite',
        identity: 'sqlite',
        senderKey: 'sqlite',
        appState: 'sqlite',
        privacyToken: 'sqlite',
        messages: 'none',
        threads: 'none',
        contacts: 'none'
    }
});

export default Object.freeze({
    owner,
    botNumber,
    pairingCode: process.env.PAIRING_CODE.trim(),
    sessionId: process.env.SESSION_ID.trim(),
    path: pathConfig,
    store
});
