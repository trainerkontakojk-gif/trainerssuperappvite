# Phase 108: SIDAK Dashboard Trend Toggle & Total Temuan Filter

## Summary

Two SIDAK UX improvements: (1) parameter trend chart toggle show/hide with rotation animation on the dashboard PCA chart, (2) "Total Temuan" filter button on the Agent Detail trend tab.

## Changes

### 1. Dashboard Parameter Trend Chart Toggle

**Files:**
- `apps/web/src/routes/sidak/dashboard.tsx` — Added `isAllShown` computed from `activeHiddenParams.size === 0`; toggle button text changes between "Tampilkan Semua"/"Sembunyikan Semua" with `rotate-90` animation on ArrowRight icon; "Parameter:" label prefix for parameter pill row

**Behavior:**
- Default state shows only default-hidden parameters (configurable via `defaultHiddenParams`)
- Click "Tampilkan Semua" to reveal all parameter lines — button toggles to "Sembunyikan Semua"
- Click "Sembunyikan Semua" to hide all parameter lines, reverting to default hidden set
- Individual parameter pills remain functional to toggle single lines
- Chevron icon rotates 90° when all parameters are shown

### 2. Agent Trend Tab Total Temuan Filter

**Files:**
- `apps/web/src/components/sidak/AgentTrendTab.tsx` — Added `isTotalOnly` state (`activeFilter === "TOTAL_ONLY"`); new filter pill "Total Temuan" with primary color when active; `chartDatasets` logic filters to only `ds.isTotal` when `isTotalOnly` is true; active state has `scale-105`, `shadow-primary/20`, white text/dot

**Behavior:**
- Click "Total Temuan" pill to isolate only the total trend line, hiding all individual parameter lines
- Click again to deselect and return to all-lines view
- Compatible with existing per-parameter filter (mutually exclusive via `isFiltered` logic)
- Visual cue: active pill gets primary bg + shadow + scale, inactive/gray otherwise

## Files Modified

- `apps/web/src/routes/sidak/dashboard.tsx` — **Major**: toggle button, isAllShown state, rotation animation, "Parameter:" label
- `apps/web/src/components/sidak/AgentTrendTab.tsx` — **Moderate**: TOTAL_ONLY filter state and pill UI

## Test Impact

1 new test file: `apps/web/src/__tests__/sidak-dashboard-parity.test.tsx` updated with toggle assertions.

## Regression Tests

468 web + 479 API tests passing.
