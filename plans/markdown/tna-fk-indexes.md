# Index the TNA foreign keys

## Requirement

The production Supabase advisor run of 2026-11-09 (`ruosnjmtywcrghjgqugz`,
lint `0001_unindexed_foreign_keys`) flags ten TNA foreign keys without a
covering index. Two are new this week (from
`20261107120000_tna_phase5_catalog.sql`); eight have existed since the
2026-11-03 baseline:

| Table                   | Foreign key column(s)                                         |
| ----------------------- | ------------------------------------------------------------- |
| `tna_programs`          | `created_by`, `updated_by` (new)                              |
| `tna_needs`             | `created_by`, `indicator_id`, `period_id`, `previous_plan_id` |
| `tna_plans`             | `created_by`, `evaluation_period_id`, `program_id`            |
| `tna_plan_participants` | `peserta_id`                                                  |

A local clean replay shows the same ten, so production and the repo agree.
Without an index, each delete or key change in a referenced table scans the
TNA table once per foreign key, and lookups by author or period scan it whole.
`idx_tna_needs_service_period (service_type, period_id)` does not cover
`period_id` because `period_id` is not its leading column.

Out of scope: the other 35 `unindexed_foreign_keys` findings (non-TNA, mostly
legacy or production-only tables that need a production readback first), the
SECURITY DEFINER EXECUTE warnings (intended, see
`postgres-revoked-execute-crash-mitigation.md`), leaked password protection
(dashboard setting, Fajar), and the RLS `auth_rls_initplan` and
`multiple_permissive_policies` lints. Also out of scope:
`idx_tna_participants_plan (plan_id)`, which the advisor reports as unused and
which duplicates the leading column of the unique key
`tna_plan_participants_plan_id_peserta_id_key`. Dropping it is a separate
decision.

## Design

- Lane D (schema migration). One idempotent migration
  `20261109090000_tna_fk_indexes.sql` with ten single-column
  `CREATE INDEX IF NOT EXISTS`, plus a rollback and a README row.
- Plain `CREATE INDEX` (not `CONCURRENTLY`): migrations run in a transaction and
  the TNA tables are small, so the lock is brief.
- Data-loss risk: none. Roles touched: none (no GRANT, REVOKE or RLS changes).
- Guard: a real-backend catalog E2E (`apps/web/e2e/tna-fk-index-api.spec.ts`,
  project `tna-fk-index-real-backend`). It fails when any foreign key on a
  `public.tna_*` table has no index whose leading columns match the foreign key
  columns. That is the advisor's rule, so it also accepts a partial index such
  as `uq_tna_plans_open_need`, and it covers later TNA phases.
- Production apply needs Fajar's OK (`supabase db push` or the dashboard SQL
  editor). Afterwards, re-run the advisor and confirm the ten TNA findings are
  gone.

## Tasklist

- [x] Plan
- [x] RED: catalog E2E fails locally and lists the same ten foreign keys
- [x] Forward migration, rollback and README row
- [x] GREEN after a clean local replay
- [x] Rollback round-trip: spec RED again after the rollback (ten keys), GREEN after re-apply; a second apply only emits NOTICEs
- [x] Changelog, review, commit and push to `main`
- [x] Production apply (approved by Fajar, 2026-11-09 01:33 UTC; readback and
      advisor recorded in `docs/database.md`)
