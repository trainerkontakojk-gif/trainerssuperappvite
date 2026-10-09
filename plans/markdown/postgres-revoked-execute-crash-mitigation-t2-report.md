# Postgres Revoked-EXECUTE Crash Mitigation — T2 Report

## Status

**T2 selesai; berhenti sebelum T3.** Lane D, branch `fix/postgres-revoked-execute-guard`, rencana disetujui `plans/markdown/postgres-revoked-execute-crash-mitigation.md`. Draft thread sebelumnya direview terhadap katalog lokal terbaru sebelum diterapkan. Skill `trainers-superapp-tdd` dan `thermo-nuclear` dimuat.

Tidak ada produksi, Supabase MCP, unit test, commit/push, blanket migration-up/reset, perubahan image/extension, atau dev server baru. Hanya `apps/api/.env.integration`; hostname DB/API diverifikasi tepat `127.0.0.1`. Port DB dan `pg_control_system().system_identifier` dicocokkan dengan container `supabase_db_trainerssuperappvite`.

## Files

- `supabase/migrations/20261008150000_guard_exposed_service_role_functions.sql`: D2, 34 Group A, Q3, GRANT dan self-check Group A/`app_internal` saja.
- `supabase/rollbacks/rollback_20261008150000_guard_exposed_service_role_functions.sql`: snapshot definisi/ACL pra-T2; warning bahwa rollback mengembalikan crash exposure. **Tidak dijalankan.**
- `apps/web/e2e/exposed-function-guard-api.spec.ts`: D5.3–8 hanya Group A; prasyarat allowlist sebelum user/RPC, sentinel psql persisten, 136 denial, tiga kontrol service-role, Q3, artifact persisten.
- Rencana: T2 dicentang; laporan ini.
- Config API adalah perubahan T1 yang sudah ada; tidak diubah sesi ini. T0/T1 report dan `.claude/launch.json` dipertahankan.

## Review sebelum penerapan

`python3 /tmp/postgres-revoked-t2/review-current.py` — exit 0, SQL baca-saja. Prasyarat: history T2 = 0, schema `app_internal` tidak ada, revoked non-trigger = **42**.

- **31 fungsi:** seluruh `pg_get_functiondef` identik byte demi byte setelah menambahkan tepat satu baris `PERFORM app_internal.assert_service_role();` setelah BEGIN pertama. Tidak ada perubahan body/atribut lain.
- **A30:** hanya deklarasi `jwt_role` dan guard lama diganti shared guard; DELETE/RETURN berikutnya identik. Fallback role GUC lama/`session_user` dihapus sesuai D3.
- **A33/A34:** SELECT asli identik; plpgsql/STABLE/SECURITY DEFINER, `#variable_conflict use_column`, guard dan RETURN QUERY ditambahkan; `DEFAULT NULL::uuid[]` tetap. Draft diperbaiki dari `search_path=public` ke `search_path=''` sesuai D3; semua tabel sudah schema-qualified.
- Semua initializer DECLARE dibandingkan dengan snapshot T0: parameter/clock/pure expression saja, tanpa read/write tabel sebelum guard.
- **Rollback 34 A:** definisi identik dengan katalog pra-T2; ACL tepat `{postgres=X/postgres,service_role=X/postgres}`. REVOKE klien + GRANT service_role mengembalikan ACL itu, owner tetap postgres.
- **Q3:** ALTER SET SCHEMA mempertahankan body; rollback memindah kembali dan memulihkan ACL awal `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`. Definisi sesudah move dibandingkan dengan definisi awal, hanya nama schema fungsi berbeda.
- Self-check hanya allowlist 34 A dan schema/dua fungsi `app_internal`; tidak ada global invariant atau grant B1/B3–B8.

Dump/diff pra-T2: `/tmp/postgres-revoked-t2/continued/{before.json,review.json,definition-diffs.patch,review.log}`. Bukti diff per fungsi dari katalog **sesudah penerapan** disematkan di bagian akhir; PostgreSQL menormalisasi header A33/A34 menjadi `STABLE SECURITY DEFINER` pada satu baris (bukan perubahan body).

## RED → penerapan lokal → GREEN Group A

### RED

`pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project db-guard-real-backend` — exit **1**, **3 failed** sebelum penerapan. D5.1 = 42 (34 A + 8 B); D5.2 dan matriks berhenti di prasyarat 34 A belum granted/guarded. Tidak ada RPC atau user fixture dibuat oleh matriks RED. Log: `/tmp/postgres-revoked-t2/continued/red.log`.

### Penerapan

`python3 /tmp/postgres-revoked-t2/continued/apply-local.py` — exit **0**. Runner memanggil `psql <URL lokal dari env> -X -v ON_ERROR_STOP=1` dengan satu input transaksi:

```sql
BEGIN;
SET LOCAL lock_timeout = '8s';
-- Fail closed bila app_internal atau versi T2 sudah ada.
-- Isi file migrasi lengkap, termasuk self-check.
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES ('20261008150000','guard_exposed_service_role_functions',
        ARRAY[/* isi migrasi lengkap sebagai satu string */]);
COMMIT;
```

Output: 34 CREATE FUNCTION Group A, helper, move Q3, 34 GRANT, NOTIFY, self-check DO, `INSERT 0 1`, `COMMIT`. History terverifikasi: `20261008150000|guard_exposed_service_role_functions`. Tidak ada window grant tanpa guard karena semuanya satu transaksi. SQL/input dan stdout: `/tmp/postgres-revoked-t2/continued/{apply-transaction.sql,apply.log}`.

### Run sesudah penerapan

Command Playwright sama, dijalankan serial (workers 1, retries 0):

1. Run pertama: exit 1, D5.2 hijau dan **136 denial hijau**, tetapi draft gagal parse JSON kosong pada kontrol MV refresh. Sentinel sehat (139 panggilan), tidak ada abnormal termination. Log `green.log`.
2. Setelah perbaikan `RETURNS void`: exit 1 dengan hanya D5.1 merah, 2 passed; kontrol MV terbukti **204 dengan body kosong**.
3. Run final setelah perbaikan cleanup ESLint/format: exit **1**, **2 passed / 1 expected failed**. Log `final.log`.

Final:

- D5.1 = **7 baris**, tepat **B1, B3–B8**, A = 0; B2 sudah pindah. Global assertion tetap mengharapkan 0, **tidak dilemahkan**.
- D5.2 = 34 checked, unsafe = 0; exposed schemas tepat `public,graphql_public`; klien tidak memiliki USAGE/EXECUTE internal.
- **34 × 4 = 136** panggilan anon/agent/trainer/admin → `42501 SERVICE_ROLE_REQUIRED`; HTTP anon **401**, user JWT **403**.
- Satu koneksi psql hidup sepanjang **140** RPC; SELECT 1 dan backend PID sama setelah setiap panggilan. Tidak reconnect.
- Counts 13 tabel sebelum/sesudah = **0**, termasuk attempts/transcript/metrics/leases/rate limits, mailbox intents/items, tiga history, coaching, peserta dan temuan; counts juga tetap setelah kontrol. Tidak ada data fixture produk dibuat oleh denial.
- Service-role: folder counts **200 / []**; leader scope **200 / satu row lima array kosong** (semantik aggregate asli, bukan nol row); MV refresh **204 / kosong**.
- Q3 sebagai anon → **404 / PGRST202**. Group B lain **tidak pernah dipanggil**.
- Cleanup akun lokal selesai; katalog `auth.users` untuk email fixture `e2e-browser-%@local.test` = **0**. Tidak ada sentinel task-owned tersisa.

`python3 /tmp/postgres-revoked-t2/continued/post-review.py` — exit **0** setelah penyesuaian normalisasi header katalog; 34 definisi applied cocok dengan draft reviewed, Q3 body identik, artifact 140 entries/136 denials/sentinel sehat.

## Artifact dan log Postgres

JSON asli + attachment tersimpan di `apps/web/test-results/api/`:

- `exposed-function-guard-api-1ed58-posed-non-trigger-functions-db-guard-real-backend/catalog-invariant.json`
- `exposed-function-guard-api-8fa49-up-A-overload-guarded-first-db-guard-real-backend/guard-placement-invariant.json`
- `exposed-function-guard-api-9ee69-fects-and-positive-controls-db-guard-real-backend/{group-a-rpc-summary.json,side-effects.json}`

Summary setiap RPC: `{function, role, httpStatus, code, sentinelAlive}`; 140 entries. List reporter final: `/tmp/postgres-revoked-t2/continued/final.log`. Run ulang command yang sama meregenerasi artifact (outputDir Playwright dibersihkan setiap run).

`docker logs --since 2026-10-08T14:50:36Z supabase_db_trainerssuperappvite` — exit **0**, 680 baris di `/tmp/postgres-revoked-t2/continued/final-postgres.log`. Ada **136 ERROR SERVICE_ROLE_REQUIRED** dengan konteks shared guard. Pencarian signal/abnormal termination/PANIC/reinitializing/interrupted/server-process exit = **0 match**. Ini log non-kosong ditambah sentinel, bukan klaim semua versi Postgres aman. Log run pascapenerapan sebelumnya juga 0 crash match.

## Typecheck/Lint/Format

- `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.e2e.json` — final exit **0**.
- `pnpm --filter @trainers/web exec eslint e2e/exposed-function-guard-api.spec.ts` — final exit **0**. Temuan awal `no-unsafe-finally` pada throw cleanup diperbaiki: semua user tetap dicoba dibersihkan, lalu failed-cleanups harus kosong.
- Prettier awal menandai format spec; diperbaiki. Final scoped Prettier/diff check dicatat dalam addendum setelah laporan ditulis.
- SQL tidak memiliki parser Prettier terpasang; SQL dicek struktur/katalog/diff, tidak diformat ulang agar body asli identik.

## Build / scope notes

Build, root lint/typecheck, regression callers, Graphify update dan canonical architecture contract ditunda ke T4/T5 sesuai rencana. Tidak menjalankan T3. Dampak pg_graphql dari T0 tetap berlaku: pemberian EXECUTE dapat membuat fungsi terlihat bila extension aktif, guard tetap menolak klien; extension lokal tidak diaktifkan.

Graphify `affected assertGroupAPrecondition --depth 2` tidak cocok unik; retry `affected runSql --depth 2` menunjukkan consumers real-backend. Katalog, caller inventory T0 dan source langsung dipakai sebagai bukti utama. Context7 resolve/query `/websites/postgrest_en_v14` dilakukan untuk respons void; hasil query tidak menjawab kontrak secara langsung, sehingga **204 dibuktikan oleh E2E lokal**, bukan diasumsikan dari lookup.

Thermo-nuclear self-review **PASS untuk scope T2**, tanpa reviewer/subagent independen. Temuan draft search_path, parse void, artifact body-only dan cleanup throw sudah diperbaiki; file SQL >1000 baris dibenarkan oleh kewajiban menyimpan 34 body lengkap tanpa refactor. Root/release gate belum dijalankan. Satu run Playwright lain terdeteksi sebelum rerun final; menunggu proses tersebut keluar, tidak menghentikan proses milik sesi lain.

**STOP: T3 belum dimulai; 7 revoked Group B masih merupakan exposure yang belum dimitigasi. Jangan jalankan RPC B sebelum T3.**

## Final verification addendum

- `pnpm exec prettier --check apps/web/e2e/exposed-function-guard-api.spec.ts apps/web/playwright.api.config.ts plans/markdown/postgres-revoked-execute-crash-mitigation.md plans/markdown/postgres-revoked-execute-crash-mitigation-t2-report.md` — exit **0**.
- `git diff --check` — exit **0**.
- Untuk lima file T2 untracked, `git diff --no-index --check /dev/null <path>` masing-masing tidak mengeluarkan diagnostic whitespace; exit **1** adalah status diff file baru, bukan whitespace error. Tidak staging file demi pemeriksaan.
- `ps -axo pid,command | grep '[p]sql'` tidak menemukan proses psql tersisa; `wc -l .../final-postgres.log` = **680**.
- Typecheck E2E dan ESLint final exit **0**; build/root checks tidak dijalankan (T4).

## Bukti diff per fungsi (katalog pra-T2 → katalog applied)

31 diff biasa tepat satu baris; A30/A33/A34 pengecualian yang disetujui. Semua rollback definition/ACL cocok dengan snapshot pra-T2.

```diff
--- public.begin_telefun_realtime_finalization(uuid,uuid,uuid,text) before
+++ public.begin_telefun_realtime_finalization(uuid,uuid,uuid,text) applied T2
@@ -8,6 +8,7 @@
   v_attempt public.telefun_realtime_attempts%ROWTYPE;
   v_outcome TEXT := p_requested_outcome;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_requested_outcome NOT IN ('completed', 'failed') THEN
     RETURN QUERY SELECT false, false, NULL::text, NULL::text, 'invalid_outcome';
     RETURN;

--- public.begin_telefun_realtime_finalization_p5(uuid,uuid,uuid,text) before
+++ public.begin_telefun_realtime_finalization_p5(uuid,uuid,uuid,text) applied T2
@@ -6,6 +6,7 @@
 AS $function$
 DECLARE v_attempt public.telefun_realtime_attempts%ROWTYPE; v_outcome TEXT := p_requested_outcome;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_requested_outcome NOT IN ('completed', 'failed', 'network_lost', 'orphaned') THEN
     RETURN QUERY SELECT false, false, NULL::text, NULL::text, 'invalid_outcome'::text; RETURN;
   END IF;

--- public.bind_telefun_realtime_provider_call(uuid,uuid,text) before
+++ public.bind_telefun_realtime_provider_call(uuid,uuid,text) applied T2
@@ -7,6 +7,7 @@
 DECLARE
   v_attempt public.telefun_realtime_attempts%ROWTYPE;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   SELECT a.* INTO v_attempt
   FROM public.telefun_realtime_attempts a
   WHERE a.id = p_attempt_id AND a.user_id = p_user_id

--- public.checkpoint_telefun_realtime_transcript(uuid,uuid,bigint,text,text,text,integer,boolean) before
+++ public.checkpoint_telefun_realtime_transcript(uuid,uuid,bigint,text,text,text,integer,boolean) applied T2
@@ -9,6 +9,7 @@
   v_event public.telefun_realtime_transcript_events%ROWTYPE;
   v_text TEXT := btrim(p_text);
 BEGIN
+  PERFORM app_internal.assert_service_role();
   SELECT a.* INTO v_attempt
   FROM public.telefun_realtime_attempts a
   WHERE a.id = p_attempt_id AND a.user_id = p_user_id

--- public.claim_telefun_realtime_attempt(uuid,uuid,uuid,text,text) before
+++ public.claim_telefun_realtime_attempt(uuid,uuid,uuid,text,text) applied T2
@@ -13,6 +13,7 @@
   v_finalization_key UUID;
   v_usage_request_id TEXT := 'telefun-webrtc:' || p_attempt_id::text;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   SELECT h.user_id, h.status, h.telefun_model_id, h.telefun_transport
   INTO v_history_user_id, v_history_status, v_history_model_id, v_history_transport
   FROM public.telefun_history h

--- public.claim_telefun_realtime_lease(uuid,uuid,uuid,text,text,integer,integer,integer) before
+++ public.claim_telefun_realtime_lease(uuid,uuid,uuid,text,text,integer,integer,integer) applied T2
@@ -13,6 +13,7 @@
   v_attempt public.telefun_realtime_attempts%ROWTYPE;
   v_id UUID;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_provider <> 'openai-webrtc'
      OR p_ttl_ms NOT BETWEEN 1000 AND 120000
      OR p_max_user_sessions < 1

--- public.claim_telefun_realtime_orphans(integer) before
+++ public.claim_telefun_realtime_orphans(integer) applied T2
@@ -5,6 +5,7 @@
  SET search_path TO ''
 AS $function$
 BEGIN
+  PERFORM app_internal.assert_service_role();
   RETURN QUERY
   WITH candidates AS (
     SELECT l.id

--- public.complete_telefun_realtime_orphan(uuid,uuid,text,boolean,boolean,text) before
+++ public.complete_telefun_realtime_orphan(uuid,uuid,text,boolean,boolean,text) applied T2
@@ -6,6 +6,7 @@
 AS $function$
 DECLARE v_user_id UUID; v_session_id UUID;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_outcome <> 'orphaned' OR p_error_code IS NOT NULL AND char_length(p_error_code) > 128 THEN
     RETURN QUERY SELECT false, 'invalid_orphan'::text; RETURN;
   END IF;

--- public.consume_telefun_realtime_rate_limit(text,uuid,uuid,text,integer,integer) before
+++ public.consume_telefun_realtime_rate_limit(text,uuid,uuid,text,integer,integer) applied T2
@@ -10,6 +10,7 @@
   v_count INTEGER;
   v_id UUID;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_scope_key IS NULL OR char_length(p_scope_key) > 256
      OR p_provider NOT IN ('openai-webrtc', 'gemini-live', 'openai-websocket')
      OR p_window_seconds NOT BETWEEN 1 AND 3600

--- public.fail_telefun_realtime_session_without_attempt(uuid,uuid) before
+++ public.fail_telefun_realtime_session_without_attempt(uuid,uuid) applied T2
@@ -8,6 +8,7 @@
   v_history public.telefun_history%ROWTYPE;
   v_attempt_state TEXT;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   SELECT h.* INTO v_history
   FROM public.telefun_history h
   WHERE h.id = p_session_id

--- public.finalize_telefun_realtime_attempt(uuid,uuid,uuid,text,integer) before
+++ public.finalize_telefun_realtime_attempt(uuid,uuid,uuid,text,integer) applied T2
@@ -11,6 +11,7 @@
   v_transcript_count BIGINT;
   v_outcome TEXT := p_final_outcome;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_final_outcome NOT IN ('completed', 'failed')
      OR p_duration_seconds IS NULL
      OR p_duration_seconds < 0

--- public.finalize_telefun_realtime_attempt_p5(uuid,uuid,uuid,text,integer) before
+++ public.finalize_telefun_realtime_attempt_p5(uuid,uuid,uuid,text,integer) applied T2
@@ -12,6 +12,7 @@
   v_outcome TEXT := p_final_outcome;
   v_history_status TEXT;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_final_outcome NOT IN ('completed', 'failed', 'network_lost', 'orphaned')
      OR p_duration_seconds IS NULL OR p_duration_seconds < 0 OR p_duration_seconds > 86400 THEN
     RETURN QUERY SELECT false, false, NULL::text, NULL::text, 0::bigint, NULL::text, 'invalid_finalization'::text; RETURN;

--- public.mark_telefun_realtime_sideband_connected(uuid,uuid) before
+++ public.mark_telefun_realtime_sideband_connected(uuid,uuid) applied T2
@@ -8,6 +8,7 @@
   v_state TEXT;
   v_hash TEXT;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   SELECT a.state, a.provider_call_id_hash
   INTO v_state, v_hash
   FROM public.telefun_realtime_attempts a

--- public.mark_telefun_realtime_usage(uuid,uuid,text,text) before
+++ public.mark_telefun_realtime_usage(uuid,uuid,text,text) applied T2
@@ -13,6 +13,7 @@
   v_usage_status TEXT;
   v_safe_error TEXT := left(regexp_replace(coalesce(p_error, ''), '\s+', ' ', 'g'), 512);
 BEGIN
+  PERFORM app_internal.assert_service_role();
   SELECT a.* INTO v_attempt
   FROM public.telefun_realtime_attempts a
   WHERE a.id = p_attempt_id AND a.user_id = p_user_id

--- public.mark_telefun_recording_ready(uuid,uuid,text,text) before
+++ public.mark_telefun_recording_ready(uuid,uuid,text,text) applied T2
@@ -13,6 +13,7 @@
   v_scoring_ready_at TIMESTAMPTZ;
   v_now TIMESTAMPTZ := now();
 BEGIN
+  PERFORM app_internal.assert_service_role();
   SELECT h.* INTO v_session
   FROM public.telefun_history h
   WHERE h.id = p_session_id

--- public.mark_telefun_recording_uploaded(uuid,uuid,text,text,text) before
+++ public.mark_telefun_recording_uploaded(uuid,uuid,text,text,text) applied T2
@@ -11,6 +11,7 @@
   v_agent_recording_path TEXT;
   v_scoring_status TEXT;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   SELECT h.* INTO v_session
   FROM public.telefun_history h
   WHERE h.id = p_session_id

--- public.record_telefun_realtime_metric(text,text,text,uuid,uuid,bigint,jsonb) before
+++ public.record_telefun_realtime_metric(text,text,text,uuid,uuid,bigint,jsonb) applied T2
@@ -5,6 +5,7 @@
  SET search_path TO ''
 AS $function$
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_provider <> 'openai-webrtc'
      OR p_metric_name NOT IN ('cost_reconciliation', 'sideband_disconnect', 'duplicate_write', 'missing_usage', 'orphan', 'session_cap')
      OR p_user_id_hash IS NOT NULL AND p_user_id_hash !~ '^[a-f0-9]{64}$'

--- public.release_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,text) before
+++ public.release_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,text) applied T2
@@ -5,6 +5,7 @@
  SET search_path TO ''
 AS $function$
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_outcome NOT IN ('completed', 'failed', 'network_lost', 'orphaned') THEN
     RETURN QUERY SELECT false, false, 'invalid_outcome'::text; RETURN;
   END IF;

--- public.renew_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,integer) before
+++ public.renew_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,integer) applied T2
@@ -9,6 +9,7 @@
   v_next TIMESTAMPTZ;
   v_lease public.telefun_realtime_leases%ROWTYPE;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_ttl_ms NOT BETWEEN 1000 AND 120000 THEN
     RETURN QUERY SELECT false, v_now, 'invalid_ttl'::text;
     RETURN;

--- public.store_telefun_realtime_provider_call_reference(uuid,uuid,text) before
+++ public.store_telefun_realtime_provider_call_reference(uuid,uuid,text) applied T2
@@ -5,6 +5,7 @@
  SET search_path TO ''
 AS $function$
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_provider_call_reference IS NULL OR char_length(p_provider_call_reference) > 16384 THEN
     RETURN QUERY SELECT false, 'invalid_reference'::text;
     RETURN;

--- public.claim_telefun_scoring(uuid,integer) before
+++ public.claim_telefun_scoring(uuid,integer) applied T2
@@ -16,6 +16,7 @@
   v_effective_timeout INT;
   v_now TIMESTAMPTZ := now();
 BEGIN
+  PERFORM app_internal.assert_service_role();
   v_effective_timeout := GREATEST(COALESCE(p_claim_timeout_seconds, 300), 300);

   SELECT h.scoring_status, h.scoring_claimed_at, h.scoring_next_attempt_at,

--- public.claim_telefun_scoring(uuid,integer,text,text) before
+++ public.claim_telefun_scoring(uuid,integer,text,text) applied T2
@@ -15,6 +15,7 @@
   v_user_id UUID;
   v_now TIMESTAMPTZ := now();
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_claim_timeout_seconds IS NULL OR p_claim_timeout_seconds < 300
      OR p_claim_token_hash IS NULL OR p_claim_token_hash = ''
      OR p_claim_owner IS NULL OR p_claim_owner = '' THEN

--- public.complete_telefun_scoring(uuid,numeric,jsonb) before
+++ public.complete_telefun_scoring(uuid,numeric,jsonb) applied T2
@@ -16,6 +16,7 @@
   v_agent_recording_path TEXT;
   v_claim_token_hash TEXT;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   SELECT h.id,
          h.user_id,
          h.status,

--- public.complete_telefun_scoring(uuid,numeric,jsonb,text) before
+++ public.complete_telefun_scoring(uuid,numeric,jsonb,text) applied T2
@@ -16,6 +16,7 @@
   v_agent_recording_path TEXT;
   v_claim_token_hash TEXT;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   IF p_claim_token_hash IS NULL OR p_claim_token_hash = '' THEN
     RETURN FALSE;
   END IF;

--- public.fail_telefun_scoring(uuid,text) before
+++ public.fail_telefun_scoring(uuid,text) applied T2
@@ -5,6 +5,7 @@
  SET search_path TO ''
 AS $function$
 BEGIN
+  PERFORM app_internal.assert_service_role();
   UPDATE public.telefun_history
   SET scoring_status = 'failed',
       scoring_last_error = p_error,

--- public.fail_telefun_scoring(uuid,text,text) before
+++ public.fail_telefun_scoring(uuid,text,text) applied T2
@@ -5,6 +5,7 @@
  SET search_path TO ''
 AS $function$
 BEGIN
+  PERFORM app_internal.assert_service_role();
   UPDATE public.telefun_history
   SET scoring_status = 'failed',
       scoring_last_error = p_error,

--- public.reschedule_telefun_scoring(uuid,text,timestamptz) before
+++ public.reschedule_telefun_scoring(uuid,text,timestamptz) applied T2
@@ -5,6 +5,7 @@
  SET search_path TO ''
 AS $function$
 BEGIN
+  PERFORM app_internal.assert_service_role();
   UPDATE public.telefun_history
   SET scoring_status = 'failed',
       scoring_last_error = p_error,

--- public.reschedule_telefun_scoring(uuid,text,timestamptz,text) before
+++ public.reschedule_telefun_scoring(uuid,text,timestamptz,text) applied T2
@@ -5,6 +5,7 @@
  SET search_path TO ''
 AS $function$
 BEGIN
+  PERFORM app_internal.assert_service_role();
   UPDATE public.telefun_history
   SET scoring_status = 'failed',
       scoring_last_error = p_error,

--- public.enqueue_telefun_scoring(uuid) before
+++ public.enqueue_telefun_scoring(uuid) applied T2
@@ -11,6 +11,7 @@
   v_agent_path TEXT;
   v_user_id UUID;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   SELECT h.telefun_transport, h.status, h.scoring_ready_at,
          h.agent_recording_path, h.user_id
   INTO v_transport, v_status, v_scoring_ready_at, v_agent_path, v_user_id

--- public.cleanup_pdkt_mailbox_subject_intents() before
+++ public.cleanup_pdkt_mailbox_subject_intents() applied T2
@@ -6,27 +6,8 @@
 AS $function$
 DECLARE
   deleted_count INTEGER;
-  jwt_role TEXT;
 BEGIN
-  -- `request.jwt.claims` is JSON. A malformed or absent setting must fall
-  -- through to the other checks instead of aborting cleanup with a parse error.
-  BEGIN
-    jwt_role := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
-  EXCEPTION
-    WHEN others THEN
-      jwt_role := NULL;
-  END;
-
-  IF jwt_role IS NULL THEN
-    jwt_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
-  END IF;
-
-  -- SECURITY DEFINER changes current_user to the function owner, so the guard
-  -- deliberately tests the JWT role claim and session_user only.
-  IF COALESCE(jwt_role, '') NOT IN ('service_role', 'postgres', 'supabase_admin')
-     AND session_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
-    RAISE EXCEPTION 'FORBIDDEN: subject intent cleanup is service-role only';
-  END IF;
+  PERFORM app_internal.assert_service_role();

   DELETE FROM public.pdkt_mailbox_subject_intents
    WHERE consumed_at IS NOT NULL

--- public.delete_monitoring_history(text,uuid) before
+++ public.delete_monitoring_history(text,uuid) applied T2
@@ -9,6 +9,7 @@
   v_deleted INTEGER := 0;
   v_source TEXT;
 BEGIN
+  PERFORM app_internal.assert_service_role();
   -- Security guard: only service_role can execute
   IF auth.role() IS DISTINCT FROM 'service_role' THEN
     RAISE EXCEPTION 'Unauthorized';

--- public.refresh_mv_qa_period_summary() before
+++ public.refresh_mv_qa_period_summary() applied T2
@@ -5,6 +5,7 @@
  SET search_path TO 'public', 'pg_temp'
 AS $function$
 BEGIN
+  PERFORM app_internal.assert_service_role();
   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_qa_period_summary;
 END;
 $function$

--- public.get_leader_scope_snapshot(uuid,text) before
+++ public.get_leader_scope_snapshot(uuid,text) applied T2
@@ -1,9 +1,13 @@
 CREATE OR REPLACE FUNCTION public.get_leader_scope_snapshot(p_leader_user_id uuid, p_module text)
  RETURNS TABLE(request_ids uuid[], peserta_ids uuid[], batch_names text[], tims text[], service_types text[])
- LANGUAGE sql
- STABLE
- SET search_path TO 'public'
+ LANGUAGE plpgsql
+ STABLE SECURITY DEFINER
+ SET search_path TO ''
 AS $function$
+#variable_conflict use_column
+BEGIN
+  PERFORM app_internal.assert_service_role();
+  RETURN QUERY
 with approved_requests as (
   select lar.id
   from public.leader_access_requests lar
@@ -50,4 +54,5 @@
   coalesce((select array_agg(distinct field_value order by field_value) from scope_items where field_name = 'batch_name'), '{}'::text[]),
   coalesce((select array_agg(distinct field_value order by field_value) from scope_items where field_name = 'tim'), '{}'::text[]),
   coalesce((select array_agg(distinct field_value order by field_value) from scope_items where field_name = 'service_type' and field_value in ('call','chat','email','cso','pencatatan','bko','slik')), '{}'::text[]);
+END;
 $function$

--- public.get_profiler_folder_counts(uuid[]) before
+++ public.get_profiler_folder_counts(uuid[]) applied T2
@@ -1,9 +1,13 @@
 CREATE OR REPLACE FUNCTION public.get_profiler_folder_counts(p_accessible_ids uuid[] DEFAULT NULL::uuid[])
  RETURNS TABLE(batch_name text, peserta_count bigint)
- LANGUAGE sql
- STABLE
- SET search_path TO 'public'
+ LANGUAGE plpgsql
+ STABLE SECURITY DEFINER
+ SET search_path TO ''
 AS $function$
+#variable_conflict use_column
+BEGIN
+  PERFORM app_internal.assert_service_role();
+  RETURN QUERY
   select
     pp.batch_name,
     count(*)::bigint as peserta_count
@@ -12,4 +16,5 @@
      or pp.id = any(p_accessible_ids)
   group by pp.batch_name
   order by pp.batch_name;
+END;
 $function$

```
