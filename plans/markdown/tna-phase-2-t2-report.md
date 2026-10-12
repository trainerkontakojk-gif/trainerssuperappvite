# TNA Fase 2 — Laporan T2

## Status dan scope

**T2 selesai untuk scope mesin evaluasi.** Lane **D**, rencana `tna-phase-2.md` rev. 2. Implementasi langsung oleh sesi Pi ini, tanpa worker/delegasi atau reviewer independen. T3–T6 tidak dimulai.

Prasyarat Git cocok: branch `feat/tna-phase-2`, log `0357846`, `ac12240`, `50d6317`, `842273e`; tiga commit lokal di atas main. Dirty awal `.impeccable/` dan `mockups/` tidak disentuh. Stack lokal memiliki migrasi `20261011130000`. Baseline sebelum perubahan dan setelah reset seed masing-masing **17/17**.

Tidak ada commit/push/deploy/remote, perubahan migrasi/rollback T1, `REVOKE EXECUTE`, UI, narasi, pemanggilan AI, unit test, atau dependency baru. Reset **lokal** kemudian disetujui eksplisit Fajar untuk scope seed terpisah di bawah. Stack pengguna tetap berjalan.

## File

### Mesin evaluasi T2

- `apps/api/src/services/tna/cohorts.ts`: filter anggota lalu memakai ulang `buildPeriodBucket`/`periodMetrics`. Pembanding adalah irisan agent non-peserta yang diaudit pada kedua periode. Ambang memakai `MIN_AUDITED_AGENTS` existing (5).
- `apps/api/src/services/tna/evaluation.ts`: populasi D1, kohort, delta rate skalar, verdict terhadap target tersimpan, drift populasi baseline vs snapshot beku, proyeksi per-peserta, opsi K9 kronologis dengan default pertama yang memiliki audit layanan.
- `apps/api/src/services/tna/analysis.ts`: mengembalikan bucket existing agar baseline/evaluasi tidak mengulang rumus D1.
- `apps/api/src/services/tna/baseline.ts`: proyeksi sesi per peserta dari bucket existing; payload RPC aktivasi existing membawa `baseline_sessions`.
- `apps/api/src/services/tna/read-service.ts`: detail status evaluasi memakai pratinjau live; selesai memakai snapshot/hasil peserta tersimpan tanpa membaca ulang QA; aktif/evaluasi membawa opsi periode.
- `packages/types/src/tna.ts`: schema snapshot/kohort/peserta/opsi, tipe response dan kolom nullable. UUID, finite number, count, enum, dan bentuk snapshot baru tetap fail-closed.
- `apps/web/e2e/tna-evaluation-metrics-api.spec.ts`: enam kasus self-contained, fixture UUID baru, end_date/start_date 31 Desember tahun sebelum fixture, due WIB hari ini. RPC T1 hanya dipakai untuk setup evaluasi dan verifikasi snapshot; tidak menambahkan route transisi T3.
- `apps/web/e2e/tna-plan-api.spec.ts`: assertion preview existing diperluas dengan sesi **exact** 12/5 dan 5/6 agar mengikuti field additive K12; assertion lama tidak dilonggarkan.

### Scope seed terpisah — disetujui Fajar

- `supabase/seeds/004_qa_periods.sql`: enam ID Januari–Juni 2024 menjadi `f1000000-0000-4000-8000-000000000001` sampai `...000006`.
- `supabase/seeds/006_qa_temuan.sql`: tujuh referensi periode mengikuti ID tersebut.

Mapping deterministik mempertahankan prefix dan suffix bulan; version nibble `4`, variant nibble `8`. Tidak mengubah tanggal, jumlah/baris temuan, indicator/peserta, nilai atau catatan seed. Ini koreksi seed lokal, **bukan migrasi data produksi**. `supabase db reset --local` mereplay migrasi dan seed yang diperbaiki; migrasi/rollback T1 tidak diubah. SQL akhir: **6 periode v4, 7 referensi, 0 ID periode invalid**, history T1 satu entri.

### Dokumentasi

- `plans/markdown/tna-phase-2.md`: status T2 dan kondisi branch terkini.
- Laporan ini: hitungan manual, RED/GREEN, seluruh gate dan gap.

## Blocker seed dan perbaikannya

Pada implementasi awal, opsi K9 membaca seluruh periode setelah end_date dan memasukkan enam seed `qa_periods` yang ID-nya memiliki version/variant nol. PostgreSQL menerima literal tersebut, tetapi `z.string().uuid()` menolaknya. GET detail aktif menghasilkan **503 TNA_UNAVAILABLE**. Instrumentasi sementara safeParse membuktikan enam issue `Invalid UUID` pada path opsi `[4..9, 'id']`; sudah dihapus.

Isolasi kalender fixture PR #51 tetap benar untuk metrik pembanding, tetapi tidak bisa menyembunyikan seed dari daftar opsi K9. Sesi berhenti dan meminta izin; Fajar menyetujui koreksi enam ID + tujuh referensi dan reset lokal. Setelah koreksi/reset, baseline **17/17** dan GET detail tidak lagi gagal karena seed. Tidak menyaring periode invalid, melonggarkan Zod, atau mengganti kalender fixture untuk memaksa hijau.

## Perhitungan manual fixture

Semua tuple berurutan `(agents, findings, sampledSessions, ratePer100, spreadPct)`. Agent normal memiliki lima sesi distinct kecuali drift peserta pertama (sepuluh). QA diberi lima temuan tetapi excluded, sehingga tidak masuk populasi/kohort. Tingkat dan sebaran dihitung oleh bucket D1 yang sama dengan metrics.ts; seluruh assertion numerik memakai equality exact, bukan toleransi.

| Kasus                 | Peserta baseline → evaluasi                                                                       | Pembanding baseline → evaluasi                                                 | Delta peserta / pembanding; net               | Populasi evaluasi / verdict                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cukup                 | `(5,10,25,40,100)` → `(5,5,25,20,100)`                                                            | `(5,5,25,20,100)` → sama                                                       | `-20 / 0; -20`                                | 10 agent, 10 findings, 50 sesi, rate 20, spread 100; target 20/100 → tercapai                                                                                           |
| Kecil + intersection  | peserta sama seperti cukup                                                                        | `(4,4,20,20,100)` → sama; baseline-only dan evaluation-only tidak masuk kohort | `-20 / 0; NULL`                               | agent eval-only menambah 5 findings: populasi 10 agent, 14 findings, 50 sesi, rate `(14 / 50) * 100`, spread 100; target 20/80 → tidak tercapai                         |
| Peserta tidak diaudit | `(5,10,25,40,100)` → `(4,4,20,20,100)`                                                            | `(5,5,25,20,100)` → sama                                                       | `-20 / 0; NULL` karena peserta evaluasi <5    | 9 agent, 9 findings, 45 sesi, rate 20, spread 100; target 20/80 → tercapai sebagian. Peserta absen: eval findings/sessions NULL, audited false                          |
| no_audit              | `(5,10,25,40,100)` → `(0,0,0,NULL,NULL)`                                                          | irisan kosong: `(0,0,0,NULL,NULL)` → sama                                      | `NULL / NULL; NULL`                           | 0 agent/findings/sesi, rate/spread NULL, insufficient true; verdict NULL                                                                                                |
| Drift                 | tambah 5 sesi/temuan peserta pertama: `(5,15,30,50,100)` → `(5,5,25,20,100)`                      | 5 agent tetap; agent baseline-only tambahan tidak masuk                        | `-30 / 0; -30`                                | eval tetap rate 20/spread 100 → tercapai. Drift populasi +6 findings/+1 agent. Frozen findings peserta pertama tetap 2, sesi legacy dihitung ulang 10, label recomputed |
| Phantom               | baseline `(5,10,25,40,100)`; mixed padding tidak mengubah angka; lalu peserta kelima phantom-only | pembanding `(5,5,25,20,100)` tetap                                             | peserta eval `(5,4,25,16,80)`; `-24 / 0; -24` | 10 agent, 9 findings, 50 sesi, rate 18, spread 90; phantom-only diaudit, findings 0, sesi 5                                                                             |

JavaScript menghasilkan `(14 / 50) * 100 = 28.000000000000004`. Expected awal literal 28 gagal; diperbaiki menjadi ekspresi manual identik, **bukan** pembulatan produk atau assertion approximate. Presisi penuh D1 dipertahankan.

Drift meniru aktivasi legacy dengan RPC kompatibel yang **menghilangkan** field sesi; tidak mengedit baseline immutable. Hasil live menandai sesi dihitung ulang. Setelah selesai, SQL T1 tidak menyimpan sesi baseline legacy yang dihitung ulang; hasil beku mengembalikan `baseline_sessions: null`, source `unavailable`, bukan klaim `recomputed` yang palsu. Perubahan QA sesudah selesai tidak mengubah snapshot ataupun proyeksi peserta beku. Untuk rencana baru, sesi baseline benar-benar disimpan oleh aktivasi API.

## RED → GREEN dan review repair

1. RED awal setup gagal FK `profiler_peserta.batch_name`; **bukan RED kontrak**. Fixture diperbaiki agar pembanding memakai folder milik namespace sendiri.
2. RED kontrak sebelum implementasi: **6 failed**, opsi evaluasi belum tersedia (`red-contract.log`).
3. Implementasi awal: **6 failed**, blocker UUID seed (`green-initial.log`, nama bukan klaim GREEN).
4. Sesudah koreksi seed/reset: **5 passed, 1 failed** pada expected floating-point literal 28 (`green-after-seed.log`). Expected diselaraskan dengan operasi exact D1; kemudian **6 passed** (`green-1.log`).
5. Self-review menemukan label `recomputed` pada hasil beku legacy dengan sesi NULL. Spec drift diperluas RED-first: gagal label (`legacy-source-red.log`), kemudian label `unavailable` dan hasil beku yang tidak berubah lulus (`legacy-source-green.log`).
6. Regresi plan awal gagal bentuk preview karena field sesi additive. Assertion exact diperluas, bukan diganti objectContaining atau dihapus. Regresi sisanya lulus kecuali pembatalan aktif yang memang menunggu T3.
7. Versi final T2 **6/6 dua kali berturut-turut**, dan enam `--grep` tunggal masing-masing **1 passed**.

## Perintah, exit code, dan log

Direktori bukti: `.pi/orchestrator/tna-phase-2/t2-evidence/` (lokal/ignored). Semua runner serial, worker 1, retry 0; `playwright.api.config.ts` tanpa webServer, helper loopback fail-closed. Prefix **PW** berarti `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend`.

| Perintah                                                                                                                                                       | Exit            | Hasil / log                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git branch --show-current; git log --oneline -4; git status --short; git log main..HEAD --oneline`                                                            | 0               | Prasyarat cocok                                                                                                                                                                                    |
| SQL lokal history migrasi `20261011130000`                                                                                                                     | 0               | Versi ditemukan                                                                                                                                                                                    |
| **PW** `tna-access-api.spec.ts tna-evaluation-db-api.spec.ts tna-metrics-api.spec.ts --workers=1` sebelum seed fix                                             | 0               | **17 passed**, `baseline.log`                                                                                                                                                                      |
| **PW** `tna-evaluation-metrics-api.spec.ts --workers=1` (awal fixture / RED kontrak / implementasi awal)                                                       | 1 masing-masing | `red.log` (FK setup), `red-contract.log` (6 failed), `green-initial.log` (6 failed)                                                                                                                |
| **PW** `tna-evaluation-metrics-api.spec.ts --grep 'comparison sufficient' --workers=1` saat diagnostik seed                                                    | 1               | **1 failed**, enam UUID issues, `options-seed-diagnostic.log`                                                                                                                                      |
| `supabase db reset --local`                                                                                                                                    | 0               | Reset/replay/seed lokal yang disetujui, `seed-local-reset.log`                                                                                                                                     |
| **PW** `tna-access-api.spec.ts tna-evaluation-db-api.spec.ts tna-metrics-api.spec.ts --workers=1` setelah reset                                                | 0               | **17 passed**, `baseline-after-seed.log`                                                                                                                                                           |
| **PW** `tna-evaluation-metrics-api.spec.ts --workers=1` setelah seed fix                                                                                       | 1, lalu 0       | **5 passed/1 failed** floating point, lalu **6 passed**; `green-after-seed.log`, `green-1.log`                                                                                                     |
| **PW** `tna-evaluation-metrics-api.spec.ts --grep 'baseline drift' --workers=1`                                                                                | 1, lalu 0       | Label legacy RED→GREEN, `legacy-source-{red,green}.log`                                                                                                                                            |
| **PW** `tna-evaluation-metrics-api.spec.ts --workers=1` final, dua run berturut-turut                                                                          | 0, 0            | **6 passed**, **6 passed**, `final-green-{1,2}.log`                                                                                                                                                |
| **PW** `tna-evaluation-metrics-api.spec.ts --grep '<pattern>' --workers=1`                                                                                     | 0 × 6           | Pattern berurutan: `comparison sufficient`, `comparison small`, `participant not audited`, `evaluation no_audit`, `baseline drift`, `phantom batch`; `grep-{1..6}.log`, masing-masing **1 passed** |
| **PW** `tna-access-api.spec.ts tna-evaluation-db-api.spec.ts tna-metrics-api.spec.ts tna-needs-api.spec.ts tna-parameter-key-api.spec.ts --workers=1`          | 0               | **23 passed**, `regression-final.log`                                                                                                                                                              |
| **PW** `tna-plan-api.spec.ts --workers=1` awal                                                                                                                 | 1               | Additive preview assertion, `plan-regression.log`                                                                                                                                                  |
| **PW** `tna-plan-api.spec.ts --workers=1` setelah preview assertion diperluas                                                                                  | 1               | **6 passed/1 failed/5 tidak jalan**, active cancel, `plan-regression-final.log`                                                                                                                    |
| **PW** `tna-plan-api.spec.ts --grep-invert 'target validation, cancellation and simultaneous activate/cancel' --workers=1`                                     | 1               | **6 passed/1 failed/4 tidak jalan**, active cancel pada tes akses, `plan-without-known-t3.log`                                                                                                     |
| **PW** `tna-plan-api.spec.ts --grep-invert 'target validation, cancellation and simultaneous activate/cancel\|plan endpoints admit admin/trainer' --workers=1` | 0               | **10 passed**, `plan-non-cancellation.log`                                                                                                                                                         |
| `pnpm typecheck --concurrency=1 --cache=local:rw`                                                                                                              | 0               | 4 workspace, termasuk E2E web, `typecheck.log`                                                                                                                                                     |
| `pnpm lint --concurrency=1 --cache=local:rw`                                                                                                                   | 0               | 0 error; 8 API + 90 web warning pada file di luar perubahan, `lint.log`                                                                                                                            |
| `pnpm build --concurrency=1 --cache=local:rw`                                                                                                                  | 0               | 3 workspace build, `build.log`; warning native Vite `__dirname` pada config existing                                                                                                               |
| `GRAPHIFY_MAX_WORKERS=1 graphify update .`                                                                                                                     | 0               | Satu update serial, AST tanpa LLM, `graphify-update.log`; HTML viz dilewati karena graph >5000 node, bukan kegagalan update                                                                        |
| SQL lokal seed/cleanup/history                                                                                                                                 | 0               | `final-cleanup.log`: 6 ID periode v4, 7 referensi, 0 invalid ID periode, 0 user E2E, 0 needs/plans/participants, history T1=1                                                                      |
| `git diff --exit-code -- supabase/migrations/20261011130000_tna_phase2_evaluation.sql supabase/rollbacks/rollback_20261011130000_tna_phase2_evaluation.sql`    | 0               | Migrasi/rollback T1 tidak berubah                                                                                                                                                                  |
| Scoped Prettier check dan `git diff --check`                                                                                                                   | 0               | File TS/laporan diformat; file untracked task-owned juga dicek via `git diff --no-index --check`                                                                                                   |

Run pertama perintah regresi 23 tes terkena **timeout tool 120 detik** setelah 18 tes lulus, bukan exit 0/1 runner atau assertion failure (`regression.log`). Proses sudah keluar sebelum retry. Namespace task-owned `da5e8997-e749-4e6d-b4c2-8cf99fd51724` diidentifikasi dari user ID dalam log, lalu dibersihkan melalui `pnpm exec tsx -e` yang memanggil helper `createTnaFixture(namespace).cleanup()` setelah menghapus dependensi TNA namespace tersebut dan akun leader/agent exact-ID. Cleanup exit 0. Retry memakai timeout tool 300 detik, selesai **23/23**. Tidak mereset DB lagi atau menghapus data lain.

### Dua kegagalan plan yang diterima hanya karena menunggu T3

- `tna-plan-api.spec.ts:467`, **target validation, cancellation and simultaneous activate/cancel preserve consistent final state**: baris 509, pembatalan plan aktif tanpa alasan, expected 200 tetapi 503.
- `tna-plan-api.spec.ts:542`, **plan endpoints admit admin/trainer, reject other roles and validate identities/body**: baris 607, pembatalan plan yang baru diaktifkan tanpa alasan, expected 200 tetapi 503.

Keduanya memakai jalur cancel tiga argumen existing, sedangkan SQL T1 menolak pembatalan aktif tanpa alasan (`TNA_CANCEL_REASON_REQUIRED`). T3 memiliki overload empat argumen + error mapping final. Tidak mengubah assertion cancellation, menambahkan route T3, atau mengklaim seluruh suite plan hijau. Sepuluh tes plan non-cancellation terverifikasi hijau setelah kedua kasus dikecualikan eksplisit dalam perintah saja.

## Thermo-nuclear — self-review

**Verdict: PASS untuk scope T2; bukan PASS integrasi/rilis Fase 2.** Diff, file baru, caller aktivasi/read service, bucket metrics/scoring, schema SQL T1, dan test dibaca/ditelusuri langsung. Tidak ada reviewer independen atau klaim persentase coverage.

Temuan material seed UUID, additive preview assertion, dan label legacy beku diperbaiki dengan bukti di atas. Tidak ada P0/P1 baru yang belum ditangani pada scope T2.

- Rumus D1/SIDAK tidak diubah; cohort/session projection memfilter anggota lalu memanggil bucket existing. Phantom-only tetap audit presence; mixed phantom tidak menambah sesi; QA tetap excluded; paginasi/DataScope existing dipakai.
- Pembanding fixed-membership pada kedua bulan; delta skalar signed; net NULL bila peserta/pembanding baseline atau evaluasi <5. Snapshot exact diterima `tna_complete_plan` T1 tanpa perubahan migrasi.
- No-audit bukan angka nol: rate/spread/verdict NULL, peserta absen eval values NULL. Sesi 0 yang benar-benar dibekukan tidak diganti fallback (`??`, bukan `||`).
- Baseline peserta dan baseline_snapshot tetap beku; kohort baseline hitung ulang diberi drift, tidak mempengaruhi target tersimpan. Selesai membaca hasil beku tanpa query QA ulang.
- Backend read memakai JWT/RLS pengguna; admin service-role hanya boundary RPC mutasi existing dan fixture E2E lokal. Tidak menambah AI, unit suite, dependencies, fallbacks, atau secrets/logging mentah.
- Field tambahan interface TS dibuat optional untuk kompatibilitas consumer/fixture UI Fase 1 yang belum diperluas T5; schema runtime kolom DB dan snapshot tetap wajib/fail-closed. Root typecheck termasuk E2E lulus tanpa edit UI.
- Pemilihan opsi periode menggunakan fetch serial tiap periode; tidak memperkenalkan cache/arsitektur baru. Optimasi kalender besar dapat dipertimbangkan terpisah jika diperlukan, bukan mengubah semantik K9.
- Gap aktif-cancel T3 tetap eksplisit. Dokumentasi kanonik API/UI Fase 2 lengkap tetap milik T6 sesuai rencana; laporan dan status task ini diperbarui sekarang.

STATUS: T2 COMPLETE — mesin evaluasi dan scope seed terpisah terverifikasi lokal; T3–T6 belum dimulai.
VERIFIED: Baseline 17/17 setelah reset; T2 6/6 dua kali + enam grep tunggal; regresi wajib 23/23; 10 plan non-cancellation; root typecheck/lint/build, format/diff-check, satu Graphify update; cleanup nol; SQL T1 tidak berubah.
JUDGMENT CALLS: Seed v4 deterministik terpisah sesuai izin; equality floating-point mengikuti D1 exact; preview no-audit verdict NULL; legacy selesai tanpa sesi tersimpan ditandai unavailable, tidak dihitung ulang; tipe tambahan optional hanya untuk kompatibilitas consumer lama.
GAPS: Dua tes plan gagal hanya pada active cancel tanpa alasan menunggu T3; suite plan penuh dan integrasi/rilis Fase 2 belum PASS. Tidak ada commit/push/remote/deploy.
