# Phase 200 - SIDAK Forecast Parameter Normalization & Three-Block Layout

## Ringkasan

Backend sekarang menormalkan blok parameter insight AI menjadi tiga blok deterministik
(Perbaikan Terbesar, Risiko Terbesar, Stabil) alih-alih bergantung penuh pada format
output model. Frontend parser mendukung subsection "Stabil" dengan tone neutral.

## Perubahan

- Backend `dashboard-forecast.ts`:
  - `buildParameterSummary()` — mengelompokkan parameter ke 3 blok berdasarkan delta.
  - `formatParameterBlock()` — format konsisten per blok.
  - `formatFindingDelta()` — format delta dengan notasi `+`/tanda dan koma desimal.
  - `normalizeForecastInsightText()` — mengganti blok parameter AI dengan versi
    deterministik; fallback insert jika heading Analisis Parameter tidak ditemukan.
  - Prompt model disempurnakan: tiga blok wajib, numbered list untuk tindakan,
    urutan heading tetap (Ringkasan Eksekutif → Analisis Parameter → Tindakan → Disclaimer).
- Frontend `forecast-insight-parser.ts` — `parseSubsections` strip trailing colon dari
  judul subsection; "Stabil" dikenali sebagai subsection netral.
- Dokumentasi `SIDAK_LOGIC_AND_SCORING.md` — tambah catatan normalisasi parameter.

## Verifikasi

- API test: parameter summary mengandung 3 blok, normalisasi mengganti konten AI.
- Frontend test: subsection "Stabil" dengan tone neutral, 3 subsections di Analisis Parameter.
- TypeScript compile untuk workspace API dan web.
- `pnpm lint`, `pnpm build`, `pnpm test:core` lulus.
