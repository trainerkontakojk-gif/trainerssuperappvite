# TNA Fase 1 — Laporan T4 (rev. 7)

## Status

T4 **selesai**: rencana, aktivasi, pembatalan, baseline D4, dan narasi D9. Lane D; rencana acuan `plans/markdown/tna-phase-1.md` rev. 7; branch `feat/tna-phase-1`. Spec fokus T4 sudah **12 passed**. Regresi final seluruh TNA **29 passed** (17 T1–T3 + 12 T4), termasuk pemanggilan Hono RPC bertipe. T5 belum dimulai. Perbaikan isolasi rate limit harness juga diverifikasi lewat dua run berurutan, masing-masing **29 passed**, dengan **0 respons 429** per log (lihat tindak lanjut di bawah).

Tidak ada commit, push, deploy, migrasi lokal/remote, perubahan image/extension, atau data produksi. Dirty work T0–T3 dan perubahan lain yang sudah ada dipertahankan. Hash SHA-1 migrasi `20261008120000_tna_phase1.sql` sebelum/sesudah **identik** (`f3d4f3202388c6b295496001e05f71751815b478`); guard dan trigger tidak dilonggarkan.

## Implementasi

- `apps/api/src/routes/tna.ts`: `POST/GET /plans`, `GET/PATCH /plans/:id`, `POST /plans/:id/activate`, `POST /plans/:id/cancel`. Router di-chain agar seluruh route TNA tersedia dalam `AppType`. Capability sebelum parsing/service; envelope `ApiResponse`; body plan/transition strict menolak snapshot, baseline, actor, dan field asing. Invalid roster → 422; input struktural/body kosong → 400; identitas tidak ditemukan → 404.
- `apps/api/src/services/tna/write-service.ts`: semua lima mutasi TNA hanya memanggil RPC dari file ini. Pembacaan awal/validasi roster/baseline menggunakan user client. Actor dari autentikasi; create/update/activate/cancel memanggil `logActivity`. RPC existing menangani lock, revision, transaksi, validasi target/baseline, dan transisi; `expected_updated_at` diteruskan utuh tanpa kehilangan presisi mikrodetik.
- `read-service.ts`: reader kebutuhan tunggal agar baseline tidak perlu membaca seluruh rencana terkait; reader daftar rencana (paginasi penuh/filter status), rencana + peserta, dan detail. Semuanya memakai client JWT pengguna. Draft menghitung preview setiap GET; detail aktif/pembatalan setelah aktivasi memakai baseline tersimpan, tanpa menghitung QA ulang. Pembatalan sebelum aktivasi menyatakan baseline belum dibekukan.
- `analysis.ts` + refactor `detail.ts`: ekstraksi analisis parameter T3 menjadi sumber bersama metrik/findings untuk drill-down dan baseline. Formula, threshold, guard phantom/non-service, paginasi, dan registry SIDAK tidak diduplikasi.
- `baseline.ts`: metrik populasi layanan/parameter/periode/jumlah pembanding dari need, `validation_drift` untuk findings/auditedAgents, dan baseline temuan parameter per roster final. `was_affected = baseline_findings > 0`. Peserta harus 1–200, unik, tersedia melalui RLS, dan bukan agent non-service; null akibat FK cleanup ditolak saat aktivasi.
- `narrative.ts`: narasi deterministik D9 untuk computed naik/turun/stabil, new_from_zero, no_findings_both, no_comparison_data, no_current_audit; angka/tanggal Indonesia, prefix `Pratinjau:`, catatan data belum cukup. Kondisi no_audit mengganti seluruh kalimat metrik, tanpa mengubah null menjadi angka nol.
- `errors.ts`: pemetaan kode stabil RPC ke 409/422 (serta 403/404 yang relevan); constraint tanggal/target invalid → 422. Error DB/transport tidak dikenal tetap 503 manusiawi, tidak mengekspos pesan DB mentah.
- `packages/types/src/tna.ts`: schema respons plan/peserta/filter status dan `participant_preview`. Kontrak detail `{ plan, participants, preview, participant_preview, narrative }`: kolom `participants.baseline_findings` tetap NULL saat draft, nilai live ada di `participant_preview`; kedua preview NULL setelah aktivasi.
- `apps/web/e2e/tna-plan-api.spec.ts`: 12 skenario real backend loopback; `helpers/accessMatrix.ts`: enam endpoint T4 dalam matriks kapabilitas existing. `docs/modules.md`: kontrak backend sampai T4.

## RED → GREEN

```bash
pnpm --filter @trainers/web exec playwright test tna-plan-api.spec.ts --config playwright.api.config.ts --project tna-real-backend
```

RED sebelum implementasi: exit **1**, **1 failed, 9 did not run**. `POST /api/v1/tna/plans`: expected **201**, received **404**. Endpoint need existing benar-benar dipanggil dan sukses sebelum kegagalan create plan; target JWT/Supabase/SQL loopback, bukan mock.

GREEN akhir spec fokus: exit **0**, **12 passed**. Dua kekurangan saat implementasi diperbaiki tanpa melemahkan assertion: body kosong semula dikategorikan 422 karena field peserta (diperbaiki 400); need UUID tidak ditemukan semula ikut terpetakan sebagai eskalasi 422 (diperbaiki pembacaan JWT dan 404). Expected failure tersebut tercatat di run kedua sebelum perbaikannya.

Spec menjadi artifact repeatable: fixture randomUUID, JWT nyata, guard fetch loopback, namespace-owned cleanup di `afterAll`. RPC langsung/SQL hanya digunakan untuk kontrak atomisitas dan trigger yang tidak dapat diamati hanya dari respons API; tetap bagian spec Playwright E2E, tidak ada test non-E2E.

Perbaikan kontrak tipe hasil review: router TNA semula memakai panggilan `tna.get/post/patch` terpisah sehingga `/tna` tidak masuk tipe `AppType`, walaupun runtime sudah lulus. Spec menambahkan pemanggilan nyata `hc<AppType>(...).v1.tna.plans.$get()`. Typecheck RED exit 1: `Property 'tna' does not exist`; GREEN setelah chaining route exit 0. Regresi seluruh TNA diulang sesudah perbaikan ini. Context7 resolve Hono lalu query `/honojs/website` mengonfirmasi [kontrak chaining RPC resmi](https://hono.dev/docs/guides/rpc#using-rpc-with-larger-applications). Endpoint/handler/auth yang dijalankan tetap sama.

## Cakupan §7 dan bukti

| Kontrak                                        | Bukti yang lulus di spec T4                                                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Need mengabaikan angka body                    | Semua create need mengirim snapshot 99999; respons bukan 99999; skenario awal memverifikasi findings 3/auditedAgents 5                                                                                                            |
| Need eskalasi; program nonaktif                | API 422 dengan `TNA_NEED_NOT_TRAINING` / `TNA_PROGRAM_INACTIVE`                                                                                                                                                                   |
| Plan kedua pada need sama                      | API 409 `TNA_PLAN_EXISTS`; count tetap 1 plan/2 peserta                                                                                                                                                                           |
| Peserta 0/duplikat/>200; tidak ada/non-service | API 422; count tetap 0 plan/0 peserta                                                                                                                                                                                             |
| Peserta invalid di tengah daftar; atomisitas   | API tidak menyisakan row; RPC service-role nyata `tna_create_plan` gagal setelah parent INSERT dan transaksi mengembalikan 0:0. RPC update draft invalid juga mengembalikan plan/roster lama utuh                                 |
| Edit roster draft dan preview                  | Roster diganti penuh; preview peserta agent2 = 1/true, agent3 = 0/false; kolom baseline database tetap NULL                                                                                                                       |
| Versi basi                                     | PATCH 409 `TNA_PLAN_STALE`; rencana tidak berubah                                                                                                                                                                                 |
| QA sebelum aktivasi; drift                     | Findings 3 → 2 sebelum activate; baseline 2, drift findings -1. Skenario tambahan menghapus phantom-only audit: auditedAgents 5 → 4, drift auditedAgents -1                                                                       |
| Roster final dan target                        | Baseline peserta 0/false untuk roster clean/phantom dan 1/true, 2/true untuk roster terdampak; kedua target lebih buruk → 422; satu target lebih baik cukup untuk aktivasi                                                        |
| QA setelah aktivasi                            | Snapshot, roster baseline, dan narasi identik sebelum/sesudah perubahan QA                                                                                                                                                        |
| Edit setelah aktivasi                          | API 409 `TNA_PLAN_NOT_DRAFT`; direct admin update baseline peserta dan `peserta_id` ditolak `TNA_PARTICIPANTS_IMMUTABLE`                                                                                                          |
| UPDATE baseline via admin                      | Ditolak `TNA_BASELINE_IMMUTABLE`; snapshot tetap                                                                                                                                                                                  |
| Penyalahgunaan penanda SQL                     | UPDATE baseline yang sudah terisi, INSERT peserta, DELETE peserta dengan marker id aktif semuanya ditolak; marker id rencana lain yang benar-benar ada juga ditolak; setiap probe memverifikasi pesan trigger persis dan rollback |
| Marker kosong setelah SQL RPC                  | Dalam satu transaksi: set klaim service-role lokal, panggil `tna_activate_plan`, periksa `current_setting(...) IS DISTINCT FROM ''` dan SELECT setting sebelum rollback; assertion membuktikan string kosong                      |
| Nol → nol                                      | Temuan dibersihkan sambil audit tetap ada; preview `no_findings_both`, rate/spread 0, narasi sesuai; activate 422 `TNA_BASELINE_NO_FINDINGS`, baseline tetap NULL                                                                 |
| Audit nol                                      | Seluruh QA fixture layanan/periode dihapus; preview rates NULL dan narasi no_audit tanpa tingkat/sebaran nol; activate 422 `TNA_BASELINE_NO_AUDIT`                                                                                |
| Dua transisi paralel                           | `Promise.all(activate, cancel)` dengan revision yang sama: tepat [200,409], loser `TNA_PLAN_TRANSITION_CONFLICT`, status/snapshot/roster akhir sesuai winner                                                                      |
| Cancel                                         | Draft dan aktif dapat dibatalkan; aktif tetap membawa baseline; transisi ulang 409; create pengganti setelah cancelled berhasil                                                                                                   |
| Auth dan D9                                    | Semua endpoint T4: admin/trainer sukses sesuai kontrak, leader/agent 403, tanpa token 401. Narasi seluruh status tren, naik/turun/stabil, format 9,1/6,1, insufficientData, dan label draft dibuktikan via GET plan nyata         |

Probe marker SQL memakai pola berikut hanya untuk RPC, sesuai petunjuk Fajar; probe penyalahgunaan trigger tidak memasang klaim JWT:

```sql
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- public.tna_activate_plan(...) dengan baseline + roster dari preview API.
-- Di transaksi yang sama, current_setting('tna.activating_plan', true) = ''.
ROLLBACK;
```

## Verifikasi akhir

| Perintah                                                                                                        | Exit / hasil                                                                             |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project tna-real-backend` | **0, 29 passed**, diulang setelah perbaikan AppType                                      |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project gate-stub`        | **0, 24 passed**, diulang setelah perbaikan AppType                                      |
| `pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json`                                                        | **0**                                                                                    |
| `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.e2e.json`                                            | **0**                                                                                    |
| `pnpm --filter @trainers/web exec tsc --noEmit`                                                                 | **0**                                                                                    |
| `pnpm exec eslint src/routes/tna.ts src/services/tna/*.ts` (cwd apps/api)                                       | **0**                                                                                    |
| `pnpm --filter @trainers/web exec eslint e2e/tna-plan-api.spec.ts e2e/helpers/accessMatrix.ts`                  | **0**                                                                                    |
| `pnpm exec prettier --check` pada file T4 (perintah di bawah)                                                   | **0**                                                                                    |
| `git diff --check` + checks file baru dengan `git diff --no-index --check /dev/null <path>`                     | tracked **0**; no-index **1** (file baru), output whitespace kosong; wrapper check **0** |
| `graphify update .` (satu update/batch, dua batch termasuk perbaikan AppType)                                   | **0** pada kedua batch; cache AST final diperbarui, HTML dilewati (>5.000 node)          |
| `shasum -c /tmp/tna-t4-migration.sha`                                                                           | **0**, migration hash OK                                                                 |

```bash
pnpm exec prettier --check apps/api/src/routes/tna.ts apps/api/src/services/tna/{analysis,baseline,detail,errors,narrative,read-service,write-service}.ts packages/types/src/tna.ts apps/web/e2e/tna-plan-api.spec.ts apps/web/e2e/helpers/accessMatrix.ts docs/modules.md plans/markdown/tna-phase-1-t4-report.md
```

## Review dan batas verifikasi

`trainers-superapp-tdd` dibaca dari `.claude/skills/trainers-superapp-tdd/SKILL.md`. Skill Supabase dan `thermo-nuclear-code-quality-review` diterapkan. Graphify tidak mengenal simbol SQL `tna_activate_plan`; retry `loadTnaParameterContext` memberi hubungan drill-down/daftar/metrik, diverifikasi terhadap sumber hidup. Context7 via `mcporter` resolve Supabase lalu query `/websites/supabase` untuk named RPC args; [referensi resmi RPC](https://supabase.com/docs/reference/javascript/rpc).

Review scoped T4: semua mutasi hanya di write-service; pembacaan memakai JWT; payload baseline/actor tidak berasal dari body; formula/registry tidak diduplikasi; roster/revision divalidasi ulang atomik oleh RPC; tidak ada file >1.000 baris. Tidak ada temuan material tersisa. Simplifikasi review: analisis parameter bersama, reader need tanpa mengambil relasi plan untuk perhitungan baseline, null peserta ditangani eksplisit, null tren invalid gagal tertutup tanpa angka palsu.

Baseline berasal dari QA yang dibaca backend saat request aktivasi. Tidak mengklaim seluruh SELECT QA dan RPC merupakan satu transaksi DB yang mengunci QA; RPC mengunci versi rencana dan memeriksa roster final untuk menolak edit/transisi yang bertabrakan. `logActivity` mengikuti best-effort service existing, tidak satu transaksi dengan RPC.

Tidak ada STOP condition tersisa; seluruh skenario §7 telah dibuktikan secara lokal. Tidak ada skenario §7 yang diganti dengan mock atau test unit. Coverage browser/antarmuka TNA belum ada (T5). Root typecheck/lint/build dan gate integrasi T6 belum dijalankan pada sesi T4 ini. T5 belum dimulai; **laporkan dan berhenti sebelum T5**.

## Cleanup dan kesehatan backend lokal

Sesudah suite final: `tna_needs=0`, `tna_plans=0`, `tna_participants=0`, QA fixture=0, peserta fixture=0, aktivitas TNA=0, program nonaktif fixture=0. Seluruh count tetap nol setelah regresi final. Query read-only lokal:

```sql
SELECT 'tna_needs='||count(*) FROM tna_needs
UNION ALL SELECT 'tna_plans='||count(*) FROM tna_plans
UNION ALL SELECT 'tna_participants='||count(*) FROM tna_plan_participants
UNION ALL SELECT 'fixture_qa='||count(*) FROM qa_temuan
WHERE peserta_id IN (SELECT id FROM profiler_peserta WHERE batch_name LIKE 'tna-fixture-%')
UNION ALL SELECT 'fixture_profiles='||count(*) FROM profiler_peserta WHERE batch_name LIKE 'tna-fixture-%'
UNION ALL SELECT 'fixture_activity='||count(*) FROM activity_logs WHERE module='tna'
UNION ALL SELECT 'inactive_fixture_programs='||count(*) FROM tna_programs WHERE code LIKE 'tna-inactive-%';
```

Dijalankan melalui `docker exec supabase_db_trainerssuperappvite psql -U postgres -d postgres -Atc "<SQL di atas>"`. Log diperiksa dengan `docker logs supabase_db_trainerssuperappvite --since 30m`; jumlah match `signal 11` **0**. Spec akses existing juga memeriksa kesehatan DB setelah panggilan RPC klien yang ditolak. Tidak ada crash/PGRST001/PGRST000 yang ditemukan dalam suite.

## Tindak lanjut — isolasi rate limit harness (2026-10-08)

Lane C (regresi harness lintas lima spec); acuan tetap rev. 7 dan instruksi tindak lanjut Fajar. RED yang dilaporkan Fajar: full project **26 passed, 1 failed, 2 did not run**, respons **429** pada `tna-plan-api.spec.ts:632`; spec rencana sendiri lulus dengan 140 request. Bukti RED tersebut berasal dari verifikasi Fajar, bukan run RED baru di sesi perbaikan ini.

Penyebab diverifikasi pada sumber hidup: `rateLimitMiddleware` menggunakan satu store in-memory, key dari header `x-forwarded-for` atau `local`, dengan batas 200 request/60 detik. Semua spec berbagi worker/modul sehingga bucket `local` terakumulasi lintas tes.

Perubahan hanya harness:

- `apps/web/e2e/helpers/tnaApi.ts` membungkus `app.request`, menghasilkan IPv6 deterministik dari SHA-256 `test.info().testId`, lalu memasang `x-forwarded-for`. Seluruh request dalam satu tes tetap memakai bucket yang sama; tes lain memiliki bucket sendiri. Komentar singkat menjelaskan alasan isolasi.
- Kelima spec `tna-access`, `tna-metrics`, `tna-needs`, `tna-parameter-key`, dan `tna-plan` memakai helper, termasuk adapter SIDAK dan transport `hc<AppType>`. Header autentikasi, method, dan body dipertahankan, termasuk input berupa `Request`.
- Helper mencatat `[tna-api] response status=<status>` untuk setiap respons sehingga pemeriksaan 429 mencakup seluruh 215 request API per run. Tidak ada panggilan `app.request` langsung tersisa di spec TNA.

Limiter produk, batas 200/60 detik, guard/trigger, dan konfigurasi project tetap utuh. Tidak ada bypass `NODE_ENV=test`, project per file, retry, atau perubahan migrasi. Hash sebelum/sesudah untuk limiter, konfigurasi Playwright API, dan migrasi diverifikasi identik dengan `shasum -c /tmp/tna-harness-unchanged.sha` (exit 0).

Dua eksekusi berikut dijalankan **berturut-turut**, tanpa perubahan kode di antaranya; keduanya menggunakan konfigurasi existing (1 worker, retries 0) dan backend loopback nyata:

```bash
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project=tna-real-backend > /tmp/tna-t4-rate-limit-run-1.log 2>&1
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project=tna-real-backend > /tmp/tna-t4-rate-limit-run-2.log 2>&1
grep -cE '\[tna-api\] response status=429([[:space:]]|$)' /tmp/tna-t4-rate-limit-run-{1,2}.log
grep -cE '\[tna-api\] response status=[0-9]+' /tmp/tna-t4-rate-limit-run-{1,2}.log
```

| Bukti | Hasil                                                               |
| ----- | ------------------------------------------------------------------- |
| Run 1 | exit **0**, **29 passed (1.4m)**; 215 respons tercatat; **429 = 0** |
| Run 2 | exit **0**, **29 passed (1.5m)**; 215 respons tercatat; **429 = 0** |

`grep -c` untuk 429 menghasilkan `0` untuk kedua log; exit grep **1** berarti tidak ada match, sesuai hasil yang diharapkan. Kedua run lulus penuh tanpa skipped/did-not-run. Log mentah ada di `/tmp` dan tidak di-commit.

Typecheck E2E `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.e2e.json` lulus (exit 0). Final gate harness:

- `pnpm exec eslint e2e/helpers/tnaApi.ts e2e/tna-*-api.spec.ts` (cwd `apps/web`): exit **0**.
- `pnpm exec prettier --check apps/web/e2e/helpers/tnaApi.ts apps/web/e2e/tna-*-api.spec.ts plans/markdown/tna-phase-1-t4-report.md`: exit **0**.
- `git diff --check`: exit **0**; tujuh file harness/laporan yang belum tracked juga diperiksa dengan `git diff --no-index --check /dev/null <path>`: exit 1 karena file baru, output whitespace kosong, wrapper check exit **0**.
- `graphify update .`: exit **0**, AST/cache diperbarui satu kali setelah batch final. HTML dilewati karena graph >5.000 node; log `/tmp/tna-t4-harness-graphify.log`.

Review scoped: satu helper, tanpa duplikasi pembentukan IP di spec; identitas bucket stabil per tes; jalur Request maupun adapter mempertahankan payload/header; tidak ada perubahan runtime produk. Tidak ada temuan material tersisa. Graphify `explain rateLimitMiddleware` menunjukkan import dari `apps/api/src/app.ts`; penyebab dan seluruh caller dikonfirmasi lewat kode hidup/`rg`. Tidak menambahkan atau menjalankan test non-E2E. Tidak ada commit, push, deploy, atau migrasi. **T5 belum dimulai.**
