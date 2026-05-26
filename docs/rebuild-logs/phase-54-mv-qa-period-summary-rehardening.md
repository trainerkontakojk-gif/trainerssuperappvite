# Phase 54: MV QA Period Summary Post-Restore Re-Hardening

**Date:** 2026-05-26  
**Status:** COMPLETE  
**Type:** Remediation / Security Hardening

---

## Root Cause

In Phase 53 (`017_harden_mv_qa_period_summary.sql`), the `mv_qa_period_summary` materialized view was hardened with `REVOKE ALL FROM anon, public, authenticated` and `GRANT SELECT TO service_role` only. However, migration ordering revealed a gap:

| Order | File | Effect on MV grants |
|---|---|---|
| 18 | `017_harden_mv_qa_period_summary.sql` | REVOKE from non-service_role, GRANT to service_role only |
| 23 | `20260525000200_restore_mv_qa_period_summary_contract.sql` | **DROP CASCADE + recreate MV**, GRANT back to `authenticated, service_role` |

Because `017` sorts lexicographically before `20260525000200`, a fresh replay of all migrations would always end with the contract restore granting `authenticated` access — undoing the hardening intent.

---

## Solution

**Terminal migration** `20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql` placed lexicographically after all `20260525xxxx` files:

```sql
REVOKE ALL ON public.mv_qa_period_summary FROM anon, public, authenticated;
GRANT SELECT ON public.mv_qa_period_summary TO service_role;
REVOKE EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary() FROM authenticated, public, anon;
GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary() TO service_role;
```

This migration does NOT touch MV schema, indexes, or function body. It only manages GRANT/REVOKE.

---

## Files Changed

| File | Action | Description |
|---|---|---|
| `supabase/migrations/20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql` | **Created** | Terminal re-hardening migration |
| `supabase/rollbacks/rollback_20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql` | **Created** | Rollback to pre-remediation state |
| `apps/api/src/__tests__/mv-qa-period-summary-security.test.ts` | **Modified** | Migration ordering assertions + terminal migration tests |
| `apps/api/src/__tests__/database-parity-post-sync.test.ts` | **Modified** | Removed incorrect authenticated final-state assumption; added terminal migration validation |
| `docs/database.md` | **Modified** | Added migration chain docs, terminal re-hardening note |
| `AGENTS.md` | **Modified** | Added Phase 54 entry + updated Relevant Files |
| `GEMINI.md` | **Modified** | Added Phase 54 entry + updated Relevant Files |
| `docs/rebuild-logs/phase-54-mv-qa-period-summary-rehardening.md` | **Created** | This file |

---

## Acceptance Criteria Status

| ID | Criterion | Status |
|---|---|---|
| AC-01 | Fresh replay → SELECT only to `service_role` | ✅ Terminal migration revokes from anon/public/authenticated |
| AC-02 | Fresh replay → EXECUTE only to `service_role` | ✅ Refresh function locked to service_role |
| AC-03 | Incremental migration after `20260525000200` | ✅ Timestamp `20260526090000` |
| AC-04 | Test verifies order-aware final state | ✅ Ordering assertions in test file |
| AC-05 | Parity test no longer assumes authenticated is final | ✅ Removed, replaced with contract-only check |
| AC-06 | `sidak-service.ts` uses `supabaseAdmin` | ✅ Confirmed (unchanged) |
| AC-07 | Docs synced | ✅ database.md, AGENTS.md, GEMINI.md |
| AC-08 | Rollback available | ✅ rollback file created |

---

## Test Results

### Targeted Tests (mv-qa-period-summary-security + database-parity-post-sync)

```
pnpm --filter @trainers/api exec vitest run \
  src/__tests__/mv-qa-period-summary-security.test.ts \
  src/__tests__/database-parity-post-sync.test.ts

 Test Files  2 passed (2)
      Tests  47 passed (47)
   Duration  1.92s
```

### Full API Suite

```
pnpm --filter @trainers/api test

 Test Files  22 passed | 1 failed (23)
      Tests  360 passed | 4 skipped (364)
   Duration  21.01s
```

Note: 1 failed file (`telefun-routes.test.ts`) is pre-existing env issue (`supabaseUrl is required`), unrelated to MV hardening.

---

## Migration Replay Verification

After applying all migrations in order:

```sql
-- Verify MV exists
SELECT to_regclass('public.mv_qa_period_summary');

-- Verify refresh function exists  
SELECT proname FROM pg_proc WHERE proname = 'refresh_mv_qa_period_summary';

-- Verify grants (should only show service_role)
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'mv_qa_period_summary';
-- Expected: only 'service_role' for SELECT

SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_name = 'refresh_mv_qa_period_summary';
-- Expected: only 'service_role' for EXECUTE
```

---

## Manual SQL Role Verification

```sql
SET ROLE anon;
SELECT count(*) FROM public.mv_qa_period_summary; -- expect permission denied

SET ROLE authenticated;
SELECT count(*) FROM public.mv_qa_period_summary; -- expect permission denied

SET ROLE service_role;
SELECT count(*) FROM public.mv_qa_period_summary; -- expect success
```

---

## Rollback Plan

If the terminal hardening causes issues:

```bash
psql "$DATABASE_URL" < supabase/rollbacks/rollback_20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql
```

This restores `GRANT SELECT/EXECUTE ... TO authenticated, service_role` (pre-remediation state).
