# Pin `search_path` on flagged public functions

## Requirement

The production Supabase advisor run of 2026-11-03 (`ruosnjmtywcrghjgqugz`,
lint `0011_function_search_path_mutable`) flags 11 functions in `public`
without a pinned `search_path`:

- In the repo: `set_updated_at()` (`000_profiles_core.sql`), a plain trigger
  function used by `profiles`, `004_admin_core` tables and
  `trainer_activities`.
- Production-only (legacy drift, no repo definition, see
  `docs/rebuild-logs/phase-37-database-legacy-parity-audit.md`):
  `is_super_admin`, `is_approved_trainer` (both SECURITY DEFINER),
  `get_qa_dashboard_data`, `get_qa_dashboard_range_data`,
  `get_qa_dashboard_range_trend_data`, `get_qa_trend_data`,
  `_qa_session_scores`, `get_agent_list_with_scores`,
  `get_qa_agent_directory_summary`, `qa_score_agent`.

A function without a pinned `search_path` resolves unqualified names through
the caller's path, so a caller who can create objects earlier in that path
(for example in `pg_temp`) can shadow a table or function. For SECURITY
DEFINER functions that runs the shadowing object with the owner's rights.

Out of scope: the advisor's SECURITY DEFINER EXECUTE warnings (intended, see
`postgres-revoked-execute-crash-mitigation.md`; every in-repo function added
after 2026-10-09 starts with an `assert_service_role()` guard), leaked password
protection (dashboard setting, Fajar), and the RLS performance lints (most
`profiles`/`activity_logs` policies are prod drift and need a prod readback
first).

## Design

- Lane D (security, migration). One idempotent migration
  `20261103090000_pin_function_search_path.sql` plus rollback and README row.
- `set_updated_at()` gets `SET search_path = ''`. Its body only touches `NEW`
  and `now()` (`pg_catalog`), so an empty path changes nothing.
- The ten production-only functions get
  `SET search_path = public, extensions, pg_temp` through a `DO` block that
  matches them by name (all overloads) and only when no `search_path` is set
  yet. Their bodies are not in the repo, so the path keeps what database
  callers already resolve (`public`, then `extensions`) and moves `pg_temp`
  last. Locally none of them exist, so the block is a no-op there.
- Data-loss risk: none. Roles touched: none (no GRANT/REVOKE changes).
- Production apply needs Fajar's OK. Before applying, read back
  `pg_get_functiondef` for the ten production-only functions and confirm no
  body depends on an unqualified object outside `public`/`extensions`.

## Production readback (2026-11-03, read-only, authorized by Fajar)

`supabase db query --linked` with catalog-only `SELECT`s on
`ruosnjmtywcrghjgqugz`:

- All ten production-only functions are owned by `postgres` and have no
  `proconfig`. Their bodies reference only `public` relations (most
  unqualified), `auth.uid()` (qualified), CTE names and temp tables they
  create themselves. No `public` relation shares a temp-table name
  (`temp_qa_*`, `temp_period_base`, `session_data`), so `pg_temp` last still
  resolves them. `public, extensions, pg_temp` therefore keeps behaviour.
- `is_approved_trainer()` is SECURITY DEFINER with an unqualified `profiles`,
  so the pin closes a real shadowing path. `is_super_admin()` compares a fixed
  email. Neither is referenced by any policy.
- No repo code calls the QA dashboard/score functions; Telefun's
  `"consume_rate_limit"` string is only the operation label for
  `consume_telefun_realtime_rate_limit`.
- Already pinned on production (not touched): `get_auth_role` (`public,
pg_temp`, used by policies on `profiles`, `activity_logs`,
  `profiler_peserta`, `qa_temuan`, `storage.objects`), `consume_rate_limit`
  and `get_service_trend_dashboard` (`''`), `publish_rule_version` x2
  (`public`), `rls_auto_enable` (`pg_catalog`, event trigger).
- Out-of-scope findings for a follow-up: `consume_rate_limit(text,int,int)`
  and `get_service_trend_dashboard(uuid[])` are SECURITY DEFINER, executable
  by `anon`, have no caller check and no repo caller. The first lets the anon
  key upsert arbitrary `security_rate_limits` rows (6 rows today); the second
  returns QA defect and audited-agent counts for any period ids.
  `publish_rule_version` rejects callers without an admin/trainer profile.

## Tasklist

- [x] T1 RED: `apps/web/e2e/function-search-path-api.spec.ts` (catalog
      invariant: no non-extension function in `public` without a pinned
      `search_path`; `set_updated_at()` still stamps `updated_at`).
- [x] T2 Migration, rollback, README row.
- [x] T3 Local replay and GREEN, rollback round-trip.
- [ ] T4 Production apply (Fajar).
