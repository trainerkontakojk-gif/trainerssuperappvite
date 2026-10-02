# Heatmap Ketidaksesuaian SIDAK — Rencana Implementasi Per Fase

- **Status:** Fase 0–7 diimplementasikan. REPAIR review (P1–P8) + gap lanjutan: E2E fitur **83 hijau** dan regresi ekspor **31 hijau** (historis, 2026-10-01; **bukan** hasil run ulang). Requirement/Design tidak berubah.
- **Status rilis (2026-10-02, SELESAI untuk lokal + migrasi; push main menyusul di commit yang sama):** pengguna mengizinkan dokumentasi, commit, migrasi, dan push ke `main`. **Fresh E2E lokal LULUS** terhadap stack Supabase lokal yang sudah berjalan (tanpa reset): sidak-heatmap-integration 3, sidak-heatmap-browser-integration 2, sidak-temuan-dates-api 40, sidak-temuan-dates 15, sidak-temuan-import-dates 8, sidak-heatmap 13, sidak-agent-report-date-invariance 2, regresi ekspor 31, sidak-jadwal-shifting 50 — semuanya hijau pada port loopback terisolasi (Vite 3105; jadwal-shifting pada port native 3005). Fresh `pnpm typecheck` / `pnpm lint` (0 error) / `pnpm build` juga hijau (web/api/telefun uncached). **Migrasi tunggal** `20261001120000_add_temuan_business_dates.sql` (SHA-256 `1f690e7a…c5bd`) **sudah diterapkan** ke target terkonfirmasi `ruosnjmtywcrghjgqugz` melalui `supabase db query --linked -f` (wrapper transaksional, hanya file ini) dan dicatat sebagai history `applied`; kolom `date NULL` + komentar terverifikasi, RLS/policy tidak berubah, migrasi PDKT `20260930120000` tetap **tidak** diterapkan. Angka E2E lama 83/31 tetap **historis**; angka di paragraf ini adalah run fresh 2026-10-02. Detail: `/tmp/sidak-heatmap-release/final-report.md`.
- **Catatan status:** baris "Status" di atas mempertahankan angka E2E 2026-10-01 sebagai **historis**; baris "Status rilis" memuat bukti **fresh** 2026-10-02. Keduanya tidak dibandingkan sebagai regresi.
- **Tanggal rencana:** 2026-10-01. **Baseline saat perencanaan:** `a112fcd` (HEAD saat persiapan rilis: `e308408`).
- **Executor:** GPT 6 Luna atau model kecil lain; satu fase per sesi.
- **Risk lane implementasi:** Lane D, karena menyentuh schema dan kontrak API.
- **Dokumen ini:** rencana, bukan bukti implementasi atau hasil pengujian.

## Requirement

### Keputusan yang sudah dikonfirmasi pengguna

| Aspek | Ketentuan |
| --- | --- |
| Halaman baru | `/sidak/heatmap` |
| Mode Agent | Jumlah temuan berdasarkan **tanggal layanan**, kapan interaksi bermasalah terjadi |
| Mode QA | Jumlah temuan berdasarkan **tanggal sampel**, kapan QA memeriksa/menetapkan temuan |
| Satuan hitungan | Satu tiket dengan tiga parameter ketidaksesuaian = **tiga temuan** |
| Tanggal | Keduanya opsional dan boleh diisi secara independen |
| Permukaan input | Manual, template/import batch, dan edit temuan |
| Akses heatmap | **Admin dan trainer** |
| Data lama | Tetap `null`; jangan menggunakan `created_at` atau tanggal perkiraan |
| Scoring | Jangan mengubah skor, ranking, periode audit, atau phantom padding |

Nama mode QA tidak otomatis memberikan akses kepada role `qa`. Heatmap bukan pengukuran produktivitas QA dan bukan tingkat kesalahan: tidak tersedia denominator jumlah seluruh layanan/audit.

### Batas MVP yang diusulkan

- Kalender heatmap tahunan dengan filter tahun dan layanan.
- Tidak mencakup ranking QA, filter evaluator, korelasi shifting, ekspor heatmap, atau analisis AI.
- Tidak menambah fitur bulk update/upsert melalui import.
- Tidak mengubah format CSV/Markdown ekspor agent yang sudah terkunci.
- Edit mengikuti endpoint existing per baris temuan; tidak otomatis mengubah tanggal seluruh parameter pada tiket yang sama.

## Design

### Kondisi kode saat perencanaan

- `packages/types/src/sidak.ts`: `qaTemuanSchema` dan `createTemuanBatchSchema` belum memiliki tanggal layanan/sampel.
- `supabase/migrations/001_sidak_core.sql`: `qa_temuan` menyimpan baris per parameter; memiliki `created_at`/`updated_at`, tetapi belum memiliki kedua tanggal bisnis.
- `apps/api/src/routes/sidak/temuan.ts`: create/preview/update/delete dibatasi admin/trainer; update menerima nilai dan catatan.
- `apps/api/src/services/sidak/temuan-service.ts`: `validateTemuanBatch()`, `createTemuanBatch()`, dan `updateTemuan()` memakai jalur existing SIDAK. Mapping insert perlu diperluas agar tanggal tidak dibuang.
- `apps/web/src/routes/sidak/hooks/useTemuanForm.ts`: satu nomor tiket untuk beberapa parameter manual.
- `apps/web/src/routes/sidak/hooks/useTemuanImport.ts`: template lima kolom dan parsing berdasarkan posisi; perlu kompatibilitas template lama.
- `apps/web/src/lib/excel-utils.ts`: jalur pembacaan ExcelJS bersama, termasuk konversi sel `Date` ke teks. Jangan mengubah semua pemakai secara global tanpa bukti.
- `apps/web/src/routes/sidak/hooks/useTemuanEdit.ts` dan `apps/web/src/components/sidak/TemuanGroupCard.tsx`: edit inline halaman Input Audit.
- `apps/web/src/hooks/useAgentDetail.ts` dan `apps/web/src/components/sidak/EditTemuanModal.tsx`: edit detail agent; mapping `TemuanDisplayItem` belum membawa tanggal.
- `apps/api/src/lib/supabase.ts`: menyediakan `createUserClient(token)` untuk query dengan JWT/RLS.
- `apps/api/src/lib/supabase-pagination.ts`: menyediakan `fetchAllPages()` agar agregasi tidak terpotong pada 1.000 baris.
- `apps/api/src/services/sidak/shared-constants.ts`: `isCountableFinding()` menentukan temuan countable berdasarkan nilai atau catatan bermakna. Phantom harus dikeluarkan secara terpisah.
- `apps/web/src/router.tsx`: routing manual TanStack Router dengan lazy import dan role guard.
- `apps/web/src/components/layout/nav-config.ts`: menu SIDAK dan breadcrumb.

### Penyimpanan dan kontrak tanggal

```text
public.qa_temuan
  tanggal_layanan DATE NULL
  tanggal_sampel  DATE NULL
```

- API menggunakan `YYYY-MM-DD`, divalidasi sebagai tanggal kalender sungguhan.
- Tidak ada default hari ini dan tidak ada backfill.
- Update tanpa field tanggal mempertahankan nilai existing.
- Update dengan `null` menghapus tanggal.
- UI menormalkan string kosong menjadi `null` sebelum mengirim.
- Jangan menambahkan constraint tanggal harus berada dalam periode audit, atau sampel harus setelah layanan, tanpa persetujuan tambahan.
- Manual mengisi tanggal sekali di tingkat tiket, lalu menyalinnya ke setiap item parameter yang dikirim.
- Batch membawa tanggal per baris parameter; tidak melakukan deduplikasi berdasarkan tanggal.

### Kontrak API heatmap yang diusulkan

```text
GET /api/v1/sidak/heatmap?mode=agent|qa&year=2026&service_type=call
```

`service_type` opsional; jika tidak dikirim berarti semua layanan. Gunakan envelope `{ success, data }` existing dan shared type berikut:

```ts
interface SidakHeatmapResponse {
  mode: "agent" | "qa";
  year: number;
  serviceType: ServiceType | null;
  dateBasis: "tanggal_layanan" | "tanggal_sampel";
  days: Array<{ date: string; count: number }>;
  totalFindings: number;
  missingDateFindingsAllPeriods: number;
}
```

- Kolom tanggal dipilih melalui allowlist mode, bukan input nama kolom bebas.
- Filter tahun memakai tanggal mode terpilih, bukan `tahun`, `created_at`, atau periode audit.
- Setiap baris countable non-phantom dihitung satu; jangan deduplikasi nomor tiket.
- `days` mencakup semua tanggal tahun terpilih, termasuk nol dan leap day.
- `totalFindings` adalah jumlah count pada kalender tahun terpilih.
- `missingDateFindingsAllPeriods` menghitung temuan tanpa tanggal mode terpilih pada seluruh periode untuk filter layanan tersebut. UI wajib menampilkan scope ini; tanggal kosong tidak bisa diatribusikan ke tahun tertentu.
- Query baru menggunakan user JWT/RLS. Jangan menambah service-role bypass.
- Paging deterministik sampai habis; kegagalan halaman/query apa pun menggagalkan respons, bukan menghasilkan data parsial atau nol palsu.

### UI

```text
Heatmap Ketidaksesuaian
[Agent — Tanggal layanan] [QA — Tanggal sampel]
[Tahun] [Layanan]
Ringkasan jumlah temuan dan kelengkapan tanggal
Legenda intensitas
Kalender Januari–Desember
Ringkasan tanggal terpilih
```

- Kalender bulanan tujuh kolom, disusun responsif untuk satu tahun.
- React/CSS dan komponen existing; tidak perlu dependency heatmap baru.
- Legenda konsisten: 0, 1–2, 3–5, 6–10, 11+.
- Tanggal/count terbaca lewat hover, focus, dan tap; jangan hanya mengandalkan warna.
- Gunakan token existing, light/dark, focus terlihat, kontras AA, dan target sentuh nyaman.
- Loading, error/retry, tanpa temuan, dan tanggal belum diisi harus dibedakan.
- Respons request lama tidak boleh mengganti filter aktif.
- Typed `sidakClient`/Hono RPC; tidak ada query data sensitif langsung dari frontend.

## Tasklist

### Fase 0 — Persiapan dan pengamanan

**Dependensi:** tidak ada.

1. Baca `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, `docs/design.md`, dan dokumen ini.
2. Drift-check baseline dan jalur dalam scope. Ambil `git status --short` sebelum mengedit; preservasi seluruh dirty work.
3. Saat rencana dibuat, ditemukan pekerjaan unrelated pada test simulation-subject, route/tab detail SIDAK, dan migration PDKT. Status dapat berubah: Git live adalah sumber kebenaran. Jangan overwrite pekerjaan itu.
4. Muat `trainers-superapp-tdd` jika tersedia sebelum behavior edit. Ikuti gate Lane D dan skill review/UI sesuai workflow; laporkan capability yang tidak tersedia, jangan mengarang tool/skill. Superpowers dilarang.
5. Siapkan frontend/API serta database lokal atau test-only disposable untuk E2E persistence/RLS.
6. Referensi isolasi: `apps/web/e2e/helpers/sidakAgentReportFixture.ts` dan `apps/web/e2e/sidak-jadwal-shifting-api.spec.ts`.
7. Periksa environment sebelum menjalankan Playwright: config existing memulai root `pnpm dev`; localhost frontend tidak membuktikan database juga lokal.

**Done:** baseline dirty tercatat dan semua target pengujian terbukti aman. Mock UI tidak boleh diklaim sebagai bukti persistence/RLS.

**STOP:** target production, safe E2E tidak tersedia, atau perlu menimpa dirty work.

### Fase 1 — Schema tanggal dan shared contract

**Dependensi:** Fase 0.

**Scope:** migration baru `supabase/migrations/`, `packages/types/src/sidak.ts`, dan E2E baru `apps/web/e2e/sidak-temuan-dates-api.spec.ts`.

1. Siapkan E2E RED untuk kontrak tanggal sebelum implementasi; konfirmasi failure relevan, bukan kegagalan koneksi.
2. Tambahkan dua kolom `DATE NULL` pada migration baru. Jangan edit migration lama, backfill, atau mengubah constraint duplikat/RLS.
3. Tambahkan schema tanggal bersama pada `qaTemuanSchema`, item `createTemuanBatchSchema`, dan schema update bersama.
4. Validasi tanggal nyata: `2026-02-28` valid; `2026-02-30` ditolak; leap day mengikuti tahun.
5. Pertahankan kompatibilitas payload/record lama tanpa tanggal.
6. Uji migration hanya pada database disposable; jangan menjalankan migration remote.

**Gate:** `pnpm --filter @trainers/types typecheck` dan `git diff --check` exit 0.

**Done:** kolom nullable dan schema tersedia; belum mengklaim E2E CRUD GREEN sebelum Fase 2.

### Fase 2 — CRUD dan preview backend

**Dependensi:** Fase 1.

**Scope:** `apps/api/src/routes/sidak/temuan.ts`, `apps/api/src/services/sidak/temuan-service.ts`, dan `apps/web/e2e/sidak-temuan-dates-api.spec.ts`.

1. Perluas tipe `validateTemuanBatch()`, `PreviewResult`, `createTemuanBatch()`, dan `updateTemuan()`.
2. Pertahankan tanggal pada request → validasi → preview → insert → GET.
3. Tambahkan tanggal pada mapping insert; gunakan schema update bersama pada `PUT /temuan/:id`.
4. Pertahankan admin/trainer pada CRUD dan perilaku duplicate/skip existing.
5. Jangan menambah admin bypass baru atau merombak authorization seluruh SIDAK.
6. Error tanggal/persistence harus manusiawi; jangan expose raw database error untuk jalur yang diubah.

**E2E:** create dua tanggal, tanpa tanggal, masing-masing tanggal sendiri, preview preservation, read setelah create, update, omitted field preservation, clear `null`, tanggal invalid sebelum insert, delete, serta duplicate existing. Gunakan route nyata dan database disposable untuk persistence.

**Gate:**

```bash
pnpm --filter @trainers/web test:e2e -- sidak-temuan-dates-api.spec.ts
pnpm --filter @trainers/api typecheck
```

**Done:** E2E GREEN dan tanggal benar-benar tersimpan/terbaca, bukan hanya payload mock. Review kontrak backend sebelum melanjutkan.

### Fase 3 — Manual, pembacaan, dan edit kedua permukaan

**Dependensi:** Fase 2.

**Scope:**

- `apps/web/src/routes/sidak/input.tsx`
- `apps/web/src/routes/sidak/hooks/useTemuanForm.ts`
- `apps/web/src/routes/sidak/hooks/useTemuanEdit.ts`
- `apps/web/src/components/sidak/SidakInputManualForm.tsx`
- `apps/web/src/components/sidak/TemuanGroupCard.tsx`
- `apps/web/src/hooks/useAgentDetail.ts`
- `apps/web/src/components/sidak/EditTemuanModal.tsx`
- Baru: `apps/web/e2e/sidak-temuan-dates.spec.ts`

1. E2E RED dahulu: kedua field opsional terlihat pada manual dan edit.
2. Tambahkan input berlabel `Tanggal layanan — opsional` dan `Tanggal sampel — opsional` dekat nomor tiket; beri penjelasan makna tanggal.
3. Manual mengisi sekali lalu mengirim nilai ke semua item parameter.
4. Reset tanggal saat cancel/sukses atau pergantian konteks tiket/agent/layanan. Jangan kehilangan draft saat save gagal.
5. Tambahkan tanggal pada edit inline Input Audit dan modal detail agent.
6. Perluas `TemuanDisplayItem`, `EditFormState`, serta mapping/load/save di `useAgentDetail.ts` agar tanggal tidak hilang.
7. Tampilkan tanggal pada detail temuan; kosong = `Belum diisi`.
8. Edit hanya baris terpilih. Jangan mengubah schema ekspor CSV/Markdown existing.
9. Jika proyeksi backend detail agent ternyata membuang tanggal, STOP dan laporkan exact file; jangan merombak endpoint tanpa memperbarui scope.

**E2E:** save tanpa tanggal, tiga parameter dengan tanggal sama, read/reload, edit/clear kedua permukaan, reset konteks, error mempertahankan draft.

**Gate:** `pnpm --filter @trainers/web test:e2e -- sidak-temuan-dates.spec.ts` dan `pnpm --filter @trainers/web typecheck` exit 0.

### Fase 4 — Excel, preview, dan batch import

**Dependensi:** Fase 2; wiring halaman mengikuti Fase 3.

**Scope:** `apps/web/src/routes/sidak/hooks/useTemuanImport.ts`, `apps/web/src/components/sidak/SidakInputImportPanel.tsx`, `apps/web/src/lib/excel-utils.ts`, dan E2E baru `apps/web/e2e/sidak-temuan-import-dates.spec.ts`.

1. E2E RED dahulu untuk download/upload template tanggal.
2. Tambahkan di belakang lima kolom lama: `Tanggal Layanan (YYYY-MM-DD)` dan `Tanggal Sampel (YYYY-MM-DD)`; sel default kosong dan petunjuk menyatakan opsional.
3. Perluas `ParsedImportRow`. Baca kolom tanggal berdasarkan header; header yang tidak ada = `null`.
4. Template lima kolom lama tetap diterima; tanggal tampil di preview dan dikirim identik ke preview/save backend.
5. Gunakan ExcelJS existing. Dukung teks ISO dan sel Excel berformat tanggal dengan konversi date-only tanpa timezone shift.
6. Tolak teks ambigu seperti `03/04/2026` dan serial angka tanpa format tanggal. Jangan menebak nilainya.
7. Jangan mengubah semua pembacaan `Date` global tanpa regression evidence untuk caller lain.
8. Tanggal invalid menghasilkan error baris/kolom dan memblokir import; jangan dikosongkan diam-diam.
9. Pertahankan duplicate/skip existing. Import bukan upsert untuk tanggal record lama.

**E2E:** template tujuh kolom, template lama, kedua/salah satu/tanpa tanggal, beda tanggal per baris, real Excel date tidak bergeser, invalid date, preview/persistence parity, dan duplicate behavior.

**Gate:** `pnpm --filter @trainers/web test:e2e -- sidak-temuan-import-dates.spec.ts` dan `pnpm --filter @trainers/web typecheck` exit 0.

### Fase 5 — API agregasi heatmap

**Dependensi:** Fase 2.

**Scope:** baru `apps/api/src/routes/sidak/heatmap.ts`, baru `apps/api/src/services/sidak/heatmap-service.ts`, `apps/api/src/routes/sidak.ts`, `packages/types/src/sidak.ts`, dan E2E agregasi heatmap (bagian E di `apps/web/e2e/sidak-temuan-dates-api.spec.ts`; tidak ada spec `sidak-heatmap-api.spec.ts` terpisah).

1. E2E RED dahulu untuk kontrak API yang dijelaskan pada Design.
2. Tambahkan shared request/response types; validasi enum mode, tahun, dan service type.
3. Role guard admin/trainer; query menggunakan `createUserClient(token)` untuk RLS. Jangan fallback ke admin saat query gagal.
4. Allowlist mode ke kolom tanggal dan filter rentang tahun pada kolom itu.
5. Hitung `isCountableFinding()` per row, keluarkan phantom, tanpa deduplikasi tiket.
6. `fetchAllPages()` dengan order deterministik; ambil kolom yang diperlukan saja.
7. Buat semua tanggal tahun terpilih, total kalender, dan count tanpa tanggal dengan scope all-periods yang eksplisit.
8. Kegagalan query/page menghasilkan error aman, bukan nol/partial success.
9. Tidak menambah cache, materialized view, AI, atau dependency baru pada MVP.

**E2E:** satu tiket tiga parameter = 3; mode memakai tanggal berbeda; phantom/clean dikeluarkan; tanggal kosong; lintas periode/tahun; leap day; lebih dari 1.000 baris; role denied; JWT/RLS pada DB disposable; gagal page/query tidak menjadi sukses kosong.

**Gate:**

```bash
pnpm --filter @trainers/web test:e2e -- sidak-temuan-dates-api.spec.ts
pnpm --filter @trainers/api typecheck
pnpm --filter @trainers/types typecheck
```

**Done:** semua gate exit 0 dan review hitungan/akses selesai sebelum UI.

### Fase 6 — Halaman dan navigasi heatmap

**Dependensi:** Fase 5.

**Scope:** baru `apps/web/src/routes/sidak/heatmap.tsx`, baru `apps/web/src/components/sidak/SidakHeatmapCalendar.tsx`, `apps/web/src/router.tsx`, `apps/web/src/components/layout/nav-config.ts`, `apps/web/src/routes/sidak/index.tsx`, dan baru `apps/web/e2e/sidak-heatmap.spec.ts`.

1. E2E RED untuk navigasi, mode/filter, dan state.
2. Implementasikan layout Design menggunakan typed `sidakClient`, kalender React/CSS, dan komponen existing.
3. Tambahkan lazy route, menu, breadcrumb, dan kartu SIDAK; seluruh permukaan admin/trainer saja.
4. Gunakan legenda tetap dan informasi tanggal/count melalui hover, keyboard, serta tap.
5. Bedakan loading, error/retry, empty tahun terpilih, dan metadata tanggal belum diisi all-periods.
6. Cegah response stale menimpa mode/tahun/layanan aktif.
7. Sesuaikan token light/dark, responsive layout, focus, kontras, dan ruang aman mobile.
8. Copy menjelaskan volume temuan, bukan defect rate atau produktivitas QA.

**E2E:** menu/direct URL, admin/trainer allowed, leader/agent denied, request filter tepat, tanggal/count sesuai API, keyboard/mobile, error/empty/loading, dan stale response.

**Gate:** `pnpm --filter @trainers/web test:e2e -- sidak-heatmap.spec.ts` dan `pnpm --filter @trainers/web typecheck` exit 0.

### Fase 7 — Integrasi, regresi, dan dokumentasi

**Dependensi:** seluruh fase sebelumnya.

**Scope:** baru `apps/web/e2e/sidak-heatmap-integration.spec.ts`, fixture feature-local bila diperlukan, `docs/database.md`, `docs/modules.md`, `docs/auth-rbac.md`, dan perbaikan scoped pada file feature fase sebelumnya.

1. Buktikan alur lengkap dengan backend dan DB disposable: manual/batch → persist → kedua heatmap → edit tanggal memindahkan count → delete mengurangi count.
2. Pastikan skor/ranking dan ekspor existing tidak berubah akibat tanggal tambahan. Run focused regression existing yang relevan, bukan legacy unit suite.
3. Dokumentasikan schema, arti tanggal, formula hitungan, scope missing-date, role, kompatibilitas template, dan tidak adanya backfill.
4. Jalankan specialist review schema/API/akses dan audit/polish UI menurut workflow. Jangan mengklaim skill/tool yang tidak tersedia telah dijalankan.
5. Rekam exact commands, exit codes, hasil RED/GREEN, trace/screenshot, serta artifact path yang repeatable.
6. Jangan commit, push, deploy, atau menjalankan migration remote tanpa izin eksplisit.

**Gate akhir:**

```bash
# Fitur (dipecah agar stabil); 83 hijau
pnpm --filter @trainers/web test:e2e -- sidak-temuan-dates-api.spec.ts sidak-heatmap-integration.spec.ts sidak-heatmap-browser-integration.spec.ts sidak-agent-report-date-invariance.spec.ts
pnpm --filter @trainers/web test:e2e -- sidak-temuan-dates.spec.ts sidak-temuan-import-dates.spec.ts sidak-heatmap.spec.ts
# Regresi ekspor terkait; 31 hijau
pnpm --filter @trainers/web test:e2e -- sidak-agent-report-download.spec.ts sidak-agent-html-export-parity.spec.ts
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

**Done:** seluruh command exit 0, artifacts tersedia, scope bersih dari unrelated edits, serta documentation sesuai behavior nyata. Unit/non-E2E test memerlukan persetujuan Fajar; jangan menjalankan `test:core`, `test:fast`, atau `test:full` sebagai pengganti E2E.

## Status Fase

### Catatan Fase 0 (2026-10-01)

Baseline saat eksekusi: HEAD `e308408` (bukan `a112fcd`). Commit `e308408` hanya menyentuh `SidakAgentDetailTabs.tsx`, `agents.$id.tsx`, dan `docs/design.md`, sehingga asumsi Fase 3 tetap berlaku. Dirty work Fajar (`simulation-subject-rpc.integration.test.ts`, migration PDKT `20260930120000`) dipertahankan utuh; `git status` sebelum dan sesudah Fase 0 identik.

**Temuan blocker:** `supabase db reset` tidak pernah bisa selesai dari kondisi bersih. Migration `20260716160000_add_slik_qa_subparameters.sql` menurunkan draft template dari rule SLIK `status='published'` yang sudah ada, tetapi tidak ada migration maupun seed yang pernah membuat rule itu (`001_sidak_core.sql` hanya `CREATE TABLE`; tidak ada seed yang menyentuh `qa_service_rule_versions`). Baseline tersebut hanya hidup di project remote.

**Solusi (disetujui pengguna, opsi A):** fixture lokal sintetis di `scratch/sidak-local-db/` (git-ignored, tidak mungkin ter-commit). Script menolak jalan bila host bukan loopback atau bila CLI Supabase masih terhubung ke project remote. CLI di-`supabase unlink` sehingga `supabase db push` tidak mungkin berjalan tanpa `supabase link` eksplisit. Restore: `supabase link --project-ref <ref>`.

Stack lokal: 69 migration diterapkan, PostgREST/auth 200, JWT + RLS terbukti (authenticated 200, anon 401).

### Catatan Fase 1 (2026-10-01)

Migrasi `20261001120000_add_temuan_business_dates.sql` menambah dua kolom `DATE NULL` tanpa backfill, tanpa default, tanpa mengubah constraint/RLS. Shared contract: `tanggalSchema`, `temuanTanggalSchema`, dan `updateTemuanSchema` di `packages/types/src/sidak.ts`. `z.string().date()` dipakai karena ia memvalidasi kalender sungguhan (leap day per tahun, format ambigu ditolak).

E2E `sidak-temuan-dates-api.spec.ts`: 15 hijau, 1 `fixme`. RED terbukti 12 kegagalan bermakna (field tanggal ter-strip, tanggal palsu diterima, kolom belum ada) — bukan kegagalan koneksi.

Dua hal yang perlu diketahui:

1. **Satu test di-`fixme`, bukan hijau.** `PUT /temuan/:id` masih memakai schema inline, jadi `tanggal_layanan` di-strip dan request bogus lolos. Menyambungkannya ke `updateTemuanSchema` adalah **Fase 2 langkah 3**, jadi test itu sengaja belum dijalankan sebagai bukti.
2. **Tidak men-pin `process.env` di level modul.** `apps/api/src/lib/env.ts` membaca `.env.local` (project remote) dan `supabaseAdmin` dibangun saat import. Playwright mengevaluasi ulang file spec di proses worker berbeda yang mewarisi env, sehingga pin level modul bocor ke file lain dan tidak bisa dipulihkan. Env kini di-pin hanya selama `await import(...)` lalu langsung dikembalikan; `fetch` dibungkus fail-closed dan dibuktikan bisa menggagalkan test ("Instrumentasi guard").

**Footgun repo (bukan dari pekerjaan ini):** `apps/web/test-results/` berisi file yang ikut ter-*commit* di `510187b`, dan TIDAK tercakup `/test-results/` yang di-`.gitignore` (pola itu ter-anchor ke root). Setiap `test:e2e` menghapusnya. Sudah dipulihkan lewat `git checkout -- apps/web/test-results/` setelah tiap run; perlu perbaikan terpisah.

### Catatan Fase 2 (2026-10-01)

Tanggal kini terbawa sampai DB: mapping insert di `createTemuanBatch` menambahkan kedua kolom dengan `?? null` (tanpa default `CURRENT_DATE`), `PUT /temuan/:id` memakai `updateTemuanSchema` bersama, dan `updateTemuan` membuang key bernilai `undefined` agar "tidak dikirim" benar-benar berarti mempertahankan nilai existing sementara `null` eksplisit berarti menghapus.

Bentuk item tidak dideklarasikan ulang di service: `PreviewResult.valid/skipped` dan signature `validateTemuanBatch`/`createTemuanBatch` memakai `CreateTemuanBatch` dari `@trainers/types`, sehingga tanggal tidak bisa hilang di satu lapisan saja.

E2E: 28 hijau, 0 gagal.RED terbukti 7 gagal yang semuanya menyoroti pemetaan tanggal yang belum ada — `baris bertanggal tidak ditemukan di DB`, dan `Expected VALIDATION_ERROR, Received UPDATE_ERROR` untuk PUT. Persistence dibaca ULANG dengan `psql` langsung ke DB disposable, bukan dari respons route, jadi mapping insert yang lupa tanggal tidak bisa menutupi dirinya sendiri. Regresi bersama `sidak-jadwal-shifting-api.spec.ts` dan `sidak-agent-html-export-parity.spec.ts`: 85 hijau, 0 gagal.

Catatan:

1. **Tidak ada cabang error tanggal di service.** Percobaan pertama menambahkan `error.message.includes("date")` untuk "pesan manusiawi", lalu dihapus saat review: format tanggal sudah divalidasi Zod sebelum service dipanggil, jadi cabang itu tidak terjangkau dan bisa menutupi pesan lain. Persyaratan "error manusiawi" dijawab di route lewat `parsed.error.issues[0].message`, dan itu diuji (pesan menyebut `YYYY-MM-DD`, tidak memuat `SQLSTATE`/`postgres`).
2. **Two fixture-bugs ditemukan oleh test, bukan diasumsikan.** `psql -t` ternyata tetap mencetak command tag `INSERT 0 1`, sehingga `INSERT ... RETURNING` mengembalikan dua baris dan UUID ikut tercemar — sekarang pakai `-q` plus `sqlOne`/`sqlUuid` yang gagal keras kalau barinya bukan satu.
3. **Noise yang sudah ada sebelumnya, bukan dari perubahan ini:** `refreshDashboardSummary` yang dipanggil fire-and-forget sesekali menulis "Summary refresh failed" (FK / duplicate key pada cache summary). Dipanggil dengan `.catch()` jadi tidak menggagalkan test; di luar scope Fase 2.

### Catatan Fase 3 (2026-10-01)

Permukaan Input Audit selesai: tanggal diisi sekali di level tiket lalu dikirim ke semua item parameter, reset pada cancel/sukses/pergantian konteks, dan draft TIDAK hilang saat save gagal. Edit inline membawa both tanggal per baris (bukan per tiket), dan tanggal selalu ditampilkan — kosong berarti `Belum diisi`.

**Pemeriksaan langkah 9 (proyeksi backend): TIDAK perlu STOP.** `apps/api/src/services/sidak/agent-directory.ts:345` memakai `.select("*")` untuk detail agent, jadi `tanggal_layanan`/`tanggal_sampel` ikut terbawa. Query terpisah di baris ~171 adalah daftar direktori, bukan sumber `EditTemuanModal`.

E2E `sidak-temuan-dates.spec.ts`: **15 hijau** (11 manual + edit inline, 4 modal detail agent). Regresi empat spec: 101 hijau, 0 gagal.

**Gap E2E modal detail agent: SUDAH DITUTUP (lanjutan 2026-10-01).** Spec diagnos yang dipakai untuk mencari penyebab dihapus setelah dipakai.

Penyebabnya BUKAN infinite render seperti dugaan awal, melainkan tiga hal:

1. **Bug nyata yang tertangkap.** Input `type="date"` mengembalikan `""` saat dikosongkan, dan `handleEditSave` mengirim `editForm` apa adanya — backend menerima `""` (bukan tanggal, bukan `null`) dan akan menolak dengan 400. `useAgentDetail` kini menormalkan `""` ke `null`, sama seperti `useTemuanEdit`. Bug kelas ini tidak akan terlihat tanpa E2E.
2. Halaman crash total karena dua endpoint tidak ter-mock: `GET /sidak/folders/{folder}/agents` dan `GET /sidak/agents/{id}/quickview`. Yang kedua bikin layar kosong dengan `Cannot read properties of undefined (reading 'agentId')` karena bentuk mock quickview tidak sama dengan `SidakAgentQuickviewResponse` (butuh `context: { agentId, year, serviceType, periodMode }`).
3. Tombol edit punya accessible name `Edit temuan <nama>`, bukan `Edit`.

**Bocor prod yang ditemukan sambil itu dan sudah ditutup:** guard kedua harness sebelumnya memanggil `route.fallback()` untuk SEMUA path `/api` di dev-server, sehingga endpoint yang tidak di-mock diteruskan ke API sungguhan yang menunjuk ke project remote. Kedua harness kini punya allowlist regex `MOCKED_API`; path `/api` yang tidak cocok di-abort dan dicatat di `blockedApi`. Manfaatnya: spec sekarang mendeteksi sendiri endpoint yang lupa di-mock, alih-alih diam-diam menembak produksi.

Empat driver/spec bug saya sendiri yang ditemukan lewat test (bukan diasumsikan):

1. Playwright mencocokkan route **dalam urutan terbalik** dari pendaftaran, sehingga `/temuan/*` menelan POST `/temuan/batch` dan membalas 404. Diperbaiki dengan `route.fallback()` pada pola yang memang bukan miliknya.
2. Harness menyimpan baris dengan id hasil generate sebagai KEY tapi mengisi `id: ""` di dalamnya, sehingga PUTedit menuju id yang salah dan selalu 400.
3. Dropdown parameter berubah TEKS setelah dipilih, sehingga penghitung berbasis teks membuat indeks bergeser. Diganti selector atribut stabil `button[aria-haspopup="listbox"]`.
4. Tombol buka form punya dua label berbeda menurut state (`Tambah Temuan` saat panel kosong, `Tambah` di header setelah ada temuan), dan form ditutup setelah sukses sehingga field tidak ada untuk diperiksa.

Skema ekspor CSV/Markdown existing tidak disentuh. `docs/design.md` tidak diubah pada fase ini.

### Catatan Fase 5 (2026-10-01)

Tiga test yang sempat gagal ternyata SATU akar masalah: `trainerToken` dideklarasikan di dalam `describe` tetapi dibaca `mountHeatmapRouter()` yang berada di scope modul. Hasilnya `ReferenceError` di dalam middleware, yang Hono ubah jadi **500** — sehingga role guard terlihat tidak bekerja padahal bekerja. Token kini jadi parameter eksplisit.

Test "query gagal jadi error" diubah memakai injeksi kegagalan deterministik di lapisan client. Versi sebelumnya mengandalkan jaringan mati, yang memicu retry supabase-js sehingga assertion tidak stabil dan tidak membuktikan apa pun.

### Catatan Fase 6 (2026-10-01)

Halaman `/sidak/heatmap` memakai `SidakHeatmapCalendar` (grid CSS tanpa dependency heatmap baru). Akses dibatasi admin+trainer di tiga lapis: nav-config, `beforeLoad: requireRole`, dan `requireRole` backend.

Setiap hari adalah `<button>` dengan `aria-label` berisi tanggal + jumlah temuan, jadi informasinya terbaca lewat hover, fokus keyboard, dan tap. Warna hanya penguat — tanggal kosong dan intensitas nol tetap punya teks.

E2E `sidak-heatmap.spec.ts`: 9 hijau. Regresi empat spec: 66 hijau, 1 flake.

**Dua bug di spec saya sendiri yangereksekuensi jauh dari penyebabnya:**
1. `expect()` di dalam route handler `buildYear` — kalau gagal, route tidak pernah di-`fulfill` sehingga halaman hang di status loading selamanya.
2. Halaman membungkus respons dua kali. `useApi` sudah.unwrap envelope `{ success, data }`, sehingga `data.success` selalu `undefined` dan `heatmap` selalu null.

Audit desain: tidak ada hex hardcode, container `max-w-[1400px]`, body `max-w-[75ch]`, radius `rounded-xl` (12px), tidak ada radius ≥32px, tidak ada gradient/shadow/badge dekoratif, `pb-28` untuk ruang aman mobile nav.

**Catatan lingkungan:** DB lokal sempat mati (Docker daemon berhenti) sehingga 5 test gagal dengan `Connection refused`. Setelah OrbStack + Supabase lokal dinyalakan dan fixture dijalankan ulang, semuanya hijau. Kegagalan ini lingkungan, bukan regresi.

### Catatan Fase 7 (2026-10-01)

`apps/web/e2e/sidak-heatmap-integration.spec.ts` (3 hijau) adalah satu-satunya spec yang memakai backend NYATA + DB lokal dari awal sampai akhir: batch → persist → dua mode heatmap → edit tanggal MEMINDAHKAN hitungan → delete MENGURANGI hitungan. Kredensial dibaca dari `.env.integration` dengan guard loopback.

Gate akhir: `pnpm typecheck` exit 0 · `pnpm lint` exit 0 (0 errors) · `pnpm build` exit 0 · `git diff --check` exit 0 · lima spec E2E 70 hijau.

Tiga warning lint yang berasal dari file feature sudah diperbaiki (binding `e` tak terpakai di route heatmap, ekspor non-komponen di kalender, import `useRef` tak terpakai). Sisa 120 warning seluruhnya bawaan repo di luar scope.

Dokumentasi kanonik diperbarui: `docs/database.md` (arti + aturan kolom tanggal), `docs/modules.md` (rute heatmap), `docs/auth-rbac.md` (akses tiga lapis + catatan bahwa mode `qa` bukan role).

**Belum dikerjakan sesuai instruksi:** tidak ada commit, push, deploy, atau migration remote.

### Celah tooling e2e typecheck — SUDAH DITUTUP

`apps/web/tsconfig.json` memakai `include: ["src"]`, jadi folder `e2e/` tidak pernah ikut typecheck. ReferenceError di atas lolos dari gate justru karena itu.

Perbaikan: `apps/web/tsconfig.e2e.json` (extends tsconfig utama, `esModuleInterop: true` karena spec memakai default import seperti `exceljs`, `types: ["node"]`) + `@types/node` sebagai devDependency apps/web + script `typecheck` jadi `tsc --noEmit && tsc -p tsconfig.e2e.json`.

Gate ini langsung menangkap **13 error** saat pertama dinyalakan, termasuk satu bug nyata di harness saya sendiri: `route.fulfill(toJson(...), 201)` — Playwright hanya menerima SATU argumen, jadi status `201` diam-diam dibuang. Selain itu 4 error bawaan di spec jadwal-shifting dan agent-report (argumen `expect.poll` ke-3, fixture readonly, early-return yang lupa field `runs`) semuanya diperbaiki.

**Bukti gate bekerja:** ReferenceError yang lolos sebelumnya diinjeksi ulang dan langsung tertangkap `error TS2304: Cannot find name 'trainerToken'` di spec yang sama.

**Flaky di bawah beban:** dua test (modal detail agent dan unduh template) gagal saat dijalankan bersama 4 spec lain, tapi hijau saat dijalankan sendiri, dan test yang gagal BERBEDA tiap run. Penyebabnya Vite dev server melambat setelah run panjang, bukan cacat produk. Kedua test memakai `test.slow()` — budget dinaikkan, assertion tidak dilonggarkan.

E2E `sidak-temuan-dates-api.spec.ts`: 36 hijau. Lima spec`: 116 hijau, 0 gagal.

| Fase | Hasil | Dependensi | Status |
| --- | --- | --- | --- |
| 0 | Lingkungan aman dan baseline | — | DONE (2026-10-01) |
| 1 | Schema nullable dan shared contract | 0 | DONE (2026-10-01) |
| 2 | Persistence CRUD/preview tanggal | 1 | DONE (2026-10-01) |
| 3 | Manual/read/edit kedua permukaan | 2 | DONE (2026-10-01) |
| 4 | Template dan import batch kompatibel | 2, integrasi 3 | DONE (2026-10-01) |
| 5 | API heatmap terhitung benar | 2 | DONE (2026-10-01) |
| 6 | Halaman dan navigasi heatmap | 5 | DONE (2026-10-01) |
| 7 | Integrasi/regresi/dokumentasi | 0–6 | DONE (2026-10-01) |

Urutan rekomendasi untuk model kecil: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7**. Tidak perlu paralelisasi. Review manusia/model lebih kuat paling penting setelah Fase 2 dan 5.

### Catatan Repair (sesi lanjutan, 2026-10-01)

Dua temuan review diperbaiki dengan E2E RED-first di worktree terisolasi
(`/tmp/sidak-heatmap-repair-worktree`), lalu diverifikasi ulang:

- **P1** `countMissingDates` tidak lagi memakai `count: "exact"` mentah. Ia
  memakai `fetchAllPages` + predikat `isCountable` yang sama dengan kalender,
  sehingga baris `nilai=3` tanpa catatan (complies) dan baris phantom tidak ikut
  terhitung, dan hitungan tidak terpotong di plafon 1.000 baris.
- **P2** Petunjuk template dipindah ke sheet terpisah `"Petunjuk"`; sheet
  `"Input Temuan"` tetap tepat 7 kolom dan bebas baris non-data, sehingga
  template hasil unduhan bisa diunggah kembali.
- **P4/P3** `sidak-heatmap-integration.spec.ts` kini membuat/mengubah/menghapus
  lewat router Hono ASLI, membaca heatmap dengan JWT user (RLS), dan membuktikan
  skor/ranking tidak berubah lewat output backend nyata (`getAgentDetail`).
- **P5/P7/P8** Paging >1.000 baris (tanggal-null DAN kalender) + kegagalan
  halaman lanjutan, kartu landing heatmap `managerOnly`, akses
  admin/trainer/leader/agent, stale-response, dan query heatmap bertipe
  `sidakClient` ditambahkan/beserta E2E-nya.

Lanjutan gap (sesi final, 2026-10-01), dengan ownership sempit yang disetujui
gate untuk tiga helper E2E + satu koreksi origin ekspektasi:

- **Integrasi browser nyata** `sidak-heatmap-browser-integration.spec.ts`:
  halaman `/sidak/input` dan panel import dijalankan di browser, request fitur
  diteruskan ke router Hono ASLI (JWT user, RLS) dan DB lokal disposable;
  membuktikan manual + import batch menulis, edit memindahkan hitungan, delete
  menguranginya, lalu `/sidak/heatmap` menampilkan angka dari API nyata.
- **Invarian ekspor** `sidak-agent-report-date-invariance.spec.ts`: CSV/MD dari
  alur unduh nyata byte-identik sebelum vs sesudah tanggal diisi.
- **Origin ekspor configurable**: `E2E_APP_ORIGIN` loopback pada fixture ekspor
  (default `localhost:3005` tetap); satu ekspektasi audit di
  `sidak-agent-report-download.spec.ts` kini menurunkan origin dari `APP_ORIGIN`,
  path/ekspektasi tidak dilonggarkan.

Angka historis pada catatan fase di atas berasal dari run yang berbeda dan
**tidak** dibandingkan sebagai bug. Bukti run repair final ini:
E2E fitur **83 passed** (DB/route 47 + UI mock 36) dan regresi ekspor
**31 passed**.

## Instruksi Handoff untuk Model Pelaksana

Salin instruksi ini bersama nomor fase yang hendak dikerjakan:

> Baca `plans/markdown/sidak-heatmap.md` penuh. Kerjakan hanya Fase N, dengan Requirement dan Design sebagai kontrak bersama. Drift-check kode/Git dan pastikan dependensi fase sudah selesai sebelum mengedit. Lindungi dirty work, jalankan E2E RED terlebih dahulu, implementasikan perubahan terkecil hingga GREEN, lalu jalankan gate fase. Jangan mengerjakan fase berikutnya, memperluas izin, mengganti scoring, atau memperbaiki modul unrelated. Jika safe E2E, prerequisite, atau skill wajib tidak tersedia, STOP dan laporkan. Jangan commit, push, deploy, migrate remote, atau menjalankan non-E2E test tanpa izin. Laporkan file berubah, commands/exit codes, artifacts, acceptance yang terbukti, dan blocker. Ubah status fase hanya setelah bukti gate lengkap.

## STOP Conditions dan Maintenance

- STOP jika live code berbeda secara material dari asumsi rencana, perlu out-of-scope edit, atau safe test target tidak dapat dibuktikan.
- STOP jika butuh perubahan RLS/grants atau akses role tambahan; ini bukan bagian MVP admin/trainer.
- Jangan melemahkan validasi/test atau mengganti failure dengan plausible success.
- Penyimpanan tanggal per baris mengikuti schema existing; kebutuhan future ticket-level edit atomic memerlukan kontrak/fase terpisah.
- Jika predicate `isCountableFinding()` berubah, review kembali keselarasan heatmap dengan hitungan SIDAK.
- Penambahan filter/evaluator, cache, atau agregasi SQL harus mempertahankan RLS, paging lengkap, scope missing-date, dan semantik tanggal bisnis.
