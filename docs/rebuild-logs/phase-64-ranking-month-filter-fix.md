# Phase 64: SIDAK Ranking Month Filter Fix

## Summary
Fixed bug where monthly Agent Ranking filter showed YTD historical findings instead of filtering strictly by the selected month. Passed `period_ids` (and conditionally set `year` to undefined for all-time selections) from Hono route `/ranking` to `getDashboardData()`.

## Changes

### Backend
- **`apps/api/src/routes/sidak.ts`**: Forwarded `period_ids` query param and conditionally disabled `year` filter when `period === "alltime"` inside the `/ranking` endpoint.

### Tests
- **`apps/api/src/__tests__/sidak-ranking-route.test.ts`** (NEW): 4 route integration tests validating parameter parsing and forwarding for month (UUID), YTD, and all-time selections.

## Test Results
- 423 API tests PASS (previously 415)
- 394 Web tests PASS
- No new lint issues

## Migration
No new database migrations.
