# Rebuild Log: Phase 26 - SIDAK Parameter Legacy Parity

## Deskripsi Fitur
Menyamakan halaman QA settings `/sidak/settings` dengan layout, tombol, status, dan data flow versi parameter legacy.

## Log Perubahan

### 1. Database & Backend API Contract (`apps/api`)
- Menyesuaikan `getRuleVersions` untuk memuat relasi `qa_periods` (month, year) guna formatting periode di sidebar history.
- Mengubah `createRuleVersion` agar secara otomatis menyalin/menduplikasi weights + indicator snapshot dari versi source (`source_version_id`) saat create revision, atau menyalin parameter dari library (`qa_indicators`) saat baseline pertama.
- Menyesuaikan `publishRuleVersion` agar menerima input override `effective_period_id` saat publish dan menghitung nomor versi secara dinamis di target period.
- Menambahkan `updateRuleVersionIndicator` untuk mutasi parameter di draft aktif.
- Menambahkan endpoint `PUT /api/v1/sidak/rule-versions/:id/indicators/:indicatorId` di router Hono.

### 2. Frontend Interface (`apps/web`)
- Layout settings diubah menjadi satu panel detail dengan sidebar list riwayat versi per tipe service.
- Penyesuaian tombol aksi header: `Publish` + `Hapus Draft` (Draft), `Create Revision` (Published), `Buat Baseline` (Empty state).
- Integrasi slider slider-based weight editor dan daftar kartu parameter di detail panel utama.
- Modals manual parameter (Add/Edit) serta preview publish modal dengan pilihan target periode efektif dan deskripsi revisi.

## Verifikasi
- Unit test frontend ditambahkan di `apps/web/src/__tests__/sidak-settings-parity.test.tsx` -> **PASS**.
- Unit test backend ditambahkan di `apps/api/src/__tests__/sidak-versioning-parity.test.ts` -> **PASS**.
- Full test suite monorepo dijalankan -> **PASS** (72 frontend, 243 backend).
