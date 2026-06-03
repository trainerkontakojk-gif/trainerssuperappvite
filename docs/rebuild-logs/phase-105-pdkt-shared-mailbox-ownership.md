# Rebuild Log: Phase 105 - PDKT Shared Mailbox Ownership Policy

## Deskripsi Fitur
Mengubah mailbox simulasi PDKT menjadi satu kotak masuk bersama (shared canonical mailbox) yang diakses oleh seluruh pengguna (admin, trainer, leader, dan agent) secara real-time. Menghapus behavior penyalinan (fanout carbon copy) per user, menampilkan metadata creator (pembuat email), serta menerapkan validasi authorization penghapusan email berbasis role di backend.

---

## Aturan Kepemilikan & Akses (PDKT Shared Mailbox)

| Role | Lihat mailbox | Buat email | Hapus email sendiri | Hapus email orang lain | Lihat creator |
| --- | --- | --- | --- | --- | --- |
| `admin` | Ya | Ya | Ya | Ya | Ya |
| `trainer` | Ya | Ya | Ya | Ya | Ya |
| `leader` | Ya | Ya | Ya | Tidak (403) | Ya |
| `agent` | Ya | Ya | Ya | Tidak (403) | Ya |

*Catatan: Role legacy (`tl`, `spv`, dan `om`) dikategorikan sebagai leader-like permissions (tidak bisa menghapus email orang lain).*

---

## Technical Design & Implementasi

### 1. Database Migrations (`supabase/migrations/20260603090000_pdkt_shared_mailbox_policy.sql`)
- **Backfill**: Mengisi field `created_by_user_id` yang kosong/null di table `pdkt_mailbox_items` dari nilai `user_id`.
- **RLS Policy**: Memperbarui select policy `pdkt_mailbox_items` agar seluruh user terautentikasi dapat membaca row mailbox canonical (`is_shared_copy = false` atau null).
- **RPC `submit_pdkt_mailbox_batch`**: Di-rewrite agar tidak melakukan fanout copy ke profiles lain saat email baru di-generate oleh admin/trainer/leader. Hanya satu row canonical saja yang diinsert.
- **RPC `submit_pdkt_mailbox_reply`**: Memodifikasi filter query select agar tidak mengunci row berdasarkan `user_id = v_user_id` (karena email dibaca bersama, siapapun agent yang pertama kali membalas akan mengubah status email menjadi `replied`).
- **RPC `soft_delete_pdkt_mailbox_item`**: Fungsi `SECURITY DEFINER` baru untuk melakukan penghapusan secara aman. Melakukan verifikasi apakah actor adalah admin/trainer atau owner pembuat email sebelum mengupdate status item menjadi `deleted`.

### 2. Backend Routes & Services (`apps/api`)
- **`mailbox-service.ts`**:
  - Menambahkan check policy helper `canDeletePdktMailboxItem(actor, item)`.
  - Batching profile query untuk menampilkan nama lengkap dan role pembuat email secara efisien.
  - Memperbarui `fetchMailboxItems` untuk melampirkan metadata `created_by_user` dan object permission `permissions.can_delete` untuk digunakan di frontend.
  - Memperbarui `softDeleteMailboxItem` agar memvalidasi permission sebelum memanggil RPC delete, melempar error status 403 jika tidak berwenang.
- **`routes/pdkt/mailbox.ts`**:
  - Mengirim context `id` dan `role` user saat memanggil service fetch dan delete.
- **`route-utils.ts`**:
  - Menangani error status custom di helper `jsonServerError` agar route meneruskan error 403 secara transparan.

### 3. Frontend UI (`apps/web`)
- **`MailboxSidebar.tsx`**:
  - Menampilkan nama pembuat dan role-nya (misal: "Dibuat oleh Siti Aminah · Trainer" atau "Dibuat oleh Anda") secara subtil di bawah snippet pesan pada list email.
- **`EmailDetailPane.tsx`**:
  - Menampilkan metadata pembuat email di bagian header pengirim.
  - Men-disable tombol delete di header detail panel jika user tidak memiliki izin menghapus (`permissions.can_delete === false`), lengkap dengan tooltip keterangan penolakan yang ramah pengguna.

---

## Verifikasi & Pengujian

### API Unit & Contract Tests (`apps/api/src/__tests__/pdkt-mailbox-permissions.test.ts`)
- Membuktikan helper `canDeletePdktMailboxItem` bertindak benar sesuai matriks otorisasi role.
- Membuktikan `fetchMailboxItems` memfilter row canonical non-deleted dan mengaitkan metadata creator serta permissions secara akurat.
- Membuktikan `softDeleteMailboxItem` mengizinkan delete bagi manager dan menolak delete bagi non-owner agent dengan error HTTP 403.
- Seluruh 57 file unit test backend API lulus pengujian (`pnpm test` -> 561/561 pass).

---

## Rollback Plan

Jika perubahan shared mailbox memunculkan regresi, rollback dilakukan bertahap dan non-destruktif:

1. Kembalikan UI creator label dan disable state delete pada `apps/web/src/routes/pdkt/components/MailboxSidebar.tsx`, `EmailDetailPane.tsx`, dan wiring di `simulation.tsx`.
2. Kembalikan service/backend ke perilaku owner-only semula di `apps/api/src/services/pdkt/mailbox-service.ts` dan `apps/api/src/routes/pdkt/mailbox.ts`.
3. Untuk rollback DB manual/staging, gunakan `supabase/rollbacks/rollback_20260603090000_pdkt_shared_mailbox_policy.sql`. File ini mengembalikan policy owner-only, RPC fanout lama, RPC reply owner-only lama, dan menghapus RPC delete shared.
4. Pertahankan data history yang sudah tersimpan; rollback hanya perlu mengubah visibility/policy mailbox, bukan menghapus data historis PDKT.
5. Setelah rollback parsial, jalankan ulang test PDKT target untuk memastikan email history dan reply flow masih stabil.
