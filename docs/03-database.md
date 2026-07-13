# 03 — Database Design & ERD

Project: **finance-whatsapp-bot**
Phase: 1 — Project Planning
DB: PostgreSQL · ORM: Prisma

---

## 1. ERD

```mermaid
erDiagram
    USERS ||--o{ TRANSACTIONS : has
    USERS ||--o{ BUDGETS : sets
    USERS ||--o{ REMINDERS : schedules
    USERS ||--o| CONVERSATION_CONTEXTS : holds
    USERS ||--o{ AUDIT_LOGS : generates
    CATEGORIES ||--o{ TRANSACTIONS : classifies
    CATEGORIES ||--o{ BUDGETS : limits
    CATEGORIES ||--o{ CATEGORY_KEYWORDS : matched_by

    USERS {
        uuid id PK
        string wa_number UK "nomor WA, unik"
        string display_name
        string currency "default IDR"
        string timezone "default Asia/Jakarta"
        bool is_onboarded
        datetime created_at
        datetime updated_at
    }

    CATEGORIES {
        uuid id PK
        uuid user_id FK "null = global/seed"
        string name
        enum type "INCOME|EXPENSE"
        string icon
        bool is_system
        datetime created_at
    }

    CATEGORY_KEYWORDS {
        uuid id PK
        uuid category_id FK
        string keyword UK "mis. kopi, bakso, pertalite"
    }

    TRANSACTIONS {
        uuid id PK
        uuid user_id FK
        uuid category_id FK
        enum type "INCOME|EXPENSE"
        decimal amount "Decimal(18,2)"
        string description
        string note
        date occurred_at "tanggal transaksi"
        string source_message "teks asli WA"
        string wa_message_id UK "idempotensi"
        datetime deleted_at "soft delete"
        datetime created_at
        datetime updated_at
    }

    BUDGETS {
        uuid id PK
        uuid user_id FK
        uuid category_id FK "null = total"
        decimal amount "Decimal(18,2)"
        enum period "DAILY|WEEKLY|MONTHLY"
        int alert_threshold "persen, default 80"
        datetime created_at
        datetime updated_at
    }

    REMINDERS {
        uuid id PK
        uuid user_id FK
        string title
        string cron_expression "jadwal"
        datetime next_run_at
        bool is_active
        datetime last_sent_at
        datetime created_at
    }

    CONVERSATION_CONTEXTS {
        uuid id PK
        uuid user_id FK UK "1:1 aktif per user"
        string state "IDLE|AWAITING_AMOUNT|AWAITING_..."
        json payload "partial ParsedIntent"
        datetime expires_at "TTL"
        datetime updated_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        string action "MESSAGE_IN|MESSAGE_OUT|TX_CREATE|..."
        json metadata
        datetime created_at
    }
```

---

## 2. Keputusan Desain Skema

| Keputusan | Alasan / Trade-off |
|---|---|
| **UUID** sebagai PK | Aman diekspos, tak bocorkan volume, mudah merge/scale. Trade-off: index sedikit lebih besar dari bigint — dapat diterima. |
| **Decimal(18,2)** untuk uang | Hindari galat floating-point pada nilai finansial (NFR-9). Prisma `Decimal`. |
| **Soft delete** (`deleted_at`) pada transaksi | Audit-friendly, mendukung "hapus/batal" reversibel & FR-13. Query default memfilter `deleted_at IS NULL`. |
| **`wa_message_id` unique** | Idempotensi pemrosesan pesan (NFR-5) — cegah duplikasi saat reconnect/retry. |
| **`category_keywords` terpisah** | Kategori otomatis extensible tanpa ubah kode (FR-7). Seed default + bisa ditambah per user. |
| **`categories.user_id` nullable** | `null` = kategori sistem global (seed); non-null = kategori custom user. `is_system` menandai seed. |
| **`conversation_contexts` 1:1 per user + `expires_at`** | State machine klarifikasi (FR-4). TTL agar konteks basi otomatis gugur. |
| **`reminders.cron_expression` + `next_run_at`** | Fleksibel (harian/mingguan/tanggal tertentu). `next_run_at` mempercepat query scheduler. |
| **`source_message`** disimpan | Untuk audit, debugging parser, dan bahan training AI parser di masa depan. |
| **`audit_logs`** append-only | Jejak semua aksi penting (NFR-7). |

---

## 3. Enum

```prisma
enum TransactionType { INCOME EXPENSE }
enum BudgetPeriod    { DAILY WEEKLY MONTHLY }
enum ConversationState { IDLE AWAITING_AMOUNT AWAITING_CATEGORY AWAITING_CONFIRM AWAITING_DELETE_CONFIRM }
```

---

## 4. Index Penting

- `users.wa_number` — UNIQUE (lookup utama tiap pesan).
- `transactions (user_id, occurred_at)` — untuk summary/laporan periode.
- `transactions.wa_message_id` — UNIQUE (idempotensi).
- `transactions (user_id, category_id, occurred_at)` — budget tracking.
- `category_keywords.keyword` — pencarian kategori.
- `reminders (is_active, next_run_at)` — polling scheduler.
- `conversation_contexts.user_id` — UNIQUE.

---

## 5. Strategi Migration & Seed

- **Migration:** `prisma migrate dev` (development) → `prisma migrate deploy` (production, di container startup).
- **Seed** (`prisma/seed.ts`):
  - Kategori sistem: Makanan, Transportasi, Belanja, Tagihan, Hiburan, Kesehatan, Gaji, Bonus, Lainnya.
  - Keyword mapping awal:
    - Food ← kopi, bakso, mie ayam, nasi, makan, jajan, gofood
    - Transport ← pertalite, pertamax, solar, bensin, grab, gojek, parkir, tol
    - Income ← gaji, salary, bonus, thr, gaji, transfer masuk
- Seed idempoten (upsert by unique key) agar aman dijalankan ulang.

---

## 6. Integritas & Konsistensi

- FK dengan `onDelete: Restrict` untuk kategori sistem, `Cascade` untuk data milik user saat user dihapus (jika fitur hapus akun ditambahkan).
- Semua penulisan transaksi finansial dalam **satu Prisma transaction** (mis. buat transaksi + update audit log + evaluasi budget) agar atomic.
- Timezone: simpan `occurred_at` sebagai `date` (tanggal lokal user) dan timestamp UTC untuk `created_at`; konversi pakai `users.timezone`.
