# Phase 65: SIDAK YTD & Monthly Agent Ranking Change Indicator

## Summary
Added rank position change indicators to the Agent Ranking page for both YTD and Monthly selections. Compares current ranking with previous ranking (preceding YTD or preceding month) to calculate `rankChange` (+X/-X index shift). Renders red upward arrows (▲ +X) for rank increases (higher defects, worse performance), green downward arrows (▼ -X) for rank decreases (fewer defects, better performance), and blue badges ("Baru") for new agents.

## Changes

### Shared Types
- **`packages/types/src/index.ts`**: Added optional `rankChange?: number | null` property to `TopAgentData` interface.

### Backend
- **`apps/api/src/services/sidak-service.ts`**: Added optional `limit` parameter to `getDashboardData()` — 0 means no slicing (full list), default remains 20.
- **`apps/api/src/routes/sidak.ts`**: Implemented YTD and Monthly rank shift calculation by fetching previous period rankings, mapping agent positions, and computing delta. Removed top 20 limit constraint — API now returns all agents for rank change context.

### Frontend
- **`apps/web/src/routes/sidak/ranking.tsx`**: Custom rendering of `rankChange` — red ▲ +X (worse), green ▼ -X (better), gray `-` (unchanged), blue "Baru" (new). Visible for YTD and monthly views (not all-time). Added dynamic context subtitle `"Sebelumnya Posisi X"` under the rank change badges for clearer UX.

### Tests
- **API** (`sidak-ranking-route.test.ts`): 8 additional integration tests — 4 for YTD rank change calculation, 4 for monthly rank change calculation (current vs previous period).

## Test Results
- 425 API tests PASS (previously 423)
- 394 Web tests PASS
- No new lint issues

## Post-Commit Fixes
- Removed 20-agent slice constraint from API response, allowing full agent list
- Added `"Sebelumnya Posisi X"` subtitle context under each rank badge
- Fixed `index is not defined` runtime error in ranking badge rendering

## Migration
No new database migrations.
