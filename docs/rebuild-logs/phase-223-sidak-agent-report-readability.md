# Phase 223 — SIDAK Agent Report Readability + Excel

Tanggal: 2026-10-06

Lane: C. Plan: `plans/markdown/sidak-agent-report-readability.md`.

Scope: laporan unduhan `/sidak/agents/:id` dinilai berantakan dan tidak human
readable. Disetujui Fajar: tahap 1 (perbaikan cepat) + tahap 2 (restrukturisasi
HTML/PDF), dan CSV + Markdown diganti Excel.

## Perubahan

- Menu **Unduh Laporan**: Excel (.xlsx), HTML Interaktif, HTML Statis, PDF.
  CSV dan Markdown dihapus beserta generatornya.
- Model bersama baru `apps/web/src/utils/agentReportModel.ts`: kamus label,
  cakupan, Kesimpulan Utama deterministik, pengelompokan temuan per parameter,
  arah baik/buruk. Generator Excel baru `apps/web/src/utils/agentReportXlsx.ts`.
- HTML/PDF: Kesimpulan Utama di awal; cakupan sekali di header; label
  manusiawi; selisih skor dalam poin; grafik skor dengan sumbu di-zoom + garis
  target 95 tanpa tabel data duplikat; tren temuan per parameter jadi tabel;
  detail temuan per parameter dengan catatan identik digabung.
- Bug diperbaiki: warna perbandingan terbalik (lebih banyak temuan diberi
  hijau); header kolom rata kanan PDF bergeser satu kolom; judul "Akar Masalah"
  hilang di PDF; halaman terakhir PDF bisa berisi penutup saja; baris tiket
  temuan bisa jatuh sendirian ke halaman baru; catatan yang diketik dengan
  Enter tercetak sebagai `[U+000A]` di PDF (kini baris baru dipertahankan di
  PDF/HTML, tab jadi spasi).
- Dampak ukuran (fixture sintetis 5 bulan/14 temuan): PDF 6 → 3 halaman,
  HTML 9.563 px → ±4.800 px tinggi halaman. Cetak HTML fixture E2E 5 → 4 halaman.

## Verifikasi

- RED: `pnpm exec playwright test e2e/sidak-agent-report-readability.spec.ts` —
  5 failed sebelum implementasi (menu 5 item tanpa Excel; tidak ada Kesimpulan
  Utama di HTML/PDF).
- `pnpm exec playwright test e2e/sidak-agent-report-download.spec.ts e2e/sidak-agent-html-export-parity.spec.ts e2e/sidak-agent-report-date-invariance.spec.ts e2e/sidak-agent-report-readability.spec.ts --reporter=line`
  (dari `apps/web`) — **35 passed (2.8m)**, exit 0 (termasuk test catatan multi-baris yang RED dulu: `[U+000A]` tercetak di PDF). Target Vite lokal
  `http://localhost:3005` lolos preflight; API/auth dimock.
- `pnpm --filter @trainers/web exec tsc --noEmit` — exit 0;
  `pnpm exec tsc --noEmit -p tsconfig.e2e.json` — tanpa error pada file tersentuh.
- `pnpm --filter @trainers/web build` — berhasil.
- eslint pada file tersentuh — 0 error, 0 warning.
- Unit test `src/__tests__/exportAgentReport.test.ts` (invarian NaN/Infinity)
  **tidak dijalankan** (butuh izin non-E2E); invariannya dicek manual lewat
  skrip `tsx` di luar repo: tanpa `NaN`/`Infinity`/`undefined`, "0 temuan" ada,
  label periode ter-escape.

## Catatan

- `agentReportHtml.ts` (1.194 baris) dan `agentReportPdf.ts` (1.543 baris)
  masih di atas ±1.000 baris, tetapi menyusut dari 2.270 dan 1.882; logika
  bersama dipindah ke model.
