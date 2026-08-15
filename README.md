# Zyron Bot

Bot WhatsApp multi-device berbasis Zapo JS dengan sistem plugin yang dapat dimuat ulang secara otomatis (hot-reload).

## Fitur

- Koneksi WhatsApp multi-device menggunakan pairing code
- Sistem plugin dengan hot-reload (file plugin langsung terdeteksi saat diubah)
- Command command bawaan:
  - `ping` — Cek latensi bot
  - `mem` — Tampilkan penggunaan memori
  - `menu` — Tampilkan daftar command dan kategori
  - `menu <kategori>` — Tampilkan command dalam kategori tertentu
  - `run` — Jalankan kode JavaScript async dari balasan teks atau dokumen `.js` (owner only)
  - `!` — Eksekusi kode JavaScript sinkron (owner only)
  - `!!` — Eksekusi kode JavaScript async (owner only)
  - `$` — Jalankan perintah shell di sistem (owner only)
  - `self on/off` — Aktifkan/nonaktifkan self mode global (owner only)
  - `self -gc on/off` — Aktifkan/nonaktifkan self mode per grup (owner only)
  - `cms` — Hasilkan kode reproduksi untuk pesan yang di-quote
  - `pay` — Kirim tombol permintaan pembayaran DANA
- Penyimpanan data lokal SQLite (chats, contacts, messages, self settings)
- Perlindungan owner untuk command sensitif
- Self mode: bot merespon setiap pesan di chat/grup sebagai diri sendiri

## Struktur Project

```
zyron-bot/
├── main.js                  # Entry point, inisialisasi WaClient dan bind event
├── handler.js               # Plugin loader, hot-reload, message handler
├── config.js                # Konfigurasi environment, path, dan store
├── package.json             # Dependensi dan script
├── .env.example             # Template variabel lingkungan
├── .gitignore               # File yang diabaikan Git
├── src/
│   ├── plugins/             # Plugin bawaan dan ekstensi
│   │   ├── ping.js
│   │   ├── mem.js
│   │   ├── menu.js
│   │   ├── run.js
│   │   ├── eval.js
│   │   ├── eval-async.js
│   │   ├── shell.js
│   │   ├── self.js
│   │   ├── cms.js
│   │   └── pay.js
│   ├── database/
│   │   ├── database.js      # Inisialisasi SQLite dan schema
│   │   └── table.js         # Prepared statements
│   ├── serialize/
│   │   ├── serialize.js     # Serialisasi pesan, chat, kontak
│   │   ├── message.js       # Serialisasi/deserialisasi pesan ke BLOB
│   │   ├── chat.js          # Serialisasi chat
│   │   └── contact.js       # Serialisasi kontak
│   ├── chats-store.js       # In-memory store untuk chat
│   ├── contacts-store.js    # In-memory store untuk kontak
│   ├── messages-store.js    # In-memory store untuk pesan
│   ├── group-store.js       # In-memory store untuk grup
│   ├── self-store.js        # In-memory store untuk self mode
│   ├── owner.js             # Validasi owner
│   └── message-resolve.js   # Resolve pesan dari store
└── data/                    # Runtime database (tidak di-commit)
```

## Persyaratan

- Node.js >= 20.9.0
- npm (atau package manager kompatibel)
- SQLite (disediakan melalui `better-sqlite3`)
- Koneksi internet untuk WhatsApp multi-device

## Instalasi

```bash
git clone https://github.com/pkgdnz/zyron-bot.git
cd zyron-bot
npm install
```

## Konfigurasi

Buat file `.env` berdasarkan `.env.example`:

| Variabel | Deskripsi | Contoh |
|----------|-----------|--------|
| `OWNER` | Nomor WhatsApp owner (tanpa +, tanpa leading 0) | `6283187820160` |
| `BOT_NUMBER` | Nomor WhatsApp bot (tanpa +, tanpa leading 0) | `6283851010908` |
| `PAIRING_CODE` | Kode pairing untuk multi-device | `PKGDNZLF` |
| `SESSION_ID` | ID sesi autentikasi | `default` |
| `PAYMENT_KEY` | Nomor rekening DANA untuk tombol pembayaran | `083187820160` |
| `PAYMENT_INSTITUTION` | Nama institusi pembayaran | `DANA` |
| `PAYMENT_FULL_NAME` | Nama lengkap pemilik akun pembayaran | `NORXXX` |

## Menjalankan Bot

```bash
npm start
```

Bot akan meminta pairing code ke nomor `BOT_NUMBER`. Setelah berhasil pairing, bot siap menerima dan merespon pesan.

## Sistem Plugin

Plugin dimuat dari direktori `src/plugins/`. Setiap plugin adalah file `.js` yang mengekspor default object dengan struktur:

```js
const plugin = {
    run: async (ctx) => { /* ... */ },
    command: ['cmd'],
    name: 'nama-plugin',
    description: 'Deskripsi singkat.',
    category: ['core'],
    ownerOnly: false
};

export default plugin;
```

- **Hot-reload**: Perubahan file plugin akan otomatis dimuat ulang tanpa restart bot.
- **Command**: Array string yang memicu plugin.
- **Category**: Digunakan untuk grouping di menu.
- **ownerOnly**: Jika `true`, plugin hanya bisa dijalankan oleh owner.

## Command

| Command | Kategori | Owner Only | Deskripsi |
|---------|----------|------------|-----------|
| `ping` | core | Tidak | Cek latensi |
| `mem` | core | Tidak | Penggunaan memori |
| `menu` | core | Tidak | Daftar command |
| `run` | core | Ya | Eksekusi JS dari teks/dokumen |
| `!` | core | Ya | Eval JS sinkron |
| `!!` | core | Ya | Eval JS async |
| `$` | core | Ya | Jalankan shell |
| `self` | core | Ya | Toggle self mode |
| `cms` | core | Tidak | Generate kode reproduksi pesan |
| `pay` | core | Tidak | Tombol pembayaran DANA |

## Database

Project menggunakan SQLite dengan dua database:

- **`data/auth.db`** — Disimpan dan dikelola oleh `zapo-js` untuk state autentikasi multi-device, kunci sinyal, sesi, identity, sender key, app state, dan privacy token (tidak di-commit).
- **`data/database.db`** — Database aplikasi yang menyimpan:
  - `contacts` — Kontak (lid, pn, push_name)
  - `chats` — Chat/grup (jid, name)
  - `messages` — Pesan yang diserialisasi (remote_jid, key_id, timestamp, raw)
  - `self_settings` — Konfigurasi self mode global
  - `self_groups` — Override self mode per grup

Catatan: domain `messages`, `threads`, dan `contacts` dari `zapo-js` dinonaktifkan (`none`), sehingga data tersebut tidak diarsipkan oleh library. Database diinisialisasi otomatis saat startup. Struktur tabel dibuat dengan `CREATE TABLE IF NOT EXISTS`. Jika terdeteksi tabel `messages` legacy tanpa kolom `remote_jid`, data akan dimigrasikan secara otomatis ke schema baru (ditangani di `src/database/database.js`).

## Arsitektur

```
main.js
  ├── config.js (env, path, store SQLite untuk auth)
  ├── WaClient (zapo-js)
  │   ├── Event: auth_qr / auth_paired
  │   ├── Event: connection (open / reconnect / logout)
  │   ├── Event: message → messageStore, contactStore, handleMessage
  │   └── Event: group → groupStore
  └── handler.js
       ├── loadPlugins() — muat plugin dari src/plugins/
       ├── watchPlugins() — hot-reload via fs.watch
       └── handleMessage() — route pesan ke plugin sesuai command
```

## Pengembangan

Tidak ada mode development khusus. Perubahan pada plugin akan hot-reload otomatis. Untuk perubahan pada core module, restart bot dengan `npm start`.

Bot menangani `SIGINT` dan `SIGTERM` untuk cleanup store sebelum exit.

## Troubleshooting

- **Bot tidak terhubung**: Pastikan `BOT_NUMBER` dan `PAIRING_CODE` valid, dan bot dapat mengakses WhatsApp server.
- **Plugin tidak loaded**: Pastikan file plugin berada di `src/plugins/`, berekstensi `.js`, dan memiliki `command` serta `run`.
- **Database error**: Hapus file `data/database.db` dan `data/auth.db` untuk reset (akan membuat ulang saat startup). Tabel legacy `messages` akan dimigrasikan secara otomatis jika terdeteksi schema lama.
- **Eval tidak bekerja**: Pastikan JavaScript syntax valid dan tidak ReferenceError.
- **Pembayaran tidak muncul**: Pastikan `PAYMENT_KEY`, `PAYMENT_INSTITUTION`, dan `PAYMENT_FULL_NAME` diisi di `.env`.

## Lisensi

MIT

## Repository

https://github.com/pkgdnz/zyron-bot
