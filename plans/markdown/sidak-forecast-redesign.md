# SIDAK — Susun ulang halaman Forecast (`/sidak/forecast`)

Status: TODO. Dibuat 2026-10-09. Lane D (redesign UI signifikan pada halaman analitik).
Eksekutor mengikuti `AGENTS.md` + `docs/AGENT_WORKFLOW.md`: muat `trainers-superapp-tdd`
sebelum edit, E2E RED-first, review orkestrator setelahnya. Tidak commit/push.

## Requirement

`apps/web/src/routes/sidak/forecast.tsx` (1318 baris) sudah memakai gaya baru, tetapi urutan
informasinya membuat isi utama (grafik tren + proyeksi) terkubur, dan beberapa data tampil
ganda. Halaman ini juga melewati batas ~1000 baris per file.

Masalah (urutan render sekarang):

1. **Header sticky dengan `backdrop-blur`** (glass sebagai default — dilarang `docs/design.md`).
2. **Filter memakan blok sendiri** (judul "Filter forecast" + deskripsi + `DashboardFilters` +
   pemilih "Periode proyeksi" di baris terpisah).
3. **Dua blok metrik sebelum grafik**: "Proyeksi temuan" (rekomendasi, titik data, periode,
   status data) dan "Kecukupan data" (agen siap + Membaik/Memburuk/Stabil/Pantauan).
4. **Jumlah status agen tampil dua kali**: di "Kecukupan data" dan di header tiap lane
   "Prioritas agent".
5. **Istilah tidak konsisten**: "Pantauan" (metrik) vs "Watchlist" (lane); "agent" vs "agen"
   (navigasi memakai "Agen"); "Stabil/stagnan" vs "Stabil/Stagnan".
6. **Warna lane ambigu**: titik lane Membaik dan Watchlist sama-sama `bg-primary`; tone status
   didefinisikan berulang di `forecastDirectionMeta`, `statusMeta`, `confidenceMeta`, dan
   `ForecastLane` (4 peta warna mentah terpisah).
7. **Kontrol seri grafik membingungkan**: tombol "Total Temuan"/"Per Parameter" menampilkan
   _state_ bukan aksi, disertai paragraf penjelasan aturan "maksimal 2 data".

### Acceptance criteria

1. **Urutan baru**:
   1. `h1 "Forecast"` + deskripsi satu baris + tombol `Perbarui` (tidak sticky, tanpa blur).
   2. **Bar filter satu blok** tanpa judul/deskripsi sendiri: `DashboardFilters`
      (`showHeader={false}`) + `Periode proyeksi` dalam satu baris flex-wrap.
   3. **Tren layanan (isi utama)**: judul + ringkasan proyeksi _inline_ di header grafik —
      arah/rekomendasi (ikon + label), status data (satu kalimat), metode & jumlah titik data
      sebagai teks sekunder. Lalu kontrol seri, grafik, `ForecastInsightPanel`.
   4. **Prioritas agen**: satu baris ringkas "{n} agen siap diproyeksikan · periode {x}", lalu
      empat lane. Jumlah per status **hanya** di header lane.
      Blok "Proyeksi temuan" dan "Kecukupan data" dihapus (isinya dipindah, tidak hilang).
2. **Kontrol seri**: segmented control (`ui/tabs` atau toggle bergaya tabs) "Total temuan |
   Per parameter" dengan state aktif jelas; chip parameter hanya muncul/aktif di mode yang
   relevan. Aturan "maksimal 2 data tampil" dipertahankan, dijelaskan lewat teks singkat di
   samping chip **hanya** saat batas tercapai (bukan paragraf permanen). `aria-pressed` tetap
   pada chip parameter.
3. **Satu sumber status**: buat `components/sidak/forecast-status.ts` berisi satu peta
   `{label, icon, textClass, dotClass}` untuk Membaik / Memburuk / Stabil / Pantauan dan satu
   peta confidence. Semua pemakaian (`forecastDirectionMeta`, `statusMeta`, lane, baris agen)
   memakai peta ini. Empat titik lane berwarna berbeda dan konsisten dengan teks statusnya.
   Warna tetap pasangan light/dark yang lolos kontras (pola `SIDAK_SCORE_TEXT` di
   `utils/sidakScoreStatus.ts`).
4. **Istilah**: "Pantauan" di semua tempat (lane, metrik, deskripsi; pengganti "Watchlist"),
   "agen" untuk teks UI (bukan "agent"), "Stabil/stagnan" satu ejaan.
5. **Pecah file**: `forecast.tsx` ≤ ~600 baris. Pindahkan `ForecastLane`, `AgentRow`, ringkasan
   proyeksi, dan kontrol seri ke `components/sidak/forecast/*.tsx`; util murni (format angka,
   label) ke modul util. Tanpa perubahan logika data/hook.
6. **State** tetap lengkap: loading, error + `Coba lagi`, data historis < 2 periode, semua agen
   Pantauan, lane kosong — dengan teks yang memakai istilah baru.
7. Responsif: 390 — filter bertumpuk rapi, grafik tidak overflow, lane 1 kolom; ≥1280 — 4 lane.
   Tanpa overflow di 320/390/768/1440; kontrol ≥44px (`h-[44px]`, font root 14px); teks ≥12px
   (`text-xs` = 11px di app ini).

### Kontrak yang dipertahankan

- Data & hook: query periode/filter, `POST /sidak/dashboard/forecast`, `POST /sidak/forecast/agents`,
  status `fresh/stale/missing`, pilihan horizon, leader-locked service, sinkron folder↔layanan.
  Tidak ada perubahan API/payload.
- `ParamTrendChart` dan `ForecastInsightPanel` tidak diubah perilakunya (dipakai juga di
  `/dashboard`; `e2e/dashboard-trend-forecast.spec.ts` harus tetap lulus).
- Nama aksesibel yang dipakai di tempat lain: `aria-label="Daftar agent …"` pada region lane
  boleh diganti ke "Daftar agen …" — cari pemakaiannya (`rg`) dan perbarui bila ada.
- `main-landmark.spec.ts` memuat `/sidak/forecast`: tetap tanpa `<main>` sendiri.

### Non-goals

Tidak mengubah algoritma forecast, backend, atau komponen grafik bersama. Tidak menambah fitur.

## Tasklist

- [x] 0. Screenshot sebelum (1440 & 390, light/dark) ke
     `/private/tmp/claude-501/-Users-nadindyta-Downloads--Projects-trainerssuperappvite/f2c6949b-f9c5-492f-80f3-05773b326b19/scratchpad/sidak-forecast-evidence/`.
- [x] 1. RED `apps/web/e2e/sidak-forecast.spec.ts` (hermetic; mock statis via
     `helpers/hermeticShell.ts` cukup karena halaman hanya membaca + POST forecast; ambil contoh
     fixture dari `e2e/dashboard-trend-forecast.spec.ts`):
     a. urutan: h1 → filter → heading "Tren layanan" muncul **sebelum** heading
     "Prioritas agen"; tidak ada heading "Proyeksi temuan"/"Kecukupan data"/"Filter forecast";
     header tidak `position: sticky`;
     b. ringkasan proyeksi (arah + status data) berada di dalam section Tren layanan;
     c. jumlah status muncul sekali: tiap lane menampilkan "{n} agen", tidak ada metrik ganda;
     d. istilah: tidak ada teks "Watchlist" atau " agent" (kata utuh) di halaman; lane "Pantauan";
     e. kontrol seri: mode "Per parameter" menampilkan chip; saat 2 seri aktif, chip ketiga
     nonaktif dan teks batas muncul; di mode Total, teks batas tidak tampil;
     f. empat titik lane punya kelas warna berbeda (ambil dari peta status);
     g. 390 & 1440: tanpa overflow horizontal, kontrol ≥44px, 4 lane berdampingan di 1440.
     Simpan output RED lengkap ke folder evidence; catat alasan gagal per test.
- [x] 2. GREEN: susun ulang + pecah file + peta status.
- [x] 3. Docs: subbagian "Forecast (SIDAK)" di `docs/design.md` §5 (urutan isi, satu peta status).
- [x] 4. Verifikasi berurutan (satu run Playwright pada satu waktu):
  - `pnpm --filter @trainers/web test:e2e sidak-forecast.spec.ts`
  - `pnpm --filter @trainers/web test:e2e dashboard-trend-forecast.spec.ts`
  - `pnpm --filter @trainers/web test:e2e main-landmark.spec.ts`
  - `pnpm typecheck --concurrency=1`, `pnpm lint --concurrency=1`, `pnpm build --concurrency=1`
  - `git diff --check`
- [x] 5. Isi Execution evidence (perintah + exit code, jumlah test, path screenshot, deviasi).

## Execution evidence

Lane D. Dieksekusi 2026-10-09. Evidence folder: `/private/tmp/claude-501/-Users-nadindyta-Downloads--Projects-trainerssuperappvite/f2c6949b-f9c5-492f-80f3-05773b326b19/scratchpad/sidak-forecast-evidence/`.

**Screenshot** (1440 & 390, light/dark; viewport shell, area scroll internal tidak ikut): `before-*.png`, `after-*.png` di folder evidence.

**RED** (`pnpm exec playwright test sidak-forecast.spec.ts --workers=1`, sebelum implementasi): `red-output.txt` (exit 1; 14 gagal, 3 lulus). Run pertama (`red-run1-superseded-shared-first-step.txt`) dibuang: semua test gagal di langkah awal yang sama; helper `open()` diperbaiki agar menunggu penanda netral. Run kedua (`red-run2-superseded-test-fixes.txt`) memperbaiki 3 bug test (judul exact, g1, m). Alasan gagal per test (run final):

- a: heading `Prioritas agen` (exact) tidak ada (lama: "Prioritas agent").
- b: region `Tren layanan` tidak ada.
- c: baris "7 agen siap diproyeksikan · periode 3 bulan" tidak ada.
- d: teks `Watchlist` dan "agent" masih ada di `main`.
- e: tab `Total temuan` tidak ada (kontrol lama berupa tombol).
- f: `forecast-lane-dot` 0 dari 4.
- g2: tab `Per parameter` tidak ada. g3: region lane `Membaik` tidak ada. h: region `Prioritas agen` tidak ada.
- i/j: pesan state tidak ada di region `Tren layanan`. k/l: pesan istilah "agen" di region `Prioritas agen`/lane tidak ada.
- m: kontrak data (cache lookup, horizon) lulus; gagal hanya di baris ringkas "periode 6 bulan".
- Lulus sebelum perubahan (guard regresi kontrak yang dipertahankan, bukan RED): g1 (tanpa overflow), n (Call→Chat reset folder/request), o (pemimpin chat terkunci).

**GREEN** (urut, dari root worktree; log `verify-*.txt`, ringkasan `verify-summary.txt`):

- `pnpm --filter @trainers/web test:e2e sidak-forecast.spec.ts` → exit 0, 17 passed.
- `pnpm --filter @trainers/web test:e2e dashboard-trend-forecast.spec.ts` → exit 0, 7 passed.
- `pnpm --filter @trainers/web test:e2e main-landmark.spec.ts` → exit 0, 18 passed.
- `pnpm typecheck --concurrency=1` → exit 0. `pnpm lint --concurrency=1` → exit 0 (0 error; warning lama, tidak ada di file yang disentuh). `pnpm build --concurrency=1` → exit 0. `git diff --check` → exit 0.

**File**: `routes/sidak/forecast.tsx` 1318 → 598 baris; baru `components/sidak/forecast-status.ts`, `components/sidak/forecast/{AgentRow,ForecastLane,ForecastSummary,ForecastFilterBar,SeriesControls}.tsx`, `forecast/useForecastSeries.ts`, `utils/forecastFormat.ts`, `e2e/sidak-forecast.spec.ts`, `e2e/helpers/sidakForecastFixture.ts`; docs `docs/design.md` (subbagian Forecast (SIDAK)) dan `docs/modules.md`; dihapus `src/__tests__/sidak-forecast.test.tsx` (menguji halaman lama; kontrak yang masih berlaku dipindah ke E2E, tidak ada entri di `scripts/test-*.json`).

**Deviasi**:

1. (Dibatalkan oleh Follow-up) Mode seri tab menghilangkan kombinasi total + 1 parameter; dipulihkan di Follow-up.
2. Label bar filter (`DashboardFilters`/`MonthRangePicker`, komponen bersama) tetap 11px; test lantai 12px mengecualikan bar filter, grafik, dan `ForecastInsightPanel`.
3. State seri diekstrak ke hook `useForecastSeries` (logika identik) agar `forecast.tsx` <= 600 baris.
4. Test unit lama juga menguji alias layanan Chat, pencarian combobox Tim, dan opsi folder anak setelah rerender; tidak diport ke E2E (komponen `DashboardFilters` tidak diubah).
5. Skeleton loading grafik kehilangan tiga skeleton kartu metrik (blok metrik dihapus).

### Follow-up (2026-10-09)

**Semantik seri dipulihkan persis seperti sebelumnya** (`useForecastSeries`, `SeriesControls`): `Total temuan` kini tombol toggle `aria-pressed` (bukan tab); chip parameter selalu tampil; total boleh on/off; maksimal 2 seri tampil (total + 1 parameter atau 2 parameter); chip yang mati dan total yang mati dinonaktifkan saat batas tercapai; mematikan total tanpa parameter aktif menyalakan parameter pertama (grafik tidak pernah kosong); teks "Maksimal 2 data tampil..." hanya muncul saat batas tercapai. Deviasi 1 di atas gugur.

**Port kontrak unit lama ke E2E** (`sidak-forecast.spec.ts`; semua guard regresi yang lulus sejak ditulis, bukan RED, kecuali e/e2/g2 yang diubah untuk semantik seri):

- keeps fresh forecast data visible across idle rerenders → `p`
- keeps child folder options visible after scoped dashboard rerenders → `q`
- searches team and batch options from the Tim combobox → `r`
- deduplicates Chat aliases → `s`
- 44px + rentang bulan berlabel → `t` (juga `g2`)
- lane scroll desktop-only, tanpa badge peringkat → `u`
- label metrik/metode manusiawi → `b` (tanpa `linear-regression`)
- dark-mode state labels → `h`; permukaan datar tanpa kartu/sparkles → `v`
- chart props awal / alur toggle seri → `e`, `e2`; reset Call→Chat dan leader lock → `n`, `o` (sudah ada).

**Perintah (berurutan, log `followup-*.txt`)**: `test:e2e sidak-forecast.spec.ts` exit 0, 25 passed; `dashboard-trend-forecast.spec.ts` exit 0, 7 passed; `main-landmark.spec.ts` exit 0, 18 passed; `pnpm --filter @trainers/web exec tsc --noEmit` exit 0; `pnpm lint --concurrency=1` exit 0 (0 error, warning lama); `git diff --check` exit 0.

### Review orkestrator (2026-10-09)

- `thermo-nuclear` (review diff oleh orkestrator, bukan reviewer independen): putaran pertama
  **NEEDS_FIX**, dua temuan P1 dikembalikan ke eksekutor (lihat Follow-up):
  1. Regresi fitur: kombinasi "Total + 1 parameter" hilang (non-goal plan: tidak mengubah fitur).
     Kini dipulihkan dengan toggle Total (`aria-pressed`) + chip parameter, maksimal 2 seri.
  2. Unit test lama `sidak-forecast.test.tsx` dihapus padahal 4 kontraknya belum punya E2E
     (rerender data, opsi folder anak, cari Tim, dedup alias Chat). Kini dipindah ke E2E p/q/r/s
     (penjaga regresi, langsung hijau).
     Setelah follow-up: **PASS**, tanpa P0/P1/P2 tersisa. Peta status tunggal memakai
     `SIDAK_SCORE_TEXT/FILL`; empat titik lane berbeda; data/hook, `ParamTrendChart`, dan
     `ForecastInsightPanel` tidak berubah.
- Catatan P3: chip parameter aktif berwarna abu gelap sedangkan Total aktif hitam (sedikit
  berbeda); label filter bersama (`DashboardFilters`) masih 11px.
- Gate visual (pengganti audit `impeccable` penuh): screenshot orkestrator
  `orch-series-1440.png` (Total + Greeting aktif, chip lain nonaktif + teks batas) dan
  `orch-lanes-1440.png` (empat lane, istilah "agen"/"Pantauan") di folder evidence.
- Verifikasi ulang (dari `apps/web`):
  `pnpm exec playwright test sidak-forecast.spec.ts dashboard-trend-forecast.spec.ts main-landmark.spec.ts --workers=1`
  — **50 passed** (25 + 7 + 18); `tsc --noEmit` web exit 0; `eslint` file forecast exit 0.
