# Phase 32: SIDAK Period Delete Fail-Closed Guard

## 1. Requirement & Goals

1. Mencegah penghapusan periode QA ketika proses verifikasi referensi (`qa_temuan` / `qa_service_rule_versions`) gagal.
2. Menutup celah fail-open yang dapat menyebabkan penghapusan data turunan melalui cascade delete.
3. Menambahkan regression test untuk mengunci behavior fail-closed.

## 2. Implementation Summary

- **Backend Service (`apps/api/src/services/sidak-service.ts`):**
  - Hardening `deletePeriod()`:
    - Query verifikasi kini membaca `error` dari kedua sumber check (`qa_temuan`, `qa_service_rule_versions`).
    - Jika salah satu check error, proses langsung abort dengan pesan `"Gagal memverifikasi status periode."`.
  - Tujuan: memastikan period deletion **tidak pernah lanjut** saat status referensi tidak bisa dipastikan.

- **API Tests (`apps/api/src/__tests__/sidak-service.test.ts`):**
  - Test baru: `fails closed when verification query returns error`.
  - Memastikan `deletePeriod()` melempar error verifikasi dan tidak lanjut ke delete path ketika query check gagal.

## 3. Verification & Validation

- **Targeted API Test:**
  - `pnpm --filter @trainers/api test -- src/__tests__/sidak-service.test.ts`
  - Hasil: **PASS** (1 file, 34 tests passed).

## 4. Impact

- Menutup risiko data loss pada skenario gangguan query verifikasi (timeout/intermittent DB error) saat delete period.
- Behavior kini fail-safe: validasi tidak pasti -> delete diblokir.
