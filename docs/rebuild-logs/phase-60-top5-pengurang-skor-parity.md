# Phase 60 — Top 5 Pengurang Skor Terbesar Legacy Parity

**Status:** DONE
**Date:** 2026-05-26
**Type:** Parity Fix

## Summary

The `topTickets` computation ("Top 5 Pengurang Skor Terbesar") on the SIDAK Agent Detail page was using a simplified inline formula that did not match the legacy behavior. Key gaps: no month scoping, wrong scoring formula (ignoring `weighted`/`flat`/`no_category` modes), no service weights, single-level sort.

## Root Cause

The original implementation in `apps/web/src/hooks/useAgentDetail.ts` (Phase 27) used a simplified formula:
```
penalty = ((3 - nilai) / 3) * bobot
scoreDeduction = Math.round((100 - minScore) * 10) / 10
```

The legacy uses `calculateSessionScoreFromTemuan()` → `scoreSession()` which handles:
- `weighted` mode: Σ(per-kategori) × inter-category weights
- `flat`/`no_category` mode: Σ(nilai/3 × bobot) / Σbobot

## Fix

### Approach: Client-side computation with shared scoring library

- Added `scoreSession()`, `calculateSessionScoreFromTemuan()`, `DEFAULT_SERVICE_WEIGHTS` to `apps/web/src/lib/scoring.ts` (shared pure functions)
- API now fetches `qa_service_weights` table and returns `weights` in `getAgentDetail()` response
- Rewrote `topTickets` useMemo with:
  1. Month scoping (filters by `selectedMonth`)
  2. Service weights from API with `DEFAULT_SERVICE_WEIGHTS` fallback
  3. Proper `scoreSession()` scoring
  4. 3-level tiebreaker sort (scoreDeduction → totalPenaltyWeight → findingCount)
  5. Renamed properties (`deduction`→`scoreDeduction`, `count`→`findingCount`)

## Files Modified

| File | Change |
|------|--------|
| `apps/web/src/lib/scoring.ts` | Added `scoreSession`, `calculateSessionScoreFromTemuan`, `DEFAULT_SERVICE_WEIGHTS` |
| `packages/types/src/index.ts` | Added `weights` field to `AgentDetailData` |
| `apps/api/src/services/sidak-service.ts` | Fetch + resolve `qa_service_weights`, return in `getAgentDetail` |
| `apps/web/src/hooks/useAgentDetail.ts` | Rewrote `topTickets` with legacy parity |
| `apps/web/src/components/sidak/TopTicketsCard.tsx` | Renamed `deduction`→`scoreDeduction`, `count`→`findingCount` |
| `apps/web/src/__tests__/top-tickets-legacy-parity.test.ts` | NEW: 10 regression tests |
| `apps/api/src/__tests__/sidak-agent-detail-weights.test.ts` | NEW: 7 regression tests |

## Post-Commit Fixes

### Fix 1: Railway Build Failure — TypeScript errors in test files

**Errors:**
- `sidak-agent-detail-weights.test.ts`: `scoring_mode` typed as `string` instead of literal union `"flat" | "weighted" | "no_category"`
- `scoring.ts`: Missing `ScoringMode` import in `QAScoreResult` interface
- `input.tsx`: Used `ParsedImportRow` instead of aliased `ImportRowType`

**Fixes:**
- Added `as const` assertions to `scoring_mode` values in test fixtures
- Added `ScoringMode` to imports from `@trainers/types` in `scoring.ts`
- Changed `ParsedImportRow` → `ImportRowType` in `input.tsx`

### Fix 2: 2 Pre-existing Test Failures (`STACK_TRACE_ERROR`)

**Root cause:** Vitest 4.x module caching issue with async `vi.mock` factory using `vi.importActual("@tanstack/react-router")` in `route-guards.test.ts`. The mock leaked to other test files during full suite execution, causing `STACK_TRACE_ERROR` during test collection.

**Fixes:**
- Replaced `vi.importActual` with `importOriginal` parameter in mock factory (vitest 4.x recommended API)
- Added `window.scrollTo = vi.fn()` to test setup (`setup.ts`) for jsdom compatibility

## Verification (Final)

- TypeScript compilation: Clean (0 errors)
- Full monorepo build: 3/3 packages successful
- Web tests: 387 PASS (0 failures)
- API tests: 407 PASS (0 failures)

## Regression Note

- Follow-up fix added in Vite: `selectedMonth` now auto-syncs to the latest available month when the active service changes or when the current month is no longer valid, matching legacy behavior and preventing the Top 5 card from rendering empty on first load.
- Added regression coverage in `apps/web/src/__tests__/useAgentDetail.test.tsx` for service-switch month restoration.
