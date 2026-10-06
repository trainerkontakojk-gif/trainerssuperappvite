# Profiler Workspace — Redesign Tahap 1

Lane D (redesign UI signifikan). Tidak ada perubahan API, shared types, database, role/akses, atau dependency.

## Requirement

`/profiler` saat ini memecah satu tugas (pilih batch → kerjakan pesertanya) menjadi dua layar yang saling mengganti, dengan navigasi tahun/tim/batch yang tampil tiga kali (navigator tengah, panel hierarki kanan, breadcrumb header), dan setelah batch dipilih pengguna hanya melihat tile menu, bukan pesertanya. Pilihan batch juga hilang saat refresh.

Kriteria penerimaan:

- Satu navigasi: panel kiri berisi pemilih tahun, pencarian, dan daftar tim → batch beserta jumlah peserta. Aksi folder (tambah batch, duplikat, ubah nama, hapus) ada di menu baris dan disembunyikan untuk mode hanya-baca. Di viewport sempit panel dibuka lewat tombol "Pilih batch".
- Batch aktif disimpan di URL (`/profiler?batch=<nama>`); refresh dan tombol back mempertahankan/mengembalikan pilihan. Nama batch yang tidak dikenal kembali ke ringkasan tahun.
- Batch aktif langsung menampilkan daftar peserta (grid kartu yang sama dengan `/profiler/table`) dengan pencarian nama. Tab **Peserta** di halaman; **Statistik**, **Slide**, **Ekspor**, dan **Tabel lengkap** menuju route yang sudah ada dengan `?batch=`.
- Satu tombol **Tambah peserta** (pilih dari daftar, input manual, impor Excel) untuk mode tulis; tidak tampil untuk mode hanya-baca.
- Ulang tahun batch menjadi satu baris info yang hanya muncul jika ada data, membuka modal yang sudah ada.
- Tanpa batch terpilih: ringkasan tahun berupa daftar batch (tim, batch, peserta) yang bisa diklik dan widget ulang tahun global. Empty state untuk tahun tanpa tim dan tanpa arsip tahun.
- Hapus hero/tile/kartu dekoratif (Tips navigasi, Mode akses, badge "Workspace aktif") dan toggle tema ganda (app shell sudah punya).

## Design

- `index.tsx` memegang data dan dialog (tahun, folder, rename, hapus, duplikat, picker, ulang tahun) seperti sekarang; state batch dibaca dari `useQueryParams()` dan ditulis lewat `navigate({ to: "/profiler", search })`.
- Komponen baru di `components/workspace/`:
  - `ProfilerLibraryNav.tsx` — panel kiri (desktop) dan isi sheet (mobile).
  - `ProfilerYearOverview.tsx` — isi kanan tanpa batch.
  - `ProfilerBatchWorkspace.tsx` — header batch, tab, baris ulang tahun, roster.
- Roster memakai ulang `ProfilerParticipantGrid` (density compact, tanpa sort/select). Klik/ubah peserta membuka `/profiler/table?batch=` (tempat modal edit berada); tombol analisis tetap ke `/sidak/agents/$id`.
- Dihapus karena tergantikan: `WorkspaceHeader`, `WorkspaceNavigator`, `WorkspaceActiveBatch`, `HierarchyPanel`, `BatchHero`, `InsightPanel`, `ActionToolTile`, beserta unit test `profiler-workspace-navigator.test.tsx` dan `profiler-hierarchy-panel.test.tsx` (tidak terdaftar di manifest suite) setelah E2E pengganti hijau.
- Visual mengikuti `docs/design.md`: hierarki lewat tipografi/spasi, border tegas, token warna, target sentuh ≥44px, tanpa overflow horizontal di 320–768px.

## Tasklist

- [x] Perluas `apps/web/e2e/helpers/profilerMocks.ts` (counts + peserta batch) dan tulis `apps/web/e2e/profiler-workspace.spec.ts`; jalankan dan konfirmasi RED.
- [x] Implementasi komponen baru dan rewiring `index.tsx`; GREEN.
- [x] Sesuaikan `apps/web/e2e/profiler.spec.ts` ke struktur baru.
- [x] Hapus komponen dan unit test yang tergantikan.
- [x] Web typecheck, lint, build, `git diff --check`, detector Impeccable, self-review.
- [x] Perbarui dokumentasi modul Profiler bila menyebut tata letak lama.

## Verification

- RED: `npx playwright test profiler-workspace.spec.ts` (apps/web) — 8/8 gagal karena navigasi/region baru belum ada.
- GREEN: `npx playwright test profiler-workspace.spec.ts profiler.spec.ts sidebar-nav-state.spec.ts` — 13/13 lulus, Chromium lokal hermetic (dev server localhost:3005, `assertLocalDevOnlyTarget` + `expectHermetic`); 320/375/768 px tanpa overflow horizontal.
- `pnpm --filter @trainers/web typecheck` — exit 0.
- `pnpm --filter @trainers/web lint` — 0 error, 107 warning (file lain/legacy, tidak ada di file baru).
- `pnpm --filter @trainers/web build` — exit 0.
- Prettier (file yang diubah) dan `git diff --check` — bersih.
- `impeccable detect --json` pada 4 file UI — `[]`. Review manual: target sentuh menu baris dinaikkan ke 44px.
- Tambahan di luar rencana awal: `useProfilerAccess` kini membaca role dari auth store (sumber yang sama dengan guard), menggantikan query `profiles` terpisah; error muat peserta kini tampil dengan "Coba lagi" alih-alih tampak sebagai batch kosong.
- Tidak dijalankan: unit test (butuh persetujuan).
- Diketahui: lookup batch tetap berbasis nama (kontrak lama `counts`/`peserta/batch/:name`); nama sama di dua tahun akan memilih yang pertama.

## Tahap 2 — Statistik, Slide, Ekspor di dalam workspace

### Requirement

- Tab **Statistik**, **Slide**, dan **Ekspor** dirender di dalam workspace batch, memakai data peserta yang sudah dimuat workspace (tanpa fetch ulang). Tab aktif disimpan di URL `?view=statistik|slide|ekspor`; peserta yang sedang ditampilkan di Slide disimpan di `?participant=`.
- **Tabel lengkap** tetap tautan ke `/profiler/table` (penyuntingan, urutan, pindah folder).
- Deep link lama `/profiler/analytics`, `/profiler/slides`, `/profiler/export` (dan alias `/profiler/download`, `/preview/profiler-slides`) diarahkan ke workspace dengan `batch`/`view`/`participant` yang sesuai.
- Konten tidak berubah: grafik + daftar peserta per segmen, slide + mode + simpan PNG/PDF + navigasi, ekspor Excel/CSV/PPTX/PDF dengan orientasi. Kartu ringkasan dekoratif ("Batch aktif", "Mode akses", ikon-tile) diganti satu baris ringkasan.
- Tab tetap tersedia untuk peran hanya-baca (semuanya operasi baca/unduh).

### Design

- Panel baru di `components/workspace/panels/`: `ProfilerStatsPanel`, `ProfilerSlidesPanel`, `ProfilerExportPanel`, diambil dari isi `analytics.tsx`, `slides.tsx`, `export.tsx`; dimuat lazy agar recharts/pptx/pdf tidak masuk chunk awal `/profiler`.
- Route `analytics`/`slides`/`export` menjadi redirect di `router.tsx` (membaca `searchStr` mentah); file route dan `ProfilerExportToolbar` dihapus. Breadcrumb di `nav-config.ts` dan `ProfilerRouteNav` diarahkan ke view workspace.
- E2E: perluas `profiler-workspace.spec.ts` (tab di URL, isi tiap panel, unduhan Excel nyata dari data mock, redirect deep link, overflow 375px per tab).

### Tasklist

- [x] E2E RED untuk tab, redirect, dan unduhan.
- [x] Ekstrak panel + wiring tab/URL; redirect route lama; hapus file tergantikan.
- [x] Typecheck, lint, build, diff check, detector Impeccable, screenshot review.
- [x] Perbarui `docs/modules.md`.

### Verification

- RED: `npx playwright test profiler-workspace.spec.ts` (apps/web) — 9 tes baru/diubah gagal (tab belum ada, redirect belum ada), 7 tes Tahap 1 tetap lulus.
- GREEN: `npx playwright test profiler-workspace.spec.ts profiler.spec.ts sidebar-nav-state.spec.ts` — 21/21 lulus, Chromium lokal hermetic. Termasuk: unduhan Excel nyata (`Batch Pagi_peserta.xlsx`), tidak ada fetch peserta tambahan saat pindah tab, redirect 3 deep link lama, `?participant=` tahan reload, 375 px tanpa overflow per tab.
- `pnpm --filter @trainers/web typecheck` — exit 0. `pnpm --filter @trainers/web build` — exit 0; panel terpisah menjadi chunk lazy (Stats 6.8 kB, Slides 19.6 kB, Export 29.8 kB sebelum gzip).
- ESLint file yang diubah — 0 error; `router.tsx` 37 warning react-refresh (40 di HEAD, pola `lazy()` lama).
- Prettier (file yang diubah) dan `git diff --check` — bersih. `impeccable detect --json` pada 4 file UI — `[]`.
- Review visual 1440 px dan 375 px per tab: slide landscape di layar sempit kini bisa digulir (sebelumnya terpotong kiri-kanan); tombol "Unduh" punya nama aksesibel per format.
- Catatan: `useProfilerAccess`/akses leader ke tab kini lewat `LeaderAccessGate` di `/profiler` (route lama memakai `requireLeaderModuleApproval`); otorisasi data tetap di backend.
- Tidak dijalankan: unit test.

### Tambahan — widget ulang tahun global

- Teks kosong "No data available" diganti "Belum ada ulang tahun terdekat".
- Unit test `global-birthdays-widget.test.tsx` diganti E2E `apps/web/e2e/profiler-global-birthdays.spec.ts` (kartu terdekat vs daftar lengkap di popup + `limit=5`, state kosong, error server lalu "Coba lagi" memanggil ulang API). RED: tes state kosong gagal pada teks lama; GREEN 3/3. Unit test dihapus setelah E2E hijau (tidak terdaftar di manifest suite).
- Gate gabungan: `npx playwright test profiler-workspace.spec.ts profiler-global-birthdays.spec.ts profiler.spec.ts sidebar-nav-state.spec.ts` — 24/24 lulus; typecheck exit 0; `git diff --check` bersih.

## Gate lanjutan (host Pi)

- `graphify update .` — exit 0, 14057 node / 25207 edge / 978 community; `graphify-out/` tetap cache lokal (gitignored). `graph.html` dilewati karena melebihi batas 5000 node (bukan kegagalan).
- `thermo-nuclear` — scoped change PASS; satu perbaikan diterapkan: item menu baris `ProfilerLibraryNav` dinaikkan dari `min-h-10` ke `min-h-11` supaya klaim target sentuh ≥44px benar. Tersisa temuan P3 saja. Gate repo `pnpm lint` gagal karena 2 error pra-eksisting di `apps/api/src/services/sidak/heatmap-service.ts:91` (file tidak tersentuh diff ini) — di luar scope.
- `ui-ux-pro-max` — dijalankan sebagai audit konformitas constraint (skill ini normalnya pra-implementasi): satu navigasi, hierarki tipografi/spasi, empty/loading/error state, target sentuh, dan 320–768px tanpa overflow terverifikasi lewat E2E; tidak ada tema/macrostructure baru.
- Verifikasi ulang setelah perbaikan target sentuh: `npx playwright test` (4 spec Profiler/sidebar) 24/24 lulus; `pnpm typecheck` exit 0; `pnpm --filter @trainers/web lint` 0 error; `pnpm build` exit 0; `git diff --check` bersih.

### Tindak lanjut P3 (thermo-nuclear)

- Ringkasan tahun: tim tanpa batch kini menampilkan nama tim di kolom Tim (bukan "Tanpa batch").
- Slide: `?participant=` yang tidak ada di batch dibersihkan dari URL (`replace`), tampilan jatuh ke peserta pertama — memulihkan perilaku halaman Slide lama.
- RED: 2 assertion/tes baru di `profiler-workspace.spec.ts` gagal (nama aksesibel "Tim Email Tanpa batch 0 peserta"; URL masih membawa `participant=tidak-ada`). GREEN: 4 spec Profiler 25/25; typecheck, ESLint workspace, build exit 0; Prettier dan `git diff --check` bersih.
- Dibiarkan sebagai catatan: `ChartTooltip: any` dan `role` yang tidak dipakai di `useProfilerAccess`.
