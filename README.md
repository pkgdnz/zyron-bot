# Zyron Bot

Base bot WhatsApp multi-device yang dibangun dengan [Zapo JS](https://github.com/zapoproject/zapo-js). Zyron Bot menggunakan arsitektur berbasis plugin, penyimpanan lokal SQLite, pairing code untuk autentikasi, serta beberapa command development yang dibatasi untuk owner.

Repository: https://github.com/pkgdnz/zyron-bot

## Gambaran umum

Zyron Bot memisahkan beberapa bagian utama:

- `main.js` menangani lifecycle client WhatsApp, autentikasi, koneksi ulang, sinkronisasi group, dan event pesan.
- `handler.js` memuat plugin, melakukan hot reload, mencocokkan command, memeriksa owner/self mode, lalu menjalankan plugin.
- `config.js` memvalidasi environment variable dan menyiapkan path serta SQLite store untuk state autentikasi Zapo JS.
- `src/db.js` menyiapkan database aplikasi dengan `better-sqlite3`.
- `src/store.js` menangani message, contact, chat, group, dan self-mode state.
- `src/serialize.js` serta `src/message-resolve.js` menangani normalisasi dan resolusi pesan.
- `src/theme-manager.js` menyimpan konfigurasi theme yang digunakan oleh command `menu`.
- `src/plugins/` berisi seluruh plugin command.

## Requirements

- Node.js `>= 22`
- npm
- Akun WhatsApp untuk akun bot
- Internet connection saat install dependency dan menjalankan bot

Tidak diperlukan server SQLite terpisah. Database aplikasi menggunakan `better-sqlite3`, sedangkan state autentikasi Zapo JS menggunakan `@zapo-js/store-sqlite`.

## Instalasi

```bash
git clone https://github.com/pkgdnz/zyron-bot.git
cd zyron-bot
npm install
cp .env.example .env
```

Isi `.env`, kemudian jalankan:

```bash
npm start
```

## Konfigurasi

Konfigurasi dibaca dari environment variable berikut:

| Variable | Wajib | Keterangan |
| --- | --- | --- |
| `OWNER` | Ya | Nomor WhatsApp owner dalam format internasional. |
| `BOT_NUMBER` | Ya | Nomor WhatsApp yang akan dipakai sebagai bot. |
| `PAIRING_CODE` | Ya | Pairing code yang diminta saat proses autentikasi. |
| `SESSION_ID` | Ya | ID session Zapo JS. Default pada `.env.example` adalah `default`. |

Contoh:

```env
OWNER=628123456789
BOT_NUMBER=628987654321
PAIRING_CODE=ZYRONBOT
SESSION_ID=default
```

`OWNER` dan `BOT_NUMBER` dinormalisasi menjadi angka saja oleh `config.js`.

## Autentikasi dan session

Saat bot mendapat event `auth_qr`, bot meminta pairing code menggunakan `BOT_NUMBER`, `PAIRING_CODE`, dan session Zapo JS. Setelah pairing berhasil, state autentikasi disimpan di:

```text
data/auth.db
```

Saat koneksi terputus, `main.js` mencoba melakukan reconnect setelah jeda 3 detik. Saat proses menerima `SIGINT` atau `SIGTERM`, store dibersihkan sebelum proses keluar.

Jika WhatsApp mengembalikan status logout, file state autentikasi akan dihapus sehingga bot perlu dipairing ulang.

## Command bawaan

Semua plugin bawaan saat ini menggunakan kategori `core`.

| Command | Owner only | Keterangan |
| --- | --- | --- |
| `ping` | Tidak | Mengecek respons bot. |
| `mem` | Tidak | Menampilkan penggunaan memori proses Node.js. |
| `menu` | Tidak | Menampilkan kategori command yang tersedia. |
| `menu <category>` | Tidak | Menampilkan command dalam kategori tertentu. |
| `menu all` | Tidak | Menampilkan seluruh command berdasarkan kategori. |
| `cms` | Tidak | Membuat kode JavaScript reproduksi dari pesan yang di-reply. |
| `theme` | Tidak | Mengatur konfigurasi theme menu. |
| `self on` | Ya | Mengaktifkan self mode global. |
| `self off` | Ya | Menonaktifkan self mode global. |
| `self -gc on` | Ya | Mengaktifkan self mode untuk group saat ini. |
| `self -gc off` | Ya | Menonaktifkan self mode untuk group saat ini. |
| `!` | Ya | Menjalankan JavaScript melalui `eval`. |
| `!!` | Ya | Menjalankan JavaScript async melalui `eval`. |
| `run` | Ya | Menjalankan JavaScript async dari teks atau dokumen `.js` yang di-reply. |
| `$` | Ya | Menjalankan command shell pada host bot. |
| `fakemsg`, `fake`, `fakeedit` | Ya | Fitur fake edit untuk pesan di group. |

Command `fakemsg` juga memeriksa bahwa command dijalankan di group dan memiliki pesan yang di-reply.

## Menu dan theme

Command `menu` membaca plugin yang sedang terdaftar, lalu membangun daftar kategori dan command secara dinamis. Karena itu, command yang ditambahkan ke `src/plugins/` dapat muncul di menu tanpa perlu mengubah daftar manual di README atau di `menu.js`.

Theme menu disimpan di database aplikasi dan digunakan untuk link preview menu. Theme dapat mengatur:

- title
- description
- url
- thumbnail
- favicon

Command yang tersedia antara lain:

```text
theme
theme title set <text>
theme title get
theme title clear

theme description set <text>
theme description get
theme description clear

theme url set <url>
theme url get

theme thumb set <url>
theme thumb set                 # reply/upload image atau thumbnail
theme thumb get
theme thumb height <0.2 - 1>
theme thumb stock

theme fav set <url>
theme fav set                    # reply/upload image atau thumbnail
theme fav get
theme fav clear

theme export <name>
theme use                         # reply dokumen JSON theme

theme preview                    # masih WIP
```

Thumbnail dan favicon dapat berasal dari URL atau media gambar yang tersedia pada pesan. Data theme disimpan sebagai satu record pada tabel `theme`.

## Plugin system

Plugin berada di:

```text
src/plugins/
```

Setiap file `.js` di directory tersebut dapat dimuat oleh plugin loader.

Contoh plugin minimal:

```js
const run = async ({ jid, sock }) => {
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

Field yang digunakan:

| Field | Type | Keterangan |
| --- | --- | --- |
| `run` | `Function` | Function utama yang dijalankan saat command cocok. |
| `name` | `String` | Nama plugin. Jika kosong, loader menggunakan nama file. |
| `command` | `String[]` | Daftar trigger command. Harus berisi minimal satu string valid. |
| `ownerOnly` | `Boolean` | Jika `true`, command hanya dapat digunakan owner. |
| `description` | `String` | Deskripsi command yang ditampilkan pada menu. |
| `category` | `String[]` | Kategori yang digunakan oleh menu. |

Loader akan menormalisasi command dan category, membuang entry tidak valid, serta memberi peringatan jika terjadi command collision.

### Context plugin

Plugin menerima object context:

```js
const { sock, jid, m, q, text } = ctx;
```

| Property | Keterangan |
| --- | --- |
| `sock` | Client Zapo JS aktif. |
| `jid` | JID chat saat ini. |
| `m` | Pesan yang sudah diserialisasi. |
| `q` | Pesan yang di-reply/quote, jika ada. |
| `text` | Argument setelah command. |

Objek pesan yang diserialisasi juga menyediakan helper seperti `m.reply()` dan, pada quoted message, `q.reply()` sesuai jenis pesan yang didukung serializer.

## Hot reload

`handler.js` memantau `src/plugins/` menggunakan `fs.watch`.

Saat file plugin dibuat, diubah, diganti, atau dihapus, registry plugin dibangun ulang. Loader menggunakan cache berdasarkan modification time sehingga plugin yang tidak berubah tidak perlu di-import ulang.

Jika proses reload plugin gagal dan versi sebelumnya masih tersedia, versi yang sebelumnya berhasil dimuat dipertahankan.

Perubahan pada file core seperti `main.js`, `handler.js`, `config.js`, database, store, atau serializer memerlukan restart proses.

## Owner dan self mode

Pengecekan owner dilakukan oleh handler untuk plugin dengan `ownerOnly: true`. Beberapa plugin owner-only juga melakukan pengecekan owner internal untuk memastikan akses tidak dapat dipanggil secara langsung dari alur lain.

Self mode memiliki dua level:

```text
Global self mode
      │
      └── Group override
          ├── on
          ├── off
          └── inherited
```

Saat self mode aktif pada sebuah chat, pesan dari non-owner diabaikan oleh `handler.js` sebelum plugin dijalankan.

State global dan override group disimpan di database aplikasi.

## Database

Zyron Bot menggunakan dua database SQLite yang terpisah.

### `data/auth.db`

Dikelola oleh Zapo JS melalui `@zapo-js/store-sqlite`. Database ini digunakan untuk state autentikasi/session WhatsApp.

### `data/database.db`

Dikelola oleh Zyron Bot melalui `better-sqlite3`. Saat ini database berisi tabel:

| Table | Fungsi |
| --- | --- |
| `contacts` | Data contact, LID, nomor telepon, dan push name. |
| `chats` | Data JID chat dan nama chat. |
| `messages` | Pesan yang disimpan dalam bentuk serialisasi. |
| `self_settings` | State self mode global. |
| `self_groups` | Override self mode per group. |
| `theme` | Konfigurasi theme menu. |

Database dikonfigurasi dengan:

```text
journal_mode = WAL
foreign_keys = ON
synchronous = NORMAL
```

`src/db.js` juga memiliki logic migrasi untuk schema `messages` lama yang masih memakai kolom berbeda.

## Struktur project saat ini

```text
zyron-bot/
├── .env.example
├── .github/
│   └── workflows/
│       └── check.yml
├── .gitignore
├── README.md
├── config.js
├── eslint.config.js
├── handler.js
├── main.js
├── package.json
├── package-lock.json
├── src/
│   ├── db.js
│   ├── helpers.js
│   ├── message-resolve.js
│   ├── owner.js
│   ├── plugin-registry.js
│   ├── plugins/
│   │   ├── cms.js
│   │   ├── core-theme.js
│   │   ├── eval-async.js
│   │   ├── eval.js
│   │   ├── fakemsg.js
│   │   ├── mem.js
│   │   ├── menu.js
│   │   ├── ping.js
│   │   ├── run.js
│   │   ├── self.js
│   │   └── shell.js
│   ├── serialize.js
│   ├── store.js
│   └── theme-manager.js
└── tests/
    ├── fakemsg.test.js
    ├── message-resolve.test.js
    └── serialize.test.js
```

## Arsitektur runtime

```text
WhatsApp / Zapo JS
        │
        ▼
     main.js
        │
        ├── auth / pairing
        ├── connection lifecycle
        ├── message events
        └── group events
                │
                ├── src/store.js
                └── handler.js
                      │
              ┌───────┼────────┐
              ▼       ▼        ▼
          command   owner   self mode
           lookup    check     check
              │
              ▼
        plugin.run(ctx)
```

## Development

Install dependency:

```bash
npm install
```

Jalankan bot:

```bash
npm start
```

Lint:

```bash
npm run lint
```

Test:

```bash
npm test
```

Script yang tersedia di `package.json` saat ini:

| Script | Perintah |
| --- | --- |
| `start` | `node main.js` |
| `lint` | `eslint .` |
| `test` | `node --test` |

CI GitHub Actions menjalankan Node.js 22, `npm install`, lint, dan test pada push ke `master` serta pull request menuju `master`.

## Security

Command berikut dapat menjalankan kode dengan permission proses bot:

```text
!
!!
run
$
```

Karena itu, akses owner harus diperlakukan sebagai akses penuh terhadap runtime host. Jangan membagikan `.env`, pairing code, atau file `data/auth.db`.

Directory `data/` merupakan runtime data lokal dan seharusnya tidak dipublikasikan ke repository.

## Catatan codebase saat ini

Dokumentasi ini disesuaikan dengan file yang saat ini berada di branch `master`.

Perlu diperhatikan bahwa `handler.js` dan `main.js` pada keadaan repository saat ini masih mengimpor beberapa path seperti `src/serialize/serialize.js`, `src/self-store.js`, dan `src/serialize/contact.js`, sedangkan struktur `src/` yang tersedia di branch `master` menggunakan file seperti `src/serialize.js` dan `src/store.js`. Artinya terdapat ketidaksesuaian struktur source yang terpisah dari perubahan README ini dan perlu dibereskan agar runtime dapat berjalan konsisten.

README ini tidak menganggap CI atau runtime sedang berhasil hanya berdasarkan konfigurasi file; validasi aktual tetap harus dilakukan dengan `npm run lint`, `npm test`, dan menjalankan bot setelah dependency terpasang.

## License

MIT License.

## Repository

https://github.com/pkgdnz/zyron-bot
