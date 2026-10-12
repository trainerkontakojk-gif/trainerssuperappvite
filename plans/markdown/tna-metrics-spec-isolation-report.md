# TNA metrics spec isolation — report

## STATUS

**Gate schema main GREEN: 29/29 passed, exit 0. Stack T1 sudah dipulihkan dan gate fokusnya 10/10 passed.** Bagian diagnosis/gate awal di bawah dipertahankan sebagai riwayat; update setelah persetujuan review dicatat pada bagian terakhir.

Worktree: `/tmp/tna-metrics-spec-isolation` (realpath `/private/tmp/tna-metrics-spec-isolation`). Branch: `fix/tna-metrics-spec-isolation`, dari **main lokal `ed1c222`**, tanpa fetch remote. Worktree diagnosis lama dihapus dengan `git worktree remove /tmp/tna-diag-503-main` (exit 0), lalu worktree baru dibuat memakai `git worktree add -b fix/tna-metrics-spec-isolation /tmp/tna-metrics-spec-isolation main` (exit 0).

Lane risiko **C**: regression/shared-fixture E2E, tanpa perubahan produk, schema, permission, seed, atau kontrak API. Plan: `plans/markdown/tna-metrics-spec-isolation.md`. Skill `trainers-superapp-tdd` dimuat sebelum edit; `thermo-nuclear` untuk self-review.

## Pendekatan (a): kalender sebelum semua audit

Constraint live `qa_periods` sama dengan `supabase/migrations/001_sidak_core.sql`: tahun **2000–2100**, bulan **1–12**, unique **(month, year)**.

Fixture sekarang memilih tahun tertinggi dalam rentang tersebut yang:

- strictly lebih awal dari tahun minimum seluruh baris audit **chat** existing, termasuk phantom/zero findings dan QA (konservatif, tidak menduplikasi logika exclusion produk);
- belum memiliki periode Januari–April, untuk menghindari collision dengan semua empat periode fixture;
- bila tidak ada audit chat, memakai batas atas 2100;
- bila tidak ada slot, **throw fail-closed sebelum membuat user**, dengan pesan `TNA fixture requires a free January-April year before all chat audits within 2000..2100`.

Dengan seed chat 2024 dan kalender kosong sebelumnya, slot aman adalah 2023. Seleksi membaca database live, bukan mengasumsikan 2024 atau mengandalkan namespace/random year. Cleanup tetap exact-ID; collision saat insert tetap gagal melalui constraint/transaction. Tidak ada fallback ke kalender yang tidak aman.

Pendekatan (b) tidak dipilih: semua consumer fixture dan expectation layanan masih chat; memindahkan service_type akan memperluas perubahan ke kontrak fixture dan assertion banyak spec.

Batasan: preflight adalah snapshot setup untuk run serial, bukan lock terhadap writer eksternal sepanjang E2E. Tidak ada uji terpisah untuk kondisi semua slot habis/race writer eksternal; jangan mengklaim coverage tersebut.

## Diff ringkas

1. `apps/web/e2e/helpers/tnaFixture.ts`: ganti tahun acak 2080–2099 dengan read-only SQL preflight kalender aman. Seluruh bulan, namespace, service_type, bentuk substrate, dan cleanup tetap sama.
2. `apps/web/e2e/tna-metrics-api.spec.ts`:
   - helper `deleteMappedAgent2Finding()` dipakai oleh kasus MIN_FINDINGS dan oleh setup kasus tren; deletion idempotent dan dibatasi periode/indikator/peserta fixture sendiri;
   - `parameters()` default mengassert status **200** dan `success: true` sebelum data bisa diakses; error code/message menjadi assertion context;
   - negative request secara eksplisit mengharapkan 400/404 dan `success: false`;
   - `comparePeriods: []`, semua trendStatus, null/zero, dan seluruh angka findings tidak dilonggarkan.
3. Plan dan laporan ini; **tidak ada perubahan `apps/api`, `packages/types`, seed, migrasi, manifest, atau spec lainnya**.

## Target, data, dan evidence

Hanya stack pengguna `trainerssuperappvite` yang sudah berjalan dipakai; API/DB dipastikan loopback **127.0.0.1:54321/54322**. Tidak membuat stack kedua atau menjalankan start/stop/reset/rollback/migration. `.env.integration` worktree di-copy privat (0600), tidak dicetak atau di-track. Fixture memasang fetch guard non-loopback dan mengimport Hono asli setelah env dipin lokal.

Semua log berada di `.pi/orchestrator/tna-metrics-spec-isolation/` di worktree. Semua Playwright menggunakan config API, project `tna-real-backend`, **workers=1**, retry nol, tanpa webServer. Tidak ada suite unit.

Definisi perintah:

```bash
# P (dari root worktree):
pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend tna-metrics-api.spec.ts --grep 'trendStatus separates' --workers=1

# M (spec metrik lengkap; dijalankan dua kali berturut-turut):
pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend tna-metrics-api.spec.ts --workers=1

# A (seluruh consumer fixture di main):
pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend tna-access-api.spec.ts tna-metrics-api.spec.ts tna-needs-api.spec.ts tna-parameter-key-api.spec.ts tna-plan-api.spec.ts --workers=1
```

| Command                                                                                                          | Exit | Log / hasil                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm --dir /tmp/tna-metrics-spec-isolation install --offline --frozen-lockfile --ignore-scripts`                | 0    | `install.log`; dependency workspace terpisah, manifest/lockfile tidak berubah                                                  |
| P, RED sebelum edit                                                                                              | 1    | `red-trend.log`: GET 503; TypeError `body.data.items`                                                                          |
| P, GREEN setelah edit                                                                                            | 0    | `green-trend.log`: **1 passed**, seluruh GET 200                                                                               |
| M, GREEN run 1                                                                                                   | 0    | `green-metrics-1.log`: **7 passed**                                                                                            |
| M, GREEN run 2, langsung setelah run 1                                                                           | 0    | `green-metrics-2.log`: **7 passed**                                                                                            |
| A                                                                                                                | 1    | `all-fixture-specs-explicit.log`: **21 passed, 2 failed, 6 did not run**                                                       |
| `pnpm --dir apps/web typecheck`                                                                                  | 0    | `typecheck-web.log`: `tsc --noEmit && tsc -p tsconfig.e2e.json`                                                                |
| `pnpm --dir apps/web lint`                                                                                       | 0    | `lint-web.log`: 0 errors, 90 warnings existing di luar dua file berubah                                                        |
| `git diff --check`                                                                                               | 0    | `final-check.log`                                                                                                              |
| `pnpm exec prettier --check apps/web/e2e/helpers/tnaFixture.ts apps/web/e2e/tna-metrics-api.spec.ts`             | 0    | `format-source.log`; source sudah sesuai format tanpa reformat massal                                                          |
| `graphify explain createTnaFixture`                                                                              | 1    | `graphify-discovery.log`: cache worktree awal belum ada                                                                        |
| Retry explain dengan `--graph /Users/nadindyta/Downloads/_Projects/trainerssuperappvite/graphify-out/graph.json` | 0    | cache dibaca saja, menunjukkan consumer; live `rg` main menjadi authority (cache juga menyebut spec T1 yang belum ada di main) |
| `graphify update .`                                                                                              | 0    | `graphify-update.log`: cache AST worktree diperbarui, tidak di-track                                                           |

Percobaan pemilihan semua spec dengan argumen quoted `tna-*-api.spec.ts` sempat exit 1, **No tests found** (`all-fixture-specs.log`); Playwright memperlakukan argumen sebagai regex, bukan shell glob. Tidak dihitung sebagai test coverage. Segera diganti daftar file eksplisit (A).

## Daftar spec fixture yang dijalankan

Inventaris live `rg -l tnaFixture apps/web/e2e` main menemukan tepat lima file:

| Spec                            | Hasil run A                                                                |
| ------------------------------- | -------------------------------------------------------------------------- |
| `tna-metrics-api.spec.ts`       | **7 passed**, juga fokus 1 passed dan standalone lengkap dua kali 7 passed |
| `tna-needs-api.spec.ts`         | **5 passed**                                                               |
| `tna-parameter-key-api.spec.ts` | **1 passed**, termasuk repeat seed/cleanup                                 |
| `tna-access-api.spec.ts`        | 2 passed, 1 failed, 1 skipped                                              |
| `tna-plan-api.spec.ts`          | 6 passed, 1 failed, 5 skipped                                              |

`apps/web/e2e/tna-evaluation-db-api.spec.ts` hanya merupakan pekerjaan uncommitted T1 di working tree utama; tidak ada di checkout main worktree ini, tidak disalin atau dijalankan.

## Dua blocker gate lintas-spec

1. **Access catalog mismatch**, `tna-access-api.spec.ts:173`: assertion main mengharapkan tepat lima RPC Fase 1. Live catalog memiliki empat signature tambahan dari T1 (`tna_cancel_plan(...,text)`, `tna_complete_plan`, `tna_start_plan_evaluation`, `tna_update_evaluation_period`). Ini tidak bergantung pada kalender/temuan fixture; spec akses dan SQL tidak berubah dalam patch ini.
2. **Active cancellation migration gap**, `tna-plan-api.spec.ts:488`: expected 200, received **503** pada pembatalan aktif. Backend main `write-service.ts:168–178` masih memanggil overload tiga argumen; fungsi live overload itu menolak aktif/evaluasi dengan `TNA_CANCEL_REASON_REQUIRED` (dikonfirmasi read-only `pg_get_functiondef`). Gap ini sudah dicatat pada laporan T1, sebelum patch fixture.

Serial suite melewati enam test berikutnya setelah failure, jadi enam test itu **belum terverifikasi**. Tidak skip manual, mengubah assertion catalog/cancellation, me-rollback T1, atau menambal produk. **Permintaan semua consumer exit 0 belum terpenuhi pada stack ini.** Untuk gate main penuh diperlukan stack schema main yang cocok; karena sesi dibatasi satu stack dan stack pengguna tidak boleh dihentikan, perlu koordinasi/izin setup lanjutan. Tidak otomatis membuat stack kedua.

## Seed dan working tree utama dipertahankan

Snapshot read-only sebelum/sesudah semua E2E (`seed-before.log`, `cleanup-db.log`):

- enam baris seed periode: fingerprint `f539d3ca5c571a5febd4117194a51a2c`, identik;
- tujuh baris seed temuan: fingerprint `2a25280cc622e75f644b7a905e3fee36`, identik;
- akun `e2e-browser-%@local.test` tersisa **0**;
- `tna_needs` tersisa **0**, `tna_plans` tersisa **0**.

Snapshot path dan SHA-256 seluruh file dirty/untracked working tree `feat/tna-phase-2` identik (`main-tree-before.json`, `main-tree-after.log`). Tidak switch/stash/reset/edit working tree utama. Tidak ada commit/push/PR/remote. Stack pengguna tetap berjalan; tidak ada server/worker agent baru.

## Thermo-nuclear dan gates

**Verdict: PASS untuk patch metrik yang diuji; BLOCKED untuk klaim semua consumer GREEN.** Self-review, bukan reviewer independen. Scope review: diff dua file, constraint kalender, consumer live, exact-ID deletion/cleanup, negative response handling, serta seluruh log E2E dan typecheck/lint.

Temuan P2 environment/compatibility: dua blocker di atas. Tidak ditemukan kebutuhan mengubah rumus/query/API untuk memperbaiki regresi metrik ini. Slot kalender dibatasi dan fail-closed; tidak ada penghapusan data asing atau fallback yang mengubah kegagalan menjadi success.

Build/root checks tidak dijalankan: patch hanya E2E helper/spec dan dokumen, tanpa perubahan kode bundle/product; web typecheck mencakup E2E dan web lint sudah dijalankan. Context7 tidak diperlukan karena tidak ada external API/dependency baru atau semantik library yang belum jelas. Graphify internal extraction melaporkan empat worker AST default; tidak ada subagent/delegasi dan tidak ada command berat lain bersamaan.

## Update setelah persetujuan review: gate schema main dan pemulihan T1

Fajar menyetujui penghentian sementara stack T1, gate dengan stack baru dari worktree fix, reset lokal pemulihan T1, commit/push fix + PR, dan checkpoint commit T1. Tidak ada izin merge/rebase/deployment dalam langkah ini.

- Private backup sebelum penghentian: `/tmp/tna-before-main-schema-gate.sql`, mode 0600; isi tidak dicetak atau di-track. Data awal TNA kosong dan disposable sebagaimana laporan T1.
- `supabase stop` dari `feat/tna-phase-2`: exit 0 (`t1-stop-for-main-gate.log`). Volume lama disimpan.
- Config ignored worktree fix: project `tna-metrics-spec-isolation`, API/DB/shadow `55421/55422/55420`, seed tujuh file repo, tidak ada migrasi T1. `supabase start -x storage-api,imgproxy,realtime,studio,edge-runtime,logflare,vector,mailpit,supavisor,postgres-meta`: exit 0 (`main-schema-start.log`). Stack baru bersih, hanya satu stack hidup.
- Perintah **A** di atas pada endpoint loopback baru: **exit 0, 29 passed, 0 skipped** (`main-schema-all-fixture-specs.log`). Spec akses 4/4, metrik 7/7, needs 5/5, parameter-key 1/1, plan 12/12. Keenam test yang sebelumnya skipped sekarang terverifikasi.
- Catalog main: 5 RPC, seed periode 6/temuan 7 masih ada; akun E2E/need/plan 0 setelah cleanup (`main-schema-cleanup.log`). Tidak menghapus data seed.
- `supabase stop --no-backup` dari worktree fix: exit 0 (`main-schema-stop.log`), volume disposable fix dibuang.
- `supabase start -x storage-api,imgproxy` lalu **`supabase db reset --local` dari working tree `feat/tna-phase-2`**: masing-masing exit 0 (`t1-restore-start.log`, `t1-restore-reset.log`). Reset diperlukan sesuai langkah pemulihan yang disetujui, agar migrasi T1 dan seed repo direplay. Output CLI menyebut branch main, tetapi `git branch --show-current` tetap `feat/tna-phase-2` dan log membuktikan migrasi `20261011130000_tna_phase2_evaluation.sql` diterapkan.
- `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend tna-access-api.spec.ts tna-evaluation-db-api.spec.ts --workers=1` dari tree T1: **exit 0, 10 passed** (`t1-restored-focused.log`). Catalog T1 9 RPC, migrasi T1 tercatat sekali, akun E2E/need/plan 0 (`t1-restored-cleanup.log`).
- Container edge-runtime dan vector yang baru dibuat oleh start pemulihan (tidak ada pada snapshot awal) dihentikan secara exact-name. Stack T1 lainnya tetap berjalan. Tidak ada stack fix hidup.

**Concurrency note untuk PR:** fixture kalender membutuhkan run serial (`--workers=1`); dua fixture paralel dapat memilih tahun yang sama dan salah satunya fail-closed pada unique `(month, year)`.

Verdict akhir self-review: **PASS** untuk patch dan gate schema main; tidak ada perubahan kode sejak review +40/−8. Web typecheck/lint sebelumnya tetap berlaku untuk source identik; checks dokumen/diff dijalankan ulang sebelum commit. CI belum diklaim lulus dan CI tidak menjalankan Playwright. Integrasi fix ke branch T1, merge/rebase, serta T2 menunggu langkah berikutnya.

```text
STATUS: PASS — patch siap commit/PR setelah gate schema main lulus; stack T1 dipulihkan. Tidak diintegrasikan ke feat/tna-phase-2.
VERIFIED: RED 503; focused GREEN 1/1; metrics GREEN 7/7 dua kali; schema-main semua fixture 29/29; restored T1 fokus 10/10; web typecheck/lint dan diff check exit 0; tidak menghapus seed.
GAPS: Preflight exhaustion/race belum diuji; fixture wajib serial; CI/merge/rebase belum diverifikasi/dijalankan; API active cancellation T1 tetap menunggu T3. T2 belum dimulai.
```
