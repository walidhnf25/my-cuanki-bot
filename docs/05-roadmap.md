# 05 — Development Roadmap

Project: **finance-whatsapp-bot**
Metode: bertahap (phase-gated), setiap phase butuh **approval** sebelum lanjut.

---

## Ringkasan Phase

| Phase | Nama | Output Utama | Gate |
|---|---|---|---|
| **1** | Project Planning | Requirements, ERD, Arsitektur, Sequence, Roadmap (dokumen ini) | ✅ butuh approval Anda |
| **2** | Environment Setup | Init project, deps, Docker, Prisma, Nginx, ESLint/Prettier, Pino, Swagger — *app "hello world" jalan di compose* | butuh approval |
| **3** | Core Infrastructure | Config module + env validation, PrismaService, GlobalExceptionFilter, LoggingInterceptor, ValidationPipe, Health module | butuh approval |
| **4** | Database Layer | Prisma schema final, migration, seed kategori+keyword, repository ports & impl | butuh approval |
| **5** | Parser Module | `MessageParser` port + `RuleBasedParser` (amount/date/category tokenizer) + unit test | butuh approval |
| **6** | WhatsApp Gateway | Baileys integration, auth persistence, `MessagingGateway` port, incoming router, dedupe | butuh approval |
| **7** | Domain Modules | User, Transaction (CRUD+soft delete+edit), Category | butuh approval |
| **8** | Conversation Engine | State machine konteks + klarifikasi (FR-4) | butuh approval |
| **9** | Reports & Budget | Summary harian/mingguan/bulanan, budget + alert, export CSV | butuh approval |
| **10** | Reminder & Scheduler | @nestjs/schedule, reminder CRUD, due-runner | butuh approval |
| **11** | Hardening & Tests | Unit+e2e coverage, error paths, idempotensi, audit logs | butuh approval |
| **12** | Deployment | Dockerfile prod, docker-compose.prod, Nginx TLS, Hostinger VPS, runbook | selesai |

---

## Checklist Phase 1 (dokumen ini)

- [x] Analisis kebutuhan (`01-requirements.md`)
- [x] Functional Requirements (FR-1..FR-14)
- [x] Non-Functional Requirements (NFR-1..NFR-12)
- [x] Use Cases (UC-01..UC-12)
- [x] ERD (`03-database.md`)
- [x] Database Design (skema, index, enum, seed)
- [x] Folder Structure (`02-architecture.md`)
- [x] Clean Architecture + SOLID mapping
- [x] Sequence Diagrams (`04-sequence-diagrams.md`)
- [x] Tech Decisions + trade-off & rekomendasi
- [x] Development Roadmap (dokumen ini)

**Status Phase 1: SELESAI & disetujui.**

---

## Checklist Phase 2 — Environment Setup

- [x] Init project (package.json, tsconfig strict, nest-cli, .gitignore/.dockerignore)
- [x] Install seluruh dependency via **Bun** (783 packages)
- [x] **NestJS 11** bootstrap (main.ts, app.module, hello-world controller)
- [x] **Prisma 6** + PostgreSQL (schema minimal, PrismaService/Module, migration `init` diterapkan)
- [x] **Baileys** terpasang (belum di-wire; integrasi di Phase 6)
- [x] **Pino** logging (nestjs-pino, correlation-id, redaksi, pretty/JSON per env)
- [x] **Swagger** aktif di `/docs` (+ `/docs-json`)
- [x] **ESLint** flat config + **Prettier** (lint & typecheck bersih)
- [x] Env config + validasi fail-fast (class-validator) + `.env.example`/`.env.development`
- [x] **Docker**: multi-stage Dockerfile (Bun install → Node runtime), non-root user
- [x] **docker-compose**: postgres + app + nginx (config valid)
- [x] **Nginx** reverse proxy (rate-limit, correlation-id, /health & /docs)
- [x] Smoke test: `/` ✅, `/health` (db up, memory up) ✅, `/docs` ✅

**Status Phase 2: SELESAI & disetujui.**

---

## Checklist Phase 3 — Core Infrastructure

- [x] Error codes (`AppErrorCode`) + `DomainException` base (+ NotFound/Conflict/BusinessRule)
- [x] `GlobalExceptionFilter` — envelope konsisten, mapping Http + Prisma (P2002/P2025/P2003), log 5xx=error / 4xx=warn
- [x] `ErrorResponseDto` (terdokumentasi di Swagger)
- [x] `LoggingInterceptor` — satu sumber log HTTP (method/path/status/durationMs/requestId), health di level debug
- [x] `TimeoutInterceptor` — batas 15s (408)
- [x] `CoreModule` — registrasi global via `APP_FILTER`/`APP_INTERCEPTOR` (DI-friendly)
- [x] Pino `autoLogging=false` (hindari log ganda)
- [x] `shared/utils/Money` — value object berbasis `bigint` (anti float drift) + format Rupiah
- [x] `shared/utils/date.util` — batas hari/minggu(ISO)/bulan sadar timezone (dayjs)
- [x] `shared/utils/string-normalizer` — normalisasi/tokenisasi untuk parser
- [x] `shared/types/pagination` — envelope paginasi
- [x] **30 unit test hijau** (Money, date, normalizer) + typecheck + lint bersih
- [x] Smoke test: 404 → error envelope, health ok, x-request-id ter-propagate

**Status Phase 3: SELESAI & disetujui.**

---

## Checklist Phase 4 — Database Layer

- [x] Schema Prisma **final**: 8 model (users, categories, category_keywords, transactions, budgets, reminders, conversation_contexts, audit_logs)
- [x] Enum (TransactionType, BudgetPeriod, ConversationState), index, soft-delete, `Decimal(18,2)`, relasi + `onDelete`
- [x] Migration `full_domain_model` (validated & applied)
- [x] Domain enums independen (`shared/domain/enums`) — domain tak impor enum Prisma
- [x] **Repository ports** (abstract class = port + DI token) untuk 7 aggregate
- [x] Implementasi Prisma + mapper per aggregate (entity ↔ persistence)
- [x] Money ↔ Decimal mapping eksak; agregasi `groupBy` → Money
- [x] Idempotensi via `wa_message_id` unique; soft-delete difilter di query
- [x] Budget upsert aman untuk `categoryId` null (hindari duplikat NULL-unique)
- [x] Conversation context: TTL expiry + JsonNull handling
- [x] **Seed** idempoten: 13 kategori sistem + 151 keyword (Makanan/Transport/Gaji/...)
- [x] Semua module di-wire ke `AppModule`; **boot penuh memvalidasi DI graph**
- [x] Unit test mapper (Money) + **5 integration test** (real Postgres): auto-register, keyword lookup, agregasi, soft-delete, idempotensi
- [x] `bun run test:int` (config terpisah) + typecheck + lint bersih

**Status Phase 4: SELESAI & disetujui.**

---

## Checklist Phase 5 — Parser Module

- [x] Port `MessageParser` (abstract + `ParseInput`) — async, siap driver AI
- [x] `ParsedIntent` discriminated union (11 intent) + enum `IntentType`/`SummaryPeriod`
- [x] `RuleBasedParser` (driver `rule`) — deterministik, pure, tanpa DB
- [x] **Amount tokenizer**: `25rb`, `25 rb`, `25 ribu`, `25000`, `25.000`, `2 juta`, `2jt`, `100k`, `1,5jt`, `Rp 25.000`; guard `25kg`≠25000
- [x] **Date tokenizer**: `hari ini`, `kemarin`, `kemarin lusa`, `N hari lalu`, `minggu lalu`, `senin lalu`, weekday, `besok` (sadar timezone)
- [x] Klasifikasi intent: record (income/expense), summary, budget, edit, delete, reminder, export, help, greeting, amount-only, unknown
- [x] Description cleaning (stopwords) + ekstraksi **category keywords** (phrase + tokens) untuk resolusi di service layer
- [x] Clarification: amount null → RecordTransaction (minta harga); bare amount → AmountOnly
- [x] `ParserModule` — factory DI berbasis `PARSER_DRIVER` (extensible openai/gemini/ollama)
- [x] **91 unit test hijau** (amount, date, parser — banyak kasus ID) + typecheck + lint bersih
- [x] Boot penuh memvalidasi DI graph termasuk ParserModule

**Status Phase 5: SELESAI & disetujui.**

---

## Checklist Phase 6 — WhatsApp Gateway

- [x] Port `MessagingGateway` + tipe `IncomingMessage` (decoupled dari Baileys)
- [x] `BaileysGateway`: koneksi nyata, **QR di terminal** (qrcode-terminal), persistensi session (`useMultiFileAuthState`), auto-reconnect **exponential backoff** (skip saat loggedOut)
- [x] Ekstraksi pesan (conversation/extendedText/caption), skip group/status/fromMe, normalisasi nomor
- [x] `sendText` + `sendDocument` (untuk export CSV nanti)
- [x] `IncomingMessageHandler`: dedupe → auto-register user → audit MESSAGE_IN → parse → reply → audit MESSAGE_OUT
- [x] `MessageDedupeService` (bounded) — idempotensi event
- [x] `ReplyBuilder` — onboarding, help, ack transaksi, clarification, fallback (Indonesia)
- [x] `WA_AUTOSTART` config (boot tanpa WA untuk test/CI)
- [x] WhatsApp health indicator (status non-kritis, /health tetap 200)
- [x] **102 unit test hijau** (dedupe, reply-builder, handler end-to-end dengan fake gateway) + typecheck + lint bersih
- [x] Boot penuh terverifikasi; gateway live-connect ke server WA + backoff bekerja (QR final butuh scan di lingkungan Anda)

**Status Phase 6: SELESAI & disetujui.**

---

## Checklist Phase 7 — Domain Modules

- [x] `CategoryResolver` — keyword parser → `Category` (coba tiap keyword, fallback Lainnya/Pemasukan Lain)
- [x] `TransactionService` — `record` (resolusi kategori + create + audit + idempotensi `wa_message_id`), `editLast`, `deleteLast` (soft-delete)
- [x] `CommandRouter` — intent → aksi service → balasan; fallback ReplyBuilder untuk intent lain
- [x] ReplyBuilder balasan sukses nyata ("✅ Berhasil dicatat", edit, hapus, "Berapa harganya?")
- [x] Handler pakai router; skip balasan kosong (idempoten)
- [x] **`CategorySeederService`** — seed kategori sistem idempoten saat bootstrap (out-of-the-box di semua environment); data seed bersama `seed-data.ts`
- [x] **117 unit test hijau** (CategoryResolver, TransactionService, CommandRouter, handler) + typecheck + lint bersih
- [x] **Verifikasi LIVE WhatsApp**: `beli bakso 20rb` → tercatat `EXPENSE 20.000 "bakso" → Makanan 🍜`, audit `MESSAGE_IN → TX_CREATE → MESSAGE_OUT`, bot balas "✅ Berhasil dicatat"

**Status Phase 7: SELESAI & disetujui.**

---

## Checklist Phase 8 — Conversation Engine

- [x] `ConversationService` — state ops di atas repo (getActive/awaitAmount/awaitDeleteConfirm/clear) + TTL 5 menit
- [x] `PendingTransaction` payload (JSON di `conversation_contexts.payload`)
- [x] `MessageOrchestrator` — entry stateful tunggal (menggantikan CommandRouter):
  - [x] Flow klarifikasi: "beli kopi" → simpan konteks → "Berapa harga kopi?" → "25 ribu" → ✅ tercatat
  - [x] Konfirmasi hapus: "hapus" → "Yakin? ya/tidak" → "ya"/"tidak"
  - [x] Ganti topik saat menunggu → konteks dibersihkan, perintah baru diproses
  - [x] Konteks otomatis IDLE + TTL expiry
- [x] `TransactionService.getLast` untuk prompt konfirmasi
- [x] **118 unit test hijau** (orchestrator: klarifikasi, complete, ganti topik, konfirmasi ya/tidak) + typecheck + lint
- [x] **Verifikasi LIVE**: klarifikasi merekam `kopi 25.000`, konfirmasi menghapusnya (soft-delete), konteks kembali IDLE, audit lengkap

**Status Phase 8: SELESAI — menunggu approval untuk lanjut ke Phase 9.**

> Catatan verifikasi awal: di sandbox `405 Connection Failure` (IP datacenter) → gateway reconnect backoff sesuai desain.

### Fix penting dari live-testing (terverifikasi jalan end-to-end)

- **405 Connection Failure** → panggil `fetchLatestBaileysVersion()` dan teruskan versi WA Web terbaru ke socket (versi bawaan usang ditolak WhatsApp).
- **Alamat `@lid`** → WhatsApp modern mengirim pesan via `@lid` (privacy), bukan `@s.whatsapp.net`. Gateway kini menerima keduanya, menyimpan `chatJid` asli, dan **membalas ke `remoteJid` asli** (bukan rekonstruksi nomor).
- **Self-chat + anti-loop** → memproses chat "message yourself" (deteksi nomor sendiri) dengan pelacakan `sentIds` agar balasan bot tak diproses ulang. (Catatan: self-chat via `@lid` kadang gagal dekripsi tepat setelah pairing — jalur antar-nomor lebih andal.)
- **Verifikasi nyata**: pesan `beli kopi 25rb` dari nomor lain → user auto-register (`walid`), audit `MESSAGE_IN`/`MESSAGE_OUT`, bot membalas onboarding + "📝 Dimengerti: Pengeluaran Rp25.000 — kopi". ✅

---

## Definition of Done (berlaku tiap phase)

1. Kode lulus `lint` + `format` + `typecheck`.
2. Test relevan hijau (unit/e2e sesuai phase).
3. `docker compose up -d` tetap berjalan (mulai Phase 2).
4. Perubahan terdokumentasi + checklist phase ditandai.
5. Tidak ada secret ter-commit; `.env` via `.env.example`.

---

## Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Baileys ToS / nomor ke-ban | Layanan mati | Abstraksi channel; siap migrasi WA Cloud API; hormati rate-limit |
| Bun runtime + Baileys inkompatibel | Bug sulit dilacak | App runtime di Node LTS; Bun untuk tooling |
| Parser rule-based meleset pola baru | UX buruk | Tokenizer modular + unit test + fallback "tidak paham, coba format: ..." |
| Scheduler ganda saat scale-out | Notifikasi dobel | MVP single-instance; roadmap ke BullMQ+Redis |
| Data keuangan sensitif | Privasi | Akses per wa_number; redaksi log; secrets di env |
