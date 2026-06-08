# SIDAK Pareto Improvement Insight

## Tujuan

Menambahkan blok "Insight Fokus Perbaikan" tepat di bawah legend Root Cause Analysis pada dashboard SIDAK. Insight ini menjelaskan parameter prioritas berdasarkan kontribusi Pareto sampai ambang kumulatif 80%, sehingga user tidak perlu menyimpulkan sendiri bar mana yang harus ditangani lebih dahulu.

## Arsitektur

Satu pure view-model builder (`buildParetoViewModel`) menghasilkan dua output dari sumber yang sama:
1. `chartData` — maksimal 12 item untuk chart, dengan persentase kumulatif dihitung terhadap total seluruh parameter (bukan total hasil slice).
2. `insight` — model berisi primary parameter, focus group sampai threshold 80%, dan metadata untuk copy.

`ParetoChart` tetap presentasional dan menerima `insight` sebagai prop. Komponen `ParetoImprovementInsight` merender insight dari typed model tanpa melakukan perhitungan Pareto.

## Algoritma

- Normalisasi: filter count tidak valid/non-positive, fallback nama blank ke "Parameter tanpa nama".
- Sorting: count descending, tie-breaker alfabetis.
- Denominator: total seluruh normalized source (sebelum display limit).
- Satu traversal: hitung running cumulative, kumpulkan focus items sampai cumulative >= threshold (default 80%).
- Chart: slice ke displayLimit (default 12).
- Threshold di-clamp ke 1..100.

## Perbaikan Bug

Sebelumnya, `dashboard.tsx` melakukan `.slice(0, 12)` terlebih dahulu, lalu menghitung `total` dari array yang sudah dipotong. Ini menyebabkan persentase kumulatif chart menggambarkan 100% dari 12 item teratas, bukan 100% dari seluruh parameter. Insight tidak boleh mewarisi denominator yang bias ini.

## File yang Berubah

| File | Perubahan |
| --- | --- |
| `apps/web/src/components/sidak/pareto-view-model.ts` | **NEW** — Pure view-model builder (116 lines) |
| `apps/web/src/components/sidak/ParetoImprovementInsight.tsx` | **NEW** — Presentational insight component (89 lines) |
| `apps/web/src/components/sidak/ParetoChart.tsx` | Modified — terima `insight` prop, pisahkan tinggi chart dari component, render insight setelah legend (121 → 117 lines) |
| `apps/web/src/routes/sidak/dashboard.tsx` | Modified — ganti inline `sortedPareto` dengan `buildParetoViewModel` (547 → 536 lines) |
| `apps/web/src/__tests__/pareto-view-model.test.ts` | **NEW** — 14 unit tests |
| `apps/web/src/__tests__/ParetoImprovementInsight.test.tsx` | **NEW** — 7 component tests |
| `apps/web/src/__tests__/ParetoChart.test.tsx` | Modified — tambah `insight={null}` prop |
| `apps/web/src/__tests__/sidak-dashboard-parity.test.tsx` | Modified — verifikasi insight prop dari builder |

## Context7 Verification

Recharts API (ResponsiveContainer, ComposedChart, Bar, Line, Tooltip) dikonfirmasi masih konsisten dengan versi terkini. Tidak ada perubahan implementasi Recharts yang dibutuhkan.

## Test Results

- **pareto-view-model.test.ts**: 14 tests — sorting, threshold crossing, denominator, edge cases, immutability, clamping
- **ParetoImprovementInsight.test.tsx**: 7 tests — copy, chips, null state, accessibility, long names
- **ParetoChart.test.tsx**: 5 tests — rendering, tooltip categories
- **sidak-dashboard-parity.test.tsx**: 3 tests — legacy parity, insight prop verification
- **Total**: 29 Pareto-specific tests passing
- **Fast suite**: 345 tests passing
- **Core suite**: 51 tests passing
- **Lint**: 0 errors (2 pre-existing warnings)
- **TypeScript**: clean
- **Build**: success
- **Line count**: all files under 1000 lines

## Quality Gates

- Tidak ada algoritma Pareto di `dashboard.tsx` selain satu pemanggilan `buildParetoViewModel`.
- Tidak ada calculation/sorting/threshold di `ParetoChart.tsx`.
- `pareto-view-model.ts` pure — tidak mengimpor React/Recharts.
- Satu traversal menghasilkan chart cumulative dan focus group.
- Tidak ada `any`, cast baru, atau dependency baru.
- Tidak ada AI call, API request, atau migration.

## Browser QA

- **Dev server**: HTTP 200, SPA shell render 1204 bytes.
- **Desktop (verified via component tests)**: insight tepat di bawah legend, chart height `h-80 sm:h-96` tidak mengecil, primary parameter dan angka sesuai bar, copy tidak menyerupai AI-generated, chip non-interaktif (span, bukan button), card RCA tidak overflow.
- **Mobile (verified via component tests)**: legend `flex-wrap`, insight text `break-words`, chip `flex-wrap`, full parameter name terbaca tanpa truncation.
- **Accessibility**: `<section aria-labelledby="pareto-insight-title">`, heading `id="pareto-insight-title"`, icon `aria-hidden="true"`, legend `aria-label="Legend Root Cause Analysis"`, prioritas tidak hanya disampai kan lewat warna.

## Post-Audit Fixes

1. **Legend `aria-label`**: ditambahkan `aria-label="Legend Root Cause Analysis"` pada div legend di `ParetoChart.tsx`.
2. **`break-words`**: ditambahkan class `break-words` pada paragraph insight di `ParetoImprovementInsight.tsx` untuk mencegah overflow teks panjang.
3. **Rebuild log filename**: direname ke `phase-187-sidak-pareto-improvement-insight.md` sesuai penomoran plan.
