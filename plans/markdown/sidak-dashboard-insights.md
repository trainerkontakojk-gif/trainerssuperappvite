# SIDAK Dashboard — Ringkasan Kondisi Temuan

## Requirement

Dashboard `/sidak/dashboard` perlu menjadi ringkasan kerja yang menceritakan kondisi saat ini, masalah yang tampak, dan tindak lanjut yang disarankan, bukan hanya menampilkan KPI. Pengguna juga harus bisa membaca proyeksi dan pola harian dari fitur Forecast dan Heatmap yang sudah tersedia.

Kriteria penerimaan:

- Tampilkan judul halaman dan breadcrumb **Dashboard SIDAK** yang konsisten, serta tombol **Perbarui data** yang memakai filter dashboard, menyatakan status sibuk, dan menjelaskan kegagalan tanpa menghapus data terakhir.
- Narasi **Kondisi**, **Masalah**, dan **Tindak lanjut** diturunkan deterministik dari `DashboardData`: tren volume (bukan tingkat/rasio), porsi temuan kritikal dengan denominator eksplisit, kategori Pareto utama, dan agen dengan temuan terbanyak. Jangan menyimpulkan sebab-akibat antar-metrik.
- Tampilkan bagian Forecast dengan ringkasan/penjelasan proyeksi yang saat ini sudah ada, serta aksi update forecast yang dapat ditemukan tanpa harus mencari di dalam kontrol grafik.
- Tampilkan Heatmap tahunan pada dashboard memakai endpoint dan kalender yang sudah ada. Tahun/layanan mengikuti filter dashboard; nyatakan bahwa visual mencakup satu tahun penuh dan tidak mengikuti filter tim/rentang bulan. Pertahankan pembatasan data di backend.
- Tidak menambah endpoint, kontrak API, panggilan AI, scoring, atau klaim/metrik rekaan. Pertahankan filter dan analisis SIDAK lain; UI responsif, keyboard-accessible, dan memakai design tokens/pola produk.
- Dokumentasikan susunan insight, cakupan heatmap, dan aksi forecast di panduan modul SIDAK.

## Design

- Audience: trainer/QA, admin, dan leader dengan akses SIDAK; tugas utama: memahami arah masalah, menentukan apa yang perlu ditinjau, lalu melihat pola waktu/proyeksi tanpa berpindah halaman.
- Hierarki: judul/filter → KPI → cerita **Kondisi / Masalah / Tindak lanjut** → Forecast yang menonjol → ringkasan Heatmap dengan kalender tahunan yang dapat dibuka → grafik/ranking terperinci.
- Narasi faktual memakai `buildKpiDelta`, denominator `donutData.total`, kategori utama dari `buildParetoViewModel`, dan `topAgents[0]`. Kalimat tindakan menyarankan review, bukan mengklaim korelasi antar-agent, kategori, tanggal, dan forecast.
- Forecast menggunakan snapshot dan `ForecastInsightPanel` yang sudah dipakai dashboard; pindahkan kontrol update/penjelasan dari dalam grafik agar bagian ini jelas ditemukan. Jangan membuat snapshot/AI baru otomatis.
- Heatmap menggunakan `fetchSidakHeatmap`, `SidakHeatmapInsights`, dan `SidakHeatmapCalendar` yang sudah ada. Tampilkan ringkasan di dashboard dan kalender tahunan melalui disclosure agar alur utama tetap ringkas. Label cakupan dengan eksplisit: tahun penuh, layanan terpilih, tanpa filter tim/rentang bulan, sesuai role scope backend.
- Visual: pertahankan palette, tipografi, spacing, dan komponen SIDAK; hindari kartu metrik dekoratif. Target aksi minimal 44px dan teks/cakupan terbaca pada viewport sempit.
- Scope implementasi: `apps/web/src/components/layout/nav-config.ts`, `apps/web/src/routes/sidak/dashboard.tsx`, `apps/web/src/components/sidak/SidakConditionSummary.tsx`, komponen baru `apps/web/src/components/sidak/SidakDashboardHeatmap.tsx`, `apps/web/e2e/sidak-dashboard-insights.spec.ts`, `docs/modules.md`, dan dokumen plan ini. Tidak ada perubahan API/shared types/database, scoring, role/access, dependencies, atau file lain.

## Tasklist

- [x] Perluas E2E Playwright hermetic untuk narasi kondisi/masalah/tindakan, forecast yang mudah ditemukan, heatmap pada dashboard, cakupan filter, dan error state; jalankan dan konfirmasi RED sebelum implementasi.
- [x] Ubah ringkasan faktual menjadi narasi yang dapat ditindaklanjuti dan tampilkan Forecast sebagai bagian tersendiri tanpa menggandakan mesin/proses forecast.
- [x] Tambahkan preview Heatmap tahunan dengan loading/error/empty state dan kalender yang bisa dibuka; pertahankan endpoint serta scope akses yang ada.
- [x] Perbarui dokumentasi modul SIDAK agar menjelaskan isi dashboard dan batas cakupan heatmap.
- [x] Jalankan focused E2E lokal/hermetic, web typecheck/lint/build, `git diff --check`, review thermo-nuclear, dan detector Impeccable.
- [x] Jalankan `graphify update .` satu kali setelah seluruh perubahan kode selesai.

## Verification

- RED: E2E hermetic mengonfirmasi narasi baru, Forecast di luar grafik, dan request Heatmap belum tersedia; tes refresh lama lulus.
- GREEN: `pnpm --filter @trainers/web test:e2e -- sidak-dashboard-insights.spec.ts` — 5/5 lulus di Chromium lokal/hermetic; viewport 320, 375, 414, dan 768 px tanpa overflow horizontal.
- `pnpm --filter @trainers/web typecheck` — lulus.
- `pnpm --filter @trainers/web lint` — lulus, 0 error dan 107 warning pada file lain yang tidak berubah.
- `pnpm --filter @trainers/web build` — lulus.
- Prettier check dan `git diff --check` — lulus.
- Detector Impeccable pada tiga file UI — tidak menemukan temuan. Instalasi saat ini menyediakan `detect`, bukan command `audit`.
- `graphify update .` — berhasil; graphviz HTML dilewati karena graph melebihi limit node visualisasi.

## Iteration 2 — Readability redesign

### Requirement

Redesign dashboard agar pengguna dapat memahami cakupan angka dan keputusan berikutnya dengan cepat. Temuan terbaru, agregat seluruh filter, dan denominator severity harus dibedakan secara eksplisit; Forecast dan Heatmap tetap tersedia tanpa menguasai hierarki utama. Pertahankan data, filter, endpoint, scoring, akses, dan design tokens.

### Design

- Letakkan ringkasan di bawah filter dan sebelum KPI, dengan urutan **Periode terbaru → Seluruh rentang filter → Tindakan selanjutnya**.
- Gunakan narasi singkat, satu daftar fokus yang mudah dipindai, dan satu tautan bernama jelas ke agen prioritas; hindari 3 kolom insight yang setara dan pengulangan konteks.
- Forecast menampilkan arah/perubahan di muka; penjelasan dan rekomendasi rinci memakai disclosure tertutup secara default.
- Preview Heatmap hanya menyebut tanggal/volume puncak; hapus statistik hari-pekan yang membingungkan di ringkasan. Pertahankan kalender lengkap, catatan cakupan, dan state error/kosong.
- Tidak mengubah theme, API, filter, schema, metric, atau halaman analisis detail.

### Tasklist

- [x] Tambah E2E RED yang membuktikan cakupan periode/rentang terpisah, urutan ringkasan sebelum KPI, dan CTA tindakan yang jelas.
- [x] Susun ulang ringkasan dashboard dan sederhanakan tindakan tanpa mengubah sumber data.
- [x] Ringkas hierarki Forecast/Heatmap dan pertahankan detail melalui disclosure/halaman lengkap.
- [x] Selaraskan dokumentasi modul dan tasklist iterasi ini.
- [x] Jalankan focused E2E, typecheck, lint/build web, screenshot review responsif, Impeccable detector, dan `git diff --check`.

### Verification

- RED: `pnpm --dir apps/web exec playwright test e2e/sidak-dashboard-insights.spec.ts -g "menjelaskan kondisi dari data aktif"` — gagal sesuai harapan sebelum implementasi karena heading `Ringkasan temuan` belum tersedia.
- GREEN: `pnpm --filter @trainers/web test:e2e -- sidak-dashboard-insights.spec.ts` — 6/6 lulus di Chromium lokal/hermetic; target API loopback, seluruh panggilan API dimock, dan tidak ada jaringan yang diblokir/dicoba.
- `pnpm --filter @trainers/web typecheck` — lulus.
- `pnpm --filter @trainers/web lint` — lulus tanpa error; 107 warning berasal dari file lain yang tidak berubah.
- `pnpm --filter @trainers/web build` — lulus; output CSS menjalankan fallback saat builtin OXC/Vite JSON dilewati.
- `pnpm exec prettier --check <file terkait>` dan `git diff --check` — lulus.
- Screenshot desktop 1280 px dan mobile 320 px ditinjau; E2E juga memeriksa 320, 375, 414, dan 768 px tanpa overflow horizontal, serta target aksi minimum 44 px.
- `impeccable detect --json <tiga file UI>` — `[]`. CLI lokal tidak menyediakan perintah `audit` atau `polish`; validasi visual dilakukan dari screenshot E2E.
- `graphify update .` — berhasil; visualisasi HTML dilewati karena graph sekitar 13.977 node melebihi batas.

## Iteration 3 — Compact dashboard

### Requirement

Ringkas dashboard lebih lanjut: kurangi paragraf dan hilangkan accordion yang menambah beban pindai. Pengguna harus dapat membaca perbandingan periode, denominator critical, fokus kategori/agen, dan proyeksi tanpa membuka disclosure. Detail lengkap tetap tersedia di halaman analisis terkait.

### Design

- Ganti narasi panjang dengan baris fakta berlabel: periode terbaru, temuan kritikal dalam rentang filter, kategori teratas, dan agen teratas. Pertahankan pembanding jumlah (bukan rate) secara singkat dan denominator eksplisit.
- Tampilkan forecast sebagai satu baris data: arah, perubahan, horizon, dan tingkat kepercayaan; hapus panel penjelasan/rekomendasi tertutup, pertahankan update serta tautan analisis.
- Heatmap menampilkan tanggal puncak dan satu baris cakupan ringkas; hapus kalender/insight accordion dan tautkan ke halaman Heatmap lengkap.
- Hapus penjelasan tindakan berbentuk paragraf; pertahankan satu tombol bernama jelas untuk agen prioritas.
- Pertahankan filter, sumber data, API, scoring, scope akses, serta loading/error/empty state.

### Scope

`apps/web/src/components/sidak/SidakConditionSummary.tsx`, `apps/web/src/components/sidak/SidakDashboardHeatmap.tsx`, `apps/web/src/routes/sidak/dashboard.tsx`, `apps/web/e2e/sidak-dashboard-insights.spec.ts`, `docs/modules.md`, dan plan ini. Tidak mengubah API/shared types, database, scoring, akses, atau dependency.

### Tasklist

- [x] Perbarui E2E agar menuntut tampilan ringkas tanpa disclosure; jalankan RED sebelum edit UI.
- [x] Ringkas ringkasan utama menjadi baris data berlabel dan satu CTA.
- [x] Ganti Forecast accordion dengan ringkasan satu baris; pindahkan detail ke tautan analisis.
- [x] Ganti Heatmap accordion dengan preview tanggal puncak dan tautan kalender lengkap.
- [x] Perbarui dokumentasi dan verifikasi E2E, typecheck, lint, build, visual responsif, Impeccable, dan diff.

### Verification

- RED: `pnpm --filter @trainers/web test:e2e -- sidak-dashboard-insights.spec.ts` — 3 assertion baru gagal sesuai harapan pada copy ringkasan, fallback agen, dan baseline nol; 3 tes state lama lulus.
- GREEN: perintah E2E yang sama — 6/6 lulus di Chromium lokal/hermetic setelah implementasi; seluruh API dimock dan target hanya loopback. E2E memeriksa lebar 320, 375, 414, dan 768 px tanpa overflow horizontal serta target aksi minimal 44 px.
- `pnpm --filter @trainers/web typecheck` — lulus.
- `pnpm --filter @trainers/web lint` — lulus, 0 error dan 107 warning pada file yang tidak berubah.
- `pnpm --filter @trainers/web build` — lulus. Vite mencatat fallback saat builtin OXC/JSON dilewati untuk output Tailwind CSS.
- `pnpm --filter @trainers/web exec prettier --check src/components/sidak/SidakConditionSummary.tsx src/components/sidak/SidakDashboardHeatmap.tsx src/routes/sidak/dashboard.tsx e2e/sidak-dashboard-insights.spec.ts` dan `git diff --check` — lulus.
- Screenshot desktop 1280 px dan mobile 320 px ditinjau langsung dari `apps/web/test-results/sidak-dashboard-insights-D-5e993--dan-memuat-ulang-dashboard-chromium/`.
- Impeccable context berhasil dimuat; `impeccable detect --json` pada tiga target UI menghasilkan `[]` sebelum penyesuaian akhir spacing mobile. CLI yang tersedia tidak menyediakan `distill`, `audit`, atau `polish`; screenshot setelah penyesuaian tersebut ditinjau langsung dan responsivitas diuji melalui E2E.
- Thermo-nuclear review — PASS; perubahan hanya menyentuh presentasi dan tetap memakai data, API, scoring, filter, dan scope akses yang ada.
- `graphify update .` — berhasil; graph 13.983 node diperbarui, visualisasi HTML dilewati karena melebihi batas 5.000 node.

## Iteration 4 — Data-first workspace (Lane D)

### Requirement
Redesign disetujui pengguna: pertahankan seluruh data dan fungsi dashboard, tanpa perubahan API, scoring, akses, atau dependency. Perubahan lokal sebelumnya menjadi baseline, bukan ditimpa.

### Design
Mode Operate; pertahankan tokens Outfit/Inter, light/dark. Header/filter → empat KPI padat → tren dominan dengan ringkasan sebagai pendamping → Pareto berdekatan dengan ranking → severity, forecast dan preview heatmap. DOM mengikuti urutan baca; mobile satu kolom, semua kontrol keyboard-accessible. Sparkline/delta, denominator, batas dua seri, forecast toggle/update, filter serta error/empty states tetap ada.
Scope: dashboard.tsx, KpiCard.tsx (hanya dipakai dashboard), SidakConditionSummary.tsx, SidakDashboardHeatmap.tsx, E2E insights, docs/modules.md, plan ini. Tidak mengubah navigasi/sidebar atau halaman lain.
Graphify diperiksa; import/caller langsung mengonfirmasi scope. Tidak ada penggunaan API library baru sehingga Context7 tidak diperlukan.

### Tasklist
- [x] RED E2E untuk hierarki baru, data lengkap, dan kontrol.
- [x] Implementasi layout dan KPI padat tanpa mengganti aliran data.
- [x] GREEN E2E hermetic dan screenshot desktop/mobile/light/dark.
- [x] Review Impeccable/thermo-nuclear; typecheck, web lint, build, diff.
- [ ] Root lint: terblokir error baseline API (di luar scope).
- [ ] Graphify update: sudah dicoba sekali, timeout 120 detik.

### Verification (iteration 4)
- RED: `pnpm --filter @trainers/web test:e2e -- sidak-dashboard-insights.spec.ts -g 'menjelaskan kondisi dari data aktif'` exit 1; pnpm meneruskan separator sehingga keenam tes berjalan. Assertion hierarki gagal sesuai harapan: KPI y=601, ringkasan y=254.25; lima tes lain lulus.
- GREEN: `pnpm --dir apps/web exec playwright test e2e/sidak-dashboard-insights.spec.ts` exit 0, 6/6 lulus. Menjaga empat nilai KPI, ringkasan/denominator, severity, Pareto, toggle total/forecast, update forecast dengan folder aktif, refresh dan error/empty. API/auth seluruhnya mock, audit blockedApi/blockedAuth/blockedExternal kosong.
- Screenshot lokal: `apps/web/test-results/sidak-dashboard-insights-D-5e993--dan-memuat-ulang-dashboard-chromium/` — desktop, analysis, outlook, dark, mobile, mobile-summary, mobile-outlook. Review visual dua putaran; E2E lebar 320/375/414/768 tanpa overflow dokumen/ringkasan dan target utama ≥44px. Ini fixture sintetik, bukan pemeriksaan data produksi.
- `pnpm typecheck`: exit 0, 4 workspace berhasil. Satu pengulangan paralel timeout; dijalankan ulang sendiri dan lulus pada source final.
- `pnpm --filter @trainers/web lint`: exit 0, 0 error / 107 warning pada file di luar scope.
- `pnpm lint`: exit 1, dua `no-unsafe-function-type` pada `apps/api/src/services/sidak/heatmap-service.ts:91`. `git diff --exit-code -- <path>` bersih dan `git show HEAD:<path>` mengonfirmasi kedua tipe Function sudah ada. Tidak diperbaiki di task UI.
- `pnpm build`: exit 0, 3 task berhasil.
- `impeccable detect --json <empat file UI>`: exit 0, [].
- Review source thermo-nuclear: tidak menambah branch bisnis/dependency/API atau mengubah state/filter/scoring. Semua blok data baseline dipertahankan; nav-config lokal tidak disentuh. Dua whitespace JSX hasil pemindahan dibersihkan setelah diff review.
- Impeccable: PASS untuk scope UI; tidak ada P1/P2 baru yang ditemukan. Gate repo keseluruhan BLOCKED oleh lint baseline API; bukan release-ready claim.
- `graphify update .`: timeout 120 detik saat berjalan paralel, log kosong; tidak mengklaim cache graph berhasil diperbarui.

## Iteration 5 — Order repair after rejected redesign (Lane D)

> **Superseded (dicatat 2026-10-10):** iterasi ini tidak dieksekusi. Fajar memilih arah "Ringkas terarah" di Iteration 6 (2026-10-05), yang sudah selesai dan diverifikasi di bawah. Tasklist di bawah dibiarkan sebagai catatan, bukan pekerjaan terbuka.

### Requirement
User rejected iteration 4 as messy. Preserve all facts, KPI/delta/sparklines, filters, two-series limit, forecast controls/cache, heatmap scope/states and navigation. No branding, API, business logic, shell or dependency changes. Ownership is the seven paths in the verified orchestration contract; nav-config.ts remains untouched.

### Design
Operate mode, existing Outfit/Inter and light/dark tokens. Diagnose sparse and dense fixtures first. Replace row-coupled panels with continuous analytical and supporting stacks only when usable content width permits readable charts (main ≥560px, supporting ≥320px, gap 24px). Below that width use a single linear flow with the same DOM/focus order. Main analysis: trend → Pareto; supporting review: summary → top five → severity → forecast → heatmap. KPI columns also depend on content width. Adjacent panels in each occupied stack must be 16–32px apart; no stretched placeholder heights. Allow the shorter final stack to end naturally. Labels wrap, controls remain in bounds, no root overflow hiding. Back-to-top becomes an in-flow action that scrolls the actual “Konten halaman” workspace and restores heading focus.

### Tasklist
- [ ] Extend the existing hermetic E2E with sparse/dense geometry, usable widths/sidebar, local overflow, control/focus ordering and real-scroller regression; capture baseline and confirm RED.
- [ ] Implement the smallest coherent width-aware composition and in-flow back-to-top; preserve every data path.
- [ ] Batch visual inspection and one bundled correction at most; save geometry and section screenshots for mobile/tablet/desktop, light/dark, expanded/collapsed sidebar.
- [ ] Run all insights E2E, web typecheck/lint/build, diff check, Impeccable detector and source thermo-nuclear review; record exact evidence and investigation dispositions.
- [ ] Update the SIDAK dashboard paragraph and implementer report. Graphify update reserved for integration owner.



## Iteration 6 — "Ringkas terarah" redesign (Lane D)

### Requirement
Pengguna masih belum puas dengan iterasi 4–5 dan memilih arah **Ringkas terarah** (2026-10-05). Dashboard harus enak dilihat dan menonjolkan data penting SIDAK tanpa mengulang angka yang sama di beberapa kartu. Tidak ada perubahan API, shared types, scoring, akses, atau dependency.

Kriteria penerimaan:
- Header menyatakan cakupan aktif (layanan · tim · rentang bulan tahun) dan tombol **Perbarui data** tetap ada.
- Empat KPI tampil dalam satu strip (bukan empat kartu terpisah) dengan nilai, keterangan, delta, dan sparkline yang sama.
- **Ringkasan temuan** berisi tiga sorotan berdampingan: periode terbaru (jumlah + perbandingan jumlah), porsi kritikal (bar komposisi + denominator, menggantikan donut), dan **Perkiraan temuan** (arah/perubahan/horizon/kepercayaan, Perbarui Prediksi, Analisis lengkap).
- Tren dan Top 5 agen berdampingan pada lebar cukup; Top agen menampilkan skor, tim, jumlah temuan dengan bar proporsional, dan penanda kritikal berlabel teks.
- **Parameter teratas** (Pareto) memakai bar horizontal dengan nama parameter terbaca penuh, jumlah, porsi, dan kumulatif; tanpa grafik dua sumbu.
- **Pola temuan tahunan** menampilkan total per bulan dari endpoint heatmap yang sudah ada, tanggal puncak, catatan cakupan, serta loading/error/empty state dan tautan kalender lengkap.
- Toggle seri tren (maks. 2), toggle garis forecast, back-to-top in-flow, refresh error state, dan empty/no-data state tetap berfungsi.

### Design
Mode Operate, tokens Outfit/Inter yang ada. Panel memakai `bg-surface-elevated` + border agar terpisah dari latar pada light mode; tray filter tetap. Hierarki dibangun dengan ukuran tipografi dan grid berbagi garis (divider), bukan kartu bertumpuk. Warna kritikal memakai `--module-sidak` (rose) dengan label teks, bukan warna saja. Mobile: satu kolom, KPI 2×2 → 1 kolom pada lebar sangat sempit.

Scope: `apps/web/src/routes/sidak/dashboard.tsx`, `KpiCard.tsx`, `SidakConditionSummary.tsx`, `SidakDashboardHeatmap.tsx`, `TopAgentsTable.tsx` (hanya dipakai dashboard), komponen baru `SidakParameterRanking.tsx`, E2E insights, `docs/modules.md`, plan ini. `ParetoChart`/`FatalDonutChart` tidak dihapus (masih dirujuk unit test legacy).

### Tasklist
- [x] Perbarui E2E hermetic untuk hierarki/teks baru; jalankan dan konfirmasi RED.
- [x] Implementasi layout, strip KPI, sorotan, ranking parameter, pola tahunan, top agen.
- [x] GREEN E2E; tinjau screenshot desktop/mobile/light/dark satu putaran + satu koreksi.
- [x] Web typecheck, lint, build, Impeccable detector, `git diff --check`.
- [x] Perbarui docs/modules.md.

### Verification (iteration 6)
- RED: `pnpm --dir apps/web exec playwright test e2e/sidak-dashboard-insights.spec.ts` — 5 gagal sesuai harapan (region/teks baru belum ada), 2 tes state lama lulus.
- GREEN: perintah yang sama — 7/7 lulus (hermetic, seluruh API/auth dimock, audit blocked kosong). Satu putaran ulang sempat gagal 7/7 karena cache browser Playwright terhapus di luar sesi; `playwright install chromium` lalu 7/7 lulus.
- Capture `SIDAK_LAYOUT_CAPTURE=1` ke `.pi/orchestrator/sidak-dashboard-order/final/` (sparse/dense, 320–1440, light/dark) ditinjau; satu koreksi gabungan (strip KPI 2 kolom di mobile, kontras segmen non-kritikal di dark, tautan ranking ke footer, baris tim/skor agen).
- `pnpm --filter @trainers/web typecheck` lulus; `lint` 0 error / 107 warning baseline; `build` lulus.
- Prettier check, `git diff --check`, dan `impeccable detect --json` (7 file UI) → `[]`.
- Tidak menjalankan root lint/graphify; tidak ada perubahan API/types/schema.

### Iteration 6b — Pola tahunan tanpa ruang kosong
- Requirement: hilangkan ruang kosong di panel Pola temuan tahunan saat panel di sebelahnya lebih tinggi, tanpa metrik rekaan.
- Design: grafik bulanan mengisi sisa tinggi panel (min 112px); tambah baris statistik dari `buildHeatmapInsights`: hari dengan temuan, rata-rata per hari aktif, hari tersibuk berlabel "(volume)". Label bulan memakai inisial pada container <480px.
- [x] RED: E2E statistik + celah statistik→catatan ≤24px (dense ≥1024px) gagal sesuai harapan.
- [x] GREEN: `SIDAK_LAYOUT_CAPTURE=1 pnpm --dir apps/web exec playwright test e2e/sidak-dashboard-insights.spec.ts` 7/7 lulus; screenshot 320/1280/1440 light/dark ditinjau.
- [x] Web typecheck, lint (0 error/107 warning baseline), build, prettier, `git diff --check`, `impeccable detect` → `[]`.
