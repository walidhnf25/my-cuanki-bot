# Cuanki — bot keuangan Telegram

Chatbot pencatatan keuangan berbasis **Telegram**: rule-based parser, Clean Architecture, NestJS.
User cukup chat bot (mis. `beli kopi 25rb`) dan transaksi dicatat ke **Google Sheets**. Tanpa login, tanpa AI API.
Di-deploy sebagai serverless function di **Vercel** (webhook Telegram).

## Tech Stack

NestJS · TypeScript (strict) · Google Sheets API · Telegram Bot API · Pino · Vercel · Bun (tooling) · Node ≥ 20

## Setup

### 1. Bot Telegram

1. Chat [@BotFather](https://t.me/BotFather) → `/newbot` → simpan **token**-nya (`TELEGRAM_BOT_TOKEN`).
2. Opsional: batasi bot hanya untuk kamu. Cari user id-mu lewat [@userinfobot](https://t.me/userinfobot), lalu isi `TELEGRAM_ALLOWED_USER_IDS`.

### 2. Google Sheets

1. Di [Google Cloud Console](https://console.cloud.google.com/): buat project → aktifkan **Google Sheets API**.
2. Buat **Service Account** → tab *Keys* → *Add key* → JSON. Dari file JSON itu ambil `client_email`
   (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) dan `private_key` (`GOOGLE_PRIVATE_KEY`).
3. Buat spreadsheet kosong, lalu **Share** ke email service account sebagai **Editor**.
4. Ambil ID spreadsheet dari URL `https://docs.google.com/spreadsheets/d/<ID>/edit` (`GOOGLE_SHEETS_SPREADSHEET_ID`).

Tab `users`, `categories`, `transactions`, `budgets`, dan `conversations` (beserta header-nya) dibuat
otomatis saat aplikasi pertama kali jalan, dan kategori bawaan langsung diisi. Keyword kategori bisa
diedit langsung di kolom `keywords` pada tab `categories` (pisahkan dengan koma).

> Jangan ubah urutan kolom atau menyisipkan kolom di tengah. Aplikasi membaca data berdasarkan posisi kolom.

## Menjalankan lokal

```bash
bun install
cp .env.example .env.development   # isi token & kredensial
bun run start:dev
```

Untuk lokal, set `TELEGRAM_POLLING=true` agar bot mengambil pesan sendiri tanpa perlu URL publik.
Kalau webhook sudah pernah dipasang untuk bot yang sama, hapus dulu:

```bash
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

- App: http://localhost:3000/
- Health: http://localhost:3000/health
- Swagger: http://localhost:3000/docs

## Deploy ke Vercel

1. Import repo ini di Vercel (framework preset: **Other**). `vercel.json` sudah mengatur build dan routing.
2. Isi Environment Variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (string acak),
   `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `NODE_ENV=production`,
   dan opsional `TELEGRAM_ALLOWED_USER_IDS`. **Jangan** set `TELEGRAM_POLLING` di Vercel.
3. Setelah deploy, daftarkan webhook sekali saja:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<app>.vercel.app/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Cek statusnya dengan `getWebhookInfo`, lalu cek `https://<app>.vercel.app/health` untuk memastikan koneksi ke spreadsheet.

### Catatan

- Paket Hobby Vercel gratis untuk penggunaan pribadi/non-komersial.
- Google Sheets API punya kuota per menit. Satu pesan butuh beberapa panggilan API (dibantu cache 5 detik),
  jadi cocok untuk pemakaian pribadi, bukan untuk ratusan user sekaligus.
- Audit log ditulis ke log aplikasi (terlihat di dashboard Vercel), bukan ke spreadsheet, supaya hemat kuota.

## Script Penting

| Script | Fungsi |
|---|---|
| `bun run start:dev` | Dev server (watch) |
| `bun run build` | Build produksi |
| `bun run lint` | ESLint + fix |
| `bun run format` | Prettier |
| `bun run typecheck` | Type check |
| `bun run test` | Unit test (Jest) |

## Struktur

- `src/sheets/` — client Google Sheets (auth service account, baca/tulis baris, layout tab)
- `src/modules/*/infrastructure/sheets-*.repository.ts` — implementasi repository di atas Sheets
- `src/modules/bot/` — alur pesan masuk (orchestrator, reply) + adapter Telegram (webhook, polling)
- `src/serverless.ts` + `api/index.js` — entry point Vercel; `src/main.ts` — server lokal

Dokumen di `docs/` adalah perencanaan awal (versi WhatsApp + PostgreSQL) dan belum diperbarui.
