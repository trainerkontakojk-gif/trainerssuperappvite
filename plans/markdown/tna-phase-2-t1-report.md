# TNA Fase 2 — Laporan T1

Tanggal: 2026-10-11. Branch: `feat/tna-phase-2`, baseline `ed1c222`.
Risk lane: **D**. Rencana: `tna-phase-2.md` rev. 2, K9–K16 disetujui.

## Status dan kepemilikan

**Implementasi T1 dan gate fokus lulus. Integrasi regresi belum seluruhnya hijau.**

Worker GPT 6 Luna menulis fondasi SQL/spec. Atas instruksi Fajar, sesi utama keluar dari orchestrator-mode dan mengambil alih implementasi, review, serta verifikasi; bukan pekerjaan yang seluruhnya didelegasikan. Worker task-owned PID 64736 dihentikan setelah perintah berat selesai; exit 130 dan proses/tmux sudah keluar. Tidak ada subagent baru setelah takeover, reviewer independen, maupun klaim coverage persentase.

T2–T6 belum dikerjakan. Tidak ada perubahan API/frontend, migrasi remote, deployment, commit, atau push.

## File

- `supabase/migrations/20261011130000_tna_phase2_evaluation.sql`: kolom/index/constraint evaluasi; trigger lifecycle dan immutability; aktivasi lima argumen tetap kompatibel; RPC start/update/complete; overload cancel empat argumen tanpa default; cancel tiga argumen hanya draft.
- `supabase/rollbacks/rollback_20261011130000_tna_phase2_evaluation.sql`: guard kehilangan data sebelum DDL, restore fungsi/trigger Fase 1, hapus hanya objek Fase 2.
- `supabase/rollbacks/README.md`: satu entri rollback baru.
- `apps/web/e2e/tna-access-api.spec.ts`: grant preflight, role guard JWT, DB tetap sehat, service-role mencapai validasi bisnis pada RPC baru.
- `apps/web/e2e/tna-evaluation-db-api.spec.ts`: enam E2E DB/API evaluasi, fixture namespace unik dan cleanup terverifikasi.
- `plans/markdown/tna-phase-2.md`: status T1 diperbarui; keputusan/desain rev. 2 dipertahankan.
- `supabase/config.toml`: config lokal yang memang Git-ignored, project `trainerssuperappvite`, API/DB loopback, schema API hanya `public`/`graphql_public`, seed repo. Bukan konfigurasi remote atau file tambahan yang harus di-commit.

API config tidak perlu diedit: glob `tna-*-api.spec.ts` sudah mencakup spec baru. Migrasi Fase 1, `.impeccable/`, `mockups/`, T0, suite unit, dan spec heatmap tidak diubah.

## Perbaikan hasil review langsung — RED → GREEN

Semua reproduksi menggunakan Playwright `playwright.api.config.ts`, project `tna-real-backend`, satu worker, retry nol, target lokal disposable. Tidak ada unit test atau probe fungsi tanpa EXECUTE.

| Kontrak                                                               | RED yang benar-benar diamati                                                        | Perbaikan                                                                 | GREEN  |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| `cohorts.*.delta` harus angka perubahan rate, bukan objek rate/spread | Snapshot valid menurut D10 ditolak `TNA_INVALID_EVALUATION`                         | Validasi scalar signed number/null; fixture sesuai kontrak                | exit 0 |
| Timestamp/audit status null harus ditolak                             | Penyelesaian snapshot `computed_at: null` berhasil, error yang diharapkan tidak ada | Type check timestamp + regex fail-closed; `IS DISTINCT FROM 'audited'`    | exit 0 |
| Roster baseline dengan beberapa FK-null tidak boleh ambigu            | Aktivasi dua baris peserta FK-null diterima                                         | Tolak beberapa FK-null dan duplikasi identitas payload sebelum pencocokan | exit 0 |
| Marker periode wajib juga pada koneksi SQL baru                       | UPDATE tanpa marker diterima (`UNMARKED_UPDATE_ACCEPTED`)                           | Perbandingan marker null-safe dengan `IS NOT DISTINCT FROM`               | exit 0 |
| Efek bersih hanya bila kedua kohort memenuhi ambang                   | Snapshot peserta <5, pembanding cukup, `net_effect: 0` diterima                     | Efek tetap NULL bila kohort peserta baseline/evaluasi <5                  | exit 0 |

Perintah reproduksi: `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend tna-evaluation-db-api.spec.ts --grep '<kasus>' --workers=1`.

Kasus grep: `service-role lifecycle`, `snapshot, period`, `activation rejects ambiguous`, `fresh transaction`. Seluruh RED exit **1** untuk assertion perilaku yang dimaksud, bukan kegagalan lingkungan. Seluruh GREEN exit **0**. Log pasangan: `.pi/orchestrator/tna-phase-2/t1-evidence/takeover-{delta,null,roster,marker,cohort}-{red,green}.log`.

## Verifikasi akhir

Artefak lokal: `.pi/orchestrator/tna-phase-2/t1-evidence/`. Spec dan perintah berikut merupakan artefak E2E yang dapat diulang.

| Perintah                                                                                                                                                                                     | Exit          | Bukti                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------- |
| `bash scripts/integration/supabase-bootstrap.sh`                                                                                                                                             | 0             | Replay lokal bersih, termasuk migrasi Fase 2; output URL credential disanitasi di `takeover-clean-replay.log` |
| `supabase db reset --local` setelah perbaikan terakhir                                                                                                                                       | 0             | Versi final migrasi direplay, `takeover-final-clean-replay.log`                                               |
| `docker exec -i supabase_db_trainerssuperappvite psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/rollbacks/rollback_20261011130000_tna_phase2_evaluation.sql`                  | 0             | Rollback pada state reversible; log `takeover-final-rollback.log`                                             |
| `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend tna-evaluation-db-api.spec.ts --grep 'columns and RPCs' --workers=1` setelah rollback | 1, diharapkan | Empat signature baru tidak ada; `takeover-rollback-red.log`                                                   |
| `docker exec -i supabase_db_trainerssuperappvite psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/migrations/20261011130000_tna_phase2_evaluation.sql`                          | 0             | Reapply lokal, diikuti GREEN; `takeover-final-reapply.log` dan `takeover-forward.log`                         |
| `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend tna-access-api.spec.ts tna-evaluation-db-api.spec.ts --workers=1`                     | 0             | **10 passed** pada versi final; `takeover-focused-green.log`                                                  |
| `pnpm typecheck --concurrency=1 --cache=local:rw`                                                                                                                                            | 0             | 4 workspace berhasil, termasuk typecheck E2E web; cache lokal digunakan untuk workspace yang tidak berubah    |
| `pnpm lint --concurrency=1 --cache=local:rw`                                                                                                                                                 | 0             | 0 error; web menampilkan 90 warning pada kode di luar perubahan T1                                            |
| `pnpm build --concurrency=1 --cache=local:rw`                                                                                                                                                | 0             | 3 workspace build berhasil; sebagian cache lokal                                                              |
| `graphify update .` setelah batch kode final                                                                                                                                                 | 0             | Cache lokal Graphify diperbarui; tidak di-force-add                                                           |
| `git diff --check`                                                                                                                                                                           | 0             | Tidak ada masalah whitespace tracked diff; file baru diperiksa terpisah                                       |

Rollback terhadap data evaluasi **ditolak** dalam E2E lifecycle: `TNA_PHASE2_ROLLBACK_DATA_PRESENT`. Fingerprint kolom, fungsi, trigger, serta status/revisi/snapshot selesai tetap identik setelah penolakan. Jadi refusal dibuktikan sebelum DDL, bukan hanya error tekstual.

E2E juga membuktikan period replacement mempertahankan started-at; stale revision ditolak; verdict dihitung ulang terhadap target; no-audit tidak dapat diselesaikan; null sesi berbeda dari nol; hasil/kolom peserta beku; pembatalan beralasan menjaga baseline; rollback failed-completion menjaga status, revision dan nilai peserta.

Catalog terakhir: **0** signature TNA yang tidak executable untuk anon/authenticated/service_role. Hak client tetap ditolak oleh guard baris pertama, bukan ACL EXECUTE. Client tidak mempunyai USAGE `tna_internal`; schema itu tidak diekspos PostgREST. Service-role mendapat USAGE private schema agar validasi trigger privileged SQL berjalan; rollback mengembalikannya. Tidak ada `REVOKE EXECUTE` pada public RPC.

Cleanup terakhir: `tna_needs = 0`, `tna_plans = 0`, `tna_plan_participants = 0`, akun `e2e-browser-*@local.test = 0`. Pemeriksaan log container pada jendela takeover menemukan 0 `signal 11`/segfault dan 0 `PGRST001`; bukan klaim kesehatan produksi atau semua riwayat stack.

## Backup dan keselamatan data

Fajar memastikan data awal adalah fixture heatmap/log E2E dan disposable. Dump awal berada di `/tmp/tna-t1-pre-reset.sql`, **0600**, 11.300 byte, sebelum reset awal. Isi tidak dicetak atau dimasukkan Git. File dump tambahan task-owned tetap private; tidak dipakai sebagai bukti data produksi. Stack pengguna dibiarkan berjalan; tidak menghapus volume atau menghentikan sesi lain.

## Gap regresi yang tidak disembunyikan

Perintah tambahan:

`pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend tna-metrics-api.spec.ts tna-needs-api.spec.ts tna-parameter-key-api.spec.ts --workers=1`

Exit **1**: **11 passed, 1 failed, 1 skipped**. Kasus `tna-metrics-api.spec.ts`, `trendStatus separates no comparison, new from zero, and zero to zero`, mendapat 503 dari `/tna/parameters`; assertion kemudian membaca `body.data.items` yang tidak ada.

Kontrol baseline: setelah rollback Fase 2, jalankan spec metrik yang sama dengan `--grep 'trendStatus separates'`. Exit **1**, 503/TypeError yang sama (`takeover-baseline-metrics.log`). Ini membuktikan kegagalan terjadi juga tanpa SQL Fase 2 dalam stack lokal ini. Akar penyebab belum ditentukan; tidak menyalahkan formula atau mengubah kode metrik/spec lama untuk memaksa hijau. Reapply Fase 2 dan gate fokus kembali hijau setelah kontrol tersebut.

Suite plan Fase 1 penuh tidak diklaim hijau: pembatalan aktif melalui backend lama sengaja ditolak sampai T3 memperbarui overload dan error mapping. Jangan menganggap 503 migration-gap sebagai API final; API final tetap 422 sesuai rencana.

## Thermo-nuclear (self-review)

Verdict: **BLOCKED untuk integrasi/rilis penuh; PASS untuk kontrak T1 yang diuji fokus**.

Temuan material baru (delta, nullable snapshot, roster ambigu, marker NULL, ambang efek kohort) diperbaiki dengan bukti RED/GREEN. Tidak ada perubahan dependency/arsitektur/rumus SIDAK. Gap tersisa adalah regresi metrik baseline di atas; T2–T6 dan dokumentasi kanonik T6 tetap di luar sesi ini. Tidak ada independent-review claim atau coverage persentase yang dibuat.

## Checkpoint setelah gate PR isolasi metrik

Fajar menyetujui penghentian sementara stack T1, gate fix pada schema main, reset lokal pemulihan T1, PR fix terpisah, dan commit checkpoint T1.

- Fix E2E berada di commit `90ee733` pada branch `fix/tna-metrics-spec-isolation`, PR [#51](https://github.com/trainerkontakojk-gif/trainerssuperappvite/pull/51). Gate fresh seeded schema main lulus **29/29**, exit 0, tanpa skip; laporan ada di worktree fix `plans/markdown/tna-metrics-spec-isolation-report.md`.
- 503 seeded disebabkan UUID seed pembanding dan isolasi kalender/asumsi state spec Fase 1, bukan regresi T1; diagnosis lengkap: `tna-phase-2-diag-503-report.md`. Fix tidak mengubah produk/seed atau rumus metrik.
- Stack T1 dipulihkan dengan `supabase start -x storage-api,imgproxy` dan `supabase db reset --local` dari working tree `feat/tna-phase-2`, masing-masing exit 0. Reset ini telah disetujui, diperlukan untuk replay lokal migrasi/seed T1; tidak ada operasi remote. Backup privat sebelumnya `/tmp/tna-before-main-schema-gate.sql` (0600).
- Gate fokus T1 setelah pemulihan: `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend tna-access-api.spec.ts tna-evaluation-db-api.spec.ts --workers=1`, **10 passed**, exit 0. Catalog 9 RPC, migrasi T1 tercatat sekali, akun E2E/needs/plans tersisa 0.
- Log pemulihan di worktree fix: `.pi/orchestrator/tna-metrics-spec-isolation/t1-restore-{start,reset}.log`, `t1-restored-focused.log`, `t1-restored-cleanup.log`. Stack fix dihentikan sebelum stack T1 dimulai; hanya satu stack/run E2E sekaligus.

Commit ini adalah checkpoint T1 lokal, bukan release/integrasi penuh. Fix belum masuk branch T1 sampai PR di-merge dan rebase disetujui/dijalankan; API pembatalan aktif tetap menunggu T3. T2 belum dimulai. Typecheck/lint/build T1 di tabel sebelumnya adalah evidence sesi implementasi (bukan rerun pada sesi checkpoint).

## IMPLEMENTATION REPORT

STATUS: partial
OBJECTIVE: Implementasi dan verifikasi fokus T1 evaluasi DB, tanpa T2–T6/remote.
CHANGES: Migrasi/rollback, satu entri README rollback, spec akses + spec DB evaluasi, status plan/laporan; parent mengambil alih hasil worker lama dan memperbaiki kontrak/guard dengan E2E RED-first.
VERIFIED: Gate fokus 10/10, replay final lokal bersih, rollback refusal + roundtrip, root typecheck/lint/build, Graphify dan diff check lulus dengan perintah/evidence di atas.
JUDGMENT CALLS: Data fixture disposable berdasarkan verifikasi Fajar; private-schema USAGE hanya service-role; mempertahankan fail-closed cancellation migration-gap; tidak memperluas scope untuk memperbaiki metrik/heatmap.
GAPS: Regresi metrik baseline sudah didiagnosis dan fix terpisah PR #51 lulus schema-main 29/29, tetapi belum diintegrasikan ke branch T1. API active cancellation menunggu T3; integrasi/rilis penuh belum PASS. T2–T6 belum dimulai.
