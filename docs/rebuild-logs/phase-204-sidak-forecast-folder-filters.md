# Phase 204: SIDAK Forecast Submodule & Folder-Aware Filters

## Summary

Added SIDAK Forecast module (`/sidak/forecast`) with agent-level projection, lane classification, linear regression scoring, and scope guard for leader roles. Added folder-aware filters across SIDAK dashboard, ranking, and forecast pages. Enhanced access-groups with subfolder support.

## Changes

### 1. Forecast Route & Service (NEW)

- `apps/api/src/routes/sidak/forecast.ts` — `POST /api/v1/sidak/forecast/agents` endpoint
- `apps/api/src/services/sidak/forecast.ts` — Agent forecast service with linear regression, lane classification (improving/declining/stable/insufficient_data), and leader scope guard
- `apps/web/src/routes/sidak/forecast.tsx` — Forecast workbench UI (~1087 lines) with service trend chart, agent lane cards, horizon selector (1–6 months), and ParamTrendChart integration

### 2. SIDAK Landing Page Update

- `apps/web/src/routes/sidak/index.tsx` — Redesigned from 6 to 5 cards (removed Input Temuan card, added Forecast card)

### 3. Folder-Aware Filters

- `apps/web/src/lib/sidak-folder-options.ts` — Folder ID resolution and normalization helpers
- `apps/web/src/components/sidak/DashboardFilters.tsx` — Added folder/batch filter dropdown
- `apps/api/src/services/sidak/dashboard-data.ts` — Folder ID filtering in dashboard queries
- `apps/api/src/services/sidak/access-scope.ts` — Folder-aware leader scope filtering
- `apps/web/src/routes/sidak/dashboard.tsx` — Folder filter integration with leader scope
- `apps/web/src/routes/sidak/ranking.tsx` — Folder filter + scope enforcement

### 4. Access Groups Subfolder Support

- `apps/web/src/routes/dashboard/components/access-groups/RuleBuilderForm.tsx` — Subfolder support in team rule selection

### 5. Bug Fixes

- `04ce4b7` — SIDAK agent directory latest period selection fix
- `cee3684` — Prevent selected service reset during stale agent detail load
- `7c54486` — Normalize SIDAK service scope to allowed leader service

### 6. Navigation

- `apps/web/src/components/layout/nav-config.ts` — Added `/sidak/forecast` to sidebar and breadcrumb
- `apps/web/src/router.tsx` — Added lazy-loaded forecast route with requireLeaderModuleApproval

### 7. Migration

- `supabase/migrations/20260630003553_add_current_sidak_profiler_lookup_indexes.sql` — Added lookup indexes for profiler/SIDAK folder queries

## Files Modified

13 new test files, 15+ source files modified, ~2,419 lines added across the commits.

## Test Coverage

- `sidak-forecast.test.ts` (294 lines) — Agent forecast unit tests
- `sidak-forecast-route.test.ts` (116 lines) — Route integration tests
- `sidak-forecast.test.tsx` (309 lines) — Frontend forecast component tests
- `sidak-index.test.tsx` — Landing page card count assertion
- `sidak-dashboard-folder-aggregation.test.ts` — Folder filter aggregation tests
- `sidak-filter-pairing.test.tsx` — Folder filter UI pairing tests
- `sidak-profiler-lookup-indexes-migration.test.ts` — Migration contract test
