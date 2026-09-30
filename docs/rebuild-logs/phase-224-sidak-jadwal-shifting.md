# Phase 224 — SIDAK Jadwal Shifting WFM

**Tanggal:** 2026-09-29 · **Rute:** `/sidak/jadwal-shifting`

## Perubahan

- Menambahkan endpoint harian dan bulanan read-only ke API SIDAK. Backend membaca PostgREST dengan proyeksi kolom minimum, origin HTTPS yang di-allowlist secara exact, redirect ditolak, batas tanggal/baris, dan credential server-only.
- Membatasi akses ke role `admin` dan `trainer` pada navigasi, route frontend, dan API. Error integrasi tetap berupa state gagal, bukan data kosong.
- Menambahkan dua format UI: **Hari ini** (jam shift dari mapping yang disepakati dan interval istirahat dari slot `LB` berurutan) serta **Kalender** (matriks agen × tanggal dengan kode shift WFM dan rekap per agen).
- Memperbarui dokumentasi kontrak di `docs/architecture.md`, `docs/modules.md`, `docs/auth-rbac.md`, dan `docs/deployment.md`; konfigurasi contoh ada di `.env.example`.
- Tidak ada migrasi database, penyimpanan jadwal, operasi tulis, atau pemanggilan AI.

## Verifikasi

- Playwright E2E terarah, memakai Vite lokal, fixture sintetis, stub upstream loopback, dan network guard fail-closed: **87 passed**. Tidak ada host WFM/Supabase live yang diakses oleh tes.
- `pnpm lint`: lulus tanpa error; warning lint yang tercatat berasal dari file lain di repo.
- `pnpm build`: lulus untuk API, Telefun, dan Web.
- `git diff --check`: lulus. Link Markdown lokal yang diperiksa seluruhnya resolve.
- Prettier lulus untuk `docs/architecture.md`, `docs/modules.md`, `docs/auth-rbac.md`, dan file log ini. `docs/deployment.md` tetap diperiksa secara surgical karena formatter akan merombak alignment tabel lain di luar perubahan WFM.

## Batas Rilis

Produksi tetap **NO-GO** sampai jenis/izin key WFM, kebijakan akses/RLS, env runtime service API, dan smoke test role `admin`/`trainer` pada environment target diverifikasi. E2E lokal bukan bukti izin produksi. Tidak ada deployment yang dilakukan.

## Update — 2026-09-30 — urutan daftar harian

Permintaan Fajar: daftar pada format **Hari ini** dirapikan ("contoh dari tim leader atau layanan").

- Daftar masuk/libur dikelompokkan dua tingkat: **layanan → team leader → nama A–Z**. Urutan layanan mengikuti `SCHEDULE_SECTIONS` (Call → Digital Chat → Email → Leader), bukan urutan kedatangan baris. Grup tanpa layanan dan grup tanpa TL selalu diletakkan paling akhir; barisnya tetap ditampilkan, tidak disembunyikan.
- Tabel detail di bawah daftar memakai urutan yang sama (`orderBySectionThenTeamLeader` di route), jadi daftar dan tabel tidak punya urutan masing-masing.
- Header layanan tetap tampil ketika filter bagian layanan memilih satu bagian, supaya struktur daftar tidak berubah bentuk saat filter diganti.
- Format **Kalender** tidak berubah: baris agen tetap A–Z tanpa grup layanan/TL.
- Pengelompokan murni di klien. Tidak ada perubahan kontrak API, tipe bersama, proyeksi query upstream, operasi tulis, atau pemanggilan AI.

## Verifikasi update

- `apps/web/e2e/sidak-jadwal-shifting.spec.ts`: **36 passed**. RED dijalankan lebih dulu — tahap TL 2 gagal / 31 lulus, tahap urutan tabel 1 gagal / 33 lulus, tahap layanan 4 gagal / 32 lulus.
- `tsc --noEmit` (web), ESLint, Prettier, dan `pnpm build` (**3/3 task**) lulus; `git diff --check` bersih.
- Bukti visual diambil dari Vite lokal dengan fixture sintetis dan network guard fail-closed; tidak ada host WFM/Supabase live yang diakses.

Rilis tetap pada batas yang sama: produksi **NO-GO** sampai gate environment target di atas diverifikasi.

## Update 2 — 2026-09-30 — gate thermo-nuclear (Pi) dan perbaikannya

Gate `thermo-nuclear` dijalankan read-only lewat Pi (`pi -p --tools read,bash --thinking max`) atas commit `010e361`. Verdict awal: **NEEDS_FIX**, tiga temuan P2.

1. **E2E belum membuktikan urutan.** Fixture grup hanya memuat satu agen per pasangan (layanan, TL), sehingga pengurutan nama di dalam grup dan pengurutan beberapa TL dalam satu layanan bisa rusak tanpa membuat test gagal. **Diperbaiki**: test baru dengan satu layanan berisi dua TL × dua agen dalam urutan input teracak, memeriksa grup, urutan datar daftar, dan tabel detail.
2. **Kapitalisasi `channel` membuat grup kembar.** `call` dan `Call` menjadi dua header untuk layanan yang sama, sementara filter bagian layanan sudah mencocokkan tanpa peduli kapitalisasi. **Diperbaiki**: nama bagian yang dikenal dikanonikalisasi ke label `SCHEDULE_SECTIONS` sebelum grouping; bagian tak dikenal tetap apa adanya.
3. **Baris ganda per agen dihitung sebagai beberapa "orang".** Keputusan Fajar: **status quo** — semua baris tetap tampil dan ikut terhitung, tidak dideduplikasi diam-diam, karena duplikat adalah cacat data sumber dan aturan konflik antar-baris belum ditetapkan. Keputusan ini ditulis eksplisit di `ScheduleGroups.tsx` dan `docs/modules.md` supaya tidak diangkat ulang sebagai temuan baru.

Bukti bahwa test urutan benar-benar punya daya tangkap (mutation check): komparator nama, komparator TL, dan peringkat bagian layanan masing-masing dibalik satu per satu — ketiganya membuat test gagal, lalu dikembalikan.

Verifikasi setelah perbaikan: **38 passed** (RED dulu untuk kasus kapitalisasi: 1 gagal / 37 lulus), `tsc --noEmit` web, ESLint, Prettier, `pnpm build` (3/3 task), dan `git diff --check` lulus. Gate Pi dijalankan ulang setelah commit perbaikan.

## Update 3 — 2026-09-30 — Hari ini hanya tabel dan urutan detail

Permintaan pemilik menggantikan daftar masuk/libur yang dicatat pada update sebelumnya:

- Format **Hari ini** sekarang hanya memiliki tabel detail; `ScheduleGroups.tsx`, panel Masuk/Libur, dan seluruh subjudul layanan/TL dihapus.
- Tabel diurutkan per baris menurut shift `S1 → H → S2 → S3 → S4 → Off → kode tak dikenal`, lalu layanan (Call → Digital Chat → Email → Leader → lainnya), TL A–Z (kosong terakhir), dan nama A–Z.
- `Off` hanya kode kosong, `OFF`, `LIBUR`, `LBR`, dan `CUTI`. Kode lain—termasuk `TBCCI` dan label jam—tetap terlihat setelah Off serta diurutkan A–Z. Filter layanan tetap case-insensitive dan berjalan di klien.
- Kalender bulanan tidak berubah; agen tetap diurutkan A–Z. Tidak ada perubahan API, shared types, proyeksi WFM, operasi tulis, atau pemanggilan AI.
- Komentar helper layanan kini membedakan peringkat bagian kanonik dari nilai channel sumber yang tetap dirender.

## Update 4 — 2026-09-30 — gate thermo-nuclear putaran ketiga

Gate ketiga atas `582c931` memberi verdict **PASS** dengan satu temuan P3: assertion “Hari ini hanya tabel” masih hanya menolak heading `h2`–`h4`, sehingga daftar/panel lama tanpa heading bisa lolos. Assertion diperkuat: sekarang `data-testid` sisa panel Masuk/Libur ditolak eksplisit, dan `ul`/`ol` di dalam wilayah Hari ini tidak boleh ada.

Dibuktikan dengan mutation check: elemen panel lama disuntikkan kembali ke route, test gagal dengan pesan “sisa panel Masuk/Libur tidak boleh dirender lagi”, lalu route dipulihkan identik. Verifikasi setelahnya: E2E **32 passed**, `tsc --noEmit` web, ESLint, Prettier, dan `git diff --check` lulus.

### E2E RED → GREEN dan daya tangkap urutan

- RED sebelum implementasi: **30 passed / 2 failed** dari 32. Kontrak tabel-saja mendeteksi 22 elemen daftar/subjudul lama; test urutan mendeteksi urutan tabel lama yang mengikuti layanan/TL dan bukan prioritas shift.
- GREEN setelah implementasi: **32/32 passed** pada `apps/web/e2e/sidak-jadwal-shifting.spec.ts`; screenshot UI sintetis disimpan di `artifacts/sidak-jadwal-shifting-e2e/hari-ini-tabel-saja.png` (lokal, gitignored) beserta ringkasan `verification.md`.
- Mutation check test urutan: pembalikan komparator **shift, layanan, TL, dan nama** satu per satu, serta menonaktifkan pengurutan A–Z kode shift tak dikenal, masing-masing menyebabkan E2E terfokus **1 gagal** pada assertion urutan. Comparator asli dipulihkan setelah tiap mutation.
- Seluruh request browser pada E2E memakai mock API lokal/fixture sintetis, dengan preflight dev-server Vite dan network guard fail-closed; tidak ada WFM/Supabase live yang diakses.

### Gerbang akhir

- `pnpm --filter @trainers/web test:e2e -- e2e/sidak-jadwal-shifting.spec.ts`: **32 passed**.
- `pnpm --filter @trainers/web exec tsc --noEmit`: exit 0.
- `npx eslint apps/web/e2e/helpers/sidakJadwalShiftingHarness.ts apps/web/e2e/sidak-jadwal-shifting.spec.ts apps/web/src/components/sidak/jadwal-shifting/schedule-sections.ts apps/web/src/routes/sidak/jadwal-shifting.tsx`: exit 0.
- `pnpm lint`: exit 0, 4/4 tasks; warnings existed in unrelated API/Web files (0 errors).
- `npx prettier --check` untuk seluruh file kode/dokumentasi yang diubah: exit 0.
- `pnpm build`: exit 0, **3 successful / 3 total**; direktori `dist` dan `tsbuildinfo` yang sudah ada dipulihkan setelah build sesuai batas perubahan artefak.
- Impeccable dan thermo-nuclear review: **PASS**, tanpa temuan sisa dalam scope. Screenshot mengonfirmasi tabel tunggal; E2E juga mencakup tabel aksesibel dan viewport sempit.
- `git diff --check`: exit 0; tidak ada whitespace error.
