# Phase 216 (TODO) — Sisa Pekerjaan Telefun In-Process Scoring Worker

**Tanggal:** 2026-09-07
**Sumber:** Audit Codex (`gpt-5.6-sol`, reasoning `medium`, read-only, exit 0) atas plan `.hermes/plans/2026-09-04_143851-telefun-inprocess-scoring-worker.md` (Task 1–8) vs working tree `main` yang belum di-commit + verifikasi independen Moy.
**Catatan model:** `gpt-5.4` ditolak akun ChatGPT (`The 'gpt-5.4' model is not supported when using Codex with a ChatGPT account`), jadi audit dijalankan dengan `gpt-5.6-sol` + effort `medium` sesuai permintaan Fajar.
**Verdict awal audit (snapshot historis):** BELUM CUKUP — jangan commit atau rollout sebelum regression migration Phase 4 dan invariant lease 300 diperbaiki.

**Rekonsiliasi eksekusi 2026-09-07:** Gap TypeScript pada abort admission, shutdown
cleanup, lease helper, adapter standalone, dan observability embedded sudah ditutup
di working tree. SQL concurrency/rollback evidence tetap menjadi pekerjaan DB,
dan rollout production tetap **BELUM TERBUKTI**; tidak ada klaim hosted migration,
Railway deployment, queue drain, atau paid provider smoke dari perubahan ini.

## Rekonsiliasi akhir verifikasi lokal (2026-09-08)

Status implementasi lokal: **PASS untuk gate kode dan bukti disposable DB; rollout
hosted tetap BELUM TERBUKTI**.

- Gap TypeScript yang dicatat audit awal sudah ditutup: abort admission,
  shutdown cleanup, lease floor 300, adapter standalone, dan observability
  embedded memiliki implementasi serta regression evidence.
- Migration/rollback fencing dan concurrency proof disposable PostgreSQL lulus
  8/8; guard Phase 4, claim token, stale-token rejection, lock rollback, dan
  legacy round-trip sudah diuji lokal. Ini bukan hosted schema parity.
- Focused scoring suite 11 file lulus 182 test setelah final route-test cleanup.
  Follow-up route
  `telefun-routes.test.ts` lulus 19/19 setelah assertion Gemini aktif dipisah
  dari describe historis dan mock `telefun-analysis` dibuat partial. Case itu
  membuktikan response `ANALYSIS_ERROR` serta hash token claim yang sama pada
  `fail_telefun_scoring`.
- Gate root lokal lulus: `pnpm typecheck`, `pnpm test:affected`, `pnpm lint`,
  `pnpm test:core` (491 test), `pnpm build` (3/3 task), dan `git diff --check`.
  Detail command dan log ada di `root-verification.md`.
- Graphify diperbarui sekali untuk batch implementasi dan sekali lagi pada
  2026-09-08 untuk follow-up test-only; hasil kedua dicatat di
  `.superpowers/sdd/2026-09-07-telefun-inprocess-scoring-worker-gap-plan/integration-report.md`.

Temuan `[BLOCKER]` dan `[PENTING]` di bawah mempertahankan jejak audit awal;
temuan tentang guard Phase 4, lease override, cache-before-claim, rollback
active claim, dan process ownership sudah tidak menjadi blocker lokal setelah
perbaikan dan bukti di atas. Full suite/CI, hosted migration/readback, deploy
artifact parity, queue drain/retry, retirement service Railway lama, dan paid
provider smoke masih pending.

### Yang sudah diperbaiki pada batch TS

- `AbortSignal` diteruskan dari scoring service ke `analyzeVoiceQuality()` dan
  diperiksa setelah state read, storage download, audio preparation, dan tepat
  sebelum provider admission.
- Runtime menunggu poll/claim yang sudah berjalan, membatalkan timer miliknya,
  dan memakai satu token-fenced release untuk active claim saat abort-settled atau
  deadline. Claim RPC yang tidak settle sampai lease deadline dicatat sebagai
  recovery deferred.
- Lease helper memakai konstanta service bersama dan menolak nilai nonfinite,
  noninteger, atau `<300` sebelum RPC. Runtime parser juga memakai konstanta yang
  sama.
- Adapter standalone (`main`, signal handlers, health server, auto-entrypoint)
  dipindah ke `telefun-scoring-worker-entrypoint.ts`; API embedded path hanya
  memakai runtime reusable. Startup dan transisi polling error/recovery log hanya
  field bounded.

### Bukti lokal yang benar-benar dijalankan pada audit awal

- RED: service + runtime regression command exit 1 dengan 5 expected failures;
  detail command/output ada di `.superpowers/sdd/2026-09-07-telefun-inprocess-scoring-worker-gap-plan/ts-report.md`.
- GREEN focused: 7 API test files / 100 tests PASS, exit 0.
- API TypeScript: `pnpm --filter @trainers/api exec tsc --noEmit -p tsconfig.json`
  PASS, exit 0.

### Gap dan gate yang masih terbuka pada audit awal

- SQL migration round-trip, two-connection claim race, stale-token writes, dan
  rollback readback belum dijalankan; DB agent memiliki test fencing/integration.
- Root Lane D gates, hosted artifact parity, queue drain/retry evidence, service
  scale-to-zero, dan production usage/billing evidence belum dijalankan.

## Ringkasan Audit Awal (snapshot historis)

Pada saat audit awal, fondasi embedded worker dan token fencing sudah ada,
tetapi implementasi belum memenuhi seluruh kontrak plan. Blocker migration,
lease, dan gate yang disebut dalam paragraf ini sudah direkonsiliasi pada
bagian verifikasi akhir di atas; paragraf ini dipertahankan sebagai sejarah,
bukan status live.

## Status per Task — snapshot audit awal (superseded locally)

Tabel berikut mempertahankan status ketika audit pertama dibuat. Status live
setelah perbaikan dan root gates dicatat pada bagian rekonsiliasi akhir.

| Task | Status | Bukti |
|---|---|---|
| Task 1 — RED lifecycle tests | DONE | `apps/api/src/__tests__/api-runtime.test.ts:55-98` (enabled/disabled/invalid); `:127-143` (shutdown worker lalu HTTP tepat sekali, dua signal). Riwayat RED tak terbukti dari working tree. |
| Task 2 — Embedded lifecycle | SEBAGIAN | `apps/api/src/api-runtime.ts:49-73` validasi env + start sekali; `:82-108` shutdown worker dulu baru HTTP. Namun runtime masih memuat `main()`, `process.exit`, signal handler, health server (`telefun-scoring-worker-runtime.ts:392-400,619-691`). |
| Task 3 — RED lease/fencing tests | SEBAGIAN | Test baru `telefun-scoring-claim-fencing.test.ts:60-181`, tapi stale-race/fencing hanya regex SQL (`:134-165`), bukan eksekusi dua claimant. Empat file test wajib tak tersentuh. |
| Task 4 — Timeout/fencing migration | SEBAGIAN | UUID+SHA-256 di `telefun-scoring-service.ts:38-43`; token ke RPC di `:118-148,169-261`; SQL filter status+hash (migration `:197-275`); grant+reload schema `:277-293`. Tapi timeout bisa di-override via env dan guard Phase 4 hilang. |
| Task 5 — Centralized persistence | SEBAGIAN | `analyzeVoiceQuality()` murni baca/provider/parse (`telefun-analysis.ts:57-278`). Route manual pakai `completeScoringAssessment()`/`failScoringJob()` (`recordings.ts:744-785,919-925`); worker pakai helper sama (`telefun-scoring-service.ts:364-422`). Regression suite kontrak tak diperbarui/dijalankan ulang. |
| Task 6 — Duplicate billing/completion sweep | SEBAGIAN | Fencing menolak stale persistence; shutdown aktif teruskan token (`telefun-scoring-worker-runtime.ts:521-568`). Tanpa assertion `logAiUsage()` stale loser; cache dicek setelah claim (`telefun-scoring-worker.ts:92-115`); celah shutdown setelah claim sebelum job aktif tercatat. |
| Task 7 — Docs/rollout | SEBAGIAN | Ownership+env di `docs/telefun.md:55-80`, `docs/deployment.md:172-238`. Instruksi standalone health masih ada (`docs/deployment.md:128-170`); checklist production salah nama kolom/status. |
| Task 8 — Final verification | BELUM | `tsc --noEmit` lulus exit 0; `git diff --check` lulus. Focused Vitest gagal jalan di sandbox read-only (`EPERM` tulis `.vite-temp`); lint, build, `test:core`, full/CI, production proof belum ada. |

## Temuan Audit Awal (retained for history)

### [BLOCKER] Migration fencing menghapus guard durable-lifecycle Phase 4

`supabase/migrations/20260904150000_telefun_scoring_claim_fencing.sql:38-66,91-117,197-219` — `claim_telefun_scoring` baru tak memeriksa transport, status sesi, `scoring_ready_at`, atau owned seekable path; completion hanya satu `UPDATE` tanpa `FOR UPDATE`. Phase 4 (`20260801120000_..._phase4_durable_lifecycle.sql:1144-1217,1220-1279`) melakukan row lock + WebRTC readiness/path validation. Dampak: service-role caller atau race readiness bisa klaim/selesaikan row WebRTC yang seharusnya ditolak; migration tidak additive secara perilaku.

### [BLOCKER] Lease 300 bukan konstanta wajib

`apps/api/src/workers/telefun-scoring-worker-runtime.ts:60,160-170,452-457` — runtime menerima integer positif apa pun dari `TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS` lalu teruskan ke `claimJob()`. Test aktif masih memakai/menerima `120` (`telefun-scoring-worker-runtime.test.ts:32-48,180-191`); test "no literal 120" hanya memindai service+route (`telefun-scoring-claim-fencing.test.ts:102-110`). Dengan env `120`, job Gemini 180 dtk bisa di-reclaim → provider call kedua → masing-masing call mencatat `logAiUsage()` (`gemini.ts:156-181`).

### [PENTING] Cache & shutdown dicek setelah claim tanpa release

`apps/api/src/workers/telefun-scoring-worker.ts:92-117` — worker klaim dulu baru `checkCachedAssessment()`. Cache hit keluar tanpa complete/reschedule/release; signal di `:106-107`/`:117` berhenti setelah claim tanpa release. Runtime baru mencatat `activeJob` saat `processScoringJob()` mulai (`telefun-scoring-worker-runtime.ts:458-467`), jadi shutdown (`:521-568`) buta terhadap claim di jendela itu. Test cache lama juga klaim dulu (`telefun-scoring-worker-integration.test.ts:241-269`) — berlawanan dengan syarat short-circuit sebelum claim/provider.

### [PENTING] Rollback tak menjaga active tokenized claims

`supabase/rollbacks/rollback_20260904150000_telefun_scoring_claim_fencing.sql:5-13` — rollback langsung menghapus overload tokenized, index, kolom fencing. Larangan di komentar `:1-3` tak ditegakkan SQL; salah operator saat claim aktif menghilangkan metadata fencing.

### [PENTING] Bukti concurrency/fencing hanya inspeksi teks

`apps/api/src/__tests__/telefun-scoring-claim-fencing.test.ts:134-181` — tak menjalankan migration/dua transaksi paralel, hanya regex. `telefun-scoring-migration-contracts.test.ts:125-143,413-434` hanya memasukkan migration baru ke allowlist redefinisi RPC. File wajib plan yang tak tersentuh (gap nyata kecuali routing): `telefun-scoring-service.test.ts` (assert token fail/reschedule + default lease), `telefun-scoring-worker-integration.test.ts` (cache-before-claim, two-worker race, post-claim shutdown), `telefun-routes.test.ts` (kontrak respons publik), `telefun-scoring-routing.test.ts` (sebagian — perlu bila buktikan tanpa provider/usage kedua).

### [PENTING] Process ownership standalone belum dipisah

`apps/api/src/workers/telefun-scoring-worker-runtime.ts:392-400,619-691` — file masih bisa jadi entrypoint standalone (dua signal handler, `process.exit`, health server kedua). API embedded path sendiri bersih (`api-runtime.ts:102-108`), tapi Task 2 menuntut reusable runtime bebas process ownership.

### [PENTING] Docs rollout kontradiktif + bukti DB mustahil

`docs/deployment.md:128-170,215-235` — instruksi standalone health belum dihapus. Checklist minta completed row punya `scoring_claim_token_hash` terisi (`:229-230`), padahal completion membersihkannya (migration `:209-215`); menyebut `scoring_attempts` (`:231`), kolom aktual `scoring_attempt_count`. Klaim rebuild-log phase-215 ("implementasi lokal selesai", "additive") tidak akurat.

### [RINGAN] Raw DB error masih bisa ke klien (pre-existing)

`apps/api/src/routes/telefun/recordings.ts:1010-1017` — endpoint coaching-summary mengembalikan `error?.message`. Jalur `/score/:id` yang diubah sudah bounded.

## Sisa Pekerjaan dan Checklist Rollout

### Wajib sebelum commit

> **Rekonsiliasi 2026-09-08:** catatan blocker commit di bawah adalah snapshot
> sebelum gate root dan follow-up route test selesai. Implementasi lokal sekarang
> memiliki bukti token failure route, seluruh gate Lane D lokal lulus, dan status
> hosted/CI tetap pending seperti bagian verifikasi akhir.

- [x] `supabase/migrations/20260904150000_telefun_scoring_claim_fencing.sql` — gabungkan token fencing dengan seluruh `FOR UPDATE`, transport, status, readiness, dan exact owned-path guard Phase 4; contract test harus gagal bila satu guard hilang.
  - DONE 2026-09-07: migration memuat `FOR UPDATE` + guard WebRTC di claim tokenized/legacy dan complete tokenized/legacy; `telefun-scoring-claim-fencing.test.ts` Phase-4 section (4 tests) PASS.
- [x] `apps/api/src/workers/telefun-scoring-worker-runtime.ts` + `telefun-scoring-service.ts` — satu `TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS`; env eksplisit di bawah 300 ditolak atau claim selalu 300. `rg` jalur aktif tak boleh temukan lease `120`.
  - DONE 2026-09-07: `TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS_MIN = 300`, parse menolak `<300`; `VALID_ENV`/`CONFIG`/expectation di runtime test diupdate `120→300`, passthrough test `42→305`; `rg` src claim paths bersih (sisa `120` di test hanya `12000ms` age + RED-reject list `["1","120","180","299"]`).
- [x] `apps/api/src/workers/telefun-scoring-worker.ts` + runtime — short-circuit completed cache sebelum claim; release tokenized claim bila shutdown terjadi setelah claim tapi sebelum provider admission.
  - DONE 2026-09-07: `checkCachedAssessment` dipindah SEBELUM `claimJob`; `ScoringWorkerDeps.releaseClaim?` ditambahkan dan di-wire dari `boundary.releaseClaim`; abort pasca-claim memanggil release fenced + `break`. RED 2 gagal → GREEN 12/12 integration.
- [x] `supabase/rollbacks/rollback_20260904150000_telefun_scoring_claim_fencing.sql` — guard fail-closed: batalkan rollback bila ada row `processing` bertoken hash.
  - DONE 2026-09-07: `DO $$` block menghitung `processing + token NOT NULL` dan `RAISE EXCEPTION ERRCODE 55000`; contract test rollback section PASS 16/16 fencing.
- [x] `telefun-scoring-service.test.ts`, `telefun-scoring-worker-integration.test.ts`, `telefun-scoring-routing.test.ts`, `telefun-routes.test.ts` — bukti token pada complete/fail/reschedule, cache-before-claim/provider, stale loser tanpa usage tambahan, race dua claimant, respons route identik.
  - DONE lokal 2026-09-08: cache-before-claim + release-after-claim + token-threading terbukti (integration 12/12, fencing 16/16); route failure aktif Gemini menegaskan hash token yang sama pada claim/fail (19/19). Two-claimant SQL race dan stale-token writes terbukti pada disposable PostgreSQL 8/8; provider billing yang sudah dimulai tetap merupakan batas runtime, bukan klaim exactly-once.
- [x] `telefun-scoring-worker-runtime.ts` — pisahkan entrypoint standalone/health dari reusable embedded runtime, atau buktikan via test import bahwa API path tak bisa aktifkan process handler/health kedua.
  - DONE 2026-09-07 via opsi kedua: `process separation` test ditulis ulang — `index.ts` wajib via `startApiRuntime` tanpa import worker langsung; `api-runtime` + embedded section terbukti bebas `process.exit(`/`process.on(`/`startHealthServer(`. 29/29 runtime PASS.
- [x] `docs/deployment.md`, `docs/telefun.md`, phase-215 rebuild-log — hapus instruksi standalone health aktif; koreksi `scoring_attempt_count`; ekspektasi token `NULL` setelah completion; ubah status "selesai" sampai blocker tertutup.
  - DONE 2026-09-07 parsial docs: checklist queue-drain dikoreksi token `NULL` setelah completion; `scoring_attempts→scoring_attempt_count`. Standalone section dipertahankan sebagai deprecated fallback (sesuai Risks plan: keep during overlap) — bukan instruksi aktif. Phase-215 tidak diubah (historis; klaimnya kini akurat setelah guard fix).
- [x] Jalankan focused Vitest Task 8 di environment writable; kriteria: semua file plan lolos, `tsc --noEmit` + `git diff --check` exit 0.
  - DONE lokal 2026-09-08: 11 file / 182 tests PASS; route follow-up 19/19; root typecheck, affected, lint, core 491 tests, build 3/3 task, dan `git diff --check` exit 0.

### Wajib sebelum production

- [x] Local Lane D gates: `pnpm typecheck`, `pnpm lint`, `pnpm test:core`, `pnpm build`, dan `git diff --check` — semua exit 0; `test:core` 491 test dan build 3/3 task.
- [ ] Full-suite/CI pre-merge/release gate.
- [ ] Apply migration ke project Supabase yang benar + hosted readback (kolom, semua overload, grants, readiness guards, schema cache).
- [ ] Standalone Railway worker sudah fencing-compatible lease 300 atau dinonaktifkan sebelum embedded worker aktif; tanpa overlap instance lease 120.
- [ ] Catat deploy SHA + bukti DB/log: single claim, stale-token rejection, retry/backoff, queue drain, satu usage record per provider call, token/owner dibersihkan setelah completion.

### Disarankan

- [ ] `apps/api/src/routes/telefun/recordings.ts:1010-1017` — ganti raw DB message dengan kode+pesan publik bounded; detail hanya log server-side.
- [ ] `telefun-scoring-service.ts` — jadikan `claimTokenHash` wajib di semua mutation helper baru agar TypeScript mencegah panggilan RPC tokenized dengan `null`.

## Verifikasi independen Moy (2026-09-07)

- `tsc --noEmit` (binary langsung): **PASS exit 0**.
- `grep -rn "120"` di service/worker/route/api-runtime claim paths: **bersih, tanpa literal 120**.
- `scripts/test-fast.json`: hanya +1 baris (claim-fencing test terdaftar). `docs/database.md`: hanya +1 baris row migration.
- Migration UTUH dibaca manual: overload tokenized + wrapper legacy (default 300) + `REVOKE`/`GRANT service_role` + `NOTIFY pgrst` — struktur sesuai klaim, TAPI temuan BLOCKER Codex soal guard Phase 4 & lease override tetap berlaku (Moy tak membatalkan temuan itu).
- Error `server_error ... model failed to generate a response` sempat muncul saat audit berjalan (transient di sisi Codex); run final selesai `exit 0`.
