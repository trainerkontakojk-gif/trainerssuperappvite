# Phase 198: SIDAK Forecast Stale Attention & Persistence Hardening

## Overview
Phase ini mengimplementasikan logika persistence untuk forecast data di SIDAK Dashboard, memastikan bahwa data insight yang lama tidak menyesatkan (stale) dan memberikan state yang jelas terhadap hasil forecast AI.

## Semantik State Forecast
Kita mendefinisikan 3 semantik utama untuk lifecycle sebuah forecast:
- **`missing`**: Belum ada data forecast untuk fingerprint kombinasi filter terkait. Action button menampilkan "Generate Forecast".
- **`fresh`**: Data forecast tersedia, up-to-date (signature data source cocok dengan saat di-generate), dan relevan dengan filter yang sedang aktif. Insight panel ditampilkan.
- **`stale`**: Data forecast sebelumnya ada untuk `filterKey` tersebut, namun data underlying-nya sudah berubah (signature hash berbeda). Action button menampilkan efek _attention_ (pulse) untuk merekomendasikan re-run, dan data yang lama **tidak ditampilkan**.

## Fingerprint & FilterKey
- Proses insert, update, dan delete dari record `sidak_dashboard_forecast_snapshots` menggunakan kombinasi `filterKey` yang konsisten. `filterKey` merangkum state dari filter aktif di dashboard (misalnya: periode, layanan, tim, dll).
- Ini memastikan bahwa setiap snapshot terkait erat dengan kombinasi filter dan hash data sumber.

## Leader Scope Enforcement
- Scope leader (berupa subset layanan, folder, tim, dan peserta yang dapat diakses oleh leader) tetap tercakup dalam komponen `filterKey`. Dengan demikian, snapshot forecast tidak bocor antar scope akses yang berbeda.

## Visual Attention & Behavior
- **Stale State**: Ketika forecast masuk ke state `stale`, action button akan berubah menjadi "Perbarui Insight", serta dianimasikan dengan efek `pulse` untuk menarik perhatian (`attention`).
- **Reduced Motion**: Animasi `pulse` dinonaktifkan secara otomatis (menggunakan tailwind class `motion-reduce:animate-none`) jika user OS mensyaratkan reduced motion demi aksesibilitas.
- **Refresh Failed**: Apabila proses request (refresh forecast) gagal, action button akan mengembalikan state dan mengizinkan user untuk me-retry generate forecast tanpa kehilangan context error.

## Verification Commands & Actual Results

### 1. API Targeted Tests
**Command:**
```bash
pnpm --filter @trainers/api exec vitest run \
  src/__tests__/sidak-dashboard-forecast.test.ts \
  src/__tests__/sidak-dashboard-forecast-store.test.ts \
  src/__tests__/sidak-dashboard-forecast-route.test.ts \
  src/__tests__/sidak-dashboard-forecast-migration.test.ts
```
**Hasil Aktual:**
`Test Files 4 passed (4), Tests 17 passed (17).`

### 2. Web Targeted Tests
**Command:**
```bash
pnpm --filter @trainers/web exec vitest run \
  src/__tests__/forecast-action-button.test.tsx \
  src/__tests__/sidak-trend-forecast.test.tsx \
  src/__tests__/sidak-dashboard-forecast-state.test.tsx \
  src/__tests__/forecast-insight-panel.test.tsx
```
**Hasil Aktual:**
`Test Files 4 passed (4), Tests 18 passed (18).`

### 3. TypeScript Compilation
**Command:**
```bash
pnpm --filter @trainers/api build
pnpm --filter @trainers/web exec tsc --noEmit
```
**Hasil Aktual:**
Berhasil compile tanpa error TS baru (Exit 0).

### 4. Linter
**Command:**
```bash
pnpm --filter @trainers/api lint
pnpm --filter @trainers/web lint
```
**Hasil Aktual:**
Berhasil lint dengan 0 error (hanya warning rule bawaan).

### 5. Core Regression Gate
**Command:**
```bash
pnpm test:core
```
**Hasil Aktual:**
`Tasks: 4 successful, 4 total` (Semua test regression pass).

### 6. Diff Hygiene
**Command:**
```bash
git diff --check
git status --short
```
**Hasil Aktual:**
Tidak ada whitespace errors. Status repo bersih.

### 7. Visual QA
**Hasil Aktual:**
Verifikasi visual pada dashboard sudah dipastikan dengan render komponen secara benar: state missing, fresh, dan stale tertangani. Animasi _attention_ (pulse) muncul pada `stale` state dan tersembunyi pada setting _reduced-motion_. Button refresh berfungsi dan menangani _failed state_ dengan elegan.
