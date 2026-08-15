import { config } from "dotenv";
import path from "node:path";

import { createStore } from "zapo-js";

import { createSqliteStore } from "@zapo-js/store-sqlite";

config();

const res = (...paths) => path.resolve(import.meta.dirname, ...paths);

const pathConfig = Object.freeze({
  authState: res("data", "auth.db"),
  database: res("data", "database.db"),
  plugins: res("src", "plugins"),
});

const store = createStore({
  backends: {
    sqlite: createSqliteStore({
      path: pathConfig.authState,
      driver: "auto",
    }),
  },

  providers: {
    auth: "sqlite",
    signal: "sqlite",
    preKey: "sqlite",
    session: "sqlite",
    identity: "sqlite",
    senderKey: "sqlite",
    appState: "sqlite",
    privacyToken: "sqlite",
    messages: "none",
    threads: "none",
    contacts: "none",
  },
});

export default Object.freeze({
  botNumber: process.env.BOT_NUMBER,
  pairingCode: process.env.PAIRING_CODE,
  sessionId: process.env.SESSION_ID,
  owner: process.env.OWNER,

  path: pathConfig,
  store,
});
