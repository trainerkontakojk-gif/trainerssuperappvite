# Phase 56 — Leader Folder/Service Scope Visibility Hardening

## Summary

Memperbaiki 4 celah visibility untuk leader:

1. **KTP metadata** (years, folders, teams) sekarang scoped — leader hanya melihat opsi yang beririsan dengan peserta dalam scope approval.
2. **SIDAK `service_type`** approval sekarang `first-class` enforcement — membatasi payload data, bukan hanya filter UI.
3. **SIDAK `folder_ids`** sekarang benar-benar memfilter `getDashboardData()` (resolve batch_name dari folder_id, filter query temuan).
4. **Frontend normalization** — state/query param stale (service/folder/batch di luar izin) dinormalisasi otomatis.

## Files Changed (16)

### Backend

| File | Change |
|------|--------|
| `apps/api/src/services/leader-access-service.ts` | Added `LeaderScopeSnapshot` type + `getLeaderScopeSnapshot()` centralized helper |
| `apps/api/src/services/profiler-service.ts` | Refactored `getAccessiblePesertaIds()` → shared snapshot; scoped `getYears()`, `getFolders()`, `getTeams()` |
| `apps/api/src/routes/profiler.ts` | `GET /years`, `/folders`, `/teams` now pass `resolveKtpScope(c)` |
| `apps/api/src/services/sidak-service.ts` | Refactored `getAccessibleAgentIds()` → shared snapshot; added `SidakFilterScope` + `getAccessibleSidakFilters()`; `getDashboardData()` accepts `allowedServiceTypes`, filters by `folder_ids`, returns `availableServices`; `getAgentDirectorySummary()` and `getAgentDetail()` filter temuan by allowed services |
| `apps/api/src/routes/sidak.ts` | Added `resolveSidakFilterScope()`; scoped `/folders`, `/folders/:folder/agents`; dashboard/ranking pass `allowedServiceTypes`; ranking response includes `availableServices` + scoped folders |
| `packages/types/src/index.ts` | `DashboardData` + `availableServices` field |

### Frontend

| File | Change |
|------|--------|
| `apps/web/src/components/sidak/DashboardFilters.tsx` | Accepts `availableServices` prop; dynamic service options |
| `apps/web/src/routes/sidak/dashboard.tsx` | Reads `availableServices` from API; normalizes invalid service/folder; `leaderLockedService` for single-service lock |
| `apps/web/src/routes/sidak/ranking.tsx` | Reads `availableServices` from API; normalizes invalid service/folder |
| `apps/web/src/hooks/useAgentDetail.ts` | Normalizes selectedService to valid services from data |
| `apps/web/src/routes/profiler/index.tsx` | Normalizes `selectedBatch` when folder list shrinks |
| `apps/web/src/routes/profiler/table.tsx` | Redirect to first valid batch if batch not in scoped folders |
| `apps/web/src/routes/profiler/slides.tsx` | Redirect to first valid batch if batch not in scoped folders |
| `apps/web/src/routes/profiler/analytics.tsx` | Redirect to first valid batch if batch not in scoped folders |
| `apps/web/src/routes/profiler/export.tsx` | Redirect to first valid batch if batch not in scoped folders |

### Docs

| File | Change |
|------|--------|
| `docs/LEADER_APPROVAL_ACCESS.md` | Metadata Scoping (V2), SIDAK service enforcement, folder filter enforcement, frontend normalization, 6 new QA checklist items |

## Test Results

- **API**: 390 passed, 4 skipped (1 pre-existing env issue)
- **Web**: 314 passed, 2 pre-existing failures (unrelated)
- **TypeScript**: 0 errors across entire monorepo

## Plan Reference

`plan/markdown/leader-folder-service-scope-visibility-hardening.md`
