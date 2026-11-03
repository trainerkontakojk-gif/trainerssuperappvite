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

## Tasklist

- [x] T1 RED: `apps/web/e2e/function-search-path-api.spec.ts` (catalog
      invariant: no non-extension function in `public` without a pinned
      `search_path`; `set_updated_at()` still stamps `updated_at`).
- [x] T2 Migration, rollback, README row.
- [x] T3 Local replay and GREEN, rollback round-trip.
- [ ] T4 Production apply (Fajar).
