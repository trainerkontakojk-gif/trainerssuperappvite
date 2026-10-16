# SIDAK redesign: beranda kerja, cakupan bersama, satu bahasa halaman

Lane D (significant UI redesign, banyak halaman, tanpa backend). Status:
**DIIMPLEMENTASI, belum di-commit** di branch `feat/sidak-redesign` (2026-10-15).
Keputusan terbuka 1–4 diambil sesuai usulan (lihat bagian itu); bisa diubah
sebelum merge. Mockup: artifact "Redesign Modul SIDAK" dan "Halaman SIDAK"
(2026-10-15). Dibuat dari `main` @ 717ff0d.

## Latar

KETIK, PDKT, dan Telefun sudah memakai satu pola: landing berbasis data dengan
satu aksi utama, menu kecil, dan bagian "Perlu tindak lanjut". SIDAK belum.
Sebagian besar sub-halaman SIDAK sudah dirapikan satu per satu (Input Temuan,
Parameter QA, Periode QA, Forecast, Filter analitik), tetapi modulnya belum
terasa sebagai satu alat kerja:

| Bagian           | Kondisi sekarang (`main` @ 717ff0d)                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beranda `/sidak` | Hero "Selamat Datang di SIDAK" + chip "Modul Utama" + 7 kartu tautan dengan teks pemasaran ("Pusat kendali utama…", "algoritma komposit…"). Tidak ada data.                                        |
| Cakupan filter   | Tiap halaman punya state sendiri (bawaan `call` + tahun berjalan). Pindah Dashboard → Ranking → Heatmap mengulang pemilihan layanan/tahun/tim.                                                     |
| Kepala halaman   | Empat gaya `h1` berbeda: `font-outfit font-bold`, `font-heading font-semibold`, `font-extrabold`, ukuran `xl`/`2xl`/`3xl`.                                                                         |
| Warna            | 190 kelas palet hardcode (`emerald-*`, `rose-*`, `amber-*`, `red-*`, `green-*`) di 22 file; paling banyak di `SidakInputImportPanel`, `ForecastInsightPanel`, `TemuanGroupCard`, `AgentTemuanTab`. |
| Tipografi        | 27 `uppercase` di 9 file (mis. `AiInsightCard`, `NilaiBadge`, `ParamTrendChart`, `MonthMatrix`), 2 `font-black`.                                                                                   |
| Konfirmasi       | 3 `window.confirm` di `hooks/useTemuanForm.ts` (2) dan `hooks/useTemuanImport.ts` (1).                                                                                                             |
| Detail agen      | Data coaching lengkap (dossier, tiket pengurang, akar masalah) tetapi tersebar di tab; tidak ada ringkasan "apa yang dibahas di coaching".                                                         |

## Requirement

1. **Beranda kerja di `/sidak`.** Ganti hero + kartu dengan halaman berbasis data,
   per peran:
   - Kepala: `h1 "SIDAK"`, satu baris cakupan ("Periode QA terbaru Oktober 2026 ·
     Call · Semua tim"), satu aksi utama sesuai peran (admin/trainer: **Input
     temuan**; leader: **Lihat agen saya**), menu kecil (Laporan, Jadwal shifting,
     Kelola) yang tersaring capability.
   - **Kondisi periode terbaru**: satu strip empat angka (rata-rata skor agen, agen
     diaudit, temuan, tiket) dengan perubahan dibanding periode sebelumnya. Dari
     `GET /sidak/dashboard` → `periodMetrics`; tidak ada angka karangan.
   - **Perlu tindak lanjut**: agen di bawah target 95, skor terendah dulu, dengan
     skor, perubahan, dan tombol "Buka". Definisi dan scope sama dengan
     `agents_below_target` di Beranda (`GET /sidak/agents`). Bila proyeksi ada di
     cache (`cacheOnly`), agen berstatus Memburuk ditandai; bila tidak ada, tulis
     "Belum ada proyeksi" + tautan Forecast. Tidak memicu forecast baru.
   - **Parameter teratas**: 3 parameter teratas dari Pareto (`paretoData`) dengan
     jumlah dan porsi, tautan ke Dashboard.
   - **Halaman SIDAK**: daftar berbaris dikelompokkan menurut pekerjaan — Audit
     (Input temuan, Periode QA, Parameter QA), Analisis (Dashboard, Ranking,
     Heatmap, Forecast), Agen, Laporan (Laporan data, Jadwal shifting). Satu baris
     fungsi per halaman, bahasa biasa. Tersaring `buildNavModel(role)`, bukan
     daftar lokal.
   - Tiap bagian punya state memuat / kosong / gagal + "Coba lagi" sendiri.
2. **Cakupan bersama.** Layanan, tahun, rentang bulan, dan tim/folder disimpan di
   query URL (`?layanan=call&tahun=2026&dari=1&sampai=10&tim=…`) dan dibawa
   ketika berpindah antar halaman SIDAK (Dashboard, Ranking, Heatmap, Forecast,
   Agen, Detail agen, Laporan data). Satu komponen `SidakScopeBar` + hook
   `useSidakScope`. Halaman yang tidak memakai salah satu filter menyatakannya
   ("Heatmap memakai tahun dan layanan saja"), bukan diam-diam mengabaikannya.
   Bawaan tetap: layanan `call`, tahun berjalan, Januari s.d. bulan ini.
3. **Satu kepala halaman.** `SidakPageHeader`: `h1` `font-display text-2xl
font-bold tracking-tight`, satu kalimat penjelas, baris cakupan, aksi di kanan
   (wrap di layar sempit). Dipakai semua halaman SIDAK; empat varian `h1` hilang.
4. **Detail agen sebagai lembar coaching.** Di atas tab Ringkasan, blok **Bahan
   coaching** untuk bulan terpilih: skor + status, parameter paling sering muncul
   (dari dossier yang sudah ada), 3 tiket pengurang terbesar dengan tautan ke tab
   Temuan, dan arah forecast bila ada di cache. Tanpa data baru dari backend.
5. **Input temuan tanpa `window.confirm`.** Ketiga konfirmasi memakai
   `components/sidak/ConfirmDialog.tsx`. Setelah simpan, status `role="status"`
   menyebut hasilnya dan memberi tautan "Buka detail agen" (cakupan ikut).
6. **Satu bahasa visual.** Ganti warna hardcode dengan `SIDAK_SCORE_TEXT` /
   `SIDAK_SCORE_FILL` / `forecast-status.ts` / token `chart-*`; hapus `uppercase
tracking` dan `font-black`; label ≥12px, kontrol `min-h-[44px]`. Istilah:
   "agen" (bukan agent), "temuan", "Pantauan".

### Non-goal

- Tidak ada perubahan backend, skema, migrasi, atau capability. Semua angka berasal
  dari endpoint yang sudah ada.
- Perilaku scoring, ranking, heatmap, forecast, export, dan Jadwal shifting tidak
  berubah; hanya kepala halaman, cakupan, dan gaya.

## Keputusan terbuka (diambil sesuai usulan; Fajar bisa membatalkan sebelum merge)

1. **Beranda vs Dashboard.** Usulan: tetap dua halaman. Beranda = "apa yang perlu
   ditindaklanjuti", Dashboard = analisis lengkap. Alternatif: `/sidak` langsung
   Dashboard dan Beranda dihapus.
2. **Demo animasi di beranda** (seperti KETIK/Telefun). Usulan: tidak. SIDAK alat
   data, jadi data nyata menggantikan demo.
3. **Tautan latihan dari detail agen** ("Latih di KETIK/PDKT/Telefun" dari
   parameter yang sering muncul). Usulan: PR terpisah, karena menyentuh penugasan
   KETIK yang sedang dikerjakan (`ketik-integrity-resilience.md` bagian B).
4. **Nama menu.** Usulan: "Analisis Individu" → "Agen", "Beranda SIDAK" →
   "Ringkasan". Mengubah teks nav + breadcrumb + E2E yang mencarinya.

## Penyimpangan dari usulan (hasil cek kode)

- **Proyeksi per agen di beranda** awalnya tidak ditampilkan; sejak putaran
  keempat ditampilkan (lihat di bawah). Bahan coaching: arah forecast tetap di
  sidebar profil (sudah ada), tidak diulang.
- **Cakupan bersama** dipakai Ringkasan, Dashboard, Forecast, Ranking, Heatmap
  (tahun + layanan; "Semua layanan" tetap lokal), dan Agen (tahun); sejak
  putaran keempat juga Detail agen dan Laporan data. Sidebar tidak membawa
  query, jadi cakupan terakhir juga disimpan di `sessionStorage` lalu ditulis ke
  URL. `tim=ALL` = "Semua tim" dipilih sengaja (pasangan tim bawaan tidak
  menimpanya).
- **`SidakScopeBar` tidak dibuat.** Tiap halaman tetap memakai bar filternya
  (`DashboardFilters`, `ForecastFilterBar`, `FilterSelect` di Ranking/Heatmap)
  yang kini membaca dan menulis cakupan bersama lewat `useSidakScope`; menyatukan
  kontrol dan tombol "Cakupan" + sheet di ponsel ditunda karena tiap halaman
  punya filter tambahan (periode Ranking, horizon Forecast, mode Heatmap).
- **Beranda memakai "Semua tim"** sampai tim dipilih; Dashboard masih memasangkan
  tim bawaan per layanan (perilaku lama). Baris cakupan di kedua halaman
  menyebutkan tim aktifnya.
- **Kelompok "Agen"** di daftar halaman digabung ke Analisis karena hanya berisi
  satu tautan yang namanya sama.
- **Pembersihan warna** dibatasi ke warna status tanpa pasangan gelap
  (`text-*-500/600`, `red-*`, `green-*`) yang dipetakan ke pasangan 700/400 seperti
  `SIDAK_SCORE_TEXT`; kelas palet yang sudah berpasangan terang/gelap dibiarkan.
  `NilaiBadge` dihapus karena tidak dipakai di mana pun.
- **Putaran mockup per halaman (2026-10-16), setelah cek browser Fajar.**
  Dikerjakan:
  - Grafik tren di Dashboard dan Forecast menulis angka aktual dan proyeksi di
    tiap titik, menandai area "Proyeksi", dan memberi legenda Aktual/Proyeksi.
  - Agen: filter Status (Perlu perhatian, Mendekati target, Memenuhi target,
    Belum diaudit), urutan Skor terendah / Skor tertinggi / Nama A–Z, ringkasan
    "N agen · M di bawah target", dan satu baris filter di desktop.
  - Forecast: Periode proyeksi masuk ke bar filter yang sama.
  - Analisis Parameter: nama dan angka perubahan dipisah, angka rata kanan.
  - Detail agen: tab aktif disimpan di `?tab=`.

  Putaran kedua (hari yang sama):
  - Ranking: segmen Tim gabungan / Per tim leader. Per tim mengelompokkan
    agen menurut `tim` dan menghitung peringkat di dalam tim. "Unduh Excel"
    di kepala halaman adalah fitur baru di sisi klien (`writeFlatExcel`, tanpa
    backend) dan isinya mengikuti tampilan yang aktif. Kolom "Kritikal" di
    mockup berupa jumlah, tetapi API hanya memberi `hasCritical`, jadi Excel
    menulis Ya/Tidak dan tabel tidak menambah kolom.
  - Detail agen, Tren: kontrol "Total + parameter", lalu tabel "Temuan per
    parameter" (bulan, Total, Arah). Arah dihitung di klien dari deret yang
    sudah dimuat (`parameterTrendDirection`).
  - Detail agen, Heatmap: kalender di kiri; tanggal terpilih (dengan nama
    hari) dan empat fakta di kanan. Tautan "Buka di tab Temuan" dari tanggal
    tidak dibuat karena respons heatmap tidak menyertakan tiket.
  - Detail agen, Simulasi: tabel Modul, Skenario, Tanggal, Telaah, Skor, dan
    aksi "Lihat telaah"/"Lihat sesi". Filter modul memakai `aria-pressed`.
    Durasi dan pelaksana tidak lagi tampil di baris, tetapi tetap ada di modal
    telaah.
  - Dashboard: sparkline KPI sempat dibuat selebar kartu, lalu dikembalikan
    ke bentuk semula (kecil, di samping angka) atas permintaan Fajar.

  Putaran ketiga, setelah dibandingkan langsung dengan mockup di browser:
  - Kepala halaman: label kecil "SIDAK" / "SIDAK · Audit" / "SIDAK · Laporan"
    di atas judul pendek (Dashboard, Ranking, Heatmap, Input temuan, Laporan
    data, Jadwal shifting), dengan kalimat penjelas dari mockup.
  - Sidebar dan direktori: urutan dan label mengikuti mockup (Ringkasan,
    Dashboard, Ranking, Heatmap, Forecast, Agen, Input temuan, Periode QA,
    Parameter QA, Laporan data, Jadwal shifting). Agen kembali punya kelompok
    sendiri, dan direktori berupa empat kolom dalam satu kotak.
  - Bar cakupan Dashboard, Forecast, Ranking, dan Heatmap: satu baris tanpa
    kotak dan ikon. Rentang bulan masih dua pilihan (Dari/Sampai), belum satu
    kontrol seperti di mockup. Ranking tetap memakai Periode (YTD/All time/
    bulan) karena API ranking tidak menerima rentang bulan.
  - Dashboard: label dan urutan KPI sempat diubah mengikuti mockup, lalu
    dikembalikan ke versi semula atas permintaan Fajar. Judul "Ringkasan
    temuan" kini terlihat. Chip parameter tren menampilkan empat dulu, lalu "+N parameter
    lain".
  - Ranking: kolom Tim · Batch selalu tampil, ada penanda "kritikal", dan
    tabelnya dalam kotak.
  - Heatmap: kalender tampil sebelum angka dan pola. Kalender masih per bulan,
    belum satu kisi setahun seperti di mockup.

  Putaran keempat (setelah commit `5451c676`), menutup sisa celah di atas:
  - Heatmap (halaman dan tab agen): satu kisi setahun, kolom = minggu (Senin di
    atas), label bulan di atas, skala warna rose yang terbaca di tema gelap.
    Tiap hari tetap tombol berlabel tanggal + jumlah.
  - Rentang bulan jadi satu kontrol (`MonthRangePicker`): pemicu "Januari –
    Oktober", popover kisi 12 bulan (klik awal lalu akhir), dan "Semua bulan".
  - Cakupan bersama juga dibaca Detail agen (tahun, layanan, rentang tren;
    `?tab=` tetap) dan Laporan data (layanan, tahun, bulan; "Semua layanan" dan
    rentang terbalik tetap lokal). Bar cakupan Dashboard/Forecast/Ranking punya
    "Atur ulang" (`resetScope`: hapus query + sesi). `SidakScopeBar` tetap tidak
    dibuat; bar filter tiap halaman yang membaca cakupan.
  - Ranking memakai rentang bulan cakupan: API `GET /sidak/ranking?period=range
&startMonth&endMonth` memetakan bulan ke periode QA (tanpa periode = ranking
    kosong, bukan semua periode) dan membandingkan dengan rentang sepanjang yang
    sama tepat sebelumnya. Rentang tidak valid = 400. Periode YTD/All time/bulan
    dihapus dari UI. `TopAgentData.criticalFindings` (jumlah temuan pada
    parameter kritikal) mengisi kolom Kritikal di tabel dan Excel.
  - Heatmap agen: respons dengan `agent_id` menyertakan `days[].tickets`
    (nomor tiket + bulan periode QA). Tanggal terpilih menyebut tiketnya dan
    "Buka … di tab Temuan" membuka grup tiket itu.
  - Ringkasan: "proyeksi memburuk" di Perlu tindak lanjut dari
    `POST /sidak/forecast/agents`. Endpoint itu regresi linear tanpa AI dan
    tanpa simpan (biaya sama dengan membuka Forecast), jadi tidak butuh mode
    cache; hanya dipanggil untuk peran dengan `sidak.forecast.generate`. Bila
    gagal, daftar tetap tampil dan halaman menyebut proyeksi belum bisa dimuat.

  Putaran kelima (setelah cek browser Fajar):
  - Ranking: segmen "Tim gabungan / Per tim leader" dihapus (dropdown Tim sudah
    ada). "Perubahan posisi" tidak pernah kosong: tanpa pembanding tertulis
    "Tanpa pembanding", dan baris jumlah menyebut rentang pembandingnya
    (`comparison.label`). Pembanding rentang = bulan dalam rentang sebelum
    periode aktif terakhir; bila periode aktif terakhir bulan pertama rentang,
    bulan sebelumnya.
  - Heatmap: jeda 10px antarbulan, dan bar "Temuan per hari dalam minggu"
    (`SidakWeekdayBars`, sama dengan Dashboard) di bawah kalender halaman dan
    tab agen.
  - **Ringkasan dihapus atas permintaan Fajar.** `/sidak` membuka Dashboard
    dengan query cakupan yang sama (gerbang akses leader tetap di `/sidak`,
    karena route guard mengalihkan leader belum disetujui ke sana). Menu
    "Ringkasan", daftar "Halaman SIDAK", komponen `components/sidak/home/*`,
    `utils/sidakHomeSummary.ts`, dan `e2e/sidak-landing.spec.ts` ikut dihapus.
  - Grafik tren: label "Proyeksi" di dalam area arsir dihapus karena menumpuk
    dengan angka titik proyeksi; keterangan tetap di legenda.
  - Detail agen mengikuti mockup: sidebar berupa baris ringkas (Skor bulan,
    Peringkat tim gabungan "7 / 42", Peringkat tim leader, Forecast 3 bulan)
    dengan catatan dasar peringkat yang selalu terlihat. **Arti peringkat
    tetap: 1 = temuan paling sedikit**, kebalikan halaman Ranking (keputusan
    Fajar; mockup menulis sebaliknya). Tab Temuan menulis jumlah temuan
    cakupan; Tren memakai satu kontrol rentang bulan; Temuan punya saringan
    Bulan dan Cari (nomor tiket atau parameter), dikosongkan saat tiket dibuka
    dari Ringkasan atau Heatmap. Jumlah di tab Simulasi tidak dibuat: riwayat
    dimuat per halaman tanpa total, jadi butuh request tambahan di tiap
    pembukaan detail.
  - Input temuan: daftar temuan jadi satu kolom, satu blok per tiket. Kepala
    tiket menyebut tanggal layanan, jumlah temuan, dan potongan skor sesi
    (100 − skor sesi, dihitung dengan `calculateSessionScoreFromTemuan`).
    Kolom baris: parameter + Kritikal/Non-kritikal, ketidaksesuaian,
    sebaiknya, nilai, Ubah/Hapus. Hapus memakai dialog aplikasi (bukan klik
    dua kali). Tombol "Sesi tanpa temuan", "Impor Excel", "Tambah temuan";
    input form 44px. **Poin nilai 3/2/1/0 tidak diubah** (keputusan Fajar):
    pemilih dan tampilan nilai tetap angka dengan warna dan label lamanya,
    bukan "Kritis/Tidak sesuai/Perbaikan/Sesuai" seperti mockup. Baris versi
    parameter ("v4 sejak Agustus 2026") tidak dibuat karena API Input hanya
    mengirim `ruleVersionId`, tanpa nomor versi dan tanggal berlaku.
  - Periode QA: endpoint baru `GET /sidak/periods/usage`
    (`sidak.config.manage`) mengembalikan `QAPeriodUsage[]` (jumlah temuan dan
    versi aturan per periode). Hitungannya memakai fungsi yang sama dengan
    penolakan hapus (`countPeriodUsage`), fail closed bila hitungan gagal.
    Baris menampilkan "N temuan", "Dipakai versi parameter", atau "Tanpa
    temuan"; tombol hapus nonaktif untuk periode terpakai dengan alasan di
    `aria-describedby`. Bila pemakaian gagal dimuat, daftar tetap tampil,
    tombol tetap aktif, dan backend tetap menolak saat dikonfirmasi. Isi
    halaman rata kiri (tanpa `mx-auto`). Hitungan dibuat dua query `head`
    per periode; cukup untuk puluhan periode, perlu RPC bila jumlahnya ratusan.

## Design

- `routes/sidak/index.tsx`: beranda baru. Komponen baru di
  `components/sidak/home/`: `SidakHomeHeader.tsx`, `SidakPeriodStrip.tsx`,
  `SidakFollowUpList.tsx`, `SidakTopParameters.tsx`, `SidakPageDirectory.tsx`;
  turunan angka di `utils/sidakHomeSummary.ts` (murni, tanpa fetch).
- `components/sidak/SidakPageHeader.tsx` + `SidakScopeBar.tsx`,
  `hooks/useSidakScope.ts` (baca/tulis search params TanStack Router; validasi di
  `router.tsx` per route SIDAK). `DashboardFilters` menjadi pembungkus tipis di
  atas `SidakScopeBar` lalu dihapus setelah semua halaman pindah.
- `components/sidak/AgentCoachingBrief.tsx` di atas Ringkasan detail agen; memakai
  `AgentAuditDossier` model yang sudah ada.
- `hooks/useTemuanForm.ts`, `hooks/useTemuanImport.ts`: kembalikan permintaan
  konfirmasi ke komponen; `SidakInputManualForm`/`SidakInputImportPanel` membuka
  `ConfirmDialog`.
- `components/layout/nav-config.ts`: grup dan label SIDAK (bila keputusan 4
  disetujui); beranda membaca daftar halaman dari `buildNavModel`.
- Dokumentasi: `docs/design.md` bagian SIDAK (beranda, cakupan, kepala halaman),
  `docs/modules.md` bagian 6.

### UX constraints (ui-ux-pro-max)

- Surfaces: `/sidak` beranda, kepala + cakupan di semua sub-halaman, Bahan coaching
  di `/sidak/agents/$id`, dialog konfirmasi Input temuan.
- Hierarki: satu aksi utama per halaman; ringkasan sebelum detail; tindak lanjut
  sebelum navigasi.
- Mobile: strip angka menjadi grid 2×2; daftar tindak lanjut tetap baris (skor di
  kanan); cakupan dilipat menjadi satu tombol "Cakupan: Call · 2026 · Jan–Okt"
  yang membuka sheet.
- Token saja (`bg-surface-elevated`, `text-fg2`, `text-module-sidak` hanya untuk
  aksen kecil); tanpa kartu ikon, tanpa garis samping berwarna, tanpa label
  kapital, kontrol ≥44px, teks ≥12px.
- Status skor selalu teks + warna (Memenuhi target / Mendekati target / Perlu
  perhatian), tidak hanya warna.

## Tasklist

- [x] Keputusan terbuka 1–4: diambil sesuai usulan (2 halaman, tanpa demo, latihan
      di PR terpisah, nama menu "Ringkasan" + "Agen").
- [x] RED: `e2e/sidak-landing.spec.ts` (trainer, leader, gagal, kosong) — gagal
      karena elemen baru belum ada, lalu hijau.
- [x] `e2e/sidak-scope.spec.ts` (query → request, terbawa lewat sidebar ke Ranking
      dan Heatmap, query tidak valid). Catatan: spec ini ditulis sebelum
      implementasi tetapi tidak dijalankan RED terlebih dulu.
- [x] RED: `e2e/sidak-input-layout.spec.ts` dialog konfirmasi (gagal karena
      `window.confirm` muncul), lalu hijau; status sukses + tautan detail agen.
- [x] RED: `e2e/sidak-agent-detail-layout.spec.ts` Bahan coaching, lalu hijau.
- [x] Spec shell yang terdampak diperbarui: `shell-focus`, `sidebar-nav-state`,
      `sidak-reports-removed`, `sidak-minor-polish` (tes beranda lama dihapus,
      kontraknya pindah ke `sidak-landing`). Fixture bersama
      `e2e/helpers/sidakHomeFixture.ts`.
- [x] GREEN fase 1: beranda + `components/sidak/home/*` + `utils/sidakHomeSummary.ts`.
- [x] GREEN fase 2: `SidakPageHeader` (semua sub-halaman) + `useSidakScope` +
      `validateSidakScopeSearch` di router.
- [x] GREEN fase 3: `AgentCoachingBrief`, `ConfirmDialog` via `useConfirmRequest`.
- [x] GREEN fase 4: tanpa `uppercase`/`font-black` di SIDAK, warna status tanpa
      pasangan gelap diseragamkan.
- [x] Reviews: impeccable audit (detector bersih; grup Agen digabung),
      thermo-nuclear (label tiket diduplikasi → `topTicketLabel`, cast nav dihapus,
      baris cakupan Agen tanpa teks palsu "layanan").
- [x] Gates (2026-10-15): regresi hermetic SIDAK + shell (24 spec `sidak-*` +
      `shell-focus`, `sidebar-nav-state`, `authenticated-shell`, `home-staff`,
      `dashboard-trend-forecast`): 350 lolos, 3 gagal karena spec lama (label
      "slik" → "SLIK", kartu landing Heatmap, request landing yang bocor ke audit
      di tes peran Jadwal) → spec diperbarui, rerun 10 spec terdampak 129/129
      lolos. `pnpm typecheck`, `pnpm lint` (0 error), `pnpm build`,
      `git diff --check`, `graphify update .` lolos. Tidak dijalankan:
      `sidak-heatmap-integration` dan `sidak-heatmap-browser-integration` (butuh
      `apps/api/.env.integration`, tidak ada di worktree).
- [x] Unit test lama `src/__tests__/sidak-filter-pairing.test.tsx` dan
      `sidak-dashboard-forecast-state.test.tsx`: `useSidakScope` dimock dengan
      state lokal. Dijalankan atas izin Fajar (`pnpm exec vitest run` dua file):
      4 lolos, 9 gagal. Baseline `main` @ 717ff0d di worktree sementara
      memberi 9 kegagalan yang sama dengan error yang sama (`isServer` dari
      `Link` tanpa router; `undefined is not iterable` di Ranking), jadi tidak
      ada regresi. Kegagalan lama itu lalu diperbaiki: test Ranking memakai
      combobox Base UI (bukan `<select>` native), `Link` dan `getErrorMessage`
      dimock, dan dua test forecast menguji UI sekarang ("Garis proyeksi" +
      prop proyeksi grafik) alih-alih teks insight/tombol "Sembunyikan Prediksi"
      yang sudah lama dihapus. Hasil: 13/13 lolos.
- [x] Suite browser penuh (55 spec non-API, tanpa dua spec integrasi Heatmap):
      611 lolos, 3 dilewati, 2 gagal di `tna-flow` (tes peran leader membuka
      `/sidak` tanpa mock beranda) → mock beranda ditambahkan, rerun 2/2 lolos.
- [x] Cakupan di Detail agen dan Laporan data (putaran keempat).
- [ ] Lanjutan (PR terpisah): tautan latihan KETIK/PDKT/Telefun dari Bahan
      coaching.
