# Postgres Revoked-EXECUTE Crash Mitigation — T1 Report

- **Scope:** T1 only, Lane D; approved plan `plans/markdown/postgres-revoked-execute-crash-mitigation.md`. No T2 work.
- **Branch:** `fix/postgres-revoked-execute-guard`, created from fetched `origin/main` at `8502e5c`.
- **Result:** expected RED for both D5.1–2. Q5 budget consumed **exactly 1/1 POST**: isolated production-version image returned HTTP 401 / 42501; **no crash observed**, subsequent DB query succeeded.
- **Important limitation:** captured PostgreSQL log window is **empty**, so there are no PostgreSQL error/recovery lines to quote. `SIGNAL_11=false` below is only a regex result on that empty capture, not independent proof that no signal occurred. Do not treat this single outcome as proof that production or the image is universally safe. No second RPC was made to improve the evidence.
- No existing function was invoked or modified. No migrations, production/Supabase MCP access, unit tests, commit, push, or active-stack reset/stop. No dev server.

## 1. Branch and protected dirty work

Commands:

```text
git fetch origin
git rev-parse --short origin/main
git switch -c fix/postgres-revoked-execute-guard origin/main
```

All three succeeded (exit 0), baseline `8502e5c`. The two pre-existing untracked plan/report files remained on the new branch. Unrelated `.claude/launch.json` was preserved, untouched. Local `main` and `feat/tna-phase-1` were not edited.

## 2. T0 §7: active-stack discovery and isolation

Read `scripts/integration/supabase-bootstrap.sh` without executing it. Its start procedure is `supabase start -x storage-api,imgproxy`, followed by `supabase db reset --local` and environment export. **The script was not run.** No current repository `supabase/config.toml` exists (only the reference repository has one). Container labels identify the active stack as Supabase CLI project/compose project `trainerssuperappvite`; its DB volume is `supabase_db_trainerssuperappvite`. The exact historical command/config used to start these containers cannot be recovered from these labels.

Read-only discovery commands included:

```text
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}'
docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}'
docker inspect supabase_rest_trainerssuperappvite --format 'Labels={{json .Config.Labels}}'
docker info --format 'Memory={{.MemTotal}} CPUs={{.NCPU}}'
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'
docker exec supabase_db_trainerssuperappvite psql -U postgres -X -tAc "BEGIN READ ONLY; SELECT r.rolname, s.setconfig FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole WHERE r.rolname='authenticator'; ROLLBACK;"
docker network ls --format '{{.Name}}'
docker image inspect public.ecr.aws/supabase/postgres:17.6.1.121 --format '{{.Id}}'
docker image inspect public.ecr.aws/supabase/postgrest:v14.10 --format '{{.Id}}'
```

These Docker commands exited 0. Active role settings:

```text
authenticator|{"session_preload_libraries=supautils, safeupdate",statement_timeout=8s,lock_timeout=8s}
```

Docker capacity was 4 CPUs / 4,180,873,216 bytes; active containers used roughly 1.2 GiB. Both required images were already cached; no pull/install was needed. A **minimal two-container** separate environment was used, not another full Supabase stack:

- Unique project label/prefix: `t1_revoked_execute_20261008`.
- Separate DB / REST containers and network (expanded commands in §6).
- Only host bindings `127.0.0.1:55432` and `127.0.0.1:55431`; no active ports reused.
- DB capped at 512 MiB / 1 CPU, 32 MiB shared buffers / 20 connections; REST at 128 MiB / 0.5 CPU / pool size 2.
- Fresh generated disposable DB password and JWT signing key, never printed. The anonymous JWT had only role `anon` (no user session). This does not reuse a production or service-role key.
- All active-stack checks used `readLoopbackEnv()` and `runSql()`, reading only `apps/api/.env.integration`; HTTP used `installLoopbackFetchGuard()`.

Image IDs:

```text
postgres:17.6.1.121 sha256:69e57a409628a809e3778a4d176eb97e32d7c961131ac025b77ad094c0b2d49e
postgrest:v14.10 sha256:bca3f86f69d8ef7aa1e5ee65e66ce9a20c6c147be637517a7be8399e102901d1
```

## 3. RED execution and artifacts

Spec contains **only D5.1 and D5.2**, as independent tests on a one-worker, no-server API project. All SQL is inside `BEGIN READ ONLY … ROLLBACK`. No Supabase client/RPC is created or called. Group A is a fixed list of 34 exact signatures, including legacy/fenced overloads; missing functions cannot silently disappear through an inner join. Guard placement tolerates leading DECLARE, comments and the planned variable-conflict directive; T0 remains the source for initializer safety.

Exact command, executed twice serially (first RED; final RED after an ESLint-only callback fix), **exit 1 both times**:

```sh
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project db-guard-real-backend
```

- D5.1: **42 rows = 34 A + 8 B**, no TNA regression.
- D5.2: **34 checked, 34 unguarded**, including the two SQL-language functions awaiting T2 conversion.
- Exposed schemas are exactly `public,graphql_public`; `app_internal` is absent.
- Playwright attachments: `catalog-invariant.json` and `guard-placement-invariant.json` under `apps/web/test-results/api/`.
- Complete final stdout/stderr is embedded verbatim in §5; initial output is retained at `/tmp/postgres-revoked-t1-evidence/red.log`.

## 4. Q5: one-call outcome, setup failures, and cleanup

Runner command:

```sh
pnpm exec tsx /tmp/postgres-revoked-t1-evidence/q5.ts
```

The first **five setup attempts** exited 1 **before any RPC**, each printed `FINAL_RPC_POST_COUNT=0` and cleaned its owned resources. Failures, in order:

1. Altering reserved authenticator as non-superuser postgres: `"authenticator" is a reserved role, only superusers can modify it`.
2. Switching to supabase_admin without password: `fe_sendauth: no password supplied`.
3. Supplying generated password but default DB name: `database "supabase_admin" does not exist`.
4. Readiness failed with quoted library-list setting and an internal Docker network; no RPC. Corrected list syntax to `SET session_preload_libraries = supautils, safeupdate`.
5. PostgREST connected and loaded the one-function schema cache, but host readiness remained inaccessible on Docker's internal network. Used a separate ordinary bridge network with loopback-only port publishing instead.

All retry logs are retained as `q5-setup-failed.log`, `q5-setup-failed-2.log` through `q5-setup-failed-5.log` in that scratch evidence directory. The final runner exited **0**; expanded commands and their individual exit codes are in §6 (secrets replaced with generated-value placeholders).

Final precondition: dummy `public.t1_revoked_execute_dummy_20261008()`, plpgsql SECURITY DEFINER, `RETURN 1`, owned by postgres; EXECUTE revoked from PUBLIC, anon, authenticated; `has_function_privilege('anon', …) = f`. Authenticator role setting exactly `session_preload_libraries=supautils, safeupdate`.

**Exactly one HTTP POST**, anonymous JWT/key only, no session:

```text
POST http://127.0.0.1:55431/rpc/t1_revoked_execute_dummy_20261008
Headers: apikey: <generated-anon-key>
         Authorization: Bearer <same-generated-anon-key>
         Content-Type: application/json
Body: {}
HTTP_STATUS=401
HTTP_BODY={"code":"42501","details":null,"hint":null,"message":"permission denied for function t1_revoked_execute_dummy_20261008"}
```

**Path detail:** direct PostgREST exposes `/rpc/…`, rather than Kong's `/rest/v1/rpc/…` prefix. This exercises the same PostgREST anonymous-role/JWT/function-ACL path without a gateway. It is not an end-to-end Kong/hosted-production test.

No client retry loop wraps POST; redirects are rejected; timeout is 15 seconds. Readiness used **GET /** only. The runner reports final POST count 1; no existing RPC was called, even though the active catalog is still RED.

Postgres log capture command:

```text
docker logs --since 2026-10-08T14:10:46.973Z t1_revoked_execute_20261008_db
```

Exit 0, **stdout and stderr empty**. The raw file `/tmp/postgres-revoked-t1-evidence/postgres.log` is therefore zero-length. There are **no signal 11 or recovery lines in this capture**, with the evidence limitation stated at the top. Post-cleanup image-only inspection (no database, no RPC) found `/etc/postgresql/logging.conf:1:logging_collector = off`; this does not explain or eliminate the empty-window limitation.

After the POST, `SELECT 1` succeeded. No recovery was observed/required; there is no long-lived sentinel in this T1 crash probe. DROP succeeded and dummy catalog count was **0 before container removal**. Both task containers (with anonymous volumes) and their network were removed, exit 0. Active loopback DB returned 1 both before and after. Final container/network/volume name sweeps matched nothing (grep exit 1 = no matches). The active `supabase_*_trainerssuperappvite` resources were never stopped/reset/modified.

## 5. Exact final RED output

```text

Running 2 tests using 1 worker

D5.1 {"total":42,"groupA":34,"groupB":8,"revoked":[{"signature":"public.begin_telefun_realtime_finalization(uuid,uuid,uuid,text)","anon":false,"authenticated":false},{"signature":"public.begin_telefun_realtime_finalization_p5(uuid,uuid,uuid,text)","anon":false,"authenticated":false},{"signature":"public.bind_telefun_realtime_provider_call(uuid,uuid,text)","anon":false,"authenticated":false},{"signature":"public.bulk_reorder_profiler_peserta(jsonb)","anon":false,"authenticated":true},{"signature":"public.checkpoint_telefun_realtime_transcript(uuid,uuid,bigint,text,text,text,integer,boolean)","anon":false,"authenticated":false},{"signature":"public.claim_telefun_realtime_attempt(uuid,uuid,uuid,text,text)","anon":false,"authenticated":false},{"signature":"public.claim_telefun_realtime_lease(uuid,uuid,uuid,text,text,integer,integer,integer)","anon":false,"authenticated":false},{"signature":"public.claim_telefun_realtime_orphans(integer)","anon":false,"authenticated":false},{"signature":"public.claim_telefun_scoring(uuid,integer)","anon":false,"authenticated":false},{"signature":"public.claim_telefun_scoring(uuid,integer,text,text)","anon":false,"authenticated":false},{"signature":"public.cleanup_pdkt_mailbox_subject_intents()","anon":false,"authenticated":false},{"signature":"public.complete_telefun_realtime_orphan(uuid,uuid,text,boolean,boolean,text)","anon":false,"authenticated":false},{"signature":"public.complete_telefun_scoring(uuid,numeric,jsonb)","anon":false,"authenticated":false},{"signature":"public.complete_telefun_scoring(uuid,numeric,jsonb,text)","anon":false,"authenticated":false},{"signature":"public.consume_telefun_realtime_rate_limit(text,uuid,uuid,text,integer,integer)","anon":false,"authenticated":false},{"signature":"public.delete_monitoring_history(text,uuid)","anon":false,"authenticated":false},{"signature":"public.enqueue_telefun_scoring(uuid)","anon":false,"authenticated":false},{"signature":"public.fail_telefun_realtime_session_without_attempt(uuid,uuid)","anon":false,"authenticated":false},{"signature":"public.fail_telefun_scoring(uuid,text)","anon":false,"authenticated":false},{"signature":"public.fail_telefun_scoring(uuid,text,text)","anon":false,"authenticated":false},{"signature":"public.finalize_telefun_realtime_attempt(uuid,uuid,uuid,text,integer)","anon":false,"authenticated":false},{"signature":"public.finalize_telefun_realtime_attempt_p5(uuid,uuid,uuid,text,integer)","anon":false,"authenticated":false},{"signature":"public.get_leader_approved_scope_items(uuid,text)","anon":false,"authenticated":true},{"signature":"public.get_leader_scope_snapshot(uuid,text)","anon":false,"authenticated":false},{"signature":"public.get_profiler_folder_counts(uuid[])","anon":false,"authenticated":false},{"signature":"public.mark_telefun_realtime_sideband_connected(uuid,uuid)","anon":false,"authenticated":false},{"signature":"public.mark_telefun_realtime_usage(uuid,uuid,text,text)","anon":false,"authenticated":false},{"signature":"public.mark_telefun_recording_ready(uuid,uuid,text,text)","anon":false,"authenticated":false},{"signature":"public.mark_telefun_recording_uploaded(uuid,uuid,text,text,text)","anon":false,"authenticated":false},{"signature":"public.record_telefun_realtime_metric(text,text,text,uuid,uuid,bigint,jsonb)","anon":false,"authenticated":false},{"signature":"public.refresh_mv_qa_period_summary()","anon":false,"authenticated":false},{"signature":"public.release_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,text)","anon":false,"authenticated":false},{"signature":"public.renew_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,integer)","anon":false,"authenticated":false},{"signature":"public.reschedule_telefun_scoring(uuid,text,timestamp with time zone)","anon":false,"authenticated":false},{"signature":"public.reschedule_telefun_scoring(uuid,text,timestamp with time zone,text)","anon":false,"authenticated":false},{"signature":"public.soft_delete_pdkt_mailbox_item(uuid)","anon":false,"authenticated":true},{"signature":"public.store_telefun_realtime_provider_call_reference(uuid,uuid,text)","anon":false,"authenticated":false},{"signature":"public.submit_pdkt_mailbox_batch(text,text,text,text,text,jsonb,jsonb,jsonb)","anon":false,"authenticated":true},{"signature":"public.submit_pdkt_mailbox_batch_with_subject(text,text,text,text,text,jsonb,jsonb,jsonb,text,uuid,text,text,text,uuid)","anon":false,"authenticated":true},{"signature":"public.submit_pdkt_mailbox_reply(uuid,jsonb,integer)","anon":false,"authenticated":true},{"signature":"public.submit_pdkt_mailbox_reply_with_outcome(uuid,jsonb,integer)","anon":false,"authenticated":true},{"signature":"public.upsert_telefun_coaching_summary(uuid,jsonb,integer,text)","anon":false,"authenticated":true}]}
  ✘  1 [db-guard-real-backend] › e2e/exposed-function-guard-api.spec.ts:59:1 › D5.1 catalog invariant: no revoked exposed non-trigger functions (146ms)
D5.2 {"schemas":["public","graphql_public"],"checked":34,"unguarded":[{"signature":"public.begin_telefun_realtime_finalization_p5(uuid,uuid,uuid,text)","language":"plpgsql"},{"signature":"public.begin_telefun_realtime_finalization(uuid,uuid,uuid,text)","language":"plpgsql"},{"signature":"public.bind_telefun_realtime_provider_call(uuid,uuid,text)","language":"plpgsql"},{"signature":"public.checkpoint_telefun_realtime_transcript(uuid,uuid,bigint,text,text,text,integer,boolean)","language":"plpgsql"},{"signature":"public.claim_telefun_realtime_attempt(uuid,uuid,uuid,text,text)","language":"plpgsql"},{"signature":"public.claim_telefun_realtime_lease(uuid,uuid,uuid,text,text,integer,integer,integer)","language":"plpgsql"},{"signature":"public.claim_telefun_realtime_orphans(integer)","language":"plpgsql"},{"signature":"public.claim_telefun_scoring(uuid,integer,text,text)","language":"plpgsql"},{"signature":"public.claim_telefun_scoring(uuid,integer)","language":"plpgsql"},{"signature":"public.cleanup_pdkt_mailbox_subject_intents()","language":"plpgsql"},{"signature":"public.complete_telefun_realtime_orphan(uuid,uuid,text,boolean,boolean,text)","language":"plpgsql"},{"signature":"public.complete_telefun_scoring(uuid,numeric,jsonb,text)","language":"plpgsql"},{"signature":"public.complete_telefun_scoring(uuid,numeric,jsonb)","language":"plpgsql"},{"signature":"public.consume_telefun_realtime_rate_limit(text,uuid,uuid,text,integer,integer)","language":"plpgsql"},{"signature":"public.delete_monitoring_history(text,uuid)","language":"plpgsql"},{"signature":"public.enqueue_telefun_scoring(uuid)","language":"plpgsql"},{"signature":"public.fail_telefun_realtime_session_without_attempt(uuid,uuid)","language":"plpgsql"},{"signature":"public.fail_telefun_scoring(uuid,text,text)","language":"plpgsql"},{"signature":"public.fail_telefun_scoring(uuid,text)","language":"plpgsql"},{"signature":"public.finalize_telefun_realtime_attempt_p5(uuid,uuid,uuid,text,integer)","language":"plpgsql"},{"signature":"public.finalize_telefun_realtime_attempt(uuid,uuid,uuid,text,integer)","language":"plpgsql"},{"signature":"public.get_leader_scope_snapshot(uuid,text)","language":"sql"},{"signature":"public.get_profiler_folder_counts(uuid[])","language":"sql"},{"signature":"public.mark_telefun_realtime_sideband_connected(uuid,uuid)","language":"plpgsql"},{"signature":"public.mark_telefun_realtime_usage(uuid,uuid,text,text)","language":"plpgsql"},{"signature":"public.mark_telefun_recording_ready(uuid,uuid,text,text)","language":"plpgsql"},{"signature":"public.mark_telefun_recording_uploaded(uuid,uuid,text,text,text)","language":"plpgsql"},{"signature":"public.record_telefun_realtime_metric(text,text,text,uuid,uuid,bigint,jsonb)","language":"plpgsql"},{"signature":"public.refresh_mv_qa_period_summary()","language":"plpgsql"},{"signature":"public.release_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,text)","language":"plpgsql"},{"signature":"public.renew_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,integer)","language":"plpgsql"},{"signature":"public.reschedule_telefun_scoring(uuid,text,timestamptz,text)","language":"plpgsql"},{"signature":"public.reschedule_telefun_scoring(uuid,text,timestamptz)","language":"plpgsql"},{"signature":"public.store_telefun_realtime_provider_call_reference(uuid,uuid,text)","language":"plpgsql"}]}
  ✘  2 [db-guard-real-backend] › e2e/exposed-function-guard-api.spec.ts:88:1 › D5.2 guard-placement invariant: every Group A overload guarded first (156ms)


  1) [db-guard-real-backend] › e2e/exposed-function-guard-api.spec.ts:59:1 › D5.1 catalog invariant: no revoked exposed non-trigger functions

    Error: STOP S1: catalog must be green before any RPC

    expect(received).toEqual(expected) // deep equality

    - Expected  -   1
    + Received  + 212

    - Array []
    + Array [
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.begin_telefun_realtime_finalization(uuid,uuid,uuid,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.begin_telefun_realtime_finalization_p5(uuid,uuid,uuid,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.bind_telefun_realtime_provider_call(uuid,uuid,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": true,
    +     "signature": "public.bulk_reorder_profiler_peserta(jsonb)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.checkpoint_telefun_realtime_transcript(uuid,uuid,bigint,text,text,text,integer,boolean)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.claim_telefun_realtime_attempt(uuid,uuid,uuid,text,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.claim_telefun_realtime_lease(uuid,uuid,uuid,text,text,integer,integer,integer)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.claim_telefun_realtime_orphans(integer)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.claim_telefun_scoring(uuid,integer)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.claim_telefun_scoring(uuid,integer,text,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.cleanup_pdkt_mailbox_subject_intents()",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.complete_telefun_realtime_orphan(uuid,uuid,text,boolean,boolean,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.complete_telefun_scoring(uuid,numeric,jsonb)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.complete_telefun_scoring(uuid,numeric,jsonb,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.consume_telefun_realtime_rate_limit(text,uuid,uuid,text,integer,integer)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.delete_monitoring_history(text,uuid)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.enqueue_telefun_scoring(uuid)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.fail_telefun_realtime_session_without_attempt(uuid,uuid)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.fail_telefun_scoring(uuid,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.fail_telefun_scoring(uuid,text,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.finalize_telefun_realtime_attempt(uuid,uuid,uuid,text,integer)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.finalize_telefun_realtime_attempt_p5(uuid,uuid,uuid,text,integer)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": true,
    +     "signature": "public.get_leader_approved_scope_items(uuid,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.get_leader_scope_snapshot(uuid,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.get_profiler_folder_counts(uuid[])",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.mark_telefun_realtime_sideband_connected(uuid,uuid)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.mark_telefun_realtime_usage(uuid,uuid,text,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.mark_telefun_recording_ready(uuid,uuid,text,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.mark_telefun_recording_uploaded(uuid,uuid,text,text,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.record_telefun_realtime_metric(text,text,text,uuid,uuid,bigint,jsonb)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.refresh_mv_qa_period_summary()",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.release_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.renew_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,integer)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.reschedule_telefun_scoring(uuid,text,timestamp with time zone)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.reschedule_telefun_scoring(uuid,text,timestamp with time zone,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": true,
    +     "signature": "public.soft_delete_pdkt_mailbox_item(uuid)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": false,
    +     "signature": "public.store_telefun_realtime_provider_call_reference(uuid,uuid,text)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": true,
    +     "signature": "public.submit_pdkt_mailbox_batch(text,text,text,text,text,jsonb,jsonb,jsonb)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": true,
    +     "signature": "public.submit_pdkt_mailbox_batch_with_subject(text,text,text,text,text,jsonb,jsonb,jsonb,text,uuid,text,text,text,uuid)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": true,
    +     "signature": "public.submit_pdkt_mailbox_reply(uuid,jsonb,integer)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": true,
    +     "signature": "public.submit_pdkt_mailbox_reply_with_outcome(uuid,jsonb,integer)",
    +   },
    +   Object {
    +     "anon": false,
    +     "authenticated": true,
    +     "signature": "public.upsert_telefun_coaching_summary(uuid,jsonb,integer,text)",
    +   },
    + ]

      83 |     contentType: "application/json",
      84 |   });
    > 85 |   expect(revoked, "STOP S1: catalog must be green before any RPC").toEqual([]);
         |                                                                    ^
      86 | });
      87 |
      88 | test("D5.2 guard-placement invariant: every Group A overload guarded first", async () => {
        at /Users/nadindyta/Downloads/_Projects/trainerssuperappvite/apps/web/e2e/exposed-function-guard-api.spec.ts:85:68

    Error Context: test-results/api/exposed-function-guard-api-1ed58-posed-non-trigger-functions-db-guard-real-backend/error-context.md

  2) [db-guard-real-backend] › e2e/exposed-function-guard-api.spec.ts:88:1 › D5.2 guard-placement invariant: every Group A overload guarded first

    Error: Group A requires first-statement app_internal guard

    expect(received).toEqual(expected) // deep equality

    - Expected  -   1
    + Received  + 138

    - Array []
    + Array [
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.begin_telefun_realtime_finalization_p5(uuid,uuid,uuid,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.begin_telefun_realtime_finalization(uuid,uuid,uuid,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.bind_telefun_realtime_provider_call(uuid,uuid,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.checkpoint_telefun_realtime_transcript(uuid,uuid,bigint,text,text,text,integer,boolean)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.claim_telefun_realtime_attempt(uuid,uuid,uuid,text,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.claim_telefun_realtime_lease(uuid,uuid,uuid,text,text,integer,integer,integer)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.claim_telefun_realtime_orphans(integer)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.claim_telefun_scoring(uuid,integer,text,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.claim_telefun_scoring(uuid,integer)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.cleanup_pdkt_mailbox_subject_intents()",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.complete_telefun_realtime_orphan(uuid,uuid,text,boolean,boolean,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.complete_telefun_scoring(uuid,numeric,jsonb,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.complete_telefun_scoring(uuid,numeric,jsonb)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.consume_telefun_realtime_rate_limit(text,uuid,uuid,text,integer,integer)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.delete_monitoring_history(text,uuid)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.enqueue_telefun_scoring(uuid)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.fail_telefun_realtime_session_without_attempt(uuid,uuid)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.fail_telefun_scoring(uuid,text,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.fail_telefun_scoring(uuid,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.finalize_telefun_realtime_attempt_p5(uuid,uuid,uuid,text,integer)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.finalize_telefun_realtime_attempt(uuid,uuid,uuid,text,integer)",
    +   },
    +   Object {
    +     "language": "sql",
    +     "signature": "public.get_leader_scope_snapshot(uuid,text)",
    +   },
    +   Object {
    +     "language": "sql",
    +     "signature": "public.get_profiler_folder_counts(uuid[])",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.mark_telefun_realtime_sideband_connected(uuid,uuid)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.mark_telefun_realtime_usage(uuid,uuid,text,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.mark_telefun_recording_ready(uuid,uuid,text,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.mark_telefun_recording_uploaded(uuid,uuid,text,text,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.record_telefun_realtime_metric(text,text,text,uuid,uuid,bigint,jsonb)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.refresh_mv_qa_period_summary()",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.release_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.renew_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,integer)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.reschedule_telefun_scoring(uuid,text,timestamptz,text)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.reschedule_telefun_scoring(uuid,text,timestamptz)",
    +   },
    +   Object {
    +     "language": "plpgsql",
    +     "signature": "public.store_telefun_realtime_provider_call_reference(uuid,uuid,text)",
    +   },
    + ]

      144 |     unguarded,
      145 |     "Group A requires first-statement app_internal guard",
    > 146 |   ).toEqual([]);
          |     ^
      147 | });
      148 |
        at /Users/nadindyta/Downloads/_Projects/trainerssuperappvite/apps/web/e2e/exposed-function-guard-api.spec.ts:146:5

    Error Context: test-results/api/exposed-function-guard-api-8fa49-up-A-overload-guarded-first-db-guard-real-backend/error-context.md

  2 failed
    [db-guard-real-backend] › e2e/exposed-function-guard-api.spec.ts:59:1 › D5.1 catalog invariant: no revoked exposed non-trigger functions
    [db-guard-real-backend] › e2e/exposed-function-guard-api.spec.ts:88:1 › D5.2 guard-placement invariant: every Group A overload guarded first
Error: ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL

  × "pnpm recursive exec" failed in /Users/nadindyta/Downloads/_Projects/
  │ trainerssuperappvite/apps/web


PLAYWRIGHT_EXIT_CODE=1
```

## 6. Exact final Q5 runner output

Generated credential values were never printed; placeholders below are intentional. Commands, SQL, status/body, counter, log window and cleanup are otherwise the captured output.

```text
Active loopback DB before=1
$ docker "network" "create" "t1_revoked_execute_20261008_network"
exit=0
$ docker "run" "-d" "--name" "t1_revoked_execute_20261008_db" "--network" "t1_revoked_execute_20261008_network" "--memory" "512m" "--cpus" "1" "--label" "com.supabase.cli.project=t1_revoked_execute_20261008" "-p" "127.0.0.1:55432:5432" "-e" "POSTGRES_PASSWORD" "-e" "JWT_SECRET" "public.ecr.aws/supabase/postgres:17.6.1.121" "postgres" "-D" "/etc/postgresql" "-c" "shared_buffers=32MB" "-c" "max_connections=20"
exit=0
$ docker "exec" "t1_revoked_execute_20261008_db" "psql" "-U" "postgres" "-X" "-v" "ON_ERROR_STOP=1" "-tAc" "SELECT version(); SELECT rolname FROM pg_roles WHERE rolname IN ('authenticator','anon','authenticated');"
exit=0
PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit
anon
authenticated
authenticator
$ docker "exec" "-e" "PGPASSWORD=<generated-password>" "t1_revoked_execute_20261008_db" "psql" "-U" "supabase_admin" "-d" "postgres" "-X" "-v" "ON_ERROR_STOP=1" "-tAc" "ALTER ROLE authenticator WITH LOGIN PASSWORD '<generated-password>'; ALTER ROLE authenticator SET session_preload_libraries = supautils, safeupdate; GRANT anon TO authenticator;"
exit=0
ALTER ROLE
ALTER ROLE
GRANT ROLE
$ docker "exec" "t1_revoked_execute_20261008_db" "psql" "-U" "postgres" "-X" "-v" "ON_ERROR_STOP=1" "-tAc" "GRANT USAGE ON SCHEMA public TO anon; CREATE FUNCTION public.t1_revoked_execute_dummy_20261008() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN 1; END $$; REVOKE EXECUTE ON FUNCTION public.t1_revoked_execute_dummy_20261008() FROM PUBLIC, anon, authenticated; SELECT has_function_privilege('anon','public.t1_revoked_execute_dummy_20261008()','EXECUTE'); SELECT r.rolname,s.setconfig FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole WHERE r.rolname='authenticator';"
exit=0
GRANT
CREATE FUNCTION
REVOKE
f
authenticator|{"session_preload_libraries=supautils, safeupdate"}
$ docker "exec" "t1_revoked_execute_20261008_db" "psql" "-U" "postgres" "-X" "-v" "ON_ERROR_STOP=1" "-tAc" "SELECT has_function_privilege('anon','public.t1_revoked_execute_dummy_20261008()','EXECUTE')"
exit=0
$ docker "run" "-d" "--name" "t1_revoked_execute_20261008_rest" "--network" "t1_revoked_execute_20261008_network" "--memory" "128m" "--cpus" "0.5" "--label" "com.supabase.cli.project=t1_revoked_execute_20261008" "-p" "127.0.0.1:55431:3000" "-e" "PGRST_DB_URI" "-e" "PGRST_JWT_SECRET" "-e" "PGRST_DB_ANON_ROLE=anon" "-e" "PGRST_DB_SCHEMAS=public" "-e" "PGRST_DB_POOL=2" "public.ecr.aws/supabase/postgrest:v14.10"
exit=0
$ docker "logs" "t1_revoked_execute_20261008_rest"
exit=0
192.168.107.1 - anon [08/Oct/2026:14:10:42 +0000] "GET / HTTP/1.1" 503 119 "" "node"
192.168.107.1 - anon [08/Oct/2026:14:10:43 +0000] "GET / HTTP/1.1" 503 119 "" "node"
192.168.107.1 - anon [08/Oct/2026:14:10:44 +0000] "GET / HTTP/1.1" 503 119 "" "node"
192.168.107.1 - anon [08/Oct/2026:14:10:45 +0000] "GET / HTTP/1.1" 503 119 "" "node"
RPC_POST_COUNT=1 target=http://127.0.0.1:55431/rpc/t1_revoked_execute_dummy_20261008
HTTP_STATUS=401 HTTP_BODY={"code":"42501","details":null,"hint":null,"message":"permission denied for function t1_revoked_execute_dummy_20261008"}
$ docker "logs" "--since" "2026-10-08T14:10:46.973Z" "t1_revoked_execute_20261008_db"
exit=0
POSTGRES_LOG_BEGIN
POSTGRES_LOG_END
SIGNAL_11=false
$ docker "exec" "t1_revoked_execute_20261008_db" "psql" "-U" "postgres" "-X" "-v" "ON_ERROR_STOP=1" "-tAc" "SELECT 1"
exit=0
DB_RECOVERY_SELECT=1
FINAL_RPC_POST_COUNT=1
$ docker "exec" "t1_revoked_execute_20261008_db" "psql" "-U" "postgres" "-X" "-v" "ON_ERROR_STOP=1" "-tAc" "DROP FUNCTION IF EXISTS public.t1_revoked_execute_dummy_20261008(); SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='t1_revoked_execute_dummy_20261008';"
exit=0
DROP FUNCTION
0
$ docker "rm" "-f" "-v" "t1_revoked_execute_20261008_rest"
exit=0
$ docker "rm" "-f" "-v" "t1_revoked_execute_20261008_db"
exit=0
$ docker "network" "rm" "t1_revoked_execute_20261008_network"
exit=0
Active loopback DB after=1

Q5_EXIT_CODE=0
```

## 7. Changed files and final gates

Owned files:

1. `apps/web/e2e/exposed-function-guard-api.spec.ts` — new, only D5.1–2.
2. `apps/web/playwright.api.config.ts` — append db-guard-real-backend; existing gate-stub / tna-real-backend unchanged.
3. `plans/markdown/postgres-revoked-execute-crash-mitigation.md` — T1 checked, status/handoff evidence link.
4. This T1 report — new.

Pre-existing T0 report preserved unchanged. No application code, migrations, helpers, dependencies or other tests changed.

Quality evidence:

- `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.e2e.json`: exit 0 (initial run; final rerun recorded below).
- First `pnpm --filter @trainers/web exec eslint e2e/exposed-function-guard-api.spec.ts playwright.api.config.ts`: exit 1, two no-empty-pattern errors on Playwright callback fixtures. Fixed by using `test.info()`, with no assertion or DB behavior changes; reran the focused RED afterward.
- Final lint/typecheck/Prettier/diff results: see final verification addendum below.
- Root lint/build/typecheck, regression specs, migrations and graph refresh are not T1/pre-merge gates here; remain deferred to T2–T5.
- Thermo-nuclear self-review: scope/security inspection completed; no production behavior changed. **Evidence limitation remains: no PostgreSQL error/recovery log lines from Q5.** No independent reviewer/worker was used.
- Graphify first path query had no unique match; exact `runSql` retry returned real-backend E2E consumers. Live helper/config/spec inspection used for T1. No cross-module implementation/decomposition occurred (T0 already covered callers).
- Context7 resolved `/websites/postgrest_en_v14`; confirmed authenticator/anon roles and schema reload/config contracts. No library upgrade.

### Final verification addendum

- `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.e2e.json`: final exit **0**.
- `pnpm --filter @trainers/web exec eslint e2e/exposed-function-guard-api.spec.ts playwright.api.config.ts`: final exit **0**.
- First scoped Prettier check: exit **1**, report formatting only; corrected with `pnpm exec prettier --write plans/markdown/postgres-revoked-execute-crash-mitigation-t1-report.md`.
- Final scoped command: `pnpm exec prettier --check apps/web/e2e/exposed-function-guard-api.spec.ts apps/web/playwright.api.config.ts plans/markdown/postgres-revoked-execute-crash-mitigation.md plans/markdown/postgres-revoked-execute-crash-mitigation-t1-report.md` — exit **0** after formatting.
- `git diff --check -- apps/web/e2e/exposed-function-guard-api.spec.ts apps/web/playwright.api.config.ts plans/markdown/postgres-revoked-execute-crash-mitigation.md plans/markdown/postgres-revoked-execute-crash-mitigation-t1-report.md`: exit **0**. Because new files are untracked, a separate whitespace scan also covers the new spec/report/plan without staging.
- Remaining-resource commands: `docker ps -a --format '{{.Names}}' | grep t1_revoked_execute`, `docker network ls --format '{{.Name}}' | grep t1_revoked_execute`, `docker volume ls --format '{{.Name}}' | grep t1_revoked_execute`: each final grep exit **1**, no output (zero leftovers).
- Self-review verdict: code scope **PASS**; Q5 log-evidence limitation explicitly retained. No version-wide safety claim.

**STOP:** T2 has not started. Report to Fajar; no extra RPC budget exists.
