# Rebuild Log: Phase 107 - PDKT Evaluation Sharing & Access Control Fix

## Deskripsi Fitur
Memperbaiki masalah akses hasil analisis/evaluasi AI PDKT untuk non-owner ketika mailbox simulasi dibagikan secara global (shared mailbox model).

---

## Masalah Utama
Setelah migrasi `20260603090000_pdkt_shared_mailbox_policy.sql`, mailbox PDKT bersifat shared (semua user authenticated bisa melihat dan membalas email). Namun, tabel `pdkt_history` masih dikunci menggunakan RLS owner-only (`auth.uid() = user_id`).

Ketika User B membalas email simulasi yang dibuat oleh User A, row `pdkt_history` dicatat dengan `user_id = B`. Saat User A (atau user non-owner lainnya) melihat email simulasi tersebut, frontend melakukan polling `/pdkt/history/eval/:id` menggunakan JWT milik User A. Karena RLS memblokir query, API mengembalikan error `404` / "History not found or access denied", menyebabkan loading spinner di UI terus berputar tanpa akhir.

---

## Solusi Implementasi

### 1. Backend Route Guard (`apps/api`)
- **`apps/api/src/routes/pdkt/history.ts`**:
  - Mengubah handler `GET /eval/:id` dan `POST /retry-eval` untuk menggunakan pemeriksaan akses dua lapis (two-tier access check).
  - Pertama, mencoba memuat data via `userClient` (JWT user saat ini) yang menghormati RLS. Jika sukses, data langsung dikembalikan.
  - Kedua, jika RLS memblokir (owner-only), backend melakukan fallback query via `userClient` ke tabel `pdkt_mailbox_items` untuk memverifikasi apakah ada email simulasi yang valid yang terhubung dengan `history_id` tersebut (diijinkan karena RLS `pdkt_mailbox_items` adalah `select_all`).
  - Jika item mailbox ditemukan, backend menggunakan `createAdminClient()` (Service Role) untuk memuat data evaluasi dari `pdkt_history` tanpa diblokir RLS.
  - Jika kedua langkah di atas gagal, API mengembalikan status `404` "History not found or access denied." secara aman.

### 2. Service Claiming & Retry (`apps/api`)
- **`apps/api/src/services/pdkt/evaluation-service.ts`**:
  - Menghapus filter `.eq("user_id", userId)` dari `processPdktEvaluation()` di query `pdkt_history`. Hal ini karena validasi kepemilikan dan hak akses sudah didelegasikan sepenuhnya ke route handler, sehingga worker service role dapat mengevaluasi atau memproses ulang (retry) history ID tersebut secara aman terlepas dari siapa yang memicu retry atau siapa pembuat asli history-nya.

---

## Verifikasi & Pengujian

### API E2E Tests (`pdkt-reply-route.test.ts`)
Menambahkan 4 test case baru untuk memverifikasi perilaku fallback:
- **`GET /history/eval/:id`**:
  - Mengembalikan evaluasi sukses untuk history yang tidak dimiliki (non-owned) jika terhubung ke item mailbox yang visible.
  - Mengembalikan `404` jika history tidak dimiliki dan tidak terhubung ke item mailbox apa pun yang visible.
- **`POST /history/retry-eval`**:
  - Memulai retry evaluasi sukses untuk history yang tidak dimiliki jika terhubung ke item mailbox yang visible.
  - Mengembalikan `404` jika history tidak dimiliki dan tidak terhubung ke item mailbox apa pun yang visible.

Seluruh 572 test case Vitest backend berhasil dilewati dengan status hijau.

---

## Rollback Plan

1. Kembalikan file `apps/api/src/routes/pdkt/history.ts` ke versi sebelumnya yang hanya menggunakan `userClient`.
2. Kembalikan file `apps/api/src/services/pdkt/evaluation-service.ts` untuk menyertakan kembali filter `.eq("user_id", userId)` pada query `pdkt_history`.
3. Hapus test case fallback baru dari `apps/api/src/__tests__/pdkt-reply-route.test.ts`.
