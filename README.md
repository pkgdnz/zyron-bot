# Zyron Bot

A lightweight WhatsApp multi-device bot built with [Zapo JS](https://github.com/zapoproject/zapo-js), featuring a file-based plugin system, automatic plugin hot-reloading, SQLite-backed storage, owner-only commands, and configurable self mode.

> This project is intended as a bot base that can be extended through plugins rather than as a fixed all-in-one bot.

## Overview

Zyron Bot connects to WhatsApp using a pairing code and routes incoming messages to plugins from `src/plugins/`. Plugins are loaded automatically at startup and reloaded when their files change, so plugin development does not require restarting the process.

The project keeps WhatsApp authentication state and application data in separate SQLite databases. Message, chat, contact, group, and self-mode state is handled by the project's local stores.

## Requirements

- Node.js `>= 20.9.0`
- npm or a compatible package manager
- An internet connection for WhatsApp connectivity
- A WhatsApp account for the bot

SQLite is provided through `better-sqlite3` and `@zapo-js/store-sqlite`; no separate SQLite server is required.

## Installation

```bash
git clone https://github.com/pkgdnz/zyron-bot.git
cd zyron-bot
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

Then edit `.env` with your own values.

## Configuration

Zyron Bot requires the following environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `OWNER` | Yes | Owner's WhatsApp number, using the international format without `+`. |
| `BOT_NUMBER` | Yes | WhatsApp number that will be paired with the bot. |
| `PAIRING_CODE` | Yes | Custom pairing code requested during authentication. |
| `SESSION_ID` | Yes | Zapo JS session identifier. |
| `PAYMENT_KEY` | No | Payment account key used by the payment plugin. |
| `PAYMENT_INSTITUTION` | No | Payment provider name used by the payment plugin. |
| `PAYMENT_FULL_NAME` | No | Full account name used by the payment plugin. |

Example:

```env
OWNER=628123456789
BOT_NUMBER=628987654321
PAIRING_CODE=ZYRONBOT
SESSION_ID=default
PAYMENT_KEY=
PAYMENT_INSTITUTION=DANA
PAYMENT_FULL_NAME=
```

Do not commit your real `.env` file or authentication database to a public repository.

## Running the Bot

Start Zyron Bot with:

```bash
npm start
```

The process connects using the configured `BOT_NUMBER` and requests a WhatsApp pairing code. After the account is paired, the bot starts processing incoming messages.

The application also handles `SIGINT` and `SIGTERM` for shutdown cleanup.

## Commands

The built-in commands are organized through plugin categories and the menu system.

| Command | Owner only | Description |
| --- | --- | --- |
| `ping` | No | Check bot latency. |
| `mem` | No | Show process memory usage. |
| `menu` | No | Show available commands and categories. |
| `menu <category>` | No | Show commands in a specific category. |
| `run` | Yes | Execute asynchronous JavaScript from a replied text message or `.js` document. |
| `!` | Yes | Execute synchronous JavaScript. |
| `!!` | Yes | Execute asynchronous JavaScript. |
| `$` | Yes | Execute a shell command. |
| `self` | Yes | Toggle global self mode. |
| `self -gc on/off` | Yes | Toggle self mode for the current group. |
| `cms` | No | Generate reproduction code for a quoted message. |
| `pay` | No | Send the configured payment request button. |

### Owner-only behavior

Commands marked as owner-only are ignored for non-owner users. The message handler performs the owner check before executing the plugin.

Self mode is also enforced by the message handler: when self mode is enabled for a chat, non-owner messages are ignored while owner commands remain available.

## Plugin System

Plugins live in:

```text
src/plugins/
```

Every `.js` file in that directory can be loaded as a plugin. A plugin must export a default object containing at least `command` and `run`:

```js
const plugin = {
  command: ['example'],
  name: 'example',
  description: 'Example plugin.',
  category: ['example'],
  ownerOnly: false,

  async run(ctx) {
    const { sock, jid, m, q, text } = ctx;

    // Plugin logic
  },
};

export default plugin;
```

### Plugin fields

| Field | Purpose |
| --- | --- |
| `command` | Array of command strings that trigger the plugin. |
| `name` | Internal plugin name used for logging. |
| `description` | Human-readable command description. |
| `category` | Category or categories used by the menu system. |
| `ownerOnly` | Restricts execution to the configured owner when set to `true`. |
| `run(ctx)` | Function that receives the execution context. |

The handler provides these commonly used context values:

```js
{
  sock,  // WhatsApp client
  jid,   // current chat JID
  m,     // serialized message
  q,     // quoted message, if available
  text   // command arguments as a string
}
```

## Hot Reloading

Plugin changes are detected automatically with `fs.watch`.

When a plugin file is created, modified, removed, or replaced, Zyron Bot reloads the plugin registry without restarting the process. If a modified plugin fails to load, the previous cached version can remain active.

Core files such as `main.js`, `handler.js`, `config.js`, and database modules still require a process restart when changed.

## Project Structure

```text
zyron-bot/
├── main.js                    # Application entry point and WhatsApp event wiring
├── handler.js                 # Plugin loading, hot reload, and command routing
├── config.js                  # Environment validation and storage configuration
├── package.json               # Project metadata, scripts, and dependencies
├── .env.example               # Environment variable template
├── src/
│   ├── plugins/               # Built-in and custom plugins
│   ├── database/
│   │   ├── database.js        # SQLite initialization and schema
│   │   └── table.js            # Database statements/helpers
│   ├── serialize/             # Message, chat, and contact serialization
│   ├── chats-store.js         # In-memory chat store
│   ├── contacts-store.js      # In-memory contact store
│   ├── messages-store.js      # In-memory message store
│   ├── group-store.js         # Group state and events
│   ├── self-store.js          # Global/group self-mode state
│   ├── owner.js               # Owner validation
│   └── message-resolve.js     # Message resolution helpers
└── data/                      # Runtime SQLite data
```

## Runtime Data

The `data/` directory contains local runtime state and should not be committed.

### `data/auth.db`

Stores WhatsApp authentication/session state used by Zapo JS, including authentication credentials, signal state, sessions, identities, sender keys, app state, and privacy tokens.

### `data/database.db`

Stores application-level data managed by Zyron Bot, including:

- `contacts` — serialized contact information
- `chats` — chat and group metadata
- `messages` — serialized message records
- `self_settings` — global self-mode configuration
- `self_groups` — per-group self-mode overrides

The application initializes the database automatically and uses `CREATE TABLE IF NOT EXISTS` for its schema. Legacy `messages` data can be migrated when an older schema is detected.

## Architecture

The runtime flow is intentionally simple:

```text
main.js
│
├── config.js
│   └── Environment + SQLite store configuration
│
├── WaClient (zapo-js)
│   ├── Authentication events
│   ├── Connection events
│   ├── Message events
│   └── Group events
│
├── Local stores
│   ├── chats-store
│   ├── contacts-store
│   ├── messages-store
│   └── group-store
│
└── handler.js
    ├── loadPlugins()
    ├── watchPlugins()
    └── handleMessage()
        ├── Resolve command
        ├── Check ownerOnly
        ├── Check self mode
        └── Run plugin
```

This separation keeps WhatsApp connection handling, message routing, storage, and plugin logic independent from one another.

## Development

For plugin development, edit files directly inside `src/plugins/`. Changes are detected automatically.

For core changes, restart the process:

```bash
npm start
```

A plugin that does not export a valid `command` array or `run` function is skipped. Plugin loading errors are logged without terminating the entire bot process.

## Troubleshooting

### Pairing does not start

Check that `BOT_NUMBER`, `PAIRING_CODE`, `SESSION_ID`, and `OWNER` are present in `.env`. The configuration module validates these variables during startup.

### The bot does not respond

Make sure the command exactly matches a loaded plugin command. Also check whether the command is owner-only or whether self mode is enabled for the current chat.

### A plugin is not loaded

Verify that the file is inside `src/plugins/`, ends with `.js`, exports a default plugin object, contains a non-empty `command` array, and defines `run` as a function.

### Database problems

Stop the bot before removing runtime databases. Deleting `data/database.db` resets application data; deleting `data/auth.db` resets WhatsApp authentication state and requires pairing again.

### Payment command is missing configuration

Set `PAYMENT_KEY`, `PAYMENT_INSTITUTION`, and `PAYMENT_FULL_NAME` when using the payment plugin.

## Dependencies

The main runtime packages include:

- `zapo-js` — WhatsApp multi-device client
- `@zapo-js/store-sqlite` — SQLite-backed Zapo JS store
- `better-sqlite3` — SQLite database driver
- `dotenv` — environment variable loading
- `pino` / `pino-pretty` — logging
- `qrcode-terminal` — terminal QR support
- `ws` — WebSocket implementation

See [`package.json`](./package.json) for the exact dependency declarations and project metadata.

## License

This project is released under the [MIT License](./LICENSE).

## Repository

[github.com/pkgdnz/zyron-bot](https://github.com/pkgdnz/zyron-bot)
