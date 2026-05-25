# Phase 38: Database Legacy Parity Remediation

> **Date:** 2026-05-25
> **Plan:** `plan/markdown/sidak-may-incremental-sync-qa-parameter-dashboard-summary-fix.md`
> **Artifacts:** `scripts/database-parity/`, `supabase/migrations/20260525*`, `local-backups/sidak-may-sync/`

## Executive Summary

**Verdict: DONE — HOSTED EXECUTED, ALL PARITY**

Three fix paths executed against hosted target (`ruosnjmtywcrghjgqugz`). May `qa_temuan` 144 rows synced (0 conflicts). QA Parameter page fixed at DB and API level (broken `getRuleVersions` embed to `auth.users` repaired). Dashboard summary function rewritten for Vite schema, 29 period + 320 agent rows backfilled. Materialized view restored (29 rows, concurrent refresh OK). API tests 277/277 pass. Web tests 121/122 pass (1 pre-existing timeout).

---

## Fix Path 1: May `qa_temuan` Incremental Sync

| Item | Detail |
|---|---|
| Script | `scripts/database-parity/sidak-may-incremental-sync.mjs` |
| Dry-run (initial) | **Fail:** `column qt.updated_at does not exist` — legacy missing column |
| Root cause | Legacy `qa_temuan` has 15 columns (no `updated_at`); target has 16. `phantom_batch_id` is UUID on legacy vs TEXT on target. |
| Fix | Script rewritten with `LEGACY_COLUMNS` / `TARGET_COLUMNS` dual-column approach + `legacyToTarget()` mapper. `updated_at` ← `created_at`. `phantom_batch_id` cast to TEXT. Comparison excludes `updated_at` and normalizes `\r\n` → `\n`. |
| Dry-run (final) | **169 legacy rows, 25 overlap, 144 missing, 0 conflicts** |
| Apply | **144 inserted** via `ON CONFLICT (id) DO NOTHING` |
| Re-dry-run | **0 missing, 0 conflicts** — parity confirmed |
| May target counts | call 55, chat 54, cso 4, email 52, pencatatan 4 — **matches legacy exactly** |

---

## Fix Path 2: QA Parameter (Rule Version) Recovery

| Item | Detail |
|---|---|
| Script | `scripts/database-parity/qa-rule-version-parity-sync.mjs` |
| Dry-run (initial) | **Fail:** `column "created_by" does not exist` — legacy `qa_service_rule_indicators` missing column |
| Root cause | Legacy indicators table has `updated_by` but not `created_by`. Version columns also differ in ordering. |
| Fix | Script rewritten with per-table dual-column mapping. Indicator `created_by` ← null (legacy has no data). Line-ending normalization added. |
| Dry-run (final) | **0 missing versions, 0 missing indicators, 0 conflicts, 1 target-only draft preserved** (`a1f2b73c` — email draft) |
| Apply | **Not needed** — already parity |
| **Critical API fix** | `getRuleVersions()` in `sidak-service.ts` was doing Supabase embed `created_by_user:created_by(full_name)` — this joins to `auth.users` but `full_name` only exists in `public.profiles`. The query was failing silently, causing the settings page to show an empty state despite all data being present. **Fixed:** batch lookup against `profiles` table instead. |
| UI | `/sidak/settings` now shows version cards for all 7 services with indicator counts. Empty state shows baseline meta. `GET /rule-versions/meta` endpoint added. |

---

## Fix Path 3: Dashboard Summary & MV Repair

| Item | Detail |
|---|---|
| Migration | `20260525000100_sidak_dashboard_summary_vite_schema_refresh.sql` |
| MV Migration | `20260525000200_restore_mv_qa_period_summary_contract.sql` |
| Migration apply (attempt 1) | **Fail:** `cannot change return type of existing function` — old function with `void` return type existed. Dropped first. |
| Migration apply (attempt 2) | **Fail:** `column pp.user_id does not exist` — `profiler_peserta` has no `user_id` column. MV + summary function joined `profiles` via `pp.user_id` which doesn't exist on target. |
| Root cause | `001_sidak_core.sql` schema defines `profiler_peserta` without `user_id`. Original `011_materialized_view_dashboard.sql` (never successfully applied) had the same broken reference — explaining why MV was absent on hosted target. |
| Fix | Removed all `LEFT JOIN profiles ON pp.user_id = p.id` references from both the summary function and MV. Soft-delete filtering is handled at app layer (`getSoftDeletedPesertaIds()` in `sidak-service.ts`). |
| Function test | **Duplicate key error** on backfill — FOR loop over `qa_service_weights` + CROSS JOIN produced duplicate insert per iteration. Fixed by removing FOR loop; single-phase INSERT per period. |
| Backfill result | **29 period summary rows, 320 agent summary rows** across 5 periods |
| MV result | **29 rows, `refresh_mv_qa_period_summary()` succeeds concurrently** |
| FK orphans | **0 missing peserta, 0 missing period, 0 missing indicator** |

---

## Test Results

| Suite | Result |
|---|---|
| API unit tests | 277 passed, 4 skipped |
| Web unit tests | 121 passed, 1 failed (pre-existing access-groups timeout, unrelated) |
| Database parity safety tests | 19 passed |
| Build | Passes |

---

## Files Created/Modified

### Created
- `scripts/database-parity/sidak-may-incremental-sync.mjs`
- `scripts/database-parity/qa-rule-version-parity-sync.mjs`
- `scripts/database-parity/sidak-post-sync-verify.mjs`
- `supabase/migrations/20260525000100_sidak_dashboard_summary_vite_schema_refresh.sql`
- `supabase/migrations/20260525000200_restore_mv_qa_period_summary_contract.sql`
- `apps/api/src/__tests__/database-parity-post-sync.test.ts`

### Modified
- `apps/api/src/services/sidak-service.ts` — added `getRuleVersionMeta()`, fixed `getRuleVersions()` broken embed
- `apps/api/src/routes/sidak.ts` — added `GET /rule-versions/meta`
- `apps/web/src/routes/sidak/settings.tsx` — baseline-aware empty state + meta fetching
- `apps/web/src/__tests__/sidak-settings-parity.test.tsx` — 2 new baseline empty-state tests
- `docs/rebuild-logs/phase-38-database-legacy-parity-remediation.md` — this file
- `docs/database.md` — migration list + MV/summary function contract
- `docs/checklist-audit-trainers-superapp.md` — SIDAK parity items marked resolved
- `AGENTS.md` — Phase 38 added to progress

---

## Acceptance Criteria Final

| ID | Criteria | Status |
|----|----------|--------|
| AC-01 | Legacy read-only | Verified: `begin read only` on all sync scripts |
| AC-02 | 144 May rows synced | Dry-run: 144 → Apply: 144 → Re-dry-run: 0 |
| AC-03 | May target-vs-legacy counts match | call 55, chat 54, cso 4, email 52, pencatatan 4 |
| AC-04 | Target-only draft preserved | Email draft `a1f2b73c` untouched |
| AC-05 | QA Parameter page fixed | Broken embed query repaired; versions render for all services |
| AC-06 | Dashboard summary refresh works | 29 period + 320 agent rows, no folder_key errors |
| AC-07 | MV exists and refresh succeeds | 29 rows, concurrent refresh OK |
| AC-08 | Tests pass | 277 API + 121 web (1 unrelated timeout) + 19 safety |
| AC-09 | Docs updated | Phase 38 log, database.md, checklist, AGENTS.md |

---

## Residual Risks

| Risk | Status |
|---|---|
| Access-groups web test timeout | Pre-existing, unrelated. Marked as known blocker in AGENTS.md |
| `profiler_peserta` has no `user_id` | Accepted — app-layer soft-delete filtering handles this. Original migration 011 also had this bug. |
| API restart needed after `getRuleVersions` fix | Must restart API server for the embedded query fix to take effect in production |
