# EFEK — proper input dianggap sesuai secara default, dengan toggle

Status: siap dikerjakan. Worker yang dituju: Codex `gpt-6-luna`. Disusun 2026-10-29 dari diskusi Fajar dengan Claude dan simulasi data produksi.

- **Fase 1 (wajib): kontrak API + toggle.** Lane **C**: tambahan kontrak laporan EFEK di `packages/types`, `apps/api`, dan `apps/web`. Tanpa skema, migrasi, auth, RLS, atau perubahan rumus skor SIDAK.
- **Fase 2 (tampilan): rapikan halaman EFEK.** Lane **B/C**: UI saja, memakai data dari Fase 1. **Kalau worker tidak bisa memverifikasi tampilan secara visual** (screenshot 390px dan 1280px, terang dan gelap), berhenti setelah Fase 1 dan laporkan. Claude yang akan mengerjakan Fase 2.

## Cara membaca plan ini (worker)

1. Baca dulu, berurutan: `AGENTS.md`, `docs/AGENT_WORKFLOW.md` (§3 lane, §4 changelog, §7 verifikasi), dan `.claude/skills/trainers-superapp-tdd/SKILL.md`. Skill itu berlaku untuk Codex juga: perlakukan sebagai instruksi kerja. Untuk Fase 2 baca juga `DESIGN.md` → `docs/design.md`.
2. **Kerjakan di worktree terpisah, bukan di checkout utama.** Checkout utama (`/Users/nadindyta/Downloads/_Projects/trainerssuperappvite`) berisi pekerjaan Telefun yang belum di-commit. Jangan `git stash`, `git checkout`, `git reset`, atau `git add -A` di sana. Langkah setup ada di Task 0.
3. Kerjakan task **berurutan**. Setiap task punya titik **STOP**: kalau syaratnya tidak terpenuhi, berhenti dan laporkan ke Fajar dengan bukti, jangan mengarang jalan lain.
4. TDD: tulis E2E Playwright yang gagal dulu (RED), jalankan dan pastikan gagal karena alasan yang benar, baru implementasi (GREEN), lalu rapikan. **Jangan menambah atau menjalankan unit test (Vitest)** tanpa izin Fajar; jangan sentuh `scripts/test-core.json` / `scripts/test-fast.json`.
5. Satu test run pada satu waktu (Mac Fajar tidak kuat paralel). Sebelum menjalankan Playwright, pastikan tidak ada dev server atau Playwright lain yang jalan (`pgrep -fl "playwright|vite"`). Kalau ada, tunggu atau tanya Fajar. Jalankan dari `apps/web` di worktree:
   - browser: `pnpm exec playwright test e2e/tna-efek.spec.ts -g "<judul test>" --workers=1`
   - API (butuh Supabase lokal di loopback): `pnpm exec playwright test --config playwright.api.config.ts e2e/tna-efek-report-api.spec.ts -g "<judul test>" --workers=1`
   - Jangan pakai `pnpm test:e2e -- -g`. **Jangan pernah mengarahkan E2E ke produksi.**
6. Setiap commit menambah satu baris `- type(scope): ringkasan` di `CHANGELOG.md` di bawah `## <tanggal hari ini>`. Commit dan push ke `main` sudah diizinkan setelah gate hijau; **deploy produksi dan perubahan Supabase remote tidak**.
7. Jangan ubah file `.env*` (kecuali `.env.example`).

## Requirement

Proper input (pencatatan di APPK) menyumbang 48–66% temuan peserta EFEK, padahal pelatihan Level Up Week melatih interaksi dengan konsumen. Karena itu, perubahan skor EFEK selama ini lebih banyak mencerminkan input APPK daripada hasil pelatihan.

- **R1 — Default: proper input dianggap sesuai.** Setiap temuan pada parameter proper input dihitung dengan nilai 3 (sesuai). Bobot parameternya **tetap ada**, jadi skala skor sama dengan SIDAK. Parameter **tidak** dibuang dan bobotnya **tidak** dibagi ulang.
- **R2 — Toggle "Hitung proper input".** Kalau dinyalakan, laporan sama persis dengan perilaku sekarang (skor SIDAK resmi). Ini satu-satunya jalur alternatif.
- **R3 — Rata-rata layanan selalu ikut mode yang sama.** Skor dan temuan per sesi rata-rata layanan dihitung dengan aturan yang sama dengan peserta.
- **R4 — Temuan per sesi ikut mode.** Saat default, baris temuan proper input tidak dihitung sebagai temuan (termasuk baris bernilai 3 yang hanya berisi teks `ketidaksesuaian`/`sebaiknya`). Sesi audit yang temuannya hanya proper input **tetap dihitung sebagai sesi** (skor 100 di mode default).
- **R5 — Mode terlihat dan terbawa.** Mode tersimpan di URL (`?proper_input=include` untuk toggle menyala; tanpa parameter = default), berlaku di ringkasan `/tna/efek` dan rincian `/tna/efek/program/$code`, ikut saat pindah dari ringkasan ke rincian, dan tercatat di laporan unduhan.
- **R6 — Median.** Ringkasan program menambah `median_delta` dan `median_relative_delta` supaya satu pencilan tidak menentukan kesimpulan. Dihitung dari peserta yang dievaluasi dan tidak dikecualikan, sama seperti `avg_*`.
- **Pengenal proper input** (berdasarkan nama parameter di snapshot aturan periode, setelah `trim`, tanpa membedakan huruf besar-kecil):
  - nama diawali `Proper Input` → Chat, Email, CSO
  - nama diawali `Kemampuan Pencatatan` → Call
  - Di produksi (2026-10-29): Chat 2 parameter, CSO 2, Email 3, Call 2. Semuanya kategori `critical`.
- **Bukan scope:** kolom penanda proper input di database (butuh migrasi; nanti kalau nama parameter sering berubah), SLIK (`Kesesuaian Input…`, belum ada program EFEK SLIK), ambang naik/turun ±1 poin, pengaturan parameter sasaran per program, perubahan skor di halaman SIDAK, dan quickview EFEK di SIDAK (`services/efek/training.ts`).

## Design

### Fakta kode saat ini (diverifikasi 2026-10-29 di `c5310b3b`)

- Query laporan: `efekReportQuerySchema` di `packages/types/src/efek.ts` (±baris 142), objek `.strict()` berisi `window`, `year`, `tim`, `session`, `exclusions`. Dipakai di `apps/api/src/routes/efek.ts` (±baris 166 dan 177) dan `apps/web/src/routes/tna/efek-exclusions.tsx`.
- Laporan: `apps/api/src/services/efek/report.ts`.
  - `loadScores()` memuat temuan per layanan, mengelompokkan `period|agent`, memuat `PeriodScoringContext` per periode (`context.indicators`, `context.scoreIdByAnyId`, `context.weight`), lalu memanggil `calculateQAScoreFromTemuan(context.indicators, normalizePeriodScoringRows(getScoreRows(group), context), context.weight)`.
  - Jumlah temuan: `group.filter((r) => isCountableFinding(r)).length`. `isCountableFinding` juga menghitung baris bernilai 3 yang berisi teks.
  - Hasil per agent masuk `byAgent`. Agent yang lolos `isAgentExcluded` juga masuk `byMonth`, yang menjadi rata-rata layanan.
  - `summarize()` (±baris 431) membentuk `EfekProgramSummary`. `header()` membentuk `data_until`, `window`, `teams`, `years`.
- Router web: `EfekReportSearch` dan `efekReportSearch()` di `apps/web/src/router.tsx` (±baris 774). Rute ringkasan sengaja membuang `exclusions`.
- Filter UI bersama: `apps/web/src/routes/tna/efek-report-ui.tsx` (Jendela banding, Tahun sesi, Tim; patch lewat `navigate({ search: { ...search, ...patch } })`). Kartu ringkasan program ada di file yang sama (label `Δ relatif rata-rata layanan` ±baris 171). Grafik: `RelativeChart` (±baris 191) dengan geometri di `chartGeometry` (`efek-report-format.ts` ±baris 85–131), sumbu Y = min/max data ±15%.
- Rincian program: `apps/web/src/routes/tna/efek-program.tsx`. Urutan sekarang: link `Kembali ke EFEK` → `Unduh laporan` → filter → `EfekExclusions` (formulir besar) → kartu ringkasan → grafik → tabel peserta. Unduhan: `downloadEfekProgramHtml(data, search)` di `efek-export.ts`.
- E2E:
  - API: `apps/web/e2e/tna-efek-report-api.spec.ts` (serial, Supabase lokal asli). Fixture membuat indikator chat `Efek kritis/non kritis ${tag}` dan snapshot aturan miliknya sendiri (±baris 112–184), dan dibersihkan di ±baris 275–280. Contoh test kontrak: `"exclusions adjust aggregates without deleting attendance or changing the service average"` (±baris 485).
  - Browser: `apps/web/e2e/tna-efek.spec.ts` (hermetik, jaringan di-mock). Contoh: `"ringkasan EFEK menampilkan efek per program dan rincian peserta KETIK"` (±baris 465), `"pengecualian agent transparan, dapat dipulihkan, dan ikut ekspor"` (±baris 572), `"unduh laporan program menghasilkan HTML siap cetak dengan teks yang di-escape"` (±baris 760).
- Dokumen kanonis: `docs/modules.md` §10 (EFEK).

### Bentuk perubahan yang disarankan (Fase 1)

1. **Kontrak** (`packages/types/src/efek.ts`):
   - `efekReportQuerySchema` menambah `proper_input: z.literal("include").optional()`. **Jangan pakai `z.coerce.boolean()`**: string `"false"` akan terbaca `true`.
   - Header laporan (`EfekReport` dan `EfekProgramReport`) menambah `include_proper_input: boolean`.
   - `EfekProgramSummary` menambah `median_delta: number | null` dan `median_relative_delta: number | null`.
2. **Pengenal** di backend: satu fungsi bernama (mis. `isProperInputIndicator(name)` di `apps/api/src/services/efek/`), dengan komentar yang mencatat daftar nama produksi di atas. Jangan menduplikasi regex di tempat lain.
3. **Skor** (`loadScores`): setelah context periode dimuat, bentuk set id skor proper input dari `context.indicators`. Kalau `!include`:
   - baris hasil `normalizePeriodScoringRows` yang `indicator_id`-nya ada di set → `nilai: 3`, sebelum `calculateQAScoreFromTemuan`;
   - jumlah temuan mengecualikan baris yang id skornya (`context.scoreIdByAnyId.get(row.rule_indicator_id || row.indicator_id) ?? id mentah`) ada di set.
   - Rumus SIDAK (`lib/scoring.ts`, `period-scoring-context.ts`) **tidak diubah**. Mode diteruskan sebagai argumen dari `build()`, bukan variabel global.
4. **Ringkasan**: `summarize()` mengisi kedua median dengan pembulatan yang sama (`roundOrNull`). `header()` mengisi `include_proper_input`.
5. **Web**:
   - `EfekReportSearch` + `efekReportSearch()` menerima `proper_input: "include"`. Kedua rute (ringkasan dan rincian) mempertahankannya. Link dari kartu ringkasan ke rincian ikut membawanya.
   - Query API ikut mengirim `proper_input`.
   - Filter bersama di `efek-report-ui.tsx` menambah checkbox/switch native berlabel **"Hitung proper input (APPK)"** (tinggi kontrol ≥ 44px, bisa dioperasikan keyboard). Di bawah filter ada satu baris keterangan sesuai mode:
     - mati: _"Proper input (APPK) dianggap sesuai, jadi skor fokus pada interaksi dengan konsumen. Nyalakan untuk melihat skor SIDAK resmi."_
     - nyala: _"Skor SIDAK resmi, termasuk proper input (APPK)."_
   - `efek-export.ts` menulis mode yang sama di laporan unduhan.
   - Fase 1 tidak menata ulang tampilan; hanya menambah toggle dan keterangan.

### Fase 2 — tampilan (boleh diserahkan ke Claude)

Kritik yang harus diselesaikan, dari tinjauan halaman produksi 2026-10-29:

- **T1 — Jawaban dulu, alat admin belakangan.** Di rincian program, urutan menjadi: judul + keterangan cohort → filter (termasuk toggle) → kartu kesimpulan → grafik → tabel peserta. `EfekExclusions` dipindah ke bawah kartu kesimpulan sebagai bagian yang bisa dibuka-tutup (`<details>` native atau disclosure setara) berjudul "Sesuaikan analisis". Bagian itu otomatis terbuka kalau ada pengecualian aktif. Daftar pengecualian aktif dan pembanding "semua peserta" tetap terlihat tanpa membuka.
- **T2 — Satu kesimpulan per kartu.** Kartu program (ringkasan dan rincian) menonjolkan satu angka utama: **median Δ dibanding rata-rata layanan** (`median_relative_delta`), dengan teks `n dievaluasi`. Di bawahnya, baris sekunder: temuan per sesi sebelum → sesudah, naik/stabil/turun, dan rata-rata Δ skor. Label `Δ relatif rata-rata layanan` diganti **"Dibanding rata-rata layanan"**. Pasangan label/nilai disusun bertumpuk di layar sempit supaya label tidak terpotong.
- **T3 — Sumbu grafik tidak melebih-lebihkan.** Di `chartGeometry`, rentang sumbu Y skor minimal 10 poin (berpusat pada data, batas atas maksimal 100). Rentang sumbu Y temuan per sesi mulai dari 0. Tabel data untuk pembaca layar tetap ada.
- **T4 — Navigasi tidak dobel.** Hapus link teks `Kembali ke EFEK` di rincian program (breadcrumb dan tab sudah ada). Kalau E2E lama bergantung pada link itu, arahkan ke breadcrumb.
- **T5 — Tabel peserta.** Kolom `Δ relatif` diberi judul "Dibanding layanan" dengan tooltip/keterangan singkat. Penanda "Data tipis" tetap ada.
- Pertahankan token desain yang ada (warna `module-tna`, `border`, `card`), tanpa dependensi baru, tanpa animasi baru.

## Tasklist

### Task 0 — Worktree dan baseline

Fajar menjalankan langkah setup di checkout utama (worker tidak menyalin file `.env*`):

```bash
cd /Users/nadindyta/Downloads/_Projects/trainerssuperappvite
git fetch origin
git worktree add ../trainerssuperappvite-efek-proper -b feat/efek-proper-input-toggle origin/main
find . -maxdepth 3 -name '.env*' ! -name '.env.example' -not -path '*/node_modules/*' \
  -exec sh -c 'mkdir -p "../trainerssuperappvite-efek-proper/$(dirname "$1")" && cp "$1" "../trainerssuperappvite-efek-proper/$1"' _ {} \;
cd ../trainerssuperappvite-efek-proper && pnpm install
```

Worker, dari `../trainerssuperappvite-efek-proper`:

- [ ] `git status -sb` menunjukkan branch `feat/efek-proper-input-toggle`, bersih, dan plan ini ada di `plans/markdown/`.
- [ ] Drift-check fakta di §Design terhadap kode.
- [ ] Pastikan Supabase lokal hidup di loopback (`supabase status`; kalau mati, `supabase start` membutuhkan Docker). **STOP** kalau Docker/Supabase lokal tidak bisa jalan; jangan pakai target remote.
- [ ] Baseline: API `-g "exclusions adjust aggregates"` dan browser `-g "ringkasan EFEK menampilkan efek per program"`. Keduanya harus hijau.
- **STOP** kalau baseline merah atau fakta kode berbeda material.

### Task 1 — RED: E2E Fase 1

API (`tna-efek-report-api.spec.ts`). Tambah satu indikator chat critical bernama `Proper Input: Efek ${tag}` ke fixture (`qa_indicators` **dan** snapshot `qa_service_rule_indicators`), dengan pembersihan yang sama. Tambah temuan proper input (nilai 0) untuk satu peserta di bulan sesudah pelatihan.

- [ ] **"proper input counts as compliant by default and the toggle restores the SIDAK score"**: tanpa `proper_input`, skor sesudah peserta itu sama seperti kalau temuan proper input bernilai 3, `findings_after` tidak menghitungnya, `sessions_after` tetap, dan `include_proper_input === false`. Dengan `proper_input=include`, skor dan temuan sama dengan perilaku lama, dan `include_proper_input === true`.
- [ ] **"the service average follows the proper input mode"**: `comparison_score` pada bulan itu berbeda antara dua mode sesuai temuan proper input, dan agent non-peserta mengikuti aturan yang sama.
- [ ] **"program summary reports medians"**: `median_delta` dan `median_relative_delta` cocok dengan median manual dari peserta fixture (jumlah genap dan ganjil).
- [ ] **"proper_input rejects any value except include"**: `proper_input=false` dan `proper_input=1` → 400.

Browser (`tna-efek.spec.ts`, mock route laporan):

- [ ] **"toggle proper input tersimpan di tautan, terbawa ke rincian, dan ikut ekspor"**: default tanpa parameter dan keterangan mode mati tampil. Nyalakan toggle → URL berisi `proper_input=include`, request API membawanya, keterangan berubah. Buka rincian program → toggle tetap menyala. Laporan unduhan menyebut mode. Muat ulang → mode bertahan. Bisa dilakukan dengan keyboard saja.
- [ ] Jalankan setiap test baru satu per satu. Semuanya harus gagal **karena fitur belum ada** (400 untuk parameter tak dikenal, field hilang, toggle tidak ditemukan), bukan karena fixture atau selector salah. Simpan output RED.
- **STOP** kalau ada test yang lolos sebelum implementasi, atau gagal karena alasan lain.

### Task 2 — GREEN: implementasi Fase 1

- [ ] Terapkan §Design "Bentuk perubahan yang disarankan" butir 1–5.
- [ ] Jalankan test baru satu per satu sampai hijau, lalu seluruh `tna-efek-report-api.spec.ts` dan `tna-efek-api.spec.ts`.
- [ ] Test API lama yang mengandalkan temuan proper input tidak ada (fixture lama tidak memakai nama itu). **STOP** kalau ada ekspektasi test lama yang harus diubah.

### Task 3 — Gate Fase 1, commit

- [ ] Refactor tanpa mengubah perilaku. Gaya dan kepadatan komentar mengikuti file sekitarnya.
- [ ] Review `thermo-nuclear` (`.claude/skills/thermo-nuclear/SKILL.md`) atas diff, lalu perbaiki temuan.
- [ ] Dari root worktree, serial: `pnpm exec turbo run typecheck --concurrency=1`, `pnpm exec turbo run lint --concurrency=1` (tanpa error baru di file yang diubah), `git diff --check`.
- [ ] Jalankan seluruh `e2e/tna-efek.spec.ts` dan `e2e/sidak-agent-efek-training.spec.ts` sekali.
- [ ] Perbarui `docs/modules.md` §10: mode default proper input, toggle, dan median.
- [ ] Commit dengan entri `CHANGELOG.md`, misalnya `- feat(efek): anggap proper input sesuai secara default dengan toggle skor SIDAK resmi`.

### Task 4 — Fase 2: tampilan (lewati kalau tidak bisa verifikasi visual)

- **STOP dan lompat ke Task 5** kalau worker tidak bisa mengambil dan memeriksa screenshot Playwright. Laporkan "Fase 2 belum dikerjakan" ke Fajar.
- [ ] RED dulu untuk perilaku yang bisa diuji: urutan bagian rincian program (kartu kesimpulan sebelum "Sesuaikan analisis"), "Sesuaikan analisis" tertutup tanpa pengecualian dan terbuka dengan pengecualian, label "Dibanding rata-rata layanan" + median tampil, link `Kembali ke EFEK` tidak ada, dan tabel peserta mobile tetap tanpa geser samping.
- [ ] Terapkan T1–T5.
- [ ] Sesuaikan test lama yang selector-nya berubah karena T1/T4. Hanya selector; ekspektasi perilaku tidak berubah. Catat setiap perubahan.
- [ ] Bukti visual: screenshot per bagian (bukan seluruh halaman, karena area scroll aplikasi terpotong) di 390px gelap dan 1280px terang untuk ringkasan, kartu, grafik, dan "Sesuaikan analisis". Periksa fokus keyboard dan kontrol ≥ 44px.
- [ ] Self-audit `impeccable` atas permukaan yang diubah, lalu typecheck/lint/`git diff --check` lagi dan seluruh `e2e/tna-efek.spec.ts`.
- [ ] Commit terpisah, misalnya `- feat(efek): tampilkan kesimpulan EFEK lebih dulu dengan median dan sumbu yang jujur`.

### Task 5 — Gabung, laporan

- [ ] `git fetch origin && git rebase origin/main`. Konflik `CHANGELOG.md`: pertahankan semua baris di bawah tanggal yang sama.
- [ ] Ulangi test baru sekali kalau rebase menyentuh file EFEK.
- [ ] Push dari worktree tanpa menyentuh checkout utama: `git push origin HEAD:main`.
- [ ] Laporkan ke Fajar: daftar commit, output RED/GREEN, perintah gate beserta hasilnya, perubahan selector test lama, path screenshot, dan status Fase 2 (selesai / belum).
- [ ] Fajar yang menghapus worktree: `git worktree remove ../trainerssuperappvite-efek-proper && git branch -d feat/efek-proper-input-toggle`.

## Bukti simulasi (konteks, bukan target test)

Simulasi 2026-10-29 menjalankan `report.ts` asli di sesi browser admin Fajar, read-only. Varian "dihitung" cocok persis dengan aplikasi. Varian simulasi **membuang** parameter (bobot dibagi ulang), jadi besarnya berbeda dari R1, tetapi arahnya relevan. Median Δ relatif, dihitung → dibuang:

| Program | Dihitung | Dibuang | Temuan per sesi (dihitung → dibuang)                   |
| ------- | -------- | ------- | ------------------------------------------------------ |
| PDKT    | +1,27    | +2,25   | 1,49→1,26 jadi 0,51→0,34                               |
| CERIWIS | +0,09    | +1,68   | 1,16→1,26 jadi 0,52→0,48                               |
| KETIK   | +0,06    | −0,11   | 1,37→1,32 jadi 0,71→0,82                               |
| Telefun | +0,46    | −0,01   | 1,35→1,92 jadi 0,63→1,24 (satu pencilan: 23→99 temuan) |

Angka default yang baru akan berbeda dari yang pernah dilihat tim, terutama KETIK. Itu sebabnya keterangan mode (R5) wajib ada.
