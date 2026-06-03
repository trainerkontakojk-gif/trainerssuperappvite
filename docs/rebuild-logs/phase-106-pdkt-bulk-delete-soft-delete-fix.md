# Rebuild Log: Phase 106 - PDKT Bulk Delete & Soft Delete RPC Fix

## Deskripsi Fitur
Menambahkan fitur hapus massal (bulk delete) email di mailbox PDKT dan memperbaiki RPC `soft_delete_pdkt_mailbox_item` untuk menangani data legacy dimana `created_by_user_id` bernilai NULL.

---

## Backward Compatibility Fix: Soft Delete RPC

RPC `soft_delete_pdkt_mailbox_item` sebelumnya menggunakan `SELECT created_by_user_id INTO v_creator_id` yang gagal untuk row legacy (migrasi dari sistem fanout lama) dimana kolom `created_by_user_id` masih NULL. Akibatnya, user biasa tidak bisa menghapus email miliknya sendiri karena `v_creator_id` bernilai NULL.

**Fix**: Mengganti query SELECT menjadi:
```sql
SELECT COALESCE(created_by_user_id, user_id) INTO v_creator_id
FROM public.pdkt_mailbox_items WHERE id = p_mailbox_id;
```

Dengan `COALESCE`, jika `created_by_user_id` NULL, akan fallback ke `user_id` (pembuat asli).

## Bulk Delete Feature

### Backend (`apps/api`)
- **`mailbox-service.ts`**: Fungsi `bulkSoftDeleteMailboxItems()` melakukan fetch semua item yang diminta, memeriksa izin per-item via `canDeletePdktMailboxItem()`, lalu menjalankan RPC delete secara paralel via `Promise.allSettled`. Mengembalikan `BulkDeleteResult` berisi `successCount`, `failureCount`, dan array `errors` detail.
- **`mailbox.ts` route**: Endpoint `POST /pdkt/mailbox/batch-delete` dengan validasi Zod `pdktMailboxBulkDeleteSchema` (array UUID).
- **Error handling**: 400 untuk UUID invalid, per-item error tidak menggagalkan batch.

### Frontend (`apps/web`)
- **`MailboxSidebar.tsx`**: Bulk mode dengan tombol `CheckSquare` "Pilih Banyak", checkbox per-item (disabled untuk item yang tidak bisa dihapus dengan tooltip), tombol delete merah dengan animasi pulse, tombol "Batal" untuk keluar dari bulk mode.
- **`simulation.tsx`**: State `selectedBulkIds` (Set), handler `handleToggleBulkId`/`handleToggleBulkMode`/`handleBulkDelete`, konfirmasi dialog, partial success/failure toast via `notify.warning`/`notify.success`.

### Types (`packages/types`)
- Menambahkan `pdktMailboxBulkDeleteSchema` (Zod) dan `PdktMailboxBulkDelete` type.

---

## Verifikasi & Pengujian

### API Tests (`pdkt-mailbox-bulk-delete-route.test.ts`)
- Bulk delete sukses (2 items, successCount=2, RPC called 2x)
- UUID invalid → 400 validation error

### Service Unit Tests (`pdkt-mailbox-permissions.test.ts`)
- Bulk delete skips forbidden items successfully (successCount=1, failureCount=2)
- RPC rejection menghasilkan best-effort summary

### Frontend Tests (`pdkt-mailbox-bulk.test.tsx`)
- Toggle bulk mode menampilkan/sembunyikan checkbox
- Select items + trigger bulk delete → `postApi` dipanggil dengan ids yang benar, toast success
- Partial failure → toast warning dengan pesan error

---

## Rollback Plan

1. Hapus endpoint `POST /pdkt/mailbox/batch-delete` dari `routes/pdkt/mailbox.ts`.
2. Hapus fungsi `bulkSoftDeleteMailboxItems` dari `services/pdkt/mailbox-service.ts`.
3. Kembalikan RPC `soft_delete_pdkt_mailbox_item` ke versi sebelumnya via rollback migration.
4. Hapus bulk UI dari `MailboxSidebar.tsx` dan `simulation.tsx`.
