# finance-whatsapp-bot

Chatbot pencatatan keuangan berbasis **WhatsApp** — rule-based parser, Clean Architecture, NestJS.
User cukup chat WhatsApp (mis. `beli kopi 25rb`) dan bot mencatat ke database. Tanpa login, tanpa AI API.

> Status: **Phase 2 — Environment Setup**. Lihat `docs/` untuk perencanaan lengkap.

## Tech Stack

NestJS · TypeScript (strict) · Prisma · PostgreSQL · Baileys · Pino · Swagger · Docker · Nginx · Bun (tooling) · Node 20 (runtime)

## Prasyarat

- Docker & Docker Compose, atau
- Bun ≥ 1.3 + Node ≥ 20 + PostgreSQL (untuk dev di host)

## Menjalankan dengan Docker (rekomendasi)

```bash
cp .env.example .env      # sesuaikan kredensial
docker compose up -d      # postgres + app + nginx
```

- App (via Nginx): http://localhost/
- Health: http://localhost/health
- Swagger: http://localhost/docs

## Menjalankan di host (dev)

```bash
bun install
# pastikan PostgreSQL jalan & DATABASE_URL benar di .env.development
bun run prisma:generate
bun run prisma:migrate
bun run start:dev
```

- App: http://localhost:3000/
- Health: http://localhost:3000/health
- Swagger: http://localhost:3000/docs

## Script Penting

| Script | Fungsi |
|---|---|
| `bun run start:dev` | Dev server (watch) |
| `bun run build` | Build produksi |
| `bun run lint` | ESLint + fix |
| `bun run format` | Prettier |
| `bun run typecheck` | Type check |
| `bun run test` | Unit test (Jest) |
| `bun run prisma:migrate` | Migration dev |
| `bun run prisma:studio` | Prisma Studio |

## Struktur

Lihat [docs/02-architecture.md](docs/02-architecture.md).
