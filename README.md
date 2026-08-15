# Zyron Bot

A lightweight WhatsApp multi-device bot built with [Zapo JS](https://github.com/zapoproject/zapo-js), featuring a file-based plugin system, automatic hot-reloading, SQLite-backed storage, owner-only commands, and configurable self mode.

> A simple and extensible bot base for building your own WhatsApp automation with plugins.

## ✨ Features

- 📱 WhatsApp multi-device support
- 🔐 Pairing-code authentication
- 🧩 File-based plugin architecture
- ♻️ Automatic plugin hot-reloading
- 🗄️ SQLite-backed runtime storage
- 👑 Owner-only command protection
- 🧠 Global and per-group self mode
- 📦 Built-in command system and categories
- ⚡ Lightweight Node.js runtime

## 📋 Requirements

- Node.js `>= 20.9.0`
- npm or a compatible package manager
- An internet connection
- A WhatsApp account to use as the bot account

SQLite is provided by `better-sqlite3` and `@zapo-js/store-sqlite`. No separate SQLite server is required.

## 🚀 Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/pkgdnz/zyron-bot.git
cd zyron-bot
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

Then configure `.env` before starting the bot.

## ⚙️ Configuration

Zyron Bot reads its configuration from environment variables.

| Variable | Required | Description |
| --- | --- | --- |
| `OWNER` | Yes | Owner's WhatsApp number in international format, without `+`. |
| `BOT_NUMBER` | Yes | WhatsApp number that will be paired with the bot. |
| `PAIRING_CODE` | Yes | Pairing code requested during authentication. |
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

Keep your real `.env` and runtime databases private. Do not commit credentials, authentication state, or other secrets to the repository.

## ▶️ Running

Start the bot with:

```bash
npm start
```

The bot requests a pairing code for `BOT_NUMBER`. After the WhatsApp account is paired successfully, Zyron Bot starts processing incoming messages.

The process also handles `SIGINT` and `SIGTERM` for shutdown cleanup.

## 🤖 Built-in Commands

| Command | Owner Only | Description |
| --- | --- | --- |
| `ping` | No | Check bot latency. |
| `mem` | No | Show process memory usage. |
| `menu` | No | Show available commands and categories. |
| `menu <category>` | No | Show commands in a specific category. |
| `run` | Yes | Execute asynchronous JavaScript from replied text or a `.js` document. |
| `!` | Yes | Execute synchronous JavaScript. |
| `!!` | Yes | Execute asynchronous JavaScript. |
| `$` | Yes | Execute a shell command. |
| `self` | Yes | Toggle global self mode. |
| `self -gc on/off` | Yes | Toggle self mode for the current group. |
| `cms` | No | Generate reproduction code for a quoted message. |
| `pay` | No | Send the configured payment request button. |

### 👑 Owner-only commands

Commands marked as owner-only are silently ignored when used by non-owner users. The check is performed by the message handler before the plugin is executed.

Self mode is also enforced by the handler. When self mode is enabled for a chat, non-owner messages are ignored while owner commands remain available.

## 🧩 Plugin System

Plugins are stored in:

```text
src/plugins/
```

Every `.js` file in this directory can be loaded automatically. A plugin must export a default object containing `run`, `name`, `command`, `ownerOnly`, and `description` as used by the project's plugin system.

### Example Plugin

Zyron Bot plugins use a separate `run` function and then reference it from the plugin object:

```js
const run = async ctx => {
  const { jid, sock } = ctx;
  const start = Date.now();

  const result = await sock.message.send(jid, 'pong!');
};

const plugin = {
  run,
  name: 'ping',
  command: ['ping'],
  ownerOnly: false,
  description: 'Respond with a latency check.',
  category: ['core']
};

export default plugin;
```

You can also use additional context values when needed:

```js
const run = async ctx => {
  const { jid, sock, m, q, text } = ctx;

  await sock.message.send(jid, `You said: ${text}`);
};

const plugin = {
  run,
  name: 'example',
  command: ['example'],
  ownerOnly: false,
  description: 'Example command.',
  category: ['example']
};

export default plugin;
```

### Plugin Fields

| Field | Type | Description |
| --- | --- | --- |
| `run` | `Function` | Main function executed when the command is triggered. |
| `name` | `String` | Internal plugin name. |
| `command` | `String[]` | Commands that trigger the plugin. |
| `ownerOnly` | `Boolean` | Restricts the plugin to the configured owner when `true`. |
| `description` | `String` | Description shown by the menu system. |
| `category` | `String[]` | Category or categories used by the menu system. |

### 🧰 Plugin Context

The handler provides a context object to `run`:

```js
const { sock, jid, m, q, text } = ctx;
```

| Property | Description |
| --- | --- |
| `sock` | Active WhatsApp client. |
| `jid` | JID of the current chat. |
| `m` | Serialized current message. |
| `q` | Quoted/replied message, if available. |
| `text` | Command arguments as a string. |

## ♻️ Hot Reloading

Plugins are automatically watched using Node.js `fs.watch`.

When a plugin is created, modified, removed, or replaced, the plugin registry is reloaded without restarting the bot.

If a modified plugin fails to load, the previously cached version can remain active. Invalid plugins are skipped and logged instead of terminating the entire bot process.

Core files such as `main.js`, `handler.js`, `config.js`, and database modules require a restart when modified.

## 📁 Project Structure

```text
zyron-bot/
├── main.js                    # Application entry point and WhatsApp events
├── handler.js                 # Plugin loader, hot reload, and command routing
├── config.js                  # Environment and storage configuration
├── package.json               # Metadata, scripts, and dependencies
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

## 🗄️ Runtime Data

The `data/` directory contains local runtime state.

### `data/auth.db`

Contains WhatsApp authentication and session state managed by Zapo JS, including credentials, signal state, sessions, identities, sender keys, app state, and privacy tokens.

### `data/database.db`

Contains application-level data managed by Zyron Bot:

- `contacts` — Contact information
- `chats` — Chat and group metadata
- `messages` — Serialized message records
- `self_settings` — Global self-mode configuration
- `self_groups` — Per-group self-mode overrides

The database is initialized automatically at startup. Existing legacy `messages` schemas can be migrated when detected.

## 🏗️ Architecture

```text
main.js
│
├── config.js
│   └── Environment + SQLite configuration
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

The architecture separates WhatsApp connection handling, local state, message routing, and plugin logic so that plugins can be developed independently from the core bot.

## 🛠️ Development

For plugin development, edit or add files inside:

```text
src/plugins/
```

Plugin changes are detected automatically through hot-reloading.

For core changes, restart the process:

```bash
npm start
```

A plugin without a valid `command` array or `run` function is skipped. Plugin loading errors are logged without shutting down the bot.

## 🔧 Troubleshooting

### Pairing does not start

Make sure `OWNER`, `BOT_NUMBER`, `PAIRING_CODE`, and `SESSION_ID` are present in `.env`. These variables are validated during startup.

### The bot does not respond

Check that the command matches a loaded plugin. Also verify whether the command is owner-only or whether self mode is enabled for the current chat.

### A plugin is not loaded

Make sure the file:

- Is inside `src/plugins/`
- Ends with `.js`
- Exports a default plugin object
- Contains a non-empty `command` array
- Defines `run` as a function

### Database problems

Stop the bot before removing runtime databases.

Deleting `data/database.db` resets application data. Deleting `data/auth.db` resets WhatsApp authentication state and requires pairing again.

### Payment command is missing configuration

Set `PAYMENT_KEY`, `PAYMENT_INSTITUTION`, and `PAYMENT_FULL_NAME` when using the payment plugin.

## 📦 Dependencies

The main runtime packages include:

- `zapo-js` — WhatsApp multi-device client
- `@zapo-js/store-sqlite` — SQLite-backed Zapo JS store
- `better-sqlite3` — SQLite database driver
- `dotenv` — Environment variable loading
- `pino` / `pino-pretty` — Logging
- `qrcode-terminal` — Terminal QR support
- `ws` — WebSocket implementation

See [`package.json`](./package.json) for the exact dependency declarations.

## 📄 License

This project is released under the [MIT License](./LICENSE).

## 🔗 Repository

[github.com/pkgdnz/zyron-bot](https://github.com/pkgdnz/zyron-bot)
