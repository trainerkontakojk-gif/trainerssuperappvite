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
