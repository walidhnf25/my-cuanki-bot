# 01 — Requirements Analysis

Project: **finance-whatsapp-bot**
Phase: 1 — Project Planning
Status: Draft (awaiting approval)

---

## 1. Ringkasan Produk

Chatbot pencatatan keuangan pribadi yang berjalan **100% di dalam WhatsApp**. User mengirim pesan natural bahasa Indonesia (mis. "beli kopi 25rb"), bot mem-parsing pesan tersebut secara **rule-based** (tanpa AI API eksternal), mencatat ke database, dan membalas konfirmasi. Identitas user = **nomor WhatsApp** (tanpa login/register/password).

## 2. Stakeholder & Aktor

| Aktor | Deskripsi |
|---|---|
| **End User** | Individu yang mencatat keuangannya via WhatsApp |
| **System (Bot)** | Menerima pesan, parsing, mencatat, membalas |
| **Admin/Operator** | Memantau health, logs, menjalankan migration (via Swagger/CLI/VPS) |

Tidak ada peran multi-tenant/organisasi pada MVP — setiap nomor WA adalah satu akun personal.

---

## 3. Functional Requirements (FR)

### FR-1 — Onboarding & Auto-Register
- FR-1.1 Saat pesan pertama dari nomor baru diterima, sistem membuat `User` otomatis.
- FR-1.2 Bot mengirim pesan sambutan + contoh cara pakai pada interaksi pertama.
- FR-1.3 User default diberi mata uang `IDR` dan timezone `Asia/Jakarta`.

### FR-2 — Catat Pengeluaran (Expense)
- FR-2.1 Parsing pesan seperti "beli kopi 25rb", "isi bensin 100k", "makan siang 30 ribu".
- FR-2.2 Ekstrak: nominal, deskripsi, kategori (otomatis), tanggal (default: hari ini).
- FR-2.3 Simpan sebagai transaksi bertipe `EXPENSE`.
- FR-2.4 Balas konfirmasi ringkas (✅ + ringkasan yang tercatat).

### FR-3 — Catat Pemasukan (Income)
- FR-3.1 Parsing pesan seperti "gaji 8 juta", "bonus 500rb", "dapat uang 200 ribu".
- FR-3.2 Simpan sebagai transaksi bertipe `INCOME`.

### FR-4 — Klarifikasi (Conversation Context)
- FR-4.1 Jika nominal tidak ditemukan (mis. "beli kopi"), bot bertanya "Berapa harganya?".
- FR-4.2 Sistem menyimpan konteks percakapan (pending transaction) per user.
- FR-4.3 Balasan user berikutnya ("25 ribu") melengkapi transaksi yang tertunda.
- FR-4.4 Konteks kedaluwarsa setelah TTL (mis. 5 menit) atau saat user mengirim perintah lain.

### FR-5 — Edit Transaksi
- FR-5.1 User dapat mengedit transaksi terakhir ("edit jadi 30rb", "ubah kategori transport").
- FR-5.2 Sistem mendukung referensi transaksi terakhir & (opsional) by-id.

### FR-6 — Hapus Transaksi
- FR-6.1 User dapat menghapus transaksi terakhir ("hapus", "batal").
- FR-6.2 Soft-delete (audit-friendly), bukan hard-delete.

### FR-7 — Kategori Otomatis
- FR-7.1 Sistem memetakan kata kunci → kategori (kopi/bakso → Food, pertalite → Transport, gaji → Income).
- FR-7.2 Kategori seed default tersedia; extensible via tabel `categories`.
- FR-7.3 Jika tak ada kecocokan → kategori `Uncategorized`/`Lainnya`.

### FR-8 — Ringkasan (Summary)
- FR-8.1 Summary harian ("ringkasan hari ini").
- FR-8.2 Summary mingguan ("ringkasan minggu ini").
- FR-8.3 Summary bulanan ("ringkasan bulan ini").
- FR-8.4 Menampilkan total pemasukan, total pengeluaran, saldo bersih, dan breakdown per kategori.

### FR-9 — Budget
- FR-9.1 User set budget per kategori/periode ("budget makan 2 juta").
- FR-9.2 Sistem melacak pemakaian vs budget.
- FR-9.3 Bot memberi peringatan saat pemakaian mendekati/melebihi budget (mis. ≥80%, ≥100%).

### FR-10 — Reminder
- FR-10.1 User set reminder ("ingatkan bayar listrik tiap tanggal 5").
- FR-10.2 Scheduler mengirim pesan WA pada waktunya.

### FR-11 — Export CSV
- FR-11.1 User meminta export ("export bulan ini").
- FR-11.2 Sistem menghasilkan file CSV dan mengirimnya sebagai dokumen WA.

### FR-12 — Health Check
- FR-12.1 Endpoint `GET /health` melaporkan status app, DB, dan koneksi WhatsApp.

### FR-13 — Logging & Audit
- FR-13.1 Semua pesan masuk/keluar dan aksi penting dicatat (`audit_logs`).
- FR-13.2 Logging terstruktur (JSON) via Pino.

### FR-14 — Bantuan / Help
- FR-14.1 Perintah "help"/"bantuan"/"menu" menampilkan daftar kemampuan bot.

---

## 4. Non-Functional Requirements (NFR)

| Kode | Kategori | Requirement |
|---|---|---|
| NFR-1 | **Performance** | Waktu respons bot ≤ 2 detik untuk operasi parsing+DB pada kondisi normal. |
| NFR-2 | **Scalability** | Arsitektur modular; parser & channel dapat diskalakan/diganti tanpa mengubah domain. |
| NFR-3 | **Maintainability** | Clean Architecture + SOLID; coverage unit test parser & service inti ≥ 80%. |
| NFR-4 | **Extensibility** | `MessageParser` sebagai abstraksi; implementasi baru (AI) plug-in tanpa ubah caller. |
| NFR-5 | **Reliability** | Baileys auto-reconnect; idempotensi pemrosesan pesan (dedupe by message id). |
| NFR-6 | **Security** | Tidak menyimpan kredensial di kode; secrets via `.env`; input divalidasi. |
| NFR-7 | **Observability** | Structured logging, correlation id per pesan, health endpoint. |
| NFR-8 | **Portability** | Fully containerized (Docker Compose): app + postgres + nginx. |
| NFR-9 | **Data Integrity** | Transaksi finansial pakai `Decimal`, bukan float. Soft-delete + audit trail. |
| NFR-10 | **Localization** | Bahasa Indonesia; timezone & currency per user; default `Asia/Jakarta`/`IDR`. |
| NFR-11 | **Privacy** | Data keuangan pribadi; akses hanya oleh pemilik nomor WA. |
| NFR-12 | **Availability** | Target 99% (single VPS MVP); graceful shutdown & restart policy. |

---

## 5. Use Cases (Ringkas)

| ID | Use Case | Aktor | Trigger |
|---|---|---|---|
| UC-01 | Auto-register user baru | System | Pesan pertama dari nomor baru |
| UC-02 | Catat pengeluaran | User | Kirim pesan pengeluaran |
| UC-03 | Catat pemasukan | User | Kirim pesan pemasukan |
| UC-04 | Klarifikasi data kurang | System | Nominal/field wajib tidak lengkap |
| UC-05 | Edit transaksi | User | Kirim perintah edit |
| UC-06 | Hapus transaksi | User | Kirim perintah hapus/batal |
| UC-07 | Lihat ringkasan | User | Kirim perintah ringkasan |
| UC-08 | Kelola budget | User | Kirim perintah budget |
| UC-09 | Set reminder | User | Kirim perintah reminder |
| UC-10 | Export CSV | User | Kirim perintah export |
| UC-11 | Bantuan | User | Kirim "help" |
| UC-12 | Health check | Operator | HTTP GET /health |

### Contoh alur (UC-02 dengan klarifikasi — UC-04)

```
User : beli kopi
Bot  : ☕ Berapa harganya?
User : 25 ribu
Bot  : ✅ Tercatat: Pengeluaran Rp25.000 — Kopi (Makanan), hari ini.
```

---

## 6. Out of Scope (MVP)

- Multi-currency conversion real-time.
- Multi-user/keluarga (shared wallet).
- Web dashboard/mobile app (nanti; API sudah disiapkan).
- AI/NLP parser (disiapkan abstraksinya, implementasi menyusul).
- Rekonsiliasi bank / integrasi payment gateway.

---

## 7. Asumsi & Batasan

- Satu nomor WA = satu user personal.
- WhatsApp via **Baileys (unofficial)** — ada risiko ToS & rate-limit; diterima untuk MVP, migrasi ke WhatsApp Cloud API dimungkinkan lewat abstraksi channel.
- Bahasa input utama: Indonesia (informal, singkatan umum).
- Nominal dalam Rupiah, tanpa desimal sen pada input umum (Decimal tetap dipakai di DB).
