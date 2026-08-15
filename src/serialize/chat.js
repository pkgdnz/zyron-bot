export function serializeChat(chat) {
    if (!chat?.id?.endsWith('@g.us')) return undefined;

    return {
        jid: chat.id,
        name: chat.name ?? chat.subject ?? null
    };
}