import { config } from "dotenv";
import path from "node:path";

import { createStore } from "zapo-js";

import { createSqliteStore } from "@zapo-js/store-sqlite";

config();

const res = (...paths) => path.resolve(import.meta.dirname, ...paths);

const pathConfig = Object.freeze({
  authState: res("data", "auth.db"),
  archive: res("data", "archive.db"),
  database: res("data", "database.db"),
  plugins: res("src", "plugins"),
});

const store = createStore({
  backends: {
    auth: createSqliteStore({
      path: pathConfig.authState,
      driver: "auto",
    }),
    archive: createSqliteStore({
      path: pathConfig.archive,
      driver: "auto",
    }),
  },

  providers: {
    auth: "auth",
    signal: "auth",
    preKey: "auth",
    session: "auth",
    identity: "auth",
    senderKey: "auth",
    appState: "auth",
    privacyToken: "auth",
    messages: "archive",
    threads: "archive",
    contacts: "archive",
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
