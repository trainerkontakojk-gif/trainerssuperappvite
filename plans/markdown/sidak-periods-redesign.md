# SIDAK — Redesign halaman Periode QA (`/sidak/periods`)

Status: TODO. Dibuat 2026-10-09. Lane C (UI + perilaku kecil di satu halaman; tanpa API/skema).
Eksekutor mengikuti `AGENTS.md` + `docs/AGENT_WORKFLOW.md`: muat `trainers-superapp-tdd`
sebelum edit, E2E RED-first, review orkestrator setelahnya. Tidak commit/push.

## Requirement

`apps/web/src/routes/sidak/periods.tsx` (348 baris) adalah halaman SIDAK terakhir yang masih
penuh gaya lama. Halaman ini mengelola periode audit (bulan + tahun) yang dipakai Input
Temuan, Settings (periode efektif), dan seluruh analitik.

Masalah:

1. **Tombol hapus tersembunyi**: `opacity-0 group-hover:opacity-100`, tanpa nama aksesibel —
   tidak bisa dipakai lewat keyboard atau layar sentuh.
2. **Modal konfirmasi buatan sendiri** (`fixed inset-0 z-50` + blur + framer-motion): tanpa
   focus trap, Escape, atau `role="dialog"`.
3. **Pilihan tahun hanya tahun lalu/ini/depan** (`YEAR_OPTIONS`), padahal data historis bisa
   lebih lama.
4. **Pesan error mentah** (`e.message` dari API) dan tidak ada umpan balik sukses setelah
   tambah/hapus; banner error tetap menempel.
5. Gaya lama: 7 `<button>` buatan sendiri, label `uppercase tracking-wide` ("TAHUN 2026"),
   kartu `rounded-2xl`, 12 blok framer-motion, ikon dalam kotak, `font-black`, spinner manual.
6. `MONTHS` diduplikasi lagi (sudah ada di `components/sidak/sidak-input.constants.ts`).

### Acceptance criteria

1. `h1 "Periode QA"` + deskripsi satu baris (sama gaya dengan `/sidak/input` dan
   `/sidak/settings`: `font-outfit text-2xl font-bold`, lebar `max-w-6xl` atau lebih sempit
   bila halaman memang ringkas — pilih yang konsisten dengan dua halaman tersebut).
2. **Form tambah inline** satu baris: `Select` Bulan, `Select` Tahun (rentang: tahun terlama di
   data − 1 s.d. tahun berjalan + 1; minimal tahun lalu s.d. tahun depan), tombol
   `Tambah periode` (`ui/button`, ≥44px → `h-[44px]`; font root 14px). Jika kombinasi sudah ada:
   tombol nonaktif + teks inline "Periode {Bulan Tahun} sudah ada." (bukan kotak merah).
   Saat menyimpan: tombol "Menyimpan…" nonaktif.
3. **Daftar per tahun** (terbaru dulu): subjudul tahun biasa (bukan uppercase), baris per bulan
   (terbaru dulu) berisi nama bulan + aksi `Hapus {Bulan Tahun}` yang **selalu terlihat**
   (ikon + `aria-label`), dipisah divider — bukan kartu bersarang.
4. **Hapus lewat dialog konfirmasi** berbasis `ui/dialog`. Pakai ulang `ConfirmDialog` dari
   `routes/sidak/settings/components/ConfirmDialog.tsx`; pindahkan ke
   `components/sidak/ConfirmDialog.tsx` agar dipakai bersama dan perbarui import Settings.
   Teks: periode yang dihapus, "tidak dapat dibatalkan", dan "periode yang sudah punya data
   temuan tidak dapat dihapus".
5. **Umpan balik**: sukses lewat `notify` (`lib/toast`) — "Periode {X} ditambahkan." /
   "Periode {X} dihapus."; error lewat `notify.error` dengan pesan manusiawi
   ("Periode gagal ditambahkan. Coba lagi." / untuk hapus yang ditolak backend karena masih
   punya temuan: tampilkan pesan backend bila sudah berbahasa Indonesia, selain itu
   "Periode tidak dapat dihapus karena sudah dipakai data temuan."). Tidak ada banner menempel.
6. State: loading (skeleton baris), kosong (`QaStatePanel` + form tetap terlihat), error memuat
   daftar (pesan + `Coba lagi` → `refetch`).
7. Tanpa framer-motion, tanpa warna mentah, tanpa `uppercase tracking`, teks ≥12px
   (`text-xs` = 11px di app ini; pakai `text-[12px]`/`text-sm` untuk label), light/dark lolos
   kontras, tanpa overflow di 320/390/768/1440, konten terakhir lolos bottom nav mobile.
8. `MONTHS`/`periodLabel` diambil dari `components/sidak/sidak-input.constants.ts`.

### Kontrak yang dipertahankan

- Endpoint & payload: `GET /sidak/periods`, `POST /sidak/periods {month, year}`,
  `DELETE /sidak/periods/:id`. Tidak ada endpoint baru.
- Guard `requireCapability("sidak.config.manage")` tidak berubah.
- `main-landmark.spec.ts` memuat `/sidak/periods`: tetap tanpa `<main>` sendiri.
- Settings tetap lulus `sidak-settings.spec.ts` setelah `ConfirmDialog` dipindah.

### Non-goals

Tidak mengubah API/skema/RLS, tidak menambah fitur (mis. arsip/aktif-nonaktif periode).

## Tasklist

- [x] 0. Screenshot sebelum (1440 & 390, light/dark) ke
     `/private/tmp/claude-501/-Users-nadindyta-Downloads--Projects-trainerssuperappvite/f2c6949b-f9c5-492f-80f3-05773b326b19/scratchpad/sidak-periods-evidence/`.
- [x] 1. RED `apps/web/e2e/sidak-periods.spec.ts` (hermetic; harness stateful kecil di
     `e2e/helpers/sidakPeriodsHarness.ts` mengikuti pola `helpers/sidakSettingsHarness.ts`):
     a. layout: h1, daftar dikelompokkan per tahun terbaru dulu, tombol `Hapus {X}` terlihat
     tanpa hover;
     b. tambah: pilih Bulan/Tahun → tepat satu `POST {month, year}` → baris baru + toast sukses;
     c. duplikat: kombinasi yang sudah ada → tombol nonaktif + teks "sudah ada", tanpa POST;
     d. hapus: dialog; Batal/Escape → tanpa DELETE, fokus kembali ke tombol; Hapus → satu DELETE;
     e. hapus ditolak backend (409/400) → toast error manusiawi, baris tetap ada;
     f. rentang tahun mencakup tahun terlama di data;
     g. 390 & 1440: tanpa overflow horizontal, kontrol ≥44px.
     Simpan output RED lengkap ke folder evidence di atas; catat alasan gagal per test.
- [x] 2. GREEN implementasi + pindahkan `ConfirmDialog`.
- [x] 3. Docs: tambah baris pola Periode di `docs/design.md` §5 bila ada pola baru; bila tidak,
     cukup catat di evidence.
- [x] 4. Verifikasi berurutan (satu run Playwright pada satu waktu):
  - `pnpm --filter @trainers/web test:e2e sidak-periods.spec.ts`
  - `pnpm --filter @trainers/web test:e2e sidak-settings.spec.ts`
  - `pnpm --filter @trainers/web test:e2e main-landmark.spec.ts`
  - `pnpm typecheck --concurrency=1`, `pnpm lint --concurrency=1`, `pnpm build --concurrency=1`
  - `git diff --check`
- [x] 5. Isi Execution evidence (perintah + exit code, jumlah test, path screenshot, deviasi).

## Execution evidence

Lane C. Evidence folder: `/private/tmp/claude-501/-Users-nadindyta-Downloads--Projects-trainerssuperappvite/f2c6949b-f9c5-492f-80f3-05773b326b19/scratchpad/sidak-periods-evidence/`.

- Screenshots before/after (1440 & 390, light/dark): `before-*.png`, `after-*.png` in the folder.
- RED (`red-output.txt`): 11 failed / 0 passed. Semua gagal di `open()` pada
  `expect(h1 "Periode QA").toBeVisible()` karena halaman lama memakai h1 "Periode Pelaporan"
  (alasan benar tetapi seragam; kontrak per test baru terbukti saat GREEN).
- GREEN iterasi 1 (`green-run1.txt`): 10 passed, 1 failed (test a: `.uppercase` terhitung dari shell
  aplikasi, bukan halaman) -> selector dibatasi ke konten halaman (`div.max-w-3xl`); iterasi 2 (`green-run2.txt`): 11 passed.
- Verifikasi (exit code, `verify-summary.txt`, output `v-N.txt`):
  - `pnpm --filter @trainers/web test:e2e sidak-periods.spec.ts` -> exit 0 (11 test lulus)
  - `pnpm --filter @trainers/web test:e2e sidak-settings.spec.ts` -> exit 0 (11 passed)
  - `pnpm --filter @trainers/web test:e2e main-landmark.spec.ts` -> exit 0 (18 passed)
  - `pnpm typecheck --concurrency=1` -> exit 0; `pnpm lint --concurrency=1` -> exit 0; `pnpm build --concurrency=1` -> exit 0
  - `git diff --check` -> exit 0
- Docs: bagian baru "Periode QA (SIDAK)" di `docs/design.md`.
- Deviasi: spec menambah test b2 (tambah gagal), h/h2 (kosong, gagal muat) di luar daftar a-g; pesan
  hapus ditolak memakai pesan backend asli (400 `DELETE_ERROR`, Indonesia). Judul halaman "Periode QA" (bukan "Periode Pelaporan").

### Review orkestrator (2026-10-09)

- `thermo-nuclear` (review diff oleh orkestrator, bukan reviewer independen): **PASS** setelah satu
  perbaikan P2. Endpoint/payload tidak berubah; `ConfirmDialog` dipindah dengan `git mv` dan
  Settings tetap lulus.
- **P2 diperbaiki (deviasi dari plan):** pesan cadangan hapus "Periode tidak dapat dihapus karena
  sudah dipakai data temuan." juga muncul untuk kegagalan umum (jaringan, error mentah) sehingga
  menebak penyebab. Kini cadangan = "Periode gagal dihapus. Coba lagi."; kasus punya temuan tetap
  memakai pesan backend berbahasa Indonesia (test e).
- Catatan P3: deteksi "pesan sudah berbahasa Indonesia" memakai regex kata kunci — cukup untuk
  pesan backend yang ada, tetapi rapuh bila pesan backend berubah.
- Gate visual (pengganti audit `impeccable` penuh): screenshot sesudah 390 dark diperiksa — form
  bertumpuk, teks duplikat inline, tombol hapus selalu terlihat, baris terakhir lolos bottom nav.
- Verifikasi ulang setelah perbaikan (dari `apps/web`):
  `pnpm exec playwright test sidak-periods.spec.ts sidak-settings.spec.ts main-landmark.spec.ts --workers=1`
  — **42 passed** (11 periods + 13 settings + 18 landmark; laporan eksekutor tertukar label
  hitungan 11/13); `tsc --noEmit` web exit 0; `eslint` file berubah exit 0.
