# Phase 201 — SIDAK Dashboard & Ranking Default Filter Pairing

## Summary

Auto-select folder based on selected service type on both Dashboard and Ranking pages using `DEFAULT_SERVICE_FOLDER_MAP`. Folder state persistence prevents option list shrinkage when API returns filtered results. Dashboard enforces max 2 visible parameter series with total trend toggle. Ranking uses one-time initial folder pairing via `initialFolderSetRef`. `ParamTrendChart` multi-forecast series support.

## Changes

### Backend

None — all changes are frontend-only.

### Frontend

- **`apps/web/src/lib/scoring.ts`** — Added `DEFAULT_SERVICE_FOLDER_MAP` mapping service types to default folder names (call→Tim Call, chat→Tim Whatsapp, email→Tim Email, cso→Tim Mix, pencatatan→Tim Mix, bko→Tim BKO)
- **`apps/web/src/routes/sidak/dashboard.tsx`** — Folder state persistence via `allFolders`+`setAllFolders` (useState) preventing option list shrinkage; `maxVisibleParameters=2` limit; showTotalTrend toggle; auto-pair folder on service change
- **`apps/web/src/routes/sidak/ranking.tsx`** — Folder state persistence; `initialFolderSetRef` one-time pairing guard; auto-select folder from `DEFAULT_SERVICE_FOLDER_MAP` on initial load and service change
- **`apps/web/src/components/sidak/ParamTrendChart.tsx`** — Multi-forecast series support via `forecastResults` array prop; normalized via `useMemo`

### Tests

- **`apps/web/src/__tests__/sidak-filter-pairing.test.tsx`** — NEW: 2 regression tests (Dashboard + Ranking) verifying folder persistence and auto-pair on service change

## Files Modified

| File | Status |
|------|--------|
| `apps/web/src/lib/scoring.ts` | Modified |
| `apps/web/src/routes/sidak/dashboard.tsx` | Modified |
| `apps/web/src/routes/sidak/ranking.tsx` | Modified |
| `apps/web/src/components/sidak/ParamTrendChart.tsx` | Modified |
| `apps/web/src/__tests__/sidak-filter-pairing.test.tsx` | **NEW** |
| `apps/web/src/__tests__/sidak-dashboard-forecast-state.test.tsx` | Modified |
| `apps/web/src/__tests__/sidak-trend-forecast.test.tsx` | Modified |
| `AGENTS.md` | Modified |
| `docs/rebuild-logs/phase-201-sidak-dashboard-ranking-filter-pairing.md` | **NEW** |

## Test Results

- 475 API tests passing
- 473 web tests passing
