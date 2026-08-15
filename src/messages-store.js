import stmt from './database/table.js';
import { serializeMessage, deserializeMessage } from './serialize/message.js';
import { toTimestamp } from './util.js';

const UNSTORABLE = new Set([
  'protocolMessage',
  'senderKeyDistributionMessage',
  'messageContextInfo',
  'reactionMessage',
  'encReactionMessage',
  'unavailableMessage'
]);

class MessageStore {
    constructor() {
        const { count } = stmt.messages.count.get();
        console.log(`[message-store] loaded ${count} messages`);
    }

    insert(message) {
        const remoteJid = message.key?.remoteJid;
        const keyId = message.key?.id;

        if (!remoteJid || !keyId) return;

        const msgType = message.messageStubType;
        if (msgType && UNSTORABLE.has(msgType)) return;

        const raw = serializeMessage(message);

        return stmt.messages.upsert.run({
            remoteJid,
            keyId,
            timestamp: toTimestamp(
                message.messageTimestamp ?? message.timestampSeconds
            ),
            raw
        });
    }

    getByKey(remoteJid, keyId) {
        const row = stmt.messages.getByKey.get({ remoteJid, keyId });
        if (!row) return null;

        return { ...row, raw: deserializeMessage(row.raw) };
    }

    getByKeyId(keyId) {
        const row = stmt.messages.getByKeyId.get({ keyId });
        if (!row) return null;

        return { ...row, raw: deserializeMessage(row.raw) };
    }
}

export const messageStore = new MessageStore();