# Phase 198: SIDAK Forecast Stale Attention & Persistence Hardening

## Overview
Phase ini mengimplementasikan logika persistence untuk forecast data di SIDAK Dashboard, memastikan bahwa data insight yang lama tidak menyesatkan (stale) dan memberikan state yang jelas terhadap hasil forecast AI.

## Semantik State Forecast
Kita mendefinisikan 3 semantik utama untuk lifecycle sebuah forecast:
- **`missing`**: Belum ada data forecast untuk fingerprint kombinasi filter terkait. Action button menampilkan "Update Prediksi".
- **`fresh`**: Data forecast tersedia, up-to-date (signature data source cocok dengan saat di-generate), dan relevan dengan filter yang sedang aktif. Insight panel ditampilkan.
- **`stale`**: Data forecast sebelumnya ada untuk `filterKey` tersebut, namun data underlying-nya sudah berubah (signature hash berbeda). Action button menampilkan efek _attention_ (pulse) untuk merekomendasikan re-run, dan data yang lama **tidak ditampilkan**.

## Fingerprint & FilterKey
- Proses insert, update, dan delete pada data historis mengubah `dataFingerprint`, sementara kombinasi filter yang sama mempertahankan `filterKey`. `filterKey` merangkum state dari filter aktif di dashboard (misalnya: periode, layanan, tim, dll).
- Ini memastikan bahwa setiap snapshot terkait erat dengan kombinasi filter dan hash data sumber.

## Leader Scope Enforcement
- Scope leader (berupa subset layanan, folder, tim, dan peserta yang dapat diakses oleh leader) tetap tercakup dalam komponen `filterKey`. Dengan demikian, snapshot forecast tidak bocor antar scope akses yang berbeda.

## Visual Attention & Behavior
- **Stale State**: Ketika forecast masuk ke state `stale`, action button berubah menjadi "Data baru — Perbarui Prediksi", serta dianimasikan dengan efek `pulse` untuk menarik perhatian (`attention`).
- **Lookup Berjalan**: Saat filter atau historical series berubah, snapshot lama langsung disembunyikan dan tombol kembali ke state aman `missing` sampai lookup backend terbaru selesai. Ini mencegah forecast lama terlihat seolah masih relevan.
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
Audit akhir: `Test Files 4 passed (4), Tests 20 passed (20).`

Coverage tambahan membuktikan insert, update, dan delete menghasilkan
fingerprint berbeda dari baseline dan mengembalikan status `stale`.

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
Audit akhir: `Test Files 4 passed (4), Tests 20 passed (20).`

Coverage tambahan membuktikan snapshot lama langsung hilang ketika historical
series berubah dan lookup baru masih berjalan, serta compact button tetap
memiliki touch target minimal 44 piksel.

### 3. TypeScript Compilation
**Command:**
```bash
pnpm --filter @trainers/api build
pnpm --filter @trainers/web exec tsc --noEmit
```
**Hasil Aktual:**
Kedua command selesai dengan exit 0.

### 4. Linter
**Command:**
```bash
pnpm --filter @trainers/api lint
pnpm --filter @trainers/web lint
```
**Hasil Aktual:**
- API: 0 error, 3 warning existing.
- Web: 0 error, 194 warning existing.

### 5. Core Regression Gate
**Command:**
```bash
pnpm test:core
```
**Hasil Aktual:**
`Tasks: 4 successful, 4 total`. API core 117 test, web core 51 test, dan
Telefun core 61 test lulus; satu task Telefun menggunakan cache Turbo.

### 6. Diff Hygiene
**Command:**
```bash
git diff --check
git status --short
```
**Hasil Aktual:**
`git diff --check` digunakan untuk memastikan tidak ada whitespace error.
Worktree tidak diklaim bersih karena terdapat perubahan lain yang sudah ada dan
tidak termasuk scope Phase 198.

### 7. Visual QA
**Hasil Aktual:**
Automated component tests memverifikasi state `missing`, `fresh`, dan `stale`,
class pulse, opt-out `motion-reduce:animate-none`, loading, serta refresh error.
Pemeriksaan browser manual harus dicatat terpisah bila target localhost tersedia;
render test tidak diklaim sebagai visual QA browser.
