# Phase 24: SIDAK Dashboard Legacy Parity

## Progress

- [x] Rebuilt `/sidak/dashboard` to match the legacy dashboard composition and density.
- [x] Restored legacy defaults for service, team scope, year, and month range behavior.
- [x] Restyled the KPI cards, filter strip, trend panel, and top-agent leaderboard to follow the legacy capture.
- [x] Fixed filter bar truncation so `Semua Tim` and the year value render fully.
- [x] Removed the extra `FATAL` badge from the top-agent leaderboard to match the legacy screenshot.
- [x] Added a parity test covering defaults, legacy copy, and the leaderboard header/link.

## Key Files

- `apps/web/src/routes/sidak/dashboard.tsx`
- `apps/web/src/components/sidak/DashboardFilters.tsx`
- `apps/web/src/components/sidak/KpiCard.tsx`
- `apps/web/src/components/sidak/ParamTrendChart.tsx`
- `apps/web/src/components/sidak/TopAgentsTable.tsx`
- `apps/web/src/components/ui/MonthRangePicker.tsx`
- `apps/web/src/__tests__/sidak-dashboard-parity.test.tsx`

## Verification

- `pnpm --filter @trainers/web test -- src/__tests__/sidak-dashboard-parity.test.tsx` ✅
- `pnpm --filter @trainers/web test` ✅
- `pnpm --filter @trainers/web lint` ✅
- `pnpm --filter @trainers/web build` ✅
- `git diff --check` ✅
- Browser screenshot check on `/sidak/dashboard` with mocked auth/data ✅

## Status

DONE — SIDAK dashboard now follows the legacy layout and default behavior closely, while preserving the existing SIDAK shell and data contract.
