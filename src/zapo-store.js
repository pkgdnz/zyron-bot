import cfg from '../config.js';

let session;

export const zapoSession = () => {
    if (!session) {
        session = cfg.store.session(cfg.sessionId);
    }
    return session;
};

export const messageStore = () => zapoSession().messages;
