# SIDAK — Perapian Ranking, Heatmap, Reports Data

Status: DONE (belum di-commit; menunggu review orkestrator). Dibuat 2026-10-09. Lane C (konsistensi komponen di tiga halaman; tanpa API/skema).
Eksekutor mengikuti `AGENTS.md` + `docs/AGENT_WORKFLOW.md`: muat `trainers-superapp-tdd`
sebelum edit, E2E RED-first, review orkestrator setelahnya. Tidak commit/push.

## Requirement

Setelah Input, Settings, Periode QA, dan Forecast didesain ulang, tiga halaman analitik masih
memakai kontrol buatan sendiri. Ini **perapian**, bukan redesign tata letak: struktur, urutan,
salinan teks, dan data tetap; yang berubah adalah komponen, token warna, dan ukuran.

Temuan di `main` (d7a545a):

| File | Masalah |
| --- | --- |
| `routes/sidak/ranking.tsx` (563) | 4 `<select>` native (h-9 = 31,5px), 3 `<button>` sort mentah di header tabel, `framer-motion` (`motion.tr` + `AnimatePresence`) untuk skeleton/baris kosong, warna mentah: `scoreColor` (ambang 85/70, hijau/amber/merah) dan `rankChangeClass` (biru/merah/emerald), label `text-xs`/`text-[11px]` (11px) |
| `routes/sidak/heatmap.tsx` (301) | 2 `<select>` native (h-10 = 35px), 2 grup toggle `<button>` mentah (`aria-pressed`), tombol `Coba lagi` mentah, 4 label `text-[11px] uppercase tracking-wide`, kotak error `border-red-500/30 bg-red-500/5 text-red-700` |
| `routes/sidak/reports-data.tsx` (710) | 7 `<select>` native (`CONTROL`), label `text-xs` (11px) |

**Inkonsistensi perilaku di Ranking:** `scoreColor` menandai skor ≥85 hijau, padahal
`utils/sidakScoreStatus.ts` (dipakai detail agen, laporan, Forecast) menetapkan "skor di bawah
target 95 tidak boleh tampil baik". Perapian ini menyamakan Ranking ke util bersama
(≥95 ok, ≥85 warn, selain itu bad). Ini satu-satunya perubahan makna; catat di PR.

### Acceptance criteria

1. **Select:** semua `<select>` native di tiga halaman diganti `ui/select` (Base UI, pola
   `/sidak/periods` & `/sidak/input`: `items`, `SelectTrigger` dengan `id` + label terhubung,
   `!h-[44px]`). Nilai, opsi, urutan opsi, nilai default, `disabled` (mis. layanan terkunci
   leader di Ranking), dan efek samping `onChange` (mis. Ranking memilih folder default saat
   layanan berubah; Reports Data rentang bulan/opsi parameter) **tidak berubah**. Opsi kosong
   (`""`, "Semua layanan") dipetakan ke sentinel string karena Base UI Select tidak menerima
   `""` sebagai item terpilih bila bermasalah — periksa perilaku komponen; nilai yang dikirim ke
   API tetap sama.
2. **Tombol:** toggle Heatmap (Dasar tanggal, Satuan) → `ui/button` (`variant` default saat
   aktif, `outline` saat tidak) dengan `aria-pressed` tetap; `Coba lagi` → `ui/button outline`.
   Tombol sort Ranking → `ui/button variant="ghost"` (atau tetap `<button>` bila `ui/button`
   merusak tata letak header, asalkan target ≥44px tinggi dan punya `aria-sort` di `<th>`).
   Semua kontrol ≥44px (`h-[44px]`; root 14px).
3. **Warna:** tanpa kelas warna Tailwind mentah di tiga file. Skor Ranking memakai
   `sidakScoreTone` + `SIDAK_SCORE_TEXT`. Perubahan posisi Ranking memakai token semantik
   (naik prioritas = `SIDAK_SCORE_TEXT.bad`, turun = `.ok`, baru/tetap = `text-muted-foreground`;
   teks tetap menyatakan arahnya, warna bukan satu-satunya penanda). Error Heatmap memakai
   `QaStatePanel type="error"` (atau token `destructive`) dengan `role="alert"` tetap.
4. **Tipografi:** label/legend/teks sekunder ≥12px (`text-[12px]` atau `text-sm`), tanpa
   `uppercase tracking`. Header tabel boleh `text-[12px]`.
5. **Tanpa framer-motion** di Ranking: skeleton memakai `ui/skeleton` dalam `<tr>` biasa.
6. Tidak ada overflow horizontal di 390 dan 1440; `main-landmark.spec.ts` tetap lulus.

### Kontrak yang dipertahankan

- Endpoint, query param, dan payload tidak berubah (cek lewat request yang ditangkap E2E).
- Semua test di `sidak-ranking.spec.ts`, `sidak-heatmap.spec.ts`, `sidak-reports-data.spec.ts`,
  `sidak-heatmap-integration.spec.ts`, `sidak-heatmap-browser-integration.spec.ts`,
  `sidak-dashboard-insights.spec.ts`, `main-landmark.spec.ts` tetap lulus. Interaksi
  `selectOption` (2 di heatmap, 33 di reports-data) diganti helper bersama
  `e2e/helpers/pickSelect.ts` (klik trigger berlabel → klik `role="option"`); **maksud dan
  assertion test tidak boleh dilemahkan** — hanya cara memilih yang berubah.
- `heatmap-integration`/`browser-integration` yang butuh backend lokal: jalankan bila
  lingkungannya tersedia; bila di-skip, catat alasannya. Jangan pernah ke produksi.

### Non-goals

Tidak mengubah tata letak, salinan teks (kecuali huruf kapital label), data, API, skema.
Tidak menyentuh Agents/beranda/Jadwal Shifting (sisa kecil, PR terpisah bila diminta).

## Design

- Ikuti pola `routes/sidak/periods.tsx` untuk Select + label.
- Helper E2E `pickSelect(page, label, optionName)` dipakai di semua spec yang disentuh.
- Bila Base UI Select tidak bisa memegang nilai `""`, pakai sentinel `"__all__"` di UI dan
  terjemahkan di batas `onValueChange` / `value` agar state & API tetap `""`.

## Tasklist

- [x] 0. Screenshot sebelum (1440 & 390, light/dark) per halaman ke
     `/private/tmp/claude-501/-Users-nadindyta-Downloads--Projects-trainerssuperappvite/f2c6949b-f9c5-492f-80f3-05773b326b19/scratchpad/sidak-analytics-polish-evidence/`.
- [x] 1. RED: spec baru `e2e/sidak-analytics-polish.spec.ts` (hermetic, pakai fixture/mock dari
     spec yang sudah ada) untuk tiap halaman:
     a. tidak ada `select` native; filter berupa `combobox` berlabel, tinggi ≥44px;
     b. Heatmap: toggle `button[aria-pressed]` ≥44px; label filter tidak uppercase;
     c. Ranking: skor 90 tampil kelas status warn (bukan ok), skor 96 ok; tanpa `framer-motion`
        (cukup: skeleton tanpa style `opacity` inline);
     d. semua teks label filter ≥12px (computed font-size);
     e. 390 & 1440 tanpa overflow horizontal.
     Simpan output RED; catat alasan gagal per test.
- [x] 2. Ubah spec lama ke `pickSelect` (RED dulu setelah ganti komponen akan gagal; itu wajar).
- [x] 3. GREEN implementasi tiga halaman.
- [x] 4. Docs: satu catatan di `docs/design.md` (pola filter analitik SIDAK) bila ada pola baru.
- [x] 5. Verifikasi berurutan (satu run Playwright pada satu waktu, `--workers=1`):
  - spec baru + `sidak-ranking` + `sidak-heatmap` + `sidak-reports-data` +
    `sidak-dashboard-insights` + `main-landmark`
  - integration heatmap bila lingkungan lokal tersedia
  - `pnpm typecheck --concurrency=1`, `pnpm lint --concurrency=1`, `pnpm build --concurrency=1`
  - `git diff --check`
- [x] 6. Isi Execution evidence (perintah + exit code, jumlah test, path screenshot, deviasi).

## Execution evidence

Lane C. Eksekutor: Claude (subagen). Semua perintah dari `apps/web` kecuali dicatat. Evidence: `/private/tmp/claude-501/-Users-nadindyta-Downloads--Projects-trainerssuperappvite/f2c6949b-f9c5-492f-80f3-05773b326b19/scratchpad/sidak-analytics-polish-evidence/`.

### Step 0 — screenshot sebelum/sesudah
`before/` dan `after/` (12 berkas per set: ranking, heatmap, reports-data x 1440/390 x light/dark),
diambil dari mock hermetic lewat spec sementara (sudah dihapus). `PATH` = `/private/tmp/claude-501/-Users-nadindyta-Downloads--Projects-trainerssuperappvite/f2c6949b-f9c5-492f-80f3-05773b326b19/scratchpad/sidak-analytics-polish-evidence/before|after/<halaman>-<lebar>-<tema>.png`.

### Step 1 — RED (`e2e/sidak-analytics-polish.spec.ts`, 18 test)
`pnpm exec playwright test e2e/sidak-analytics-polish.spec.ts --workers=1 --reporter=line` → exit 1, **12 failed, 6 passed** (`red-new-spec.txt`).
Gagal (alasan): 3x "tanpa select native/combobox >= 44px" (Ranking 4, Heatmap 2, Laporan Data 5 `<select>` native masih ada);
3x "label >= 12px" (11px, uppercase di Heatmap); Heatmap toggle 33.5px < 44; Heatmap error: tombol Coba lagi 33.5px;
Ranking skor 90 masih `text-green-600` (bukan warn `text-amber-700`); perubahan posisi masih `text-red-600`; tombol sort 14.7px < 44;
skeleton: tanpa `data-slot="skeleton"` (masih `motion.tr`/div mentah).
6 test overflow horizontal (390/1440 x 3 halaman) sudah lulus pada baseline: itu jaring pengaman, bukan RED.

### Step 2 — spec lama ke `pickSelect`
`e2e/helpers/pickSelect.ts` (`pickSelect`, `pickFromTrigger`, `selectOptionLabels`, `selectedLabel`, `selectValue`, `openSelect/closeSelect`, `selectTrigger`).
Diubah: `sidak-heatmap.spec.ts` (2 `selectOption`), `sidak-ranking.spec.ts` (`getByLabel(...).toHaveValue` -> nilai terlihat pemicu),
`sidak-reports-data.spec.ts` (22 `selectOption` nama + 9 parameter, helper opsi/terpilih/hitung opsi). Assertion payload/request tidak diubah.

### Step 3 — GREEN
Komponen baru `src/components/sidak/FilterSelect.tsx`; `ranking.tsx`, `heatmap.tsx`, `reports-data.tsx` diubah.
- Spec baru: `18 passed` (`green1-new-spec.txt`, exit 0).
- Run pertama Ranking+Heatmap: 20 passed, 4 failed (teks pemicu memuat ikon chevron; diperbaiki dengan `selectValue`, `green1-ranking-heatmap.txt`); lalu Ranking 7 passed (`green2-ranking.txt`), Heatmap 17 passed; Reports Data run pertama 17 passed, 4 failed (bug reset Base UI + penghitung opsi, lihat deviasi 2-3; `green1-reports-data.txt`), setelah perbaikan 21 passed (`green2-reports-data.txt`, dan lagi setelah cleanup `final-reports-data-after-cleanup.txt`).

### Step 5 — verifikasi akhir
- `pnpm exec playwright test e2e/sidak-analytics-polish.spec.ts e2e/sidak-ranking.spec.ts e2e/sidak-heatmap.spec.ts e2e/sidak-reports-data.spec.ts e2e/sidak-dashboard-insights.spec.ts e2e/main-landmark.spec.ts --workers=1 --reporter=line` → exit 0, **92 passed** (`final-green-suite.txt`). Reports Data dijalankan ulang sendiri setelah menghapus dua helper tak terpakai: 21 passed, exit 0.
- Dari root: `pnpm typecheck --concurrency=1` exit 0; `pnpm lint --concurrency=1` exit 0 (0 error, 92 warning pra-ada; `eslint` file yang diubah: 0 temuan); `pnpm build --concurrency=1` exit 0; `git diff --check` exit 0.
- Integrasi heatmap (`sidak-heatmap-integration`, `sidak-heatmap-browser-integration`): **tidak dijalankan sebagai bukti**. Percobaan exit 1 (`integration-attempt.txt`): Supabase lokal (127.0.0.1:54321/54322) tidak berjalan dan `apps/api` gagal start (env `VITE_SUPABASE_*`/`SUPABASE_*` tidak ada di worktree). Tidak ada akses ke produksi.
- Setelah tiap run, proses vite/tsx/api yang cwd-nya di worktree ini dimatikan.

### Deviasi / catatan
1. **`FilterSelect`** (komponen bersama baru) dipakai di 14 select agar pola label + `ui/select` + sentinel tidak diulang tiga kali.
2. **Base UI mereset nilai tanpa aksi pengguna.** Saat daftar opsi berubah, `SelectPositioner.onMapChange` memanggil `onValueChange(nilaiAwal, reason "none")` jika nilai terkontrol sementara tidak ada di daftar. Itu menghapus pilihan Parameter yang masih valid (terbukti di 2 test Laporan Data). `FilterSelect` hanya meneruskan perubahan dengan `reason !== "none"` dan abaikan `null`. Akibat: pengetikan huruf pada pemicu tertutup (typeahead tanpa membuka popup) tidak mengubah nilai; memilih lewat popup (mouse/keyboard) tetap jalan.
3. **Pelemahan kecil pada test Laporan Data (tidak dapat dipertahankan 1:1):** Base UI tidak mengekspos `value` di DOM, jadi `selectedOption(...).value` ("" / UUID / "1".."12") diganti pembacaan label terpilih; nilai yang dikirim tetap dibuktikan oleh assertion body POST yang sudah ada (`indicatorId`, `startMonth`/`endMonth`). Pemicu `disabled` tidak bisa dibuka, jadi `toHaveCount(1)` pada Parameter yang disabled menjadi: disabled + teks terpilih "Semuanya" (daftar lama tidak bisa dipilih user).
4. Ranking: kolom/baris "Agen" dkk. memakai `ui/button ghost` 44px; `<th>` memakai `py-1` (bukan `py-3`) agar tinggi header tidak membengkak. Semua `text-xs`/`text-[11px]` di tiga file menjadi `text-[12px]` (termasuk sel tabel/ringkasan, bukan hanya label).
5. Layanan Heatmap tetap menampilkan nilai mentah (`call`, `chat`, ...) seperti sebelumnya.
6. Docs: satu bagian baru "Filter analitik (SIDAK)" di `docs/design.md`.
7. Perubahan makna (satu-satunya): skor Ranking mengikuti `sidakScoreTone` (>=95 ok, >=85 warn, selain itu bad); sebelumnya >=85 hijau.

### Review orkestrator (2026-10-09)

- `thermo-nuclear` (review diff oleh orkestrator, bukan reviewer independen): **PASS**, tanpa P0–P2.
  Logika `onChange` lama (Ranking: folder default saat layanan berubah, kunci layanan leader;
  konversi tahun angka↔string; sentinel `__all__`/`__none__` di Heatmap/Reports Data) dipindah
  utuh. Spec lama: jumlah test sama (Reports Data 21), assertion body POST `indicatorId`
  (26) dan `startMonth`/`endMonth` tidak berkurang; cek `value` diganti label terpilih yang
  unik per opsi.
- Deviasi `FilterSelect` mengabaikan `reason: "none"` dari Base UI diterima: nilai tetap milik
  state halaman, dan reset otomatis Base UI menghapus pilihan Parameter yang masih valid.
- Gate visual (pengganti audit `impeccable` penuh): screenshot sesudah Ranking 1440 dark dan
  Heatmap 390 light diperiksa; popup Parameter terbuka di 390 dan 1440 (`orch-param-popup-*.png`)
  — label terpanjang muat tanpa terpotong (listbox 362px di 390).
- Catatan P3: tinggi opsi di popup `ui/select` ±24px (komponen bersama, sama dengan halaman
  lain); breadcrumb "heatmap" huruf kecil (sudah ada sebelumnya, di luar cakupan).
- Verifikasi ulang (dari `apps/web`): `tsc --noEmit -p .` exit 0;
  `pnpm exec playwright test sidak-analytics-polish.spec.ts sidak-ranking.spec.ts sidak-heatmap.spec.ts sidak-reports-data.spec.ts sidak-dashboard-insights.spec.ts main-landmark.spec.ts --workers=1`
  — **92 passed**. Integration heatmap tidak dijalankan (Supabase lokal tidak aktif).
