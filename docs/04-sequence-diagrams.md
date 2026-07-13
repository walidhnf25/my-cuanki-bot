# 04 — Sequence Diagrams

Project: **finance-whatsapp-bot**
Phase: 1 — Project Planning

---

## 1. Alur Utama: Pesan Masuk → Catat Transaksi

```mermaid
sequenceDiagram
    actor U as User (WhatsApp)
    participant B as BaileysGateway
    participant H as IncomingMessageHandler
    participant CV as ConversationService
    participant P as MessageParser (RuleBased)
    participant UC as RecordTransactionUseCase
    participant R as Repositories (Prisma)
    participant DB as PostgreSQL

    U->>B: "beli kopi 25rb"
    B->>H: onMessage(waNumber, text, messageId)
    H->>R: findOrCreateUser(waNumber)
    R->>DB: SELECT/INSERT user
    DB-->>R: user
    H->>CV: getActiveContext(userId)
    CV-->>H: IDLE (tidak ada pending)
    H->>P: parse({text, user})
    P-->>H: ParsedIntent{type:EXPENSE, amount:25000, category:Food, date:today}
    alt data lengkap
        H->>UC: execute(intent, messageId)
        UC->>R: create transaction (+audit, +budget eval) [TX]
        R->>DB: INSERT (atomic)
        DB-->>R: ok
        UC-->>H: TransactionResult
        H->>B: reply("✅ Tercatat: ...")
        B-->>U: konfirmasi
    else data kurang (mis. amount null)
        H->>CV: setContext(userId, AWAITING_AMOUNT, payload)
        H->>B: reply("Berapa harganya?")
        B-->>U: pertanyaan
    end
```

---

## 2. Alur Klarifikasi (Conversation Context)

```mermaid
sequenceDiagram
    actor U as User
    participant H as IncomingMessageHandler
    participant CV as ConversationService
    participant P as MessageParser
    participant UC as RecordTransactionUseCase

    U->>H: "beli kopi"
    H->>P: parse("beli kopi")
    P-->>H: {type:EXPENSE, desc:"kopi", amount:null}
    H->>CV: setContext(AWAITING_AMOUNT, {desc:"kopi", category:Food})
    H-->>U: "☕ Berapa harganya?"

    U->>H: "25 ribu"
    H->>CV: getActiveContext(userId)
    CV-->>H: AWAITING_AMOUNT + payload{desc:"kopi"}
    H->>P: parseAmountOnly("25 ribu")
    P-->>H: 25000
    H->>UC: execute(merge(payload, amount))
    UC-->>H: ok
    H->>CV: clearContext(userId)
    H-->>U: "✅ Tercatat: Pengeluaran Rp25.000 — Kopi (Makanan)"
```

> Catatan: konteks punya `expires_at` (TTL). Jika user justru mengirim perintah lain (mis. "ringkasan bulan ini"), handler mendeteksi intent baru berprioritas dan meng-clear konteks pending.

---

## 3. Alur Ringkasan (Summary)

```mermaid
sequenceDiagram
    actor U as User
    participant H as IncomingMessageHandler
    participant P as MessageParser
    participant RS as ReportService
    participant R as TransactionRepository
    participant DB as PostgreSQL

    U->>H: "ringkasan bulan ini"
    H->>P: parse(...)
    P-->>H: {intent: SUMMARY, period: MONTH}
    H->>RS: generateSummary(userId, MONTH)
    RS->>R: aggregate income/expense by category [range]
    R->>DB: SELECT SUM(...) GROUP BY category
    DB-->>R: rows
    R-->>RS: aggregates
    RS-->>H: formatted summary
    H-->>U: "📊 Juli 2026\nMasuk: Rp8.000.000\nKeluar: Rp3.250.000\nSaldo: Rp4.750.000\nTop: Makanan Rp1.2jt ..."
```

---

## 4. Alur Budget Alert

```mermaid
sequenceDiagram
    participant UC as RecordTransactionUseCase
    participant BR as BudgetRepository
    participant N as Notifier (Gateway)

    UC->>BR: getBudget(userId, category, period)
    BR-->>UC: budget{amount, threshold, used}
    UC->>UC: hitung used+amount vs budget
    alt melewati threshold/limit
        UC->>N: send("⚠️ Budget Makanan 85% terpakai (Rp1.7jt/2jt)")
    end
```

---

## 5. Alur Reminder (Scheduler)

```mermaid
sequenceDiagram
    participant S as ReminderScheduler (@nestjs/schedule)
    participant RR as ReminderRepository
    participant G as MessagingGateway

    loop setiap menit
        S->>RR: findDue(now)
        RR-->>S: [reminders due]
        loop tiap reminder
            S->>G: sendMessage(waNumber, title)
            S->>RR: update(next_run_at, last_sent_at)
        end
    end
```

---

## 6. Alur Export CSV

```mermaid
sequenceDiagram
    actor U as User
    participant H as IncomingMessageHandler
    participant EX as CsvExportService
    participant R as TransactionRepository
    participant G as MessagingGateway

    U->>H: "export bulan ini"
    H->>EX: export(userId, MONTH)
    EX->>R: findMany(range)
    R-->>EX: transactions
    EX->>EX: build CSV buffer
    EX->>G: sendDocument(waNumber, csvBuffer, "laporan-juli.csv")
    G-->>U: file CSV
```

---

## 7. Alur Health Check

```mermaid
sequenceDiagram
    actor Op as Operator/Monitoring
    participant NG as Nginx
    participant HC as HealthController (Terminus)
    participant DB as PostgreSQL
    participant WA as BaileysGateway

    Op->>NG: GET /health
    NG->>HC: proxy
    HC->>DB: ping
    HC->>WA: connection status
    HC-->>Op: 200 {db:up, whatsapp:connected, uptime}
```
