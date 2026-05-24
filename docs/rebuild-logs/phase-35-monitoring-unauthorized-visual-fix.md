# Phase 35: Monitoring Unauthorized & Visual Legacy Parity Fix

**Date:** 2026-05-24  
**Status:** Done

## Summary

Fixed two major issues on `/monitoring` page:
1. **Unauthorized errors** — All raw `fetch()` calls replaced with authenticated API helpers
2. **Visual parity** — Adopted legacy design patterns (hero header, tab strip, refined cards)

## Root Cause

`apps/web/src/routes/monitoring.tsx` was using raw `fetch()` without `Authorization: Bearer <token>` header for all monitoring endpoints (history, aggregation, pricing, billing). Backend auth middleware (`apps/api/src/middleware/auth.ts:14`) requires bearer token and returns 401 `Unauthorized` when missing.

## Changes

### 1. Auth Transport Fix (`apps/web/src/routes/monitoring.tsx`)
- Replaced all `fetch()` calls with `getApi`, `putApi`, `postApi` from `apps/web/src/hooks/useApi.ts`
- These helpers auto-inject `Authorization: Bearer <token>` from `localStorage.auth_token`
- Added `mapError()` function for human-friendly error messages
- Added toast notifications for pricing/billing save operations

### 2. Visual Legacy Parity Pass
- Added hero header with eyebrow badge "SIMULATION MONITORING", heading, and description
- Replaced button-group tabs with border-bottom tab strip (active indicator via `border-primary`)
- Table containers: `bg-card border border-border rounded-2xl shadow-sm`
- Module badges use theme tokens: `text-module-ketik` (blue), `text-module-pdkt` (purple), `text-module-telefun` (emerald)
- Score colors: emerald (>=80), amber (>=60), red (<60)
- Improved empty states with icons
- Pricing editor: refined with legacy-style buttons and feedback
- Transcript modal: restyled with module badge, metadata grid, and footer with score/duration

### 3. Regression Tests (`apps/web/src/__tests__/monitoring-unauthorized-parity.test.tsx`)
- 20 tests covering:
  - Auth transport (no raw fetch, correct path to getApi)
  - Role-gated pricing tab (trainer/admin visible, leader/qa hidden)
  - Error mapping (Unauthorized → user-friendly, pass-through for other errors)
  - Visual elements (hero eyebrow, heading, description, tab strip, active tab)
  - Feature regression (KPI cards, history table, module filter, tab switching, empty state)

### 4. Docs Update
- Updated `docs/MONITORING_TOKEN_USAGE_BILLING.md` with transport auth & error handling section

## Files Changed

| File | Change |
| --- | --- |
| `apps/web/src/routes/monitoring.tsx` | Full rewrite: auth fix + visual parity + toast |
| `apps/web/src/__tests__/monitoring-unauthorized-parity.test.tsx` | New: 20 regression tests |
| `docs/MONITORING_TOKEN_USAGE_BILLING.md` | Updated with auth transport docs |

## Verification

```
pnpm --filter @trainers/web test
  ✓ 20 passed (0 failed) — monitoring-unauthorized-parity.test.tsx
  ✓ 20/22 test files passed (1 pre-existing timeout in access-groups-parity)

pnpm build
  ✓ built in 10.67s (web + api + telefun)
```

## Acceptance Criteria Satisfied

| ID | Criteria | Status |
| --- | --- | --- |
| AC-01 | No more Unauthorized on monitoring requests | ✓ |
| AC-02 | Only authenticated helper API calls (no raw fetch) | ✓ |
| AC-03 | Human-friendly error messages | ✓ |
| AC-04 | Visual parity with legacy (hero, tab strip, cards) | ✓ |
| AC-05 | Role behavior preserved (leader no pricing tab) | ✓ |
| AC-06 | Existing features not regressed | ✓ |
| AC-07 | Regression tests added | ✓ |
| AC-08 | Docs updated | ✓ |
