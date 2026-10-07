# Text Size Floor

## Requirement

`docs/design.md` §7 menetapkan teks yang dibaca minimal 11px. Kenyataannya:

- `html { font-size: 14px }` membuat `text-xs` Tailwind (0.75rem) dirender 10.5px. Kelas ini dipakai 710 kali di `apps/web/src`.
- Ada 305 ukuran manual `text-[6px]`–`text-[10px]`; 73 di antaranya di SIDAK (`components/sidak`, `routes/sidak`).

Keputusan Fajar (2026-10-07): perbaiki secara global dan mulai dari SIDAK, dengan batas 11px.

Acceptance:

1. `text-xs` dirender ≥ 11px di seluruh aplikasi.
2. Tidak ada teks terlihat < 11px di dashboard SIDAK dan detail agen SIDAK (tab Ringkasan dan Temuan).
3. Tidak ada `text-[6–10px]` tersisa di `components/sidak` dan `routes/sidak`.
4. Layout yang sudah diuji E2E tidak regresi (seluruh suite Playwright default).

Di luar scope: ukuran manual 6–10px di modul selain SIDAK (232 tempat: Telefun, Monitoring, KETIK, PDKT, Profiler, layout) dikerjakan per modul berikutnya.

## Design

Constraint record (`ui-ux-pro-max`):

- Surface: seluruh aplikasi web (global), lalu layar SIDAK.
- Token yang dipertahankan: root 14px, skala Tailwind lain, font, warna. Hanya `--text-xs` di `@theme` yang diubah ke `11px`. Line-height bawaan Tailwind (`calc(1 / 0.75)`, unitless) tetap, jadi baris ikut naik proporsional.
- SIDAK: setiap `text-[6–10px]` diganti `text-xs` (sekarang 11px), sehingga nilai arbitrer hilang dan semuanya memakai satu token. Kelas responsif yang jadi duplikat (`text-xs sm:text-xs`) dirapikan.
- Elemen lebar tetap yang teksnya membesar diperiksa. `SidakInputImportPanel` label baris `R{n}` memakai `w-6`, sehingga diganti `min-w-6 shrink-0` agar nomor baris tiga digit tidak terpotong.
- Non-goal: tidak mengubah hierarki, warna, atau struktur komponen.

## Tasklist

- [x] RED: `e2e/typography-floor.spec.ts` (global `text-xs`), plus scan teks di `sidak-dashboard-insights.spec.ts` dan `sidak-agent-detail.spec.ts` lewat `e2e/helpers/typographyFloor.ts`. Gagal pada nilai lama (10.5px).
- [x] GREEN: `--text-xs: 11px` di `@theme`; 73 penggantian di 22 file SIDAK; `min-w-6` di label baris import.
- [x] Seluruh suite Playwright default.
- [x] `impeccable` audit pada layar SIDAK yang berubah.
- [x] `thermo-nuclear` review.
- [x] Root typecheck, lint, build, `git diff --check`.

## Hasil

- RED: tiga tes gagal pada nilai lama (`text-xs` 10.5px; 46 teks di detail agen, 69 di dashboard SIDAK).
- GREEN: ketiga tes lulus.
- Suite Playwright default di dev server web lokal (port 3005, tanpa backend): 383 lulus, 17 gagal, 3 dilewati, 12 tidak jalan.
  - 16 gagal butuh Supabase lokal (`apps/api/.env.integration`), dan guard loopback memblokir egress remote. Ini lingkungan, bukan regresi.
  - `telefun-history.spec.ts` "landing Telefun dirender tanpa menyentuh backend" juga gagal tanpa baris `--text-xs`. Locator `getByText(/Telefun/).first()` mengenai tooltip sidebar yang tersembunyi. Kegagalan ini sudah ada sebelumnya.
- `impeccable detect` pada 22 file yang berubah: tidak ada temuan.
- Root `pnpm typecheck` exit 0, e2e typecheck exit 0, `pnpm lint` exit 0 (warning lama saja), `pnpm build` exit 0, `git diff --check` bersih.

## Lanjutan: modul Telefun

Requirement: tidak ada teks terlihat < 11px di landing, riwayat, dan modal review Telefun (tab Detail dan Penilaian).

Design:

- 40 `text-[6–10px]` di `routes/telefun` diganti `text-xs` (11px).
- `TelefunMotionFrame` sengaja tidak diubah (7 tempat). Komponen ini mockup ponsel dekoratif (`aria-hidden`) yang meniru layar telepon pada skala kecil, termasuk huruf keypad 6px. Spec landing mengecualikannya secara eksplisit lewat opsi `exclude` di `findTextBelowFloor`.
- Tes lama "landing Telefun dirender tanpa menyentuh backend" sudah gagal sebelum perubahan ini: locator `getByText(/Telefun/).first()` mengenai tooltip sidebar yang tersembunyi, dan landing ternyata memanggil `/telefun/settings` serta `/sessions`. Tes itu digabung dengan scan landing yang baru, memakai locator caption yang terlihat dan mock kedua endpoint.

Hasil:

- RED: scan review menemukan label 10px (Konsumen, Target simulasi, Pelaksana, Tanggal, Durasi, Skor, Rekaman Sesi).
- GREEN: `telefun-history.spec.ts` 13/13 lulus. Spec lain yang menyentuh Telefun (`edukatif-visual`, `authenticated-shell`, `usage`, `access-matrix-api`): 23 lulus, 2 dilewati.
- Belum tercakup E2E: route `/telefun/replay`, tab Replay (`ReplayAnnotator`), dan `CommunicationProfileZoomModal`. Semuanya butuh rekaman audio atau fixture tambahan.
- `impeccable detect` bersih; web dan e2e typecheck, `pnpm lint`, `pnpm build`, `git diff --check` semua exit 0.

## Lanjutan: modul Monitoring

Requirement: tidak ada teks terlihat < 11px di riwayat Monitoring, detail review tiap modul (KETIK, PDKT, Telefun), dan tab Penggunaan Token.

Design:

- 74 `text-[6–10px]` di `routes/monitoring` diganti `text-xs`.
- `HistoryCard.tsx` tidak diubah, lalu dihapus. Komponen ini tidak dipakai aplikasi; hanya blok `describe("HistoryCard …")` di `__tests__/monitoring-redesign.test.tsx` yang mengimpornya, dan blok itu ikut dihapus. Tes HistoryTab dan PdktEvaluationPanel di file yang sama tetap ada, jadi entri `scripts/test-core.json` tidak berubah.
- Grafik radar Telefun (`VoiceRadarChartInner`, dipakai di detail Monitoring) mengatur ukuran lewat props Recharts, bukan class. Label sudut mode compact 10 → 11, tick radius 9 → 11.
- `monitoring.spec.ts` kini punya fixture berisi data (satu sesi per modul, review per modul, agregasi token). Fixture kosong lama tetap dipakai tes lain.

Hasil:

- RED: 59 teks di bawah 11px di riwayat, ketiga panel review, dan penggunaan token (termasuk tick radar 9–10px).
- GREEN: `monitoring.spec.ts` 7/7 dan `telefun-history.spec.ts` 13/13 lulus. `usage`, `authenticated-shell`, `edukatif-visual`, dan `typography-floor`: 12 lulus, 2 dilewati.
- `impeccable detect` bersih; web dan e2e typecheck, `pnpm lint`, `pnpm build`, `git diff --check` semua exit 0.
- Sisa di luar Monitoring: `DashboardTrendPanel` memakai `fontSize: 10` pada grafik (modul Dashboard).

## Lanjutan: modul KETIK

Requirement: tidak ada teks terlihat < 11px di landing, riwayat, replay sesi, dan review sesi KETIK, termasuk `KetikEducationSections` (juga dipakai panel review Monitoring).

Design:

- 31 `text-[6–10px]` di `routes/ketik` dan `components/KetikEducationSections.tsx` diganti `text-xs`.
- `KetikMotionFrame` (mockup chat ponsel, `aria-hidden`) tidak diubah. Ia mendapat `data-testid="ketik-motion-frame"` agar spec landing bisa mengecualikannya secara eksplisit, sama seperti Telefun.

Hasil:

- RED: "Mulai latihan" 10px di landing; 34 teks < 11px di riwayat, replay, dan review.
- GREEN: `ketik-flow.spec.ts` 4/4 lulus. `monitoring`, `usage`, `authenticated-shell`, `edukatif-visual`, `typography-floor`: 19 lulus, 2 dilewati.
- `impeccable detect` bersih; web dan e2e typecheck, `pnpm lint`, `pnpm build`, `git diff --check` semua exit 0.
- Temuan di luar scope: `SessionReplayModal` tidak punya `role="dialog"`/`aria-modal`, tidak bisa ditutup dengan Escape, dan tombol tutupnya ikon tanpa label aksesibel.

## Lanjutan: modul PDKT

Requirement: tidak ada teks terlihat < 11px di landing, sidebar mailbox, detail email berlampiran, dan email terbalas yang sudah dievaluasi, termasuk `PdktEducationSections` (juga dipakai panel evaluasi PDKT di Monitoring).

Design:

- 9 `text-[6–10px]` di `routes/pdkt` dan `components/PdktEducationSections.tsx` diganti `text-xs`.
- `PdktMotionFrame` (mockup kotak masuk, `aria-hidden`, 12 tempat) tidak diubah. Ia mendapat `data-testid="pdkt-motion-frame"` untuk pengecualian eksplisit di spec landing.
- `pdkt-flow.spec.ts` kini punya fixture mailbox berisi data: satu email terbuka berlampiran, satu email terbalas yang tertaut ke riwayat dengan evaluasi, `scoreBreakdown`, dan `edu`. Tes mengikuti alur nyata: filter default "Belum Dibalas" memilih email terbuka, lalu filter "Terbalas".

Hasil:

- RED: 13 teks < 11px (tanggal dan status di sidebar, "Dibuat oleh user lama", label skor breakdown 9px, tombol "Salin" edukasi). Landing tidak punya teks kecil di luar mockup.
- GREEN: `pdkt-flow.spec.ts` 8/8 lulus. `monitoring`, `usage`, `authenticated-shell`, `edukatif-visual`, `typography-floor`: 19 lulus, 2 dilewati.
- `impeccable detect` bersih; web dan e2e typecheck, `pnpm lint`, `pnpm build`, `git diff --check` semua exit 0.
- Catatan verifikasi: run pertama tidak valid karena port 3005 dipakai dev server sesi lain (worktree `.claude/worktrees/dreamy-kare-63d5f1`). Run di atas diulang setelah port kosong, dan cwd listener sudah dipastikan checkout ini.

## Lanjutan: modul Profiler

Requirement: tidak ada teks terlihat < 11px di halaman impor Profiler (`/profiler/import`).

Design:

- `text-[10px]` pada label grup kolom template di `routes/profiler/import.tsx` menjadi `text-xs`. Eyebrow "Profiler import" di `ProfilerPageHeader` (`text-[0.68rem]` = 9,52px) juga menjadi `text-xs`.
- `ParticipantSlide.tsx` (12x `text-[10px]`, 7x `text-[9px]`) sengaja TIDAK diubah, atas keputusan Fajar. Ia adalah kanvas ekspor: dirender di dalam `SlideCanvas` dengan rasio tetap (A4 210/297 atau 16:9) dan diekspor ke PNG/PDF lewat `html2canvas` yang menangkap kotak rasio tetap itu. Teks lebih besar akan menambah tinggi konten sehingga terpotong di ekspor A4/16:9. `SlideCanvas.tsx` juga tidak diubah. Tidak ada pengecualian di spec karena slide tidak ada di halaman impor.
- Tes baru di `profiler.spec.ts` memindai seluruh `<main>` halaman impor dengan semua `/api` dimock (termasuk `/profiler/teams`), memastikan label "Identitas Utama" tampil dulu, dan ditutup `expectHermetic`.

Hasil:

- RED: 5 teks < 11px: "Profiler import" 9.52px, serta "Identitas Utama", "Data Kerja", "Data Pribadi", "Data Sensitif" masing-masing 10px.
- GREEN: tes baru lulus 1/1. `profiler`, `profiler-workspace`, `profiler-global-birthdays`, `typography-floor`: 24 lulus, 0 gagal, 0 dilewati.
- `impeccable detect`, web dan e2e typecheck, `pnpm build`, `git diff --check` exit 0; `pnpm lint` 0 error, 102 warning (sama seperti sebelumnya).
- Di luar cakupan E2E: `text-[0.68rem]` di `ProfilerFolderSelect.tsx` dan `text-[0.65rem]`/`text-[0.68rem]` di `table/ProfilerParticipantCard.tsx` (di bawah 11px, belum dipindai karena bukan di halaman impor).
