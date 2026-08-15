# Zyron Bot

A personal WhatsApp multi-device bot base built with [Zapo JS](https://github.com/zapoproject/zapo-js).

Zyron Bot is designed to stay simple, modular, and easy to customize. Features are implemented as plugins, plugin changes are hot-reloaded, and application state is persisted locally with SQLite.

## ✨ Features

- 📱 WhatsApp multi-device connection with pairing code authentication
- 🧩 File-based plugin system
- ♻️ Automatic plugin hot-reloading
- 🗄️ SQLite-backed message, chat, contact, and self-mode storage
- 👑 Owner-only command support
- 🧠 Global self mode with per-group overrides
- 🛠️ Built-in JavaScript and shell tools for owner development
- 📂 Command categories and automatic menu generation
- ⚡ Lightweight Node.js runtime

## 📋 Requirements

- Node.js `>= 20.9.0`
- npm or a compatible package manager
- Internet access
- A WhatsApp account to use as the bot account

No external SQLite server is required. SQLite is provided by `better-sqlite3` and `@zapo-js/store-sqlite`.

## 🚀 Installation

```bash
git clone https://github.com/pkgdnz/zyron-bot.git
cd zyron-bot
npm install
cp .env.example .env
```

Edit `.env` with your own configuration, then start the bot:

```bash
npm start
```

## ⚙️ Configuration

Zyron Bot requires these environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `OWNER` | Yes | Owner's WhatsApp number. International format, without `+`. |
| `BOT_NUMBER` | Yes | WhatsApp number used by the bot. |
| `PAIRING_CODE` | Yes | Pairing code requested during authentication. |
| `SESSION_ID` | Yes | Zapo JS session identifier. |

Example:

```env
OWNER=628123456789
BOT_NUMBER=628987654321
PAIRING_CODE=ZYRONBOT
SESSION_ID=default
```

Keep `.env` and the `data/` directory private. Authentication state contains sensitive session information.

## ▶️ Running

```bash
npm start
```

On first launch, the bot requests a pairing code for `BOT_NUMBER`. After pairing succeeds, the session is persisted in `data/auth.db` so normal restarts do not require pairing again.

Graceful shutdown closes the local store without intentionally logging the WhatsApp account out. A real WhatsApp logout is handled separately by the connection lifecycle.

## 🤖 Built-in Commands

| Command | Owner Only | Description |
| --- | --- | --- |
| `ping` | No | Check bot response. |
| `mem` | No | Show process memory usage. |
| `menu` | No | Show available categories. |
| `menu <category>` | No | Show commands inside a category. |
| `run` | Yes | Execute asynchronous JavaScript from text or a replied `.js` document. |
| `!` | Yes | Execute JavaScript synchronously. |
| `!!` | Yes | Execute JavaScript asynchronously. |
| `$` | Yes | Execute a shell command. |
| `self` | Yes | Toggle global self mode. |
| `self -gc on/off` | Yes | Override self mode for the current group. |
| `cms` | No | Generate reproduction code for a quoted message. |

### 👑 Owner-only tools

Owner-only commands are blocked by the central message handler before the plugin is executed. The plugins also keep their own owner checks for privileged operations.

`!`, `!!`, `run`, and `$` are intentionally privileged development tools. Treat them as full local-code execution features and keep the bot account and session private.

## 🧩 Plugin System

Plugins live in:

```text
src/plugins/
```

Every `.js` file in this directory can be loaded as a plugin.

### Example

Zyron Bot separates the handler function from the plugin metadata object:

```js
const run = async ctx => {
    const { jid, sock } = ctx;

    await sock.message.send(jid, 'pong!');
};

const plugin = {
    run,
    name: 'ping',
    command: ['ping'],
    ownerOnly: false,
    description: 'Check bot response.',
    category: ['core']
};

export default plugin;
```

### Plugin fields

| Field | Type | Description |
| --- | --- | --- |
| `run` | `Function` | Function executed when the command is triggered. |
| `name` | `String` | Plugin name used by logging and menus. |
| `command` | `String[]` | Command triggers for the plugin. |
| `ownerOnly` | `Boolean` | Restricts execution to the owner when `true`. |
| `description` | `String` | Human-readable command description. |
| `category` | `String[]` | Menu categories for the plugin. |

### 🧰 Plugin context

The handler passes a context object to `run`:

```js
const { sock, jid, m, q, text } = ctx;
```

| Property | Description |
| --- | --- |
| `sock` | Active Zapo JS client. |
| `jid` | Current chat JID. |
| `m` | Serialized current message. |
| `q` | Quoted message, if available. |
| `text` | Command arguments as a string. |

The serialized message also provides helpers such as `m.reply()` and `q.reply()` for common reply flows.

## ♻️ Hot Reloading

The core loader watches `src/plugins/` with Node.js `fs.watch`.

When a plugin is added, edited, replaced, or removed, Zyron Bot rebuilds the plugin registry automatically. Invalid plugins are skipped and logged instead of crashing the whole process.

Command collisions are also reported so two plugins do not silently override each other without a warning.

Changes to core files such as `main.js`, `handler.js`, `config.js`, and database modules require a normal process restart.

## 📁 Project Structure

```text
zyron-bot/
├── main.js                     # WhatsApp client lifecycle and event binding
├── handler.js                  # Plugin loader, hot reload, and command routing
├── config.js                   # Environment validation and storage config
├── package.json                # Metadata, scripts, and dependencies
├── .env.example                # Environment template
├── scripts/
│   └── check.mjs               # JavaScript syntax validation
├── .github/workflows/
│   └── check.yml               # GitHub Actions syntax check
├── src/
│   ├── plugins/                # Built-in and custom plugins
│   ├── database/               # SQLite schema and prepared statements
│   ├── serialize/              # Message/chat/contact serialization
│   ├── chats-store.js          # Chat state
│   ├── contacts-store.js       # Contact state
│   ├── messages-store.js       # Persistent message store
│   ├── group-store.js          # Group state and events
│   ├── self-store.js           # Global/group self-mode state
│   ├── owner.js                # Owner detection
│   └── message-resolve.js      # Message resolution helpers
└── data/                       # Runtime SQLite data
```

## 🗄️ Runtime Data

### `data/auth.db`

Zapo JS authentication/session state, including credentials, signal state, sessions, identities, sender keys, app state, and privacy tokens.

### `data/database.db`

Application-level data managed by Zyron Bot:

- `contacts` — Contact information
- `chats` — Chat and group metadata
- `messages` — Serialized message records
- `self_settings` — Global self-mode configuration
- `self_groups` — Per-group self-mode overrides

The application creates these tables automatically. Legacy `messages` schemas are migrated when recognized.

## 🏗️ Architecture

```text
WhatsApp / Zapo JS
        │
        ▼
     main.js
        │
        ├── Authentication + connection lifecycle
        ├── Message events
        └── Group events
                │
                ▼
           Message stores
                │
                ▼
            handler.js
                │
        ┌───────┼────────┐
        ▼       ▼        ▼
    command  owner    self mode
    lookup    check      check
        │       │        │
        └───────┴────────┘
                │
                ▼
          plugin.run(ctx)
```

The important boundary is the plugin API. Core WhatsApp lifecycle logic stays outside individual features, while plugins only receive the execution context they need.

## 🛠️ Development

Add or edit plugins inside `src/plugins/` and let hot reload apply the change.

For core changes, restart the process:

```bash
npm start
```

Before committing, run the built-in syntax check:

```bash
npm run check
```

The GitHub Actions workflow runs the same source validation on pushes and pull requests.

## 🔧 Troubleshooting

### Pairing does not start

Check that `OWNER`, `BOT_NUMBER`, `PAIRING_CODE`, and `SESSION_ID` exist in `.env`. Configuration is validated during startup.

### The bot does not respond

Confirm that the command exactly matches a loaded plugin. Also check `ownerOnly` and self-mode state for the current chat.

### A plugin is not loaded

Make sure the file is inside `src/plugins/`, ends in `.js`, exports a default plugin object, contains a non-empty `command` array, and defines `run` as a function.

### A plugin command collides with another plugin

The loader reports command collisions in the console. Give each command a unique owner unless intentionally overriding it.

### Database problems

Stop the bot before deleting runtime databases.

Deleting `data/database.db` resets application data. Deleting `data/auth.db` resets WhatsApp authentication state and requires pairing again.

### WhatsApp session was logged out

A real logout or an external device removal invalidates the stored authentication state. Pair the bot again after the session has been removed.

## ✅ Source Validation

Run:

```bash
npm run check
```

This checks the syntax of JavaScript source files without starting the WhatsApp client or touching the runtime database.

## 📦 Dependencies

Core runtime dependencies include:

- `zapo-js` — WhatsApp multi-device client
- `@zapo-js/store-sqlite` — SQLite store for Zapo JS
- `better-sqlite3` — SQLite driver
- `dotenv` — Environment loading
- `pino` / `pino-pretty` — Logging
- `ws` — WebSocket implementation

See [`package.json`](./package.json) for the current dependency declarations.

## 📄 License

MIT License.

## 🔗 Repository

[github.com/pkgdnz/zyron-bot](https://github.com/pkgdnz/zyron-bot)
