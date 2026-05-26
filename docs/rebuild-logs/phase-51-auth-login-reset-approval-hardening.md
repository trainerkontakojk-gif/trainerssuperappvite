# Phase 51: Auth Login, Reset Redirect & Approval Guard Hardening

**Status:** DONE  
**Date:** 2026-05-26  
**Tests:** 27 new (all passing), 275 total (no regressions)

## Summary

Hardening flow autentikasi di tiga area kritis:
1. Login flow — type safety `qa` role, CSRF header, 401 interception
2. Reset password — `beforeLoad` guard mencegah akses non-recovery
3. Waiting approval — `beforeLoad` guard redirect user aktif

## Changes

| File | Change |
|---|---|
| `packages/types/src/index.ts` | Tambah `"qa"` ke `UserProfile.role` dan `ManagedUser.role` union |
| `apps/web/src/hooks/useApi.ts` | Header `X-Requested-With: XMLHttpRequest` + 401 interception (clear localStorage + hard redirect `/`) |
| `apps/web/src/router.tsx` | Export `guardWaitingApproval()` dan `guardResetPassword()` dengan `beforeLoad` pada route |
| `apps/web/src/routes/reset-password.tsx` | Password complexity: min 8 char, 1 uppercase, 1 digit |
| `apps/web/src/routes/waiting-approval.tsx` | Optimize double query → single query + conditional is_deleted fallback |

## New Tests

| File | Tests | Coverage |
|---|---|---|
| `auth-login-flow.test.ts` | 7 | CSRF header, 401 interception, qa type |
| `route-guards.test.ts` | 12 | 6 reset password + 6 waiting approval guard scenarios |
| `reset-password-validation.test.ts` | 8 | 8 password complexity rules |

## Key Decisions
- **No catch blocks in guards**: TanStack Router catches `redirect()` at framework level before user try/catch; removing catch blocks prevents redirect from being overridden on error
- **`is_deleted` check before `status === "active"`**: Deleted users with active status must be caught first in `guardWaitingApproval`
- **Hard redirect (`window.location.href`) on 401**: Consistent with existing logout pattern in `Layout.tsx`
- **Password validation client-side only**: Reset password flow goes directly to Supabase `updateUser()` — no backend endpoint involved
