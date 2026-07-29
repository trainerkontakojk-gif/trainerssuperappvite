# Phase KETIK/PDKT Scenario Image Persistence Fix

**Date:** 2026-07-29
**Status:** DONE

## Summary

- Fixed KETIK/PDKT scenario image persistence races, versioned settings writes, and KETIK account-bound recovery cache.
- Added `x-settings-version` optimistic concurrency plus `409 SETTINGS_CONFLICT` reload flow.
- No migration or storage redesign; the existing `user_settings` row remains the source of truth.

## Root causes

1. KETIK FileReader callbacks captured stale `scenarioForm.draft.images`, so later readers could overwrite earlier uploads.
2. PDKT had the same stale snapshot race on `attachmentImages`, plus late callbacks could target a reopened draft.
3. Save flows were unawaited/duplicate-prone: KETIK wrote optimistic state/backup before persistence; PDKT save/reset could close before the request resolved.
4. Settings updates could silently last-writer-wins because the client had no trustworthy version header / CAS guard.
5. KETIK recovery cache was not account-bound and could be stale or quota-failed, so wrong-user/old data could be restored.

## Fixes

- Functional attachment accumulation plus pending/late/error guards and generation tracking.
- Awaited, retryable save/reset flows; drafts stay open on failure or conflict.
- PDKT native submit/reset disabled while reads are pending.
- `x-settings-version` is captured/required on save, exposed via CORS, and rejected with `409 SETTINGS_CONFLICT` on stale writes.
- KETIK backup is now user/version-bound best-effort `localStorage` recovery only; quota/storage errors are ignored.

## Verification evidence (reported by workers)

### Discovery

- `graphify query "approved plan Thermo review PDKT KETIK token backup CORS FileReader pending reset conflict CAS"` — exit 0

### Final repair report

- `pnpm --filter @trainers/api exec vitest run src/__tests__/app-onerror-cors.test.ts` — exit 1 RED, then exit 0.
- `pnpm --filter @trainers/web exec vitest run src/lib/settings-contract.test.ts src/__tests__/ketik-settings-modal.test.tsx src/__tests__/pdkt-settings-modal.test.tsx` — exit 1 RED, then exit 0.
- `pnpm --filter @trainers/api exec vitest run src/__tests__/app-onerror-cors.test.ts src/__tests__/ketik-service.test.ts src/__tests__/ketik-settings-route.test.ts src/__tests__/pdkt-settings-route.test.ts` — exit 0.
- `pnpm --filter @trainers/web exec vitest run src/lib/settings-contract.test.ts src/routes/ketik/ketikApi.test.ts src/__tests__/useCrudForm.test.tsx src/__tests__/ketik-settings-modal.test.tsx src/__tests__/pdkt-settings-modal.test.tsx` — exit 0.
- `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.json` — exit 0.
- `pnpm --filter @trainers/api build` — exit 0.
- `pnpm --filter @trainers/web build` — exit 0.
- `git diff --check` — exit 0.

### Unversioned repair report

- `pnpm --filter @trainers/web exec vitest run src/lib/settings-contract.test.ts src/routes/ketik/ketikApi.test.ts` — exit 1 RED, then exit 0.
- `pnpm --filter @trainers/web exec vitest run src/lib/settings-contract.test.ts src/routes/ketik/ketikApi.test.ts src/__tests__/useCrudForm.test.tsx src/__tests__/ketik-settings-modal.test.tsx src/__tests__/pdkt-settings-modal.test.tsx` — exit 0.
- `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.json` — exit 0.
- `pnpm --filter @trainers/web lint` — exit 0.
- `pnpm --filter @trainers/web build` — exit 0.
- `git diff --check` — exit 0.

### Thermo review 4 retry

- `pnpm --filter @trainers/web exec vitest run src/lib/settings-contract.test.ts src/routes/ketik/ketikApi.test.ts src/__tests__/useCrudForm.test.tsx src/__tests__/ketik-settings-modal.test.tsx src/__tests__/pdkt-settings-modal.test.tsx` — exit 0.
- `pnpm --filter @trainers/web exec vitest run src/__tests__/ketik-settings-modal.test.tsx src/__tests__/pdkt-settings-modal.test.tsx src/__tests__/useCrudForm.test.tsx --testTimeout=15000` — exit 0.
- `pnpm --filter @trainers/api exec vitest run src/__tests__/app-onerror-cors.test.ts src/__tests__/ketik-service.test.ts src/__tests__/ketik-settings-route.test.ts src/__tests__/pdkt-settings-route.test.ts` — exit 0.
- `pnpm --filter @trainers/api exec vitest run src/__tests__/app-onerror-cors.test.ts src/__tests__/ketik-service.test.ts src/__tests__/ketik-settings-route.test.ts src/__tests__/pdkt-settings-route.test.ts --testTimeout=15000` — exit 0.
- `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.json` — exit 0.
- `pnpm --filter @trainers/api exec tsc --noEmit -p tsconfig.json` — exit 0.
- `pnpm exec prettier --check ...` — exit 0 for the task slice; the mixed API+web check exited 1 only because of pre-existing unrelated formatting drift in `apps/api/src/routes/ketik.ts`.
- `git diff --check` — exit 0.

## Browser / visual review

- No browser visual check was run or claimed in the worker reports.
