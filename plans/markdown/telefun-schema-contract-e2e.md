# Telefun schema contract: replace the stale unit test with E2E

- **Status:** Fajar picked this item 2026-10-10.
- **Lane:** D. It started as Lane C (test-only), but the new spec found a schema gap in migration replay (see Finding), so it adds one idempotent migration.

## Requirement

`apps/api/src/__tests__/telefun-schema-contract.test.ts` greps migration files as text. CI does not run it (`pnpm test:fast` is off), so nobody noticed when it went stale. It now fails in its second test. That test asserts that no migration after `20260611100000` mentions `FUNCTION public.upsert_telefun_coaching_summary`, but `20261008150001_restore_anon_execute_client_rpcs.sql` (revoked-EXECUTE rollout, PR #38) grants `EXECUTE ON FUNCTION public.upsert_telefun_coaching_summary(uuid,jsonb,integer,text) TO anon` on purpose. The function body already rejects anon, and `exposed-function-guard-api.spec.ts` (D5.3–5 Group B) proves that against the local database.

The three tests guard real contracts that no E2E covers yet:

1. `telefun_history` declares every column the API and Telefun write (`recording_path`, `agent_recording_path`, `session_metrics`, `voice_dashboard_metrics`, `disruption_results`, `persona_config`, `realistic_mode_enabled`, `score`, `feedback`).
2. `upsert_telefun_coaching_summary` has exactly one overload, `(uuid, jsonb, integer, text)`, and `authenticated` and `service_role` can execute it. The legacy 2-argument overload is gone. If it existed, PostgREST could not choose between the overloads for the 2-argument call in `apps/api/src/lib/telefun-analysis.ts`.
3. The last two parameters default to `NULL`, so that 2-argument call resolves.

A text grep of migrations proves none of these about the database that actually runs. A catalog query and a real RPC call against the local stack do.

**Acceptance:**

- A real-backend spec checks contracts 1–3 against the local database, including the 2-argument and 4-argument service-role calls the API makes through PostgREST.
- The spec fails when the contract breaks (RED by mutation on the local database: recreate the legacy overload).
- The unit test file and its entries in `scripts/test-fast.json` and `scripts/test-core.json` are removed, but only after the spec passes.

## Design

- `apps/web/e2e/telefun-schema-contract-api.spec.ts`, using the helpers in `helpers/sidakRealBackend.ts` (`readLoopbackEnv`, `runSql`, `createAdmin`, `installLoopbackFetchGuard`). Register it as project `telefun-schema-real-backend` in `playwright.api.config.ts`.
- Catalog tests read `information_schema.columns` and `pg_proc` (the same pattern as D5.1).
- The RPC test creates one disposable auth user and one `telefun_history` row, calls the RPC with the service-role client using 2 named arguments and then 4, checks `telefun_coaching_summary`, and deletes the user in `afterAll`. The delete cascades.
- Anon rejection stays in `exposed-function-guard-api.spec.ts`. It is not duplicated here.

## Tasklist

- [x] RED: with a legacy `upsert_telefun_coaching_summary(uuid, jsonb)` created on the local database, the overload test fails and the 2-argument RPC call fails with `PGRST203: Could not choose the best candidate function`. With `persona_config` renamed, the column test fails. Both mutations reverted.
- [x] RED (schema gap): on the clean local database the RPC test fails with `42703: column "ai_annotation_count" … does not exist`, for the 2-argument call too.
- [x] GREEN: migration `20261010120000_add_telefun_coaching_summary_annotation_columns.sql` applied to the local database with `psql`; spec 3/3. A second apply (columns and constraints present, the production state) is a no-op. Full `playwright.api.config.ts`: 105 passed.
- [x] Unit test and its entries in `scripts/test-fast.json` and `scripts/test-core.json` removed; `tsc -p tsconfig.e2e.json` exit 0; `git diff --check` clean.
- [x] CI: PR #49 run 38046212172: the rollback check passed, and the blocking clean replay applied `20261010120000` (`Started supabase local development setup.`). Merged as 6eb4527.
- [x] Production ledger (Fajar's approval; Hermes ran it 2026-10-10, 10:54:41–43 UTC): the pre-check found the version absent and both constraints present. A dry-run on production (`ROLLBACK`) left no dummy row. `apply-20261010120000.sql` (one transaction: migration, history row, `COMMIT`) exited 0. Post-check: version recorded with the full 1790-byte statement, 8 columns and both constraints unchanged, 32 rows untouched. NOTICE output is not returned through `supabase db query --linked`, so the no-op is shown by the identical before/after schema.

## Finding (2026-10-10): coaching summary RPC fails on a database built from migrations

The new spec's RPC test fails on the local database with `42703: column "ai_annotation_count" of relation "telefun_coaching_summary" does not exist`. The 2-argument call fails too, because the function always writes the three annotation columns.

Cause: `005_carbon_copy_parity.sql` creates `telefun_coaching_summary` without `ai_annotation_count`, `ai_annotation_checksum`, `ai_annotation_completed_at` and their two CHECK constraints. `20260523000000_telefun_parity_extensions.sql` declares them only inside `CREATE TABLE IF NOT EXISTS`, which is a no-op once the table exists. No migration adds them with `ALTER TABLE`. Every database replayed from migrations (local stack, CI replay) therefore lacks the columns. Whether production has them is unknown (production migration history is out of sync).

This turns the item from Lane C into Lane D: the likely fix is a new idempotent migration (`ADD COLUMN IF NOT EXISTS` plus the constraints) with a rollback. Production check (Fajar, read-only, 2026-10-10): `telefun_coaching_summary` has all 8 columns and both CHECK constraints (`telefun_coaching_summary_ai_annotation_count_check`, `telefun_coaching_summary_ai_annotation_checksum_check`), so the feature works there. `ADD CONSTRAINT` has no `IF NOT EXISTS`, so the migration guards each constraint by name; otherwise it would fail with 42710 on production and abort the atomic wrapper. The rollback is a no-op on purpose: on production the columns predate this migration and the RPC writes them.
