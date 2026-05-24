# Phase 28: SIDAK Ranking Fatal Legacy Parity

## 1. Requirement & Goals
Menyamakan badge status pada ranking agen dengan legacy:
1. Badge `Fatal` hanya muncul jika agent memiliki minimal satu temuan real dengan `nilai === 0` pada indikator `critical`.
2. Temuan critical dengan nilai `1` atau `2` tidak boleh memicu badge.
3. Phantom padding dan data fallback tidak memicu badge.
4. Struktur response `TopAgentData` tetap dipertahankan.
5. Menambahkan regression tests baik di backend (`apps/api`) maupun frontend (`apps/web`) untuk mengunci behavior ini.

## 2. Implementation Summary
- **Backend Fix (`apps/api/src/services/sidak-service.ts`):**
  - Mengubah penentuan flag `hasCritical` di dalam fungsi `getDashboardData()` (pemetaan `topAgents`).
  - Menghitung `hasCritical` secara ketat dengan memeriksa semua row asli milik agen (tidak termasuk `is_phantom_padding === true`) di mana `nilai` adalah `0` (atau secara numerik `0`), dan indikator terkait berkategori `critical`.
- **Backend Testing (`apps/api/src/__tests__/sidak-service-dashboard.test.ts`):**
  - Memodifikasi mock database setup agar data indicators (`qa_indicators`) dan findings (`qa_temuan`) dapat dimodifikasi secara dinamis per test case.
  - Menambahkan test block `hasCritical Parity Validation` yang menguji skenario:
    - Agen dengan temuan non-critical bernilai 0 (`hasCritical: false`).
    - Agen dengan temuan critical bernilai 1 atau 2 (`hasCritical: false`).
    - Agen dengan temuan critical bernilai 0 namun berupa phantom padding (`hasCritical: false`).
    - Agen dengan temuan critical bernilai 0 asli (`hasCritical: true`).
- **Frontend Testing (`apps/web/src/__tests__/sidak-ranking-fatal-parity.test.tsx`):**
  - Membuat unit test suite baru yang merender `SidakRankingPage` dengan data mock, memverifikasi bahwa badge "Fatal" secara kondisional hanya dirender untuk agen yang memiliki flag `hasCritical === true`.

## 3. Verification & Validation
- **Linting:** Berhasil dijalankan dengan `pnpm lint` (0 error).
- **Frontend Tests:** `pnpm --filter @trainers/web test` berhasil meluluskan seluruh test suite (18 file test, 77 test case).
- **Backend Tests:** `pnpm --filter @trainers/api test` berhasil meluluskan seluruh test suite (16 file test, 247 test case).
- **Production Build:** `pnpm build` berhasil diselesaikan tanpa kesalahan tipe atau bundling.
