# Postgres Revoked-EXECUTE Crash Mitigation — T0 Report

- **Task:** T0, verify and freeze the inventory (read-only). Plan: `plans/markdown/postgres-revoked-execute-crash-mitigation.md`.
- **Date:** 2026-10-08. **Lane:** D. **Branch/worktree:** `feat/tna-phase-1` (dirty TNA work left untouched).
- **Result: PASS.** The inventory matches the plan for Groups A/B/C. Group D (TNA) dropped to 0 because TNA T1 rev. 6 landed locally in another session; this drift was expected (STOP S4 resolved, not triggered).
- **Side effects:** none. No RPC was called, nothing in the database changed, no migration was applied, there was no remote or production access, and nothing was committed. Every DB query ran in `BEGIN READ ONLY … ROLLBACK` on the local container. The PostgREST OpenAPI read went to loopback only (`127.0.0.1`, asserted before the request).

## Decisions recorded (Fajar, 2026-10-08: "ikut rekomendasi kamu semua")

| #   | Decision                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Production is `ruosnjmtywcrghjgqugz` on **17.6.1.121**. Status: possibly affected. No upstream fix exists, and production is not to be probed.                                                                                                                                                                    |
| Q2  | The recommendation depended on whether the Railway service is still running, and that is unknown. The executor chose the option that is **safe either way: guard the four legacy overloads** (A21/A23/A25/A27) like the fenced ones. Moving them to `app_internal` can follow once Fajar confirms Railway is off. |
| Q3  | `get_leader_approved_scope_items` → `ALTER FUNCTION … SET SCHEMA app_internal` (reversible; drop later).                                                                                                                                                                                                          |
| Q4  | Group B: only restore anon EXECUTE. Existing errors stay as they are (P0001 → HTTP 400).                                                                                                                                                                                                                          |
| Q5  | One crash-repro call is approved for T1: an anon PostgREST call to a disposable dummy function, preferably on a **separate** local stack pinned to `17.6.1.121`.                                                                                                                                                  |
| Q6  | TNA keeps its own `tna_internal.assert_service_role()`; consolidation is deferred.                                                                                                                                                                                                                                |

## 1. Catalog re-run (local `supabase_db_trainerssuperappvite`, image `17.6.1.106`)

The query lists functions in `public`/`graphql_public` where anon or authenticated lacks EXECUTE. It returned **46 rows**. Classifying them by `prorettype = trigger` and the anon/authenticated privilege bits, then diffing against the plan's expected list, gave **an exact match: 34 A, 8 B, 4 C**.

- service_role has EXECUTE on every non-trigger function in the list.
- **TNA (Group D): 0 rows.** The five `public.tna_*` mutation functions now have anon EXECUTE = true. Helpers and triggers now live in the `tna_internal` schema (`assert_service_role`, `guard_need`, `guard_participant`, `guard_plan`, `replace_participants`, `require_actor`). This is rev. 6 as implemented by the TNA T1 session.
- PostgREST `PGRST_DB_SCHEMAS=public,graphql_public` is unchanged. `tna_internal` is not exposed.
- The OpenAPI listing (service-role, follow-privileges) has 46 `/rpc` paths. It includes the five `tna_*` functions plus `is_admin`, `is_admin_or_trainer`, and `refresh_qa_dashboard_summary_for_period` (all unaffected). Reachability itself rests on the PostgREST v14.10 routine query having no privilege filter (see the plan).

## 2. Callers (S5 check)

**Graphify:** `graphify affected callDurableRpc` and `graphify affected durable-db.ts` (`--depth 2`) show that `durable-db.ts` is consumed only inside `apps/telefun` (`server.ts`, `db.ts`, `orphan-cleanup.ts`, `call-manager-*`, `internal-scoring-http.ts`, …). Graphify does not model RPC names, because they are string literals. Per the skill's fallback rule, the executor stopped querying it and switched to an exhaustive `git grep`.

**Exhaustive sweep:** for each of the 46 names, the executor ran `git grep` for the quoted name across tracked files. The sweep excluded migrations, rollbacks, tests, e2e, and generated types. The results match the plan's tables exactly.

- Every Group A caller uses the service-role key:
  - `apps/api` uses `supabaseAdmin` or `createAdminClient()` (`apps/api/src/lib/supabase.ts:4-15`, built from `SUPABASE_SERVICE_ROLE_KEY`).
  - `apps/telefun` uses `createTelefunWebRtcDb()` with its default `admin` client (`durable-db.ts:8,384`; `server.ts:74` calls it with no arguments).
- Every runtime scoring call passes `p_claim_token_hash` by name, so it resolves to the **fenced** overloads:
  - `telefun-scoring-service.ts:143,192,223,259`
  - `workers/telefun-scoring-worker-runtime.ts:305`
  - `routes/telefun/recordings.ts:567,633`
- `enqueue_telefun_scoring` has a single signature. The legacy overloads have no in-repo caller.
- Group B PDKT callers use `createUserClient` (user JWT, `routes/pdkt/route-utils.ts:23`). `bulk_reorder_profiler_peserta` and `upsert_telefun_coaching_summary` use the admin client.
- No frontend `.rpc(` call exists in `apps/web/src`. There are no `supabase/functions` (edge functions), no `cron.schedule`/`pg_cron` usage, and no direct `pg` or `postgres` client in runtime code.
- Group C triggers and `get_leader_approved_scope_items` have no runtime caller.

**S5: clear.** No guarded function has a caller without service-role claims.

## 3. DECLARE initialisers before the guard (S3, Group A)

Definitions were read live via `pg_get_functiondef` and every non-constant `:=`/`DEFAULT` in a `DECLARE` block was listed. All of them are pure expressions over parameters or the clock. None reads a table or has a side effect.

| Function                                                                                              | Initialiser                                                                             |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `begin_telefun_realtime_finalization(_p5)`                                                            | `v_outcome TEXT := p_requested_outcome`                                                 |
| `checkpoint_telefun_realtime_transcript`                                                              | `v_text TEXT := btrim(p_text)`                                                          |
| `claim_telefun_realtime_attempt`                                                                      | `v_usage_request_id TEXT := 'telefun-webrtc:' \|\| p_attempt_id::text`                  |
| `claim_telefun_realtime_lease`, `consume_telefun_realtime_rate_limit`, `renew_telefun_realtime_lease` | `v_now TIMESTAMPTZ := clock_timestamp()`                                                |
| `claim_telefun_scoring` (both), `mark_telefun_recording_ready`                                        | `v_now TIMESTAMPTZ := now()`                                                            |
| `delete_monitoring_history`                                                                           | `v_module TEXT := lower(trim(p_module))`                                                |
| `finalize_telefun_realtime_attempt(_p5)`                                                              | `v_outcome TEXT := p_final_outcome`                                                     |
| `mark_telefun_realtime_usage`                                                                         | `v_safe_error TEXT := left(regexp_replace(coalesce(p_error,''), '\s+', ' ', 'g'), 512)` |

**S3: clear for Group A.**

Implementation notes from the definitions:

- 27 Group A functions use `SET search_path = ''`. The guard call **must** be schema-qualified (`PERFORM app_internal.assert_service_role();`).
- The others use `search_path=public`: `cleanup_pdkt…`, `delete_monitoring_history`, `refresh_mv…` (`public, pg_temp`).

## 4. Group B: statements before the anon rejection (S3)

| Function                                 | First statements after `BEGIN`                                                                          | Verdict                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `bulk_reorder_profiler_peserta`          | `IF auth.role() = 'service_role' … ELSIF auth.role() = 'authenticated' … ELSE RAISE 'Unauthorized'`     | Rejects anon first ✓                          |
| `soft_delete_pdkt_mailbox_item`          | `v_actor_id := auth.uid(); IF v_actor_id IS NULL THEN RAISE 'Unauthorized'`                             | ✓                                             |
| `submit_pdkt_mailbox_batch`              | `v_creator_id := auth.uid(); IF … IS NULL THEN RAISE 'Unauthorized'`                                    | ✓                                             |
| `submit_pdkt_mailbox_batch_with_subject` | same as above                                                                                           | ✓                                             |
| `submit_pdkt_mailbox_reply_with_outcome` | `v_user_id := auth.uid(); v_now := now(); IF v_user_id IS NULL THEN RAISE 'Unauthorized'`               | ✓ (`now()` is harmless)                       |
| `submit_pdkt_mailbox_reply`              | Only `SELECT public.submit_pdkt_mailbox_reply_with_outcome(...)`                                        | ✓ through delegation                          |
| `upsert_telefun_coaching_summary`        | `IF auth.role() = 'anon' THEN RAISE 'Access denied: Anonymous users cannot upsert coaching summaries.'` | ✓                                             |
| `get_leader_approved_scope_items`        | `RETURN QUERY SELECT … FROM leader_access_requests …`, with **no caller check**                         | ✗ → moved to `app_internal` (Q3), not granted |

Every raise is P0001 with no `ERRCODE`, which PostgREST returns as HTTP 400. The D5 Group B expectations therefore assert code `P0001` with these exact messages (`Unauthorized` / the coaching message), plus sentinel alive and no rows created.

## 5. Converting A33/A34 (LANGUAGE sql → plpgsql)

The live definitions are both `LANGUAGE sql STABLE SET search_path TO 'public'` and SECURITY INVOKER:

- `get_leader_scope_snapshot(p_leader_user_id uuid, p_module text) RETURNS TABLE(request_ids uuid[], peserta_ids uuid[], batch_names text[], tims text[], service_types text[])`. The body is one CTE query over `leader_access_requests`, `leader_access_request_groups`, `access_group_items`, `access_groups`, and `profiler_peserta`.
- `get_profiler_folder_counts(p_accessible_ids uuid[] DEFAULT NULL) RETURNS TABLE(batch_name text, peserta_count bigint)`. **The `DEFAULT NULL` must be kept.**

Why switching to SECURITY DEFINER is safe:

- Every table they read is owned by `postgres`, has RLS enabled, and does **not** force RLS.
- Both `postgres` and `service_role` have `rolbypassrls = true`.
- So DEFINER-as-`postgres` returns the same rows the service-role caller sees today.

How to convert:

- Use `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public`, then the guard, then `RETURN QUERY <identical SELECT>`.
- Add `#variable_conflict use_column`. In `get_profiler_folder_counts`, the OUT column `batch_name` would otherwise collide with `pp.batch_name`/`group by`. In the other function, unqualified CTE columns sit next to OUT names.
- `CREATE OR REPLACE` may change the language, because the return type, argument names, and defaults stay the same.

## 6. pg_graphql

- **Local:** `pg_graphql` is available (1.5.11) but **not installed**, although the `graphql`/`graphql_public` schemas exist.
- **Production:** unknown. pg_graphql is commonly enabled on hosted projects, and production is not to be probed.
- **Source check:** pg_graphql builds its schema with `has_function_privilege(current_user, oid, 'EXECUTE')` (`sql/load_sql_context.sql:446`). It drops non-executable functions (`src/graphql.rs:2192`, `src/sql_types.rs:122`). The docs (Context7 `/websites/supabase_github_io_pg_graphql`, security page) say only that it respects role permissions for tables and columns. The source is what confirms the behaviour for functions.
- **What this means:**
  - **Today:** the revoked functions are invisible in GraphQL, so GraphQL is not a crash path.
  - **After the fix:** granting EXECUTE can make the guarded functions **visible** as GraphQL fields, wherever pg_graphql is enabled and the function is GraphQL-eligible (not overloaded, supported types).
  - **Why that is acceptable:** the guard runs inside the function body, so anon and authenticated get the same `42501` through GraphQL. The guard does not depend on the entry path.
  - **T2 must** note this in `docs/architecture.md`. An optional hardening is a `@graphql({"name": …})`/omit comment directive, but that needs Fajar's say. A GraphQL E2E can only run where pg_graphql is installed, so local E2E cannot prove it unless the extension is enabled locally. Ask Fajar before enabling it.

## 7. Open items handed to T1

1. **Separate stack for Q5.** No `supabase/config.toml` is tracked in this repo; only `reference-repo/supabase/config.toml` exists. The running stack's start procedure is therefore not discoverable from the repo. The Supabase CLI cache `supabase/.temp/postgres-version` holds `17.6.1.121` (linked production), yet the running container is `17.6.1.106`. Before creating any disposable stack, T1 must find out how the current stack is started and isolate the new one: different project id and ports, never `supabase stop`/`db reset` on the active stack. If that cannot be done safely, fall back to a single dummy call on the existing local stack (17.6.1.106) and record the limitation.
2. **RED baseline.** On the current local DB the D5.1 invariant must return exactly the 42 non-trigger rows (34 A + 8 B). The plan's "49 rows" figure predates TNA rev. 6. Both the plan's D5.1 note and S4 have been updated accordingly.

## Commands (all exit 0)

```text
docker exec supabase_db_trainerssuperappvite psql -U postgres -X -A -F '|' -c "BEGIN READ ONLY; <catalog inventory>; ROLLBACK;"
docker exec supabase_db_trainerssuperappvite psql … "BEGIN READ ONLY; SELECT json_agg(… pg_get_functiondef …); ROLLBACK;"
docker exec supabase_db_trainerssuperappvite psql … "BEGIN READ ONLY; <relforcerowsecurity / rolbypassrls / pg_available_extensions>; ROLLBACK;"
docker inspect supabase_rest_trainerssuperappvite (PGRST_DB_SCHEMAS)
python3 <loopback-asserted GET /rest/v1/ OpenAPI with local service-role key from apps/api/.env.integration>
graphify affected callDurableRpc --depth 2; graphify affected durable-db.ts --depth 2
python3 <git grep sweep of 46 names>
gh api repos/supabase/pg_graphql/contents/{sql/load_sql_context.sql,src/graphql.rs,src/sql_types.rs}
```

The scratch outputs (catalog dump, function definitions JSON) are in the session scratchpad. They are not repo artifacts.
