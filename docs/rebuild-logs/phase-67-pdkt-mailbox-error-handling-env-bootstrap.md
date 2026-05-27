# Phase 67: PDKT Mailbox Error Handling & API Env Bootstrap Hardening

## Requirement

Hardening PDKT mailbox error handling across the stack and fixing API env bootstrap to include missing Supabase anon key env vars.

## Changes

### PDKT API Error Handling (Backend)
- **Null-safe auth header extraction** — Replaced non-null assertions (`authHeader!`) with `|| ""` fallback across all PDKT endpoints to prevent crashes on missing Authorization header
- **ExecutionContext guard** — Wrapped `c.executionCtx?.waitUntil` with try-catch to gracefully handle missing ExecutionContext in test environments (`app.request()`)
- **Structured error logging** — Added detailed error logging with `message`, `code`, `details`, `hint` properties in `/mailbox/reply` endpoint
- **Human-friendly error messages** — Replaced raw `throw error` with `throw new Error(error.message || "...")` wrappers in `fetchMailboxItems`, `createMailboxItem`, `softDeleteMailboxItem`, `submitMailboxReply`
- **Defensive `humanError` mapper** — Added type narrowing (string / Error / object message extraction) before `msg.toLowerCase()` call

### PDKT Frontend Error UI
- **Error state component** — Added `AlertCircle` + `RefreshCw` UI with "Gagal Memuat Email" message and "Coba Lagi" button when mailbox API returns error
- **Better notifications** — Replaced silent failure with `notify.success("Balasan terkirim! Evaluasi AI sedang berjalan.")` on reply success; `notify.error(err?.message)` on reply failure with actual error message
- **Diagnostic warnings** — Added `console.warn` for empty scenarios and missing consumer types from API

### API Env Bootstrap
- Added `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY` to Zod schema validation in `env.ts`
- Fixed `createAdminClient()` in `supabase.ts` to use `env.VITE_SUPABASE_ANON_KEY` instead of raw `token` parameter
- Added env var set/cleanup in `api-env-bootstrap.test.ts` for Supabase client tests

### AGENTS.md Fix
- Corrected Phase 49 role lock text: `(trainer/qa/admin)` → `(admin/trainer/leader/tl/spv/om/agent)`

## Files Modified

| File | Change |
|------|--------|
| `AGENTS.md` | Phase 49 role list fix |
| `apps/api/src/lib/env.ts` | Added `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY` Zod validations |
| `apps/api/src/lib/supabase.ts` | Use `env.VITE_SUPABASE_ANON_KEY` in `createAdminClient()` |
| `apps/api/src/__tests__/api-env-bootstrap.test.ts` | Anon key env var test coverage |
| `apps/api/src/routes/pdkt.ts` | Null-safe auth headers, ExecutionContext try-catch, structured error logging, human error mapper |
| `apps/api/src/services/pdkt-service.ts` | Error message wrapping in 4 functions |
| `apps/web/src/routes/pdkt/simulation.tsx` | Error state UI, retry button, better notifications, warnings |
| `apps/web/src/__tests__/pdkt-mailbox.test.tsx` | 5 error state regression tests |

## Test Coverage

- **5 new frontend tests** — Error state rendering, retry button refetch, loading state absence, 2 pre-existing tests unchanged
- All 394 web + 425 API tests passing
