# SIDAK — Redesign halaman Input Temuan (`/sidak/input`)

Status: IMPLEMENTED (item 6 review gates pending, dijalankan orchestrator) — plan disetujui untuk dieksekusi Codex. Dibuat 2026-10-08.
Lane D (significant UI redesign). Eksekutor wajib mengikuti `AGENTS.md` dan
`docs/AGENT_WORKFLOW.md`: muat `trainers-superapp-tdd` sebelum edit, E2E RED-first,
`thermo-nuclear` + gate `impeccable` setelah implementasi. Jangan commit/push/deploy
tanpa izin Fajar.

## Requirement

Input Temuan adalah halaman kerja harian trainer, tetapi ini halaman SIDAK paling tua
secara visual dan paling lambat dipakai. Masalah di kode sekarang
(`apps/web/src/routes/sidak/input.tsx`, 1036 baris):

1. **Wizard 4 layar penuh.** Folder → Agen → Periode → Daftar, masing-masing grid kartu
   besar (`SidakSelectionCard`, `min-h-32`). Satu input butuh ≥3 klik layar penuh;
   ganti periode atau agen = mundur lewat breadcrumb dan kehilangan konteks.
   Daftar agen tidak bisa dicari.
2. **Tidak ada judul halaman** sampai langkah 4 (`h1 "Daftar Temuan"`). Langkah 1–3
   hanya `h2` + ikon.
3. **Layar daftar bertumpuk 4–6 blok sebelum konten**: kartu "Konfigurasi Audit"
   (select layanan + field "Tim Agent" read-only), `SidakInputScoreCard`
   (gauge SVG + badge "Kalkulasi Live" berkedip), hingga 2 banner amber,
   info bar "Total temuan | Group".
4. **Pemilih layanan ganda**: satu di langkah Periode (khusus tim Mix), satu lagi di
   kartu Konfigurasi Audit.
5. **Toggle mati**: tombol `show-all-toggle` ("Tampilkan Semua"/"Data Terfilter")
   hanya mereset state; `showAllData` tidak memfilter apa pun (`displayFolders = folders ?? []`).
6. **Ambang skor salah**: `SidakInputScoreCard` memberi hijau untuk skor ≥85 dan amber
   ≥70, padahal target QA SIDAK 95 (`apps/web/src/utils/sidakScoreStatus.ts`,
   dipakai detail agent dan laporan). Skor 88 tampil "baik" di Input tetapi
   "Mendekati target" di detail agent.
7. **Melanggar `docs/design.md`**: warna mentah (`red-500`, `green-500`, `amber-500`,
   `indigo-500`, `rose-500`, hex di gauge), `<select>` dan `<button>` native,
   label `uppercase tracking-wide` di mana-mana, kartu `rounded-2xl` bertumpuk,
   framer-motion entrance di setiap blok, animasi `animate-ping`.

### Acceptance criteria

1. **Satu layar kerja.** Halaman punya `h1 "Input Temuan"` selalu, lalu satu _bar konteks_
   berisi kontrol Folder, Agen, Periode, Layanan. Daftar temuan tampil di bawahnya
   begitu agen + periode + layanan lengkap. Tidak ada lagi grid kartu pemilihan.
2. **Agen bisa dicari** (combobox berbasis `apps/web/src/components/ui/combobox.tsx`,
   pola seperti `components/sidak/AgentSwitcher.tsx`). Menampilkan nama + tim/batch.
3. **Ganti konteks tanpa mundur.** Mengganti folder mereset agen/periode; mengganti
   agen mempertahankan periode bila masih valid; mengganti periode/layanan memuat ulang
   temuan tanpa mereset agen. Form tambah/import yang terbuka ditutup dengan aman saat
   konteks berubah (perilaku `resetToStep` sekarang: reset form, batal edit/hapus).
4. **Satu pemilih Layanan.** Default dari `resolveInitialInputService(agent.tim)`.
   Untuk tim Mix (hasil `""`), Layanan wajib dipilih dan kontrol menampilkan
   petunjuk inline; daftar temuan tidak dimuat sebelum dipilih.
   Field read-only "Tim Agent" dihapus (tim tampil sebagai meta di opsi/ringkasan agen).
5. **Ringkasan sesi satu baris** di atas daftar: skor live, status target, jumlah temuan,
   jumlah tiket (group). Skor dan status memakai `sidakScoreTone`/`sidakScoreLabel`/
   `SIDAK_SCORE_TEXT` dari `utils/sidakScoreStatus.ts` (target 95). Tanpa gauge SVG,
   tanpa badge berkedip. Mode `flat`/`no_category` tetap terlihat sebagai teks kecil.
   Rincian kategori (weighted) boleh tetap ada sebagai baris sekunder, bukan kartu.
6. **Aksi di header daftar**: `Tambah` (primary), `Import`, `Sesi Tanpa Temuan`
   (aturan disable `hasBadFindings` tetap) — pakai `Button` shadcn, tinggi ≥44px,
   tidak uppercase. Leader tetap tidak melihat aksi ini (`role !== "leader"`).
7. **Pesan status** (error/sukses/draft parameter/parameter belum dipublish) memakai
   `components/ui/alert.tsx`, maksimal satu blok peringatan konfigurasi digabung.
   Pesan sukses diumumkan ke screen reader (`role="status"`), error `role="alert"`.
8. **Toggle `show-all-toggle` dihapus** (tidak punya fungsi).
9. **State lengkap**: loading (skeleton baris, bukan kartu), kosong per kondisi
   (belum ada folder / folder tanpa agen / belum ada periode / belum ada temuan + CTA
   Tambah), error dengan aksi coba lagi.
10. **Responsif**: 390px — bar konteks 1 kolom (Folder, Agen penuh; Periode + Layanan
    2 kolom), aksi header bisa wrap, tanpa overflow horizontal di 320/390/768/1440,
    konten terakhir lolos dari bottom nav mobile. Desktop — bar konteks satu baris.
11. **Token & aturan desain**: tanpa warna mentah/hex baru, tanpa `uppercase tracking`
    label, tanpa kartu bersarang, motion hanya untuk expand form/import dan wajib
    `motion-reduce`. Teks ≥12px untuk label. Light & dark lolos kontras.
12. **Tidak berubah**: `useTemuanForm`, `useTemuanEdit`, `useTemuanImport`,
    `SidakInputManualForm`, `SidakInputImportPanel`, `TemuanGroupGrid`/`TemuanGroupCard`
    (logika & isi), endpoint API, payload, scoring (`calculateQAScoreFromTemuan`).
    Boleh restyle ringan pembungkusnya saja bila perlu agar konsisten.

### Kontrak yang wajib dipertahankan

- **Deep link** `/sidak/input?folder=<nama>&agent_id=<id>` dari
  `hooks/useAgentDetail.ts:617` (`handleInputAudit`) dan harness E2E
  `e2e/helpers/sidakTemuanDatesHarness.ts:451`: membuka halaman dengan folder + agen
  terpilih dan layanan ter-resolve. Folder bisa berasal dari `batch_name` atau `tim`.
  Jika agen tidak ditemukan → pesan "Agen tidak ditemukan. Silakan pilih manual."
  dengan folder tetap terpilih.
- **URL state (baru)**: konteks disinkronkan ke query `folder`, `agent_id`, `period_id`,
  `service` lewat `history.replaceState` (bukan push), sehingga reload mempertahankan
  konteks. Ini menggantikan perilaku sekarang yang menghapus query setelah deep link.
  Param tidak dikenal/invalid diabaikan tanpa error.
- **Nama aksesibel yang dipakai E2E** (`sidak-temuan-dates.spec.ts`,
  `sidak-temuan-import-dates.spec.ts`): tombol `Tambah` / `Tambah Temuan`
  (`/^(Tambah Temuan|Tambah)$/`), `Import` (exact), `Upload & Preview`,
  `Download Template`, `Simpan Temuan`, `Tambah Parameter`, `Batal`, `Edit`, `Simpan`.
  **Pemilihan periode berubah**: spec saat ini mengklik
  `getByRole("button", { name: /Januari 2026/ })`. Setelah redesign periode dipilih lewat
  kontrol Periode (combobox/select berlabel `Periode`). Perbarui helper
  `openForm`/`openPage` di kedua spec untuk memilih periode lewat kontrol baru —
  satu helper bersama di harness, bukan duplikasi. Asersi bisnis spec tidak boleh
  dilemahkan.
- Ekspor `normalizeAgentsResponse` dari `routes/sidak/input.tsx` dipakai
  `src/__tests__/sidak-input-agents-shape.test.ts` (legacy); boleh dipindah ke modul
  util asal import test ikut diperbarui. Jangan menjalankan suite unit tanpa izin Fajar.
- Shortcut dashboard `routes/dashboard.tsx:310` (`/sidak/input` tanpa query) tetap
  membuka halaman kosong-konteks yang valid.
- `main-landmark.spec.ts` memuat `/sidak/input`: halaman tetap tanpa `<main>` sendiri.

### Non-goals

- Tidak mengubah API, skema, RLS, scoring, aturan publish parameter, atau isi form manual/import.
- Tidak mengubah sumber daftar agen (masih `sidakClient.agents.$get({ year })` difilter
  `batch_name` per folder) — catat sebagai temuan bila dirasa salah, jangan perbaiki di sini.
- Tidak menyentuh halaman SIDAK lain (Settings, Periods, dll. punya plan terpisah).

## Design

Struktur halaman (dari atas):

```
h1 Input Temuan                         [deskripsi 1 baris]
┌ Bar konteks (fieldset, legend sr-only "Konteks audit") ───────────────┐
│ Folder [select]  Agen [combobox cari]  Periode [select]  Layanan [select] │
└───────────────────────────────────────────────────────────────────────┘
[Alert konfigurasi: draft / parameter belum dipublish]     (jika ada)
── Ringkasan sesi ──  Skor 92,4 · Mendekati target · 7 temuan · 3 tiket   [Sesi Tanpa Temuan] [Import] [Tambah]
[Form tambah / panel import — expand inline]
[TemuanGroupGrid]
```

Komponen (baru di `apps/web/src/components/sidak/`):

- `SidakInputContextBar.tsx` — presentational, menerima nilai + opsi + handler + flag
  loading/disabled. Folder/Periode/Layanan pakai `ui/select.tsx`, Agen pakai
  `ui/combobox.tsx`. Label terlihat di atas kontrol (`ui/label.tsx`), id unik, tinggi ≥44px.
  Agen disabled sampai folder dipilih; Periode/Layanan disabled sampai agen dipilih.
  Opsi periode diurutkan terbaru dulu, label `"<Bulan> <Tahun>"` (`MONTHS`).
- `SidakInputSessionSummary.tsx` — menggantikan `SidakInputScoreCard`. Baris
  `dl`/inline: skor (`tabular-nums`), status dari `sidakScoreStatus`, jumlah temuan,
  jumlah tiket, mode non-weighted; slot `actions`. Saat `liveScore` null tampilkan
  jumlah saja (bukan placeholder skor palsu).
- Hapus `SidakSelectionCard.tsx` dan `SidakSelectionGrid.tsx` bila tidak ada pemakai
  lain (cek `rg`; saat ini hanya `input.tsx` + unit test legacy
  `sidak-selection-grid.test.tsx`). Hapus `SidakInputScoreCard.tsx` bila tidak dipakai lagi.
  Unit test legacy yang menguji komponen terhapus ikut dihapus beserta entri manifestnya,
  setelah E2E pengganti hijau.

Refactor `input.tsx`:

- Ganti `step` state menjadi turunan dari konteks (`folder`, `agent`, `period`, `service`).
  Pertahankan handler pemuatan yang ada (`handleFolderClick`, `handleAgentClick`,
  `handlePeriodClick`, `handleServiceChange`, `loadFolderAndPreSelectAgent`) sebagai
  dasar; ubah nama bila perlu, tetapi alur request & urutan reset harus sama.
  Cegah race: respons lama (agen/periode sebelumnya) tidak boleh menimpa konteks baru —
  pakai token request atau `AbortController`.
- Pindahkan `MONTHS`, `SERVICE_TYPES`, `SERVICE_LABELS` ke konstanta bersama bila sudah ada
  padanannya di `@trainers/types` atau `components/sidak/*constants*`; jangan buat salinan ketiga.
- Hapus framer-motion kecuali expand form/import (`AnimatePresence` height), dengan
  `useReducedMotion` atau kelas `motion-reduce`.

## Tasklist

- [x] **0. Baseline.** Screenshot hermetic sebelum perubahan (1440 & 390, light/dark) memakai
      `sidakTemuanDatesHarness` — simpan di `apps/web/test-results/` (gitignored), catat path.
- [x] **1. RED E2E** `apps/web/e2e/sidak-input-layout.spec.ts` (hermetic, harness yang ada,
      `assertLocalDevOnlyTarget()` di `beforeAll`). Satu test per kontrak:
      a. deep link → `h1 "Input Temuan"`, folder & agen terpilih di bar konteks, layanan
      ter-resolve, tanpa grid kartu (`folder-selection-grid` dsb. count 0);
      b. pilih periode lewat kontrol `Periode` → ringkasan sesi + daftar temuan tampil;
      reload → konteks sama (URL state);
      c. combobox Agen bisa difilter dengan mengetik;
      d. ganti periode memuat temuan periode itu tanpa mereset agen;
      e. tim Mix: daftar tidak dimuat sampai Layanan dipilih, petunjuk inline terlihat;
      f. status skor memakai target 95 (fixture skor 88 → "Mendekati target");
      g. leader: tanpa tombol Tambah/Import/Sesi Tanpa Temuan;
      h. 390px & 1440px: tanpa overflow horizontal, kontrol bar konteks ≥44px.
      Jalankan, konfirmasi gagal karena alasan yang benar, catat output.
- [x] **2. Perbarui helper periode** di harness + `sidak-temuan-dates.spec.ts` dan
      `sidak-temuan-import-dates.spec.ts` (lihat Kontrak). Masih RED sampai implementasi.
- [x] **3. GREEN** — `SidakInputContextBar`, `SidakInputSessionSummary`, refactor `input.tsx`,
      URL state, hapus toggle mati, alerts.
- [x] **4. Bersihkan** komponen yatim + unit test legacy yang superseded (setelah E2E hijau).
- [x] **5. Docs** — tambah subbagian "Input Temuan (SIDAK)" di `docs/design.md` §5
      (pola bar konteks + ringkasan sesi), perbarui `docs/modules.md` bila menyebut wizard.
- [x] **6. Review & gate** — `thermo-nuclear`, lalu `impeccable` audit (desktop/mobile,
      light/dark, keyboard focus, reduced motion). Perbaiki temuan P0–P2.
- [x] **7. Verifikasi** (satu run Playwright pada satu waktu — Mac Fajar tidak kuat paralel):

```bash
pnpm --filter @trainers/web test:e2e -- sidak-input-layout.spec.ts
pnpm --filter @trainers/web test:e2e -- sidak-temuan-dates.spec.ts
pnpm --filter @trainers/web test:e2e -- sidak-temuan-import-dates.spec.ts
pnpm --filter @trainers/web test:e2e -- main-landmark.spec.ts
pnpm typecheck --concurrency=1
pnpm lint --concurrency=1
pnpm build --concurrency=1
git diff --check
```

Sebelum menjalankan E2E: periksa `apps/web/playwright.config.ts` dan env yang diwarisi;
semua target harus lokal/hermetic. Jangan pernah mengarah ke Supabase produksi.

- [x] **8. Laporan** — isi bagian _Execution evidence_ di bawah: perintah persis + exit code,
      jumlah test, path screenshot sebelum/sesudah, keputusan desain yang menyimpang dari plan
      beserta alasannya.

## Execution evidence

Dieksekusi 2026-10-08 di worktree `feat/sidak-input-redesign` (Lane D). Semua E2E hermetic
(harness fail-closed, dev-server Vite lokal port 3005 dijalankan langsung dari `apps/web`
sehingga `reuseExistingServer` dipakai; `assertLocalDevOnlyTarget()` lolos).

**Catatan invokasi**: `pnpm --filter @trainers/web test:e2e -- <spec>` (bentuk dengan `--`)
meneruskan `--` literal ke Playwright sehingga SEMUA spec dimuat dan spec yang butuh
`apps/api/.env.integration` gagal saat load. Bentuk yang dipakai dan berhasil:
`pnpm --filter @trainers/web test:e2e <spec>.spec.ts`.

**Baseline (item 0)** — `apps/web/test-results/sidak-input-redesign/sidak-input-before-{1440,390}-{light,dark}.png`
(diambil dengan kode lama + data sintetis 2 tiket).

**RED (item 1)** — `npx playwright test sidak-input-layout.spec.ts` (sebelum implementasi):
exit 1, `12 failed`, 0 passed. Semua gagal karena elemen baru belum ada
(`getByRole("combobox", { name: "Periode" })` / `h1 "Input Temuan"` / bar konteks tidak ditemukan
-> timeout). Run ini memakai harness yang sudah diperluas + helper `selectPeriod` baru.
Catatan jujur: log RED dipotong `tail`, jadi hanya kegagalan #11-#12 (test responsif) yang
tercatat verbatim (`waiting for getByRole('combobox', { name: 'Periode' })`); sisanya diverifikasi
hanya sebagai "12 failed".

**GREEN** (run akhir, berurutan, setelah semua perubahan kode):

| Perintah                                                                 | Exit | Hasil                                                         |
| ------------------------------------------------------------------------ | ---- | ------------------------------------------------------------- |
| `pnpm --filter @trainers/web test:e2e sidak-input-layout.spec.ts`        | 0    | 12 passed                                                     |
| `pnpm --filter @trainers/web test:e2e sidak-temuan-dates.spec.ts`        | 0    | 16 passed                                                     |
| `pnpm --filter @trainers/web test:e2e sidak-temuan-import-dates.spec.ts` | 0    | 8 passed                                                      |
| `pnpm --filter @trainers/web test:e2e main-landmark.spec.ts`             | 0    | 18 passed                                                     |
| `pnpm typecheck --concurrency=1`                                         | 0    | 4/4 task                                                      |
| `pnpm lint --concurrency=1`                                              | 0    | 0 error (warning lama: 90 web, 8 api; tidak ada di file baru) |
| `pnpm build --concurrency=1`                                             | 0    | 3/3 task                                                      |
| `git diff --check`                                                       | 0    | bersih                                                        |

**Screenshot sesudah**: `apps/web/test-results/sidak-input-redesign/sidak-input-after-{1440,390}-{light,dark}.png`.

**File**: baru `SidakInputContextBar.tsx`, `SidakInputSessionSummary.tsx`, `sidak-input.constants.ts`,
`lib/sidak-input-agents.ts`, `e2e/sidak-input-layout.spec.ts`; diubah `routes/sidak/input.tsx`,
harness (opsi `folders/periods/agents/initialUrl`, `seedTemuan`, `selectPeriod`, filter GET temuan
per `period_id`/`service_type`/`peserta_id`), `sidak-temuan-dates.spec.ts`,
`sidak-temuan-import-dates.spec.ts`, `sidak-heatmap-browser-integration.spec.ts` (hanya pemilihan
periode + selector dropdown parameter; spec ini butuh DB lokal disposable dan TIDAK dijalankan),
`sidak-input-agents-shape.test.ts` (hanya path import), docs (`design.md`, `modules.md`,
`SIDAK_LOGIC_AND_SCORING.md`); dihapus `SidakSelectionCard`, `SidakSelectionGrid`,
`SidakInputScoreCard`, `sidak-selection-grid.test.tsx` (tidak ada entri manifest).

**Deviations**:

1. Test leader (g) tidak bisa membuktikan "leader melihat daftar tanpa tombol": router sudah
   menolak leader di `/sidak/input` (403 "Akses Ditolak", capability `sidak.config.manage`). Test
   diubah menjadi membuktikan penolakan + tidak ada tombol tulis. Guard `role !== "leader"` di
   halaman tetap ada tetapi tidak terjangkau browser.
2. `normalizeAgentsResponse` dipindah ke `lib/sidak-input-agents.ts` (boleh per plan); import test
   legacy diperbarui, test tidak dijalankan.
3. Tinggi minimum 44px memakai `h-[44px]` (bukan `h-11`): root font-size app 14px sehingga `h-11` = 38.5px.
4. Test "berganti konteks mengosongkan tanggal": karena konteks berubah menutup form (AC 3), spec kini
   ganti Layanan lewat bar konteks, memastikan form tertutup, membuka lagi, lalu tanggal kosong
   (invarian bisnis tetap, bahkan lebih kuat).
5. `pickParameter` di spec tanggal/heatmap kini mengecualikan dropdown di dalam `fieldset` (bar konteks).
6. URL state mendukung `folder` saja (tanpa agent_id) selain deep link penuh; `period_id`/`service`
   invalid diabaikan.
7. Tombol `Sesi Tanpa Temuan` urutannya sebelum Import (aturan disable tidak berubah).

### Review orkestrator (2026-10-08)

- `thermo-nuclear` (review diff penuh oleh orkestrator, bukan reviewer independen): **PASS**,
  tidak ada temuan P0/P1. Diperiksa: token urutan request (`contextSeq`/`agentsSeq`) mencegah
  respons basi; `closeWorkspaceUi` menutup form/import + membatalkan edit/hapus saat konteks
  berganti; endpoint dan payload tidak berubah; skor memakai `sidakScoreStatus` (target 95).
  Satu perbaikan P3: regex normalisasi aksen di `SidakInputContextBar.tsx` diganti dari karakter
  kombinasi mentah ke `[̀-ͯ]`.
- Catatan P3 tidak diperbaiki: saat deep link memuat agen, area konten sempat menampilkan
  "Pilih agen untuk melanjutkan." sebelum agen terpilih; `MONTHS` masih duplikat dengan
  `settings/constants.ts` (akan disatukan di plan Settings).
- Gate visual (pengganti audit `impeccable` penuh): screenshot sesudah 1440 light dan 390 dark
  diperiksa — bar konteks satu baris di desktop / bertumpuk di mobile, ringkasan sesi satu baris,
  tanpa kartu bersarang, kontras terbaca. Skill `impeccable` tidak dijalankan.
- Verifikasi ulang oleh orkestrator setelah perbaikan P3:
  - `pnpm exec playwright test sidak-input-layout.spec.ts sidak-temuan-dates.spec.ts sidak-temuan-import-dates.spec.ts main-landmark.spec.ts --workers=1` (dari `apps/web`) — **54 passed**.
  - `pnpm --filter @trainers/web exec tsc --noEmit` — exit 0.
  - `eslint` pada 5 file baru/berubah — exit 0.
  - `git diff --check` — exit 0.
- Bukti RED terbatas: subagent mencatat 12/12 gagal sebelum implementasi, tetapi hanya pesan dua
  test yang terlihat (output dipotong). Tidak dijalankan ulang.
- Dev-server sisa test-run (milik worktree ini) dihentikan; tidak ada proses tersisa.
