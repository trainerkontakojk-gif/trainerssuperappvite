# Capture the remaining prod-only objects (phase-37 parity gaps)

## Requirement

A read-only prod readback (2026-10-17) found objects that no repo migration
creates, so local and E2E databases behave differently from prod:

- `guard_profile_sensitive_columns` → `prevent_self_role_status_change()` on
  `profiles`;
- `on_{ketik,pdkt,telefun}_history_insert` → `log_*_activity()`, the only
  logging of finished simulation sessions;
- `tr_pdkt_mailbox_updated_at` and `ketik_review_jobs_updated_at`;
- the legacy `results` table, still read by the Telefun monitoring review.

## Design

- Lane D. One idempotent migration per group (`20261017130000`..`130300`),
  each with a rollback and a README entry.
- Hardened versus prod: every trigger function gets `SET search_path = ''`
  and `REVOKE ALL ... FROM PUBLIC, anon, authenticated`. The profile guard
  becomes SECURITY INVOKER (it only edits NEW). The activity-log functions stay
  SECURITY DEFINER, because the inserting role may not be allowed to write
  `activity_logs`.
- `results`: the same columns, constraints and indexes as prod. It is not
  given prod's `update_results_updated_at`, because the table has no
  `updated_at` and that trigger breaks every UPDATE on prod. Access is
  backend-only: anon loses all grants, and authenticated keeps SELECT on its
  own rows. Duplicate policies and the `get_auth_role()` 'Trainer'/'Leader'
  policies are dropped. The rollback drops the table, which is local only.
- KETIK `persistSession` no longer writes to `results`, and `deleteSession`
  no longer deletes from it. Both used columns that do not exist (`session_id`,
  `metadata`) and omitted `score`, which is NOT NULL, so they always failed
  silently. `clearHistory` keeps its delete, which works on prod.
- Prod apply is not part of this change and needs Fajar's OK. Before applying
  `20261017130300`, check `pg_get_functiondef('public.get_auth_role'::regproc)`
  and `SELECT DISTINCT role FROM profiles` on prod to confirm the dropped
  'Trainer'/'Leader' policies never match.

## Tasklist

- [x] RED: `prod-parity-triggers-api.spec.ts` (7 of 9 failing) and
      `monitoring-legacy-results-api.spec.ts` (`relation "results" does not
    exist`).
- [x] Four migrations, rollbacks, and README entries.
- [x] Remove the dead KETIK dual-write and dual-delete.
- [x] Clean local replay; both specs GREEN twice.
- [x] Rollback round-trip per migration (RED after rollback, GREEN after
      re-apply; each migration applied twice).
- [x] Regression: ketik-integrity, ketik-session, ketik-history,
      sidak-temuan-tahun-trigger.
