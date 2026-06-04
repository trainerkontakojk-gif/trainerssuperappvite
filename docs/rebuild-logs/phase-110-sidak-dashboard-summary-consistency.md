# Phase 110: SIDAK Dashboard Summary Consistency Fix

## Summary

Dashboard summary KPI cards (`totalDefects`, `avgAgentScore`, `complianceRate`, dll.) kini dihitung secara real-time dari `qa_temuan` via scoring engine aplikasi, menggantikan chain MV/cache-summary yang sebelumnya diprioritaskan. Ini menjamin konsistensi antara KPI cards, trend chart, dan perhitungan aktual.

## Problem

Sebelumnya dashboard summary endpoint menggunakan chain: `mv_qa_period_summary` → `qa_dashboard_period_summary` → raw computed values. Chain ini menyebabkan ketidaksesuaian antara angka KPI dengan trend chart karena:
1. Formula SQL di MV tidak persis identik dengan scoring engine aplikasi (rule version, session grouping, `isCountableFinding`)
2. Cache summary bisa stale jika ada perubahan rule version yang tidak memicu refresh ulang
3. Untuk multi-period view, summary hanya diambil dari satu period saja

## Changes

### 1. Backend Summary Refactoring

**Files:**
- `apps/api/src/services/sidak/dashboard-data.ts` — Moved `buildDashboardTrends()` call to before summary computation. Removed all MV/cache lookups from summary path. Summary now computed real-time from `qa_temuan` rows via app scoring engine. Multi-period summaries aggregate from `trends.periodMetrics` using weighted averages across all periods. Empty/zero state guard when no data.

Key behavioral change for single-period view:
- Before: MV row → cache row → raw computed (with potential formula mismatch)
- After: Always uses app scoring engine (same as trend chart, agent detail, input)

Multi-period view (range/overview):
- Before: Raw computed from current result set (no trend-level aggregation)
- After: Aggregates from `periodMetrics` returned by `buildDashboardTrends()` — weighted averages across all active periods

- `apps/api/src/services/sidak/dashboard-trends.ts` — Returns `periodMetrics` array alongside `paramTrend` and `sparklines` to enable downstream summary aggregation.

### 2. Frontend Compliance Description Fix

**Files:**
- `apps/web/src/routes/sidak/dashboard.tsx` — Compliance KPI description now differentiates between single-month and multi-month views: single month shows `"X agen dengan skor ≥ 95"`, multi-month shows `"X agen dengan skor ≥ 95 (rata-rata per bulan)"` with integer rounding for multi-month count.

### 3. Test Changes

- `apps/api/src/__tests__/sidak-dashboard-mv-fallback.test.ts` — Refactored: now throws error if any summary/cache table is queried (enforcing that dashboard summary path does NOT hit MV or cache tables). Added mock temuan rows for scoring pathway.
- `apps/api/src/__tests__/sidak-dashboard-range-summary.test.ts` — **NEW**: 115-line test for multi-period summary aggregation from `periodMetrics`.

### 4. Documentation Updates

- `docs/SIDAK_LOGIC_AND_SCORING.md` — Added note about real-time computation vs MV/cache
- `docs/architecture.md` — Updated "SIDAK Dashboard Performance" section
- `docs/checklist-audit-trainers-superapp.md` — Updated 2 audit entries
- `docs/database.md` — Updated MV description

## Files Modified

- `apps/api/src/services/sidak/dashboard-data.ts` — **Major**: summary refactoring
- `apps/api/src/services/sidak/dashboard-trends.ts` — **Minor**: return periodMetrics
- `apps/web/src/routes/sidak/dashboard.tsx` — **Minor**: compliance desc
- `apps/api/src/__tests__/sidak-dashboard-mv-fallback.test.ts` — **Moderate**: refactored
- `apps/api/src/__tests__/sidak-dashboard-range-summary.test.ts` — **NEW**
- `docs/SIDAK_LOGIC_AND_SCORING.md` — **Minor**: note added
- `docs/architecture.md` — **Minor**: section updated
- `docs/checklist-audit-trainers-superapp.md` — **Minor**: 2 entries updated
- `docs/database.md` — **Minor**: MV description updated
- `graphify-out/` — **Auto**: graph update

## Test Impact

1 existing test refactored, 1 new test file. All dashboard-summary related tests now enforce MV/cache-free path.

## Regression Tests

572 API + 530 web tests passing.
