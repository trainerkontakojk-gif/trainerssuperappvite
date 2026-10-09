# Postgres Revoked-EXECUTE Crash Mitigation — T3 Report

## Status

**T3 selesai; berhenti sebelum T4.** Lane D, branch `fix/postgres-revoked-execute-guard`, rencana disetujui Fajar. Skill `trainers-superapp-tdd` dimuat sebelum edit; `thermo-nuclear` dipakai untuk self-review scope T3, bukan review independen.

Hanya target dari `apps/api/.env.integration`: API dan DB diverifikasi tepat `127.0.0.1`, port DB dan `pg_control_system().system_identifier` cocok dengan container `supabase_db_trainerssuperappvite`. Tidak ada produksi, Supabase MCP, unit test, commit/push, blanket migration-up/reset, perubahan body fungsi, atau dev server baru. Dirty work T0–T2, config API dan `.claude/launch.json` dipertahankan.

## Files

- `supabase/migrations/20261008150001_restore_anon_execute_client_rpcs.sql`: tujuh GRANT anon, NOTIFY reload schema, lalu DO-block self-check **global** public/graphql_public, non-trigger, anon/authenticated.
- `supabase/rollbacks/rollback_20261008150001_restore_anon_execute_client_rpcs.sql`: tujuh REVOKE anon yang mengembalikan ACL pra-T3, dengan warning crash exposure. **Tidak dijalankan.**
- `apps/web/e2e/exposed-function-guard-api.spec.ts`: matriks tujuh Group B anon, dummy args bertipe sesuai katalog, sentinel persisten, count sesudah setiap panggilan; global precondition juga diwajibkan untuk seluruh RPC Group A/kontrol.
- Rencana: T3 dicentang; laporan ini.

## RED → penerapan lokal → GREEN

Command E2E yang sama untuk RED dan GREEN:

```bash
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project db-guard-real-backend
```

- **RED exit 1:** 3 failed / 1 passed. D5.1 tepat 7 revoked Group B; D5.2 hijau. Kedua matriks gagal di global precondition, **tanpa RPC atau pembuatan user**. Log `/tmp/postgres-revoked-t3/red.log`.
- **GREEN exit 0:** seluruh 4 test hijau; workers 1, retries 0. Log `/tmp/postgres-revoked-t3/green.log`.

Penerapan: `python3 /tmp/postgres-revoked-t3/apply.py` — **exit 0**. Script hanya membaca env integration, menolak catalog drift/history T3 yang sudah ada, membandingkan tujuh signature dengan snapshot dan rollback, lalu menjalankan `psql` dengan `-X -v ON_ERROR_STOP=1` melalui stdin:

```sql
BEGIN;
SET LOCAL lock_timeout = '8s';
-- Seluruh isi 20261008150001_restore_anon_execute_client_rpcs.sql.
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES ('20261008150001','restore_anon_execute_client_rpcs',
        ARRAY[/* isi migrasi lengkap sebagai satu string */]);
COMMIT;
```

Output: `BEGIN`, `SET`, tujuh `GRANT`, `NOTIFY`, `DO`, `INSERT 0 1`, `COMMIT`. History terverifikasi `20261008150001|restore_anon_execute_client_rpcs`. SQL dan stdout tersimpan di `/tmp/postgres-revoked-t3/{apply-transaction.sql,apply.log}`. Self-check dan pencatatan history berada dalam transaksi yang sama.

### Output E2E GREEN

```text
Running 4 tests using 1 worker
D5.1 {"total":0,"groupA":0,"groupB":0,"revoked":[]}
✓ D5.1 catalog invariant: no revoked exposed non-trigger functions
D5.2 {"schemas":["public","graphql_public"],"checked":34,"unsafe":[]}
✓ D5.2 guard-placement invariant: every Group A overload guarded first
D5.3–8 {"calls":140,"sentinelAlive":true}
✓ D5.3–8 Group A rejection matrix, sentinel, side effects and positive controls
Group B {"calls":7,"sentinelAlive":true}
✓ D5.3–5 Group B anon rejection matrix, sentinel and no side effects
4 passed (45.9s)
```

- **Group A:** 136 denial (34 × anon/agent/trainer/admin), `42501 / SERVICE_ROLE_REQUIRED`, HTTP anon 401 dan JWT 403; tiga kontrol service-role serta Q3 not-found tetap hijau.
- **Group B:** setiap signature dipanggil sekali sebagai anon key tanpa Authorization, cookie atau sesi. Seluruhnya **HTTP 400 / P0001**; enam pesan persis `Unauthorized`, coaching persis `Access denied: Anonymous users cannot upsert coaching summaries.`.
- Sentinel Group A hidup untuk 140 panggilan; sentinel Group B hidup untuk tujuh panggilan. Koneksi tidak dibuat ulang; `SELECT 1` dan PID backend sama diperiksa setelah setiap RPC, termasuk pada jalur error.
- Count 13 tabel seluruhnya 0 sebelum/sesudah, termasuk `pdkt_mailbox_items`, `pdkt_mailbox_subject_intents`, `profiler_peserta`, `telefun_coaching_summary`. Group B memeriksa seluruh count **setelah setiap panggilan**, bukan hanya di akhir.
- Post-review: user fixture `e2e-browser-%@local.test` tersisa **0**. Pemeriksaan proses akhir tidak menemukan psql sentinel tersisa.

## Reviewer evidence: body/ACL

`python3 /tmp/postgres-revoked-t3/local.py` — exit **0**, snapshot pra-T3, loopback/container identity dan history T2 terverifikasi. First statements Group B dibandingkan dengan T0 §4: anon ditolak sebelum akses tabel; reply wrapper hanya mendelegasikan ke fungsi guarded. Tidak ada initializer dengan side effect.

`python3 /tmp/postgres-revoked-t3/post-review.py` — final exit **0**:

- `pg_get_functiondef` ketujuh Group B **identik byte-for-byte**, termasuk signature, default, attributes dan body. Delta ACL hanya `anon=X/postgres`.
- ACL sebelumnya `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`; ACL sesudahnya menambahkan `anon=X/postgres`. Rollback hanya mencabut grant ini.
- Seluruh 34 definisi Group A serta satu fungsi Q3 yang dipindah **tetap identik dengan snapshot applied T2**. Reviewer diff sebelum/sesudah T2 tersedia di laporan T2; tidak ada guard/body baru pada T3.
- Global revoked = 0; user fixture = 0.

| Group B signature di public                                                                                        | Diff definisi | ACL delta    |
| ------------------------------------------------------------------------------------------------------------------ | ------------- | ------------ |
| `bulk_reorder_profiler_peserta(jsonb)`                                                                             | kosong        | anon EXECUTE |
| `soft_delete_pdkt_mailbox_item(uuid)`                                                                              | kosong        | anon EXECUTE |
| `submit_pdkt_mailbox_batch(text,text,text,text,text,jsonb,jsonb,jsonb)`                                            | kosong        | anon EXECUTE |
| `submit_pdkt_mailbox_batch_with_subject(text,text,text,text,text,jsonb,jsonb,jsonb,text,uuid,text,text,text,uuid)` | kosong        | anon EXECUTE |
| `submit_pdkt_mailbox_reply(uuid,jsonb,integer)`                                                                    | kosong        | anon EXECUTE |
| `submit_pdkt_mailbox_reply_with_outcome(uuid,jsonb,integer)`                                                       | kosong        | anon EXECUTE |
| `upsert_telefun_coaching_summary(uuid,jsonb,integer,text)`                                                         | kosong        | anon EXECUTE |

Snapshot dan hash proof: `/tmp/postgres-revoked-t3/{before.json,after.json,definition-review.json}`. Post-review awal exit 1 karena script salah menambahkan prefix `public.` pada signature Q3 yang sudah `app_internal`; diperbaiki di script scratch saja, lalu semua perbandingan lolos. Bukan kegagalan produk atau gate yang dilemahkan.

Thermo-nuclear self-review scope T3: **PASS**, tidak ada temuan material tersisa. Global invariant tidak dilemahkan; migration grants-only; rollback eksplisit berbahaya; semua RPC fail-closed sebelum POST; cleanup sentinel ada di finally. Root/release gates tetap belum dijalankan.

## Artifact dan log Postgres

Artifact repeatable di `apps/web/test-results/api/` (akan diregenerasi oleh command E2E di atas):

- `exposed-function-guard-api-1ed58-posed-non-trigger-functions-db-guard-real-backend/catalog-invariant.json`
- `exposed-function-guard-api-8fa49-up-A-overload-guarded-first-db-guard-real-backend/guard-placement-invariant.json`
- `exposed-function-guard-api-9ee69-fects-and-positive-controls-db-guard-real-backend/{group-a-rpc-summary.json,side-effects.json}`
- `exposed-function-guard-api-56cf6-entinel-and-no-side-effects-db-guard-real-backend/{group-b-rpc-summary.json,group-b-side-effects.json}`

Summary RPC memuat `{function, role, httpStatus, code, sentinelAlive}`; attachment JSON juga disimpan oleh Playwright.

```bash
docker logs --since 2026-10-08T15:42:33Z --until 2026-10-08T15:43:33Z supabase_db_trainerssuperappvite
```

Exit **0**, 707 baris di `/tmp/postgres-revoked-t3/green-postgres.log`: **136 ERROR SERVICE_ROLE_REQUIRED**, **6 ERROR Unauthorized**, **1 ERROR coaching anon**. Pencarian `signal 11`, `terminated by signal`, `abnormal termination`, `PANIC`, `reinitializing`, `database system was interrupted`, `server process .*exited` menghasilkan **0 match** (checker exit 0). Ini log non-kosong dan bukti sentinel, bukan klaim bahwa semua versi Postgres aman.

## Typecheck/Lint/Format

- `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.e2e.json` — **exit 0** (`typecheck.log`).
- `pnpm --filter @trainers/web exec eslint e2e/exposed-function-guard-api.spec.ts` — **exit 0** (`eslint.log`).
- `pnpm exec prettier --write apps/web/e2e/exposed-function-guard-api.spec.ts` — **exit 0**, formatting scope spec saja.
- Final scoped Prettier/check dan diff dicatat di addendum setelah laporan ini ditulis. Tidak ada parser SQL Prettier terpasang; SQL diverifikasi signature/ACL/katalog/global self-check dan diff, tanpa mengubah body.

## Notes / scope boundaries

- Graphify `affected bulk_reorder_profiler_peserta --depth 2` — exit 0, no unique match; satu retry `affected runSql --depth 2` — exit 0, consumers E2E. Fallback source/katalog lokal dan inventory T0; tidak ada perubahan library/API eksternal baru, Context7 tidak diulang.
- **Penyimpangan concurrency:** RED awal dijalankan walaupun inspeksi proses menampilkan Playwright dari worktree lain; pemeriksaan awal hanya mencetak, tidak memblokir. Ini melanggar batas satu run pada saat tersebut. RED tidak melakukan RPC. Run GREEN dimulai setelah pemeriksaan fail-closed berdasarkan `comm=node` tidak menemukan runner/worker aktif. Pemeriksaan sementara yang memindai args juga menghasilkan false positive pada command shell sendiri dan menyebabkan penundaan; diperbaiki sebelum GREEN. Tidak ada proses sesi lain yang dihentikan. Tidak mengklaim lock OS atau jaminan lintas sesi.
- Regression callers, root typecheck/lint/build, architecture docs dan Graphify update **tidak dijalankan**, milik T4/T5. Tidak ada rollout remote, perubahan image/extension atau pengujian pg_graphql baru.

## Final verification addendum

Scoped Prettier pertama exit **1**, hanya format tabel laporan ini; plan/spec sudah sesuai. Laporan diformat dengan `pnpm exec prettier --write plans/markdown/postgres-revoked-execute-crash-mitigation-t3-report.md`. Final command:

```bash
pnpm exec prettier --check apps/web/e2e/exposed-function-guard-api.spec.ts plans/markdown/postgres-revoked-execute-crash-mitigation.md plans/markdown/postgres-revoked-execute-crash-mitigation-t3-report.md
git diff --check
```

Formatting laporan, final Prettier dan `git diff --check` masing-masing **exit 0**. Hanya lima path T3 di daftar Files di atas yang ditambah/diubah sesi ini; status akhir disimpan di `/tmp/postgres-revoked-t3/status-final.txt`.

**STOP: T3 selesai, T4 belum dimulai.**
