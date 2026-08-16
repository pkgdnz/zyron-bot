# Zyron Bot

A personal WhatsApp multi-device bot base built with [Zapo JS](https://github.com/zapoproject/zapo-js).

Zyron Bot is designed as a simple, modular base for personal WhatsApp automation. Features are implemented as plugins, plugin changes are hot-reloaded, and application data is persisted locally with SQLite.

## ✨ Features

- 📱 WhatsApp multi-device connection with pairing-code authentication
- 🧩 File-based plugin architecture
- ♻️ Automatic plugin hot-reloading
- 🗄️ SQLite-backed message, chat, contact, and self-mode storage
- 👑 Central owner-only command protection
- 🧠 Global self mode with per-group overrides
- 🛠️ Built-in JavaScript and shell tools for owner development
- 📋 Automatic command/category menu generation
- 🔎 ESLint + Vitest validation with GitHub Actions
- ⚡ Lightweight Node.js runtime

## 📋 Requirements

- Node.js `>= 20.9.0`
- npm or a compatible package manager
- Internet access
- A WhatsApp account to use as the bot account

No external SQLite server is required. SQLite is provided through `better-sqlite3` and `@zapo-js/store-sqlite`.

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

Zyron Bot reads its configuration from environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `OWNER` | Yes | Owner's WhatsApp number in international format, without `+`. |
| `BOT_NUMBER` | Yes | WhatsApp number that will be paired with the bot. |
| `PAIRING_CODE` | Yes | Pairing code requested during authentication. |
| `SESSION_ID` | Yes | Zapo JS session identifier. |

Example:

```env
OWNER=628123456789
BOT_NUMBER=628987654321
PAIRING_CODE=ZYRONBOT
SESSION_ID=default
```

Keep `.env` and the `data/` directory private. `data/auth.db` contains WhatsApp authentication/session state.

## ▶️ Running the Bot

```bash
npm start
```

On the first launch, Zyron Bot requests a pairing code for `BOT_NUMBER`. After pairing succeeds, the authentication state is stored in `data/auth.db`, allowing normal process restarts without pairing again.

A normal `SIGINT` or `SIGTERM` shutdown cleans up the local runtime without intentionally logging the WhatsApp account out. A real WhatsApp logout is handled separately by the connection lifecycle.

## 🤖 Built-in Commands

| Command | Owner Only | Description |
| --- | --- | --- |
| `ping` | No | Send a simple ping response. |
| `mem` | No | Show current process memory usage. |
| `menu` | No | Show available command categories. |
| `menu <category>` | No | Show commands inside a specific category. |
| `run` | Yes | Execute asynchronous JavaScript from command text or a replied text/`.js` document. |
| `!` | Yes | Execute JavaScript synchronously. |
| `!!` | Yes | Execute JavaScript asynchronously. |
| `$` | Yes | Execute a shell command. |
| `self` | Yes | Toggle global self mode. |
| `self -gc on/off` | Yes | Enable or disable self mode for the current group. |
| `cms` | No | Generate reproduction code for a quoted message. |
| `theme` | No | Manage the bot theme (title, description, url, thumbnail, favicon). |

### 👑 Owner-only tools

Owner-only commands are blocked centrally by the message handler before the plugin runs. Privileged plugins also perform their own owner checks where appropriate.

`!`, `!!`, `run`, and `$` are intentionally powerful development tools. They execute JavaScript or shell commands with the permissions of the bot process, so the bot account and authentication state should be treated as private.

## 🧩 Plugin System

Plugins live in:

```text
src/plugins/
```

Every `.js` file in this directory can be loaded by the plugin loader.

### Example Plugin

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
    description: 'Send a simple ping response.',
    category: ['core']
};

export default plugin;
```

### Plugin fields

| Field | Type | Description |
| --- | --- | --- |
| `run` | `Function` | Function executed when the command is triggered. |
| `name` | `String` | Plugin name used for logging and menu metadata. |
| `command` | `String[]` | Command triggers registered by the plugin. |
| `ownerOnly` | `Boolean` | Restricts execution to the configured owner when `true`. |
| `description` | `String` | Human-readable command description. |
| `category` | `String[]` | One or more menu categories for the plugin. |

The loader requires a valid non-empty `command` array and a callable `run` function. Invalid plugins are skipped instead of terminating the bot.

### 🧰 Plugin context

The handler passes this context object to `run`:

```js
const { sock, jid, m, q, text } = ctx;
```

| Property | Description |
| --- | --- |
| `sock` | Active Zapo JS client. |
| `jid` | Current chat JID. |
| `m` | Serialized current message. |
| `q` | Quoted/replied message, if available. |
| `text` | Remaining command arguments as a string. |

Serialized messages also expose helpers such as `m.reply()` and `q.reply()` for common reply flows.

## ♻️ Hot Reloading

The core loader watches `src/plugins/` with Node.js `fs.watch`.

When a plugin is added, edited, replaced, or removed, Zyron Bot rebuilds the plugin registry automatically. A plugin is cached by file modification time, and a failed reload can keep the previous working version active.

Command collisions are reported instead of being silently ignored, helping identify two plugins that register the same command.

Changes to core files such as `main.js`, `handler.js`, `config.js`, or database modules require a process restart.

## 🧠 Self Mode

Self mode determines whether the bot ignores messages from non-owner users in a chat.

There are two levels of configuration:

```text
Global self mode
      │
      └── Group override
          ├── on
          ├── off
          └── inherited from global
```

Use:

```text
self on
self off
self -gc on
self -gc off
```

Global and per-group settings are persisted in SQLite and restored when the bot restarts.

## 🎨 Theme Manager

The `theme` command manages a global bot theme (title, description, url, link-preview thumbnail, and favicon) persisted in SQLite and restored on restart.

```text
theme                       Show available subcommands
theme title set <text>      Set the theme title
theme title get             Show the current title
theme title clear           Reset the title
theme desc set <text>       Set the theme description
theme desc get              Show the current description
theme desc clear            Reset the description
theme url set <url>         Set the theme url
theme url get               Show the current url
theme thumb set <url>       Set the link-preview thumbnail from a url
theme thumb set             Set it from a replied/uploaded image or thumbnail
theme thumb get             Re-send the stored thumbnail as an image
theme thumb height <ratio>  Override the thumbnail height ratio (0.2 - 1)
theme thumb stock           Reset the thumbnail to the default
theme fav set <url>         Set the theme favicon from a url
theme fav set               Set it from a replied/uploaded image or thumbnail
theme fav get               Re-send the stored favicon as an image
theme fav clear             Reset the favicon
theme export <name>         Export the theme as a JSON document
theme use                   Import a theme from a quoted JSON document
theme preview               Work in progress
```

Thumbnail and favicon inputs accept an image url, a reply to an image/thumbnail/document-with-image, or a directly uploaded image. Uploaded media is encrypted as a WhatsApp `thumbnail-link`, so it can be re-downloaded and re-sent on demand.

## 🗄️ Database

Zyron Bot uses two separate SQLite databases.

### `data/auth.db`

Managed through Zapo JS. It stores WhatsApp authentication/session state such as credentials, signal state, sessions, identities, sender keys, app state, and privacy tokens.

### `data/database.db`

Managed by Zyron Bot. It stores application data such as:

- `contacts` — Contact information and identifiers
- `chats` — Chat/group metadata
- `messages` — Serialized message records
- `self_settings` — Global self-mode state
- `self_groups` — Per-group self-mode overrides
- `theme` — Global theme (title, description, url, thumbnail, favicon)

The schema is initialized automatically. The application also contains migration handling for recognized legacy `messages` schemas.

SQLite is configured with WAL mode and foreign-key enforcement, while prepared statements are centralized in `src/database/table.js`.

## 📁 Project Structure

```text
zyron-bot/
├── main.js                     # WhatsApp client lifecycle and event binding
├── handler.js                  # Plugin loading, hot reload, and command routing
├── config.js                   # Environment validation and storage configuration
├── eslint.config.js            # ESLint configuration
├── package.json                # Metadata, scripts, and dependencies
├── package-lock.json           # Locked dependency tree
├── .env.example                # Environment variable template
├── .github/
│   └── workflows/
│       └── check.yml           # GitHub Actions lint + test workflow
├── tests/
│   ├── handler.test.js         # Command routing and guards
│   ├── owner.test.js           # Owner detection
│   ├── plugin-loader.test.js   # Plugin normalization/loading
│   ├── self-store.test.js      # Self mode state
│   └── serialize.test.js       # Message serialization
├── src/
│   ├── plugins/                # Built-in and custom plugins
│   ├── database/               # SQLite schema and prepared statements
│   ├── serialize/              # Message, chat, and contact serialization
│   ├── helper/                 # Shared helpers (media, text, streams)
│   ├── chats-store.js          # Chat state store
│   ├── contacts-store.js       # Contact state store
│   ├── messages-store.js       # Persistent message store
│   ├── group-store.js          # Group state and events
│   ├── self-store.js           # Global/group self-mode state
│   ├── theme-manager.js        # Global theme state
│   ├── owner.js                # Owner detection
│   ├── plugin-registry.js      # Active plugin registry
│   ├── message-resolve.js      # Message resolution helpers
│   └── util.js                 # Shared utility helpers
└── data/                       # Runtime SQLite data (local only)
```

## 🏗️ Architecture

```text
WhatsApp / Zapo JS
        │
        ▼
     main.js
        │
        ├── authentication
        ├── connection lifecycle
        ├── message events
        └── group events
                │
                ▼
             local stores
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

The main separation is between the WhatsApp lifecycle, local persistence, message routing, and plugin features. Plugins interact with the bot through the context API instead of handling the raw connection lifecycle themselves.

## 🛠️ Development

### Add a plugin

Create a new `.js` file in `src/plugins/` and export a plugin object following the plugin format above.

The file is picked up automatically by the hot-reload system while the bot is running.

### Modify core code

Changes to `main.js`, `handler.js`, `config.js`, serializers, stores, or database modules require a normal restart:

```bash
npm start
```

### Lint the project

Use ESLint for source validation:

```bash
npm run lint
```

### Run tests

Run the Vitest suite:

```bash
npm test
```

The test suite focuses on the core contracts that are most likely to regress: message serialization, owner detection, command routing, self mode, and plugin loading/normalization.

The GitHub Actions workflow runs both linting and tests for pushes and pull requests targeting `master`.

## 🔧 Troubleshooting

### Pairing does not start

Check that `OWNER`, `BOT_NUMBER`, `PAIRING_CODE`, and `SESSION_ID` exist in `.env`. Configuration is validated during startup.

### The bot does not respond

Confirm that the command exactly matches a loaded plugin. Also check `ownerOnly` and self-mode state for the current chat.

### A plugin is not loaded

Make sure the file is inside `src/plugins/`, ends in `.js`, exports a default plugin object, contains a non-empty `command` array, and defines `run` as a function.

### A plugin command collides with another plugin

The loader reports command collisions in the console. Give each command a unique owner unless intentionally overriding it.

### Lint or tests fail

Run the checks locally:

```bash
npm install
npm run lint
npm test
```

Read the first failing file and test name before changing runtime code. The test suite uses mocks for WhatsApp/runtime dependencies where needed, so it does not require an active WhatsApp session.

### Database problems

Stop the bot before deleting runtime databases.

Deleting `data/database.db` resets application data. Deleting `data/auth.db` resets WhatsApp authentication state and requires pairing again.

### WhatsApp session was logged out

A real logout or an external device removal invalidates the stored authentication state. Pair the bot again after the session has been removed.

## 📦 Dependencies

Core runtime dependencies include:

- `zapo-js` — WhatsApp multi-device client
- `@zapo-js/store-sqlite` — SQLite store for Zapo JS
- `better-sqlite3` — SQLite driver
- `dotenv` — Environment loading
- `pino` / `pino-pretty` — Logging
- `ws` — WebSocket implementation

Development tooling includes:

- `eslint` — Static code analysis
- `@eslint/js` — ESLint's recommended JavaScript rules
- `vitest` — Unit and integration-style test runner

See [`package.json`](./package.json) for the current dependency declarations.

## 📄 License

MIT License.

## 🔗 Repository

[github.com/pkgdnz/zyron-bot](https://github.com/pkgdnz/zyron-bot)
