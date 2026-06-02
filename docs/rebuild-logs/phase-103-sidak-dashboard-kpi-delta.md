# Phase 103: SIDAK Dashboard KPI Delta & Compliance Sparkline Fix

## Changes

### 1. KPI Delta Utility (`sidak-kpi-delta.ts`)
New pure utility `buildKpiDelta()` that computes change indicators with:
- Direction (up/down/flat)
- Magnitude (rounded to 1 decimal)
- Tone (good/bad/neutral) based on `lowerIsBetter` flag
- Two unit modes: `relative-percent` (for count/ratio metrics) and `percentage-point` (for percentage metrics)
- Returns `null` when previous is zero (avoiding division-by-zero)

### 2. KpiCard Refactor
- `delta` prop changed from `number | null` to `KpiDeltaViewModel | null`
- Removed `invertDelta` prop — tone is now computed by `buildKpiDelta()`
- Richer delta display: two-line badge (delta text + comparison label)
- Shows "Belum ada pembanding" when only one period of data exists

### 3. Dashboard Delta Computation
- Inline `calcDelta()` replaced with `buildDelta()` using `buildKpiDelta()`
- Each KPI card specifies `deltaUnit` and `lowerIsBetter`:
  - `total-defects` / `avg-defects`: `relative-percent`, `lowerIsBetter: true`
  - `avg-score` / `compliance`: `percentage-point`, `lowerIsBetter: false`

### 4. Compliance Sparkline Rate Fix
- Backend `buildDashboardTrends()` now emits `complianceRate` (percentage) instead of `complianceCount` (raw count) for the compliance sparkline value
- New `DashboardSparklinePoint` type with `count` and `totalAudited` fields
- Sparkline type in `DashboardData` changed to `DashboardSparklinePoint[]`

### 5. Tests
- `sidak-kpi-delta.test.ts` (NEW): 3 tests — relative-percent, percentage-point, null-on-zero-previous
- `sidak-dashboard-trends.test.ts` (NEW): 1 test — compliance sparkline uses rate, not count
- `sidak-dashboard-parity.test.tsx`: Updated KpiCard mock to accept `delta` object; assertions verify delta text

## Files

| File | Action |
|------|--------|
| `apps/web/src/lib/sidak-kpi-delta.ts` | NEW |
| `apps/web/src/__tests__/sidak-kpi-delta.test.ts` | NEW |
| `apps/api/src/__tests__/sidak-dashboard-trends.test.ts` | NEW |
| `apps/web/src/components/sidak/KpiCard.tsx` | MODIFIED |
| `apps/web/src/routes/sidak/dashboard.tsx` | MODIFIED |
| `apps/api/src/services/sidak/dashboard-trends.ts` | MODIFIED |
| `packages/types/src/sidak.ts` | MODIFIED |
| `apps/web/src/__tests__/sidak-dashboard-parity.test.tsx` | MODIFIED |
| `docs/SIDAK_LOGIC_AND_SCORING.md` | MODIFIED |
