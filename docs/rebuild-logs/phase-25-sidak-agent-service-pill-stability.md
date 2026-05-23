# Phase 25: SIDAK Agent Service Pill Stability

## Progress

- [x] Fixed the SIDAK agent detail service pills so the visible set now comes from raw `temuan` rows instead of the service-filtered summary list.
- [x] Preserved the active service filter for score, trend, and summary data.
- [x] Added a regression test that reproduces the refresh collapse and verifies both `call` and `email` remain visible.

## Key Files

- `apps/web/src/hooks/useAgentDetail.ts`
- `apps/web/src/__tests__/useAgentDetail.test.tsx`
- `plan/markdown/sidak-agent-service-pill-stability.md`

## Verification

- `pnpm --filter @trainers/web test -- src/__tests__/useAgentDetail.test.tsx` ✅
- `pnpm --filter @trainers/web test` ✅

## Status

DONE — the SIDAK agent detail pill list is now stable across refreshes while keeping the active service-driven analytics behavior intact.
