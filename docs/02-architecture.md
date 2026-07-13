# 02 — Architecture & Tech Decisions

Project: **finance-whatsapp-bot**
Phase: 1 — Project Planning

---

## 1. Prinsip Arsitektur

Kita mengadopsi **Clean Architecture** yang dipetakan ke idiom NestJS (Module → Controller/Gateway → Service/UseCase → Repository). Tujuan: **domain tidak bergantung pada framework/infra**. WhatsApp (Baileys), Prisma, dan Parser adalah *detail* yang bisa diganti.

### Aturan dependency (dari dalam ke luar)

```
        ┌─────────────────────────────────────────────┐
        │                 DOMAIN (core)               │  Entities, Value Objects,
        │   Money, TransactionType, ParsedIntent,     │  Domain interfaces (ports)
        │   MessageParser (port), *Repository (port)  │  — TIDAK import NestJS/Prisma
        └───────────────▲─────────────────────────────┘
                        │ implements / depends
        ┌───────────────┴─────────────────────────────┐
        │             APPLICATION (use cases)         │  RecordTransaction,
        │   Orchestrasi domain, transaction script,   │  GenerateSummary,
        │   conversation state machine                │  HandleIncomingMessage
        └───────────────▲─────────────────────────────┘
                        │
        ┌───────────────┴─────────────────────────────┐
        │            INFRASTRUCTURE (adapters)        │  PrismaRepository,
        │   RuleBasedParser, BaileysGateway,          │  PinoLogger, CsvExporter,
        │   PrismaService, Scheduler                  │  Reminder cron
        └───────────────▲─────────────────────────────┘
                        │
        ┌───────────────┴─────────────────────────────┐
        │              INTERFACE / DELIVERY           │  WhatsApp Gateway (inbound),
        │   HTTP Controllers (health, admin),         │  Swagger, Nginx
        │   Whatsapp message handler                  │
        └─────────────────────────────────────────────┘
```

> Aturan emas: panah dependency selalu menunjuk **ke dalam**. Infrastruktur mengimplementasikan *port* yang dideklarasikan domain/application. Ini yang membuat `RuleBasedParser` bisa ditukar `OpenAIParser` tanpa menyentuh use case.

---

## 2. Abstraksi Parser (kunci requirement)

```ts
// domain/parser/message-parser.port.ts
export interface MessageParser {
  parse(input: ParseInput): Promise<ParsedIntent>;
}
```

- `RuleBasedParser` (MVP) — regex + kamus kata kunci + normalisasi angka/tanggal.
- Masa depan: `OpenAIParser`, `GeminiParser`, `OllamaParser` — cukup daftarkan di DI container.
- Pemilihan implementasi via **NestJS custom provider token** (`MESSAGE_PARSER`) + config env (`PARSER_DRIVER=rule|openai|...`). Caller (use case) hanya tahu interface.

Pola yang sama diterapkan untuk **channel** (`MessagingGateway` port) agar Baileys bisa diganti WhatsApp Cloud API kelak.

---

## 3. Folder Structure

```
finance-whatsapp-bot/
├── docs/                          # Dokumen perencanaan (phase 1)
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                    # seed kategori & keyword default
├── src/
│   ├── main.ts                    # bootstrap: pino, swagger, global pipe/filter
│   ├── app.module.ts
│   │
│   ├── common/                    # cross-cutting (framework-aware)
│   │   ├── filters/               # GlobalExceptionFilter
│   │   ├── interceptors/          # LoggingInterceptor, correlation-id
│   │   ├── pipes/                 # ValidationPipe config
│   │   ├── decorators/
│   │   └── constants/
│   │
│   ├── config/                    # ConfigModule, schema validasi env (zod/joi)
│   │   ├── config.module.ts
│   │   ├── configuration.ts
│   │   └── env.validation.ts
│   │
│   ├── database/                  # PrismaModule + PrismaService
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   │
│   ├── shared/                    # domain-agnostic pure helpers
│   │   └── utils/                 # money, date, string normalizer
│   │
│   └── modules/
│       ├── whatsapp/              # DELIVERY: Baileys gateway + message router
│       │   ├── whatsapp.module.ts
│       │   ├── gateways/baileys.gateway.ts
│       │   ├── ports/messaging.gateway.port.ts
│       │   └── handlers/incoming-message.handler.ts   # orchestrator masuk
│       │
│       ├── parser/                # PARSER abstraction + rule-based impl
│       │   ├── parser.module.ts
│       │   ├── ports/message-parser.port.ts
│       │   ├── rule-based/rule-based.parser.ts
│       │   ├── rule-based/amount.tokenizer.ts
│       │   ├── rule-based/date.tokenizer.ts
│       │   └── rule-based/category.matcher.ts
│       │
│       ├── conversation/          # state machine konteks percakapan
│       │   ├── conversation.module.ts
│       │   ├── conversation.service.ts
│       │   └── entities/conversation-context.entity.ts
│       │
│       ├── user/
│       ├── transaction/
│       ├── category/
│       ├── budget/
│       ├── report/                # summary + export csv
│       ├── reminder/              # scheduler
│       └── health/                # @nestjs/terminus
│
├── test/                          # e2e
├── nginx/                         # reverse proxy config
├── docker-compose.yml
├── docker-compose.prod.yml
├── Dockerfile
├── .env.example
├── .env.development
├── .env.production                # (git-ignored)
├── eslint.config.mjs
├── .prettierrc
├── tsconfig.json
└── package.json
```

Setiap modul mengikuti pola internal: `*.module.ts`, `*.controller.ts` (bila ada HTTP), `*.service.ts` (use case), `ports/` (interface), `dto/` (class-validator), `entities/`.

---

## 4. Tech Decisions (dengan trade-off & rekomendasi)

### 4.1 Runtime & Package Manager — **Bun**
- ✅ Sangat cepat untuk install & test; sesuai permintaan.
- ⚠️ Trade-off: Baileys + beberapa dependency NestJS diuji terutama di Node. Ada risiko edge-case di runtime Bun.
- **KEPUTUSAN FINAL (disetujui):** **Bun sebagai package manager & test runner**, aplikasi berjalan di **Node.js LTS** di dalam container untuk stabilitas Baileys. (`bun install` untuk deps, runtime `node dist/main.js`.) Dockerfile berbasis image Node. Dapat dievaluasi ulang bila Bun runtime terbukti stabil dengan Baileys.

### 4.2 WhatsApp — **Baileys**
- ✅ Gratis, tanpa Meta Business approval, cepat untuk MVP.
- ⚠️ Unofficial (risiko ToS, nomor bisa ke-banned), session butuh QR scan & persistensi auth state.
- **Rekomendasi:** kunci di balik port `MessagingGateway`. Persist auth state ke volume (bukan ephemeral). Siapkan jalur migrasi ke **WhatsApp Cloud API** untuk produksi serius.

### 4.3 ORM — **Prisma**
- ✅ Type-safe, migration workflow bagus, DX unggul.
- ⚠️ Kurang cocok untuk query super-dinamis/kompleks; Decimal perlu perhatian.
- **Rekomendasi:** Prisma untuk semua akses data. Bungkus di **Repository port** agar domain tak tahu Prisma. Pakai tipe `Decimal` untuk uang.

### 4.4 Parser — **Rule-Based (regex + dictionary)**
- ✅ Deterministik, cepat, tanpa biaya, tanpa dependency AI (sesuai batasan).
- ⚠️ Terbatas pada pola yang didefinisikan; bahasa alami bebas bisa meleset.
- **Rekomendasi:** implementasi rule-based modular (tokenizer angka, tanggal, kategori terpisah) di balik `MessageParser` port. Uji unit ekstensif. AI parser menyusul.

### 4.5 Validation — **class-validator + class-transformer**
- Dipakai untuk DTO HTTP (admin/health) dan validasi env. Untuk pesan WA yang bebas-teks, validasi dilakukan di layer parser (hasil `ParsedIntent` divalidasi sebelum persist).

### 4.6 Logging — **Pino** (`nestjs-pino`)
- ✅ Sangat cepat, JSON terstruktur, cocok untuk observability & aggregasi log.
- **Rekomendasi:** correlation-id per pesan WA; redaksi field sensitif; pretty-print di dev, JSON di prod.

### 4.7 Scheduler (reminder) — **@nestjs/schedule**
- ✅ Native cron di NestJS, cukup untuk MVP single-instance.
- ⚠️ Tidak tahan multi-instance (job ganda). 
- **KEPUTUSAN FINAL (disetujui):** MVP pakai **@nestjs/schedule** (single-instance, tanpa Redis). Reminder service didesain di balik interface agar, saat scale-out, mudah migrasi ke **BullMQ + Redis** (queue tahan-restart, distributed) tanpa mengubah caller.

### 4.8 Reverse Proxy — **Nginx**
- Terminasi TLS, rate-limit dasar, serve `/health` & Swagger, proxy ke app. Baileys sendiri outbound (WebSocket ke WA), jadi Nginx utamanya untuk HTTP admin/health/webhook masa depan.

### 4.9 Config — **@nestjs/config + validasi schema**
- Semua nilai dari `.env`, tervalidasi saat bootstrap (fail-fast bila env kurang). Pisah `.env.development` / `.env.production`.

---

## 5. Konsistensi SOLID

- **S**RP: parser dipecah per-tanggung-jawab (amount/date/category), service tipis.
- **O**CP: parser & gateway extensible via port tanpa modifikasi caller.
- **L**SP: semua implementasi `MessageParser` patuh kontrak `ParsedIntent`.
- **I**SP: port kecil & fokus (`MessageParser`, `MessagingGateway`, `TransactionRepository`).
- **D**IP: use case bergantung pada abstraksi (token DI), bukan implementasi konkret.

---

## 6. Idempotensi & Reliability

- Setiap pesan WA punya `messageId`. Handler cek dedupe (unique index) agar retry/reconnect tak menggandakan transaksi.
- Baileys auto-reconnect dengan backoff; auth state dipersist ke volume.
- Graceful shutdown (NestJS lifecycle) untuk menutup koneksi WA & Prisma rapi.
