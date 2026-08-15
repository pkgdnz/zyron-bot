import fs from "node:fs/promises";
import path from "node:path";

import { createPinoLogger, WaClient } from "zapo-js";

import { WebSocket } from "ws";

import cfg from "./config.js";

import { chatStore } from "./src/chats-store.js";
import { contactStore } from "./src/contacts-store.js";
import { messageStore } from "./src/messages-store.js";

import { bindGroupEvents, fetchAllGroups } from "./src/group-store.js";

import { handleMessage } from "./handler.js";

import {
  serializeContactFromMessage,
  serializeSelfContact,
} from "./src/serialize/contact.js";

const logger = await createPinoLogger({ level: "error" });

globalThis.WebSocket = WebSocket;

await fs.mkdir(path.dirname(cfg.path.authState), {
  recursive: true,
});

function bindStoreEvents(sock) {
  sock.on("message", event => {
    messageStore.insert(event);

    const derived = serializeContactFromMessage(event);

    if (derived) {
      contactStore.upsertAndGet(derived);
    }

    handleMessage(event, sock);
  });

  bindGroupEvents(sock);
}

let pairingRequested = false;

function bindAuthEvents(sock) {
  sock.on("auth_qr", () => {
    if (pairingRequested || !cfg.botNumber) return;

    pairingRequested = true;

    requestPairingCode(sock);
  });

  sock.on("auth_paired", ({ credentials }) => {
    console.log("paired as", credentials.meJid);
  });
}

async function requestPairingCode(sock) {
  try {
    const code = await sock.auth.requestPairingCode(
      cfg.botNumber,
      true,
      cfg.pairingCode,
    );

    console.log(`pairing code: ${code.match(/.{1,4}/g).join("-")}`);
  } catch (err) {
    pairingRequested = false;
    console.error("[bot]", err);
  }
}

function bindConnectionEvents(sock) {
  sock.on("connection", event => {
    if (event.status === "open") {
      console.log("bot connected");

      const self = serializeSelfContact(sock);

      if (self) {
        contactStore.upsertAndGet(self);
      }

      fetchAllGroups(sock).catch(err => {
        console.error("[bot]", err);
      });

      return;
    }

    if (event.isLogout) {
      fs.rm(cfg.path.authState, {
        recursive: true,
        force: true,
      }).catch(() => {});

      console.log("logged out");
      return;
    }

    console.log("reconnecting...");

    setTimeout(async () => {
      try {
        await sock.connect();
      } catch (err) {
        console.error("[bot] reconnect failed:", err);
      }
    }, 3000);
  });
}

async function start() {
  const sock = new WaClient(
    {
      store: cfg.store,
      sessionId: cfg.sessionId,
      markOnlineOnConnect: true,
      history: { enabled: true, requireFullSync: true },
    },
    logger,
  );

  bindAuthEvents(sock);
  bindConnectionEvents(sock);
  bindStoreEvents(sock);

  const shutdown = async () => {
    console.log("shutting down...");
    try {
      await sock.logout();
    } catch {
      // ignore logout errors during shutdown
    }
    try {
      await cfg.store.destroy();
    } catch {
      // ignore store destroy errors
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await sock.connect();
}

await start();
