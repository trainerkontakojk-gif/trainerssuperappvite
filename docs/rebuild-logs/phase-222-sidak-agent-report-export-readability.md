# Phase 222 — SIDAK Agent Report Export Readability

Tanggal: 2026-09-28

Scope: meningkatkan keterbacaan PDF dan HTML pada `/sidak/agents/:id` tanpa mengubah skema CSV/Markdown.

## Perubahan

- HTML Statis dan PDF memisahkan grafik skor dari grafik jumlah temuan. Skor memakai `periodSummaries` (`finalScore`, `nonCriticalScore`, `criticalScore`); jumlah temuan memakai `personalTrend`.
- Setiap metrik ditampilkan pada grafik dan tabelnya sendiri. `Total Temuan` tidak digabung dengan rincian temuan per parameter, dan skor tidak dicampur dengan jumlah temuan dalam satu trendline.
- Nomor tiket menjadi identifier utama pada blok temuan PDF/HTML; hierarkinya lebih menonjol daripada nama parameter dan nilai.
- PDF mempertahankan paginasi tabel panjang, mengulang header, dan menjaga setiap baris tetap utuh saat berpindah halaman.
- CSV/Markdown tidak diubah karena skemanya terkunci. Seksi legacy `Perkembangan Skor` pada kedua format itu tetap berisi jumlah temuan dari `personalTrend`; grafik skor aktual hanya ada di HTML dan PDF.
- Tidak ada unit test tambahan yang dihapus pada phase ini. Dari 12 unit test tersisa, audit menemukan 0 yang aman dihapus sekarang: 11 kandidat komponen/hook menunggu E2E ekuivalen yang lulus, sementara invarian `NaN`/`Infinity` tetap memerlukan satu test non-E2E karena JSON mengubah nilai tersebut menjadi `null` sebelum mencapai browser.

## Dokumentasi

- Kontrak dan peta test diperbarui di `docs/feature-agent-detail-export-csv-md-html.md`, termasuk hitungan 29 test download + 2 test parity.
- Ringkasan modul dan navigasi kontrak diperbarui di `docs/modules.md` dan `docs/README.md`.
- Kebijakan E2E-first diselaraskan di `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, dan navigasi verifikasi `docs/README.md`.
- Wiki lokal `~/wiki/entities/sidak-module.md` dan ringkasan `~/wiki/index.md` diselaraskan.

## Verifikasi

- `pnpm --filter @trainers/web exec playwright test e2e/sidak-agent-report-download.spec.ts e2e/sidak-agent-html-export-parity.spec.ts --reporter=line` — PASS, **31 passed (2.0m)**, exit 0. Target Vite lokal `http://localhost:3005`; API/auth dimock, pembacaan HTML offline melalui `file://`, request font eksternal diblokir.
- `pnpm --filter @trainers/web exec tsc --noEmit && pnpm --filter @trainers/web build` — PASS, exit 0.
- `pnpm --filter @trainers/web exec eslint src/utils/agentReportHtml.ts src/utils/agentReportPdf.ts e2e/helpers/sidakAgentReportFixture.ts e2e/sidak-agent-report-download.spec.ts` — PASS, exit 0.
- `git diff --check` — PASS sebelum file log dibuat; validasi akhir mencakup file ini secara eksplisit.
- Prettier check pada `docs/AGENT_WORKFLOW.md` dan dokumen fitur memberi warning; kedua versi `HEAD` juga warning. Format lama dipertahankan agar tidak membuat diff alignment massal.
