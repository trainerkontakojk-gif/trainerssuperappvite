# Phase 207 — Security Headers, Auth RLS Fix, CORS Hardening, KETIK Duration UX & Dep Bumps

## Summary

Hardened API security posture with global security headers middleware, fixed auth middleware to respect RLS, tightened CORS `onError` fail-closed behavior, and applied matching security headers to Vercel and Railway web deployments. Also improved KETIK custom duration input UX and bumped several dependencies.

## Changes

### 1. API Security Headers Middleware (New)
- **File:** `apps/api/src/middleware/securityHeaders.ts`
- Global middleware (`securityHeadersMiddleware`) applies 6 security headers to **every** API response (including error responses via `onError`):
  - `Content-Security-Policy`: `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
  - `X-Content-Type-Options`: `nosniff`
  - `X-Frame-Options`: `DENY`
  - `Strict-Transport-Security`: `max-age=31536000; includeSubDomains`
  - `Referrer-Policy`: `strict-origin-when-cross-origin`
  - `Permissions-Policy`: `camera=(), microphone=(), geolocation=()`
- `applySecurityHeaders()` helper reused in `app.ts` `onError` handler so error responses also get headers.
- **File:** `apps/api/src/app.ts` — Applied as first middleware (before CORS), security headers re-applied in `onError` handler.

### 2. Auth Middleware RLS Fix
- **File:** `apps/api/src/middleware/auth.ts`
- Profile query changed from `supabaseAdmin` → `createUserClient(token)` (user-scoped client).
- Previously used `supabaseAdmin` (service_role), which bypasses RLS — the profile query should respect RLS policies like other user data.
- Fix ensures RLS still applies to profile access, consistent with security principle.

### 3. CORS onError Hardening
- **File:** `apps/api/src/app.ts`
- Removed wildcard fallback (`allowedOrigins[0] || "*"`) when origin doesn't match.
- Unmatched origins → no `Access-Control-Allow-Origin` header emitted (fail-closed, not fail-open).
- Added `Vary: Origin` header when origin matches to prevent CDN cache poisoning.
- Updated tests in `app-onerror-cors.test.ts` to expect `null` CORS headers for invalid/missing origins.

### 4. Vercel Security Headers
- **File:** `vercel.json` — Added `headers` block with same 6 security headers (CSP relaxed for web: `default-src 'self'`, `script-src 'self'`, `connect-src 'self' https: wss:`, `media-src 'self' blob: data:`, etc.)

### 5. Railway Web `serve.json`
- **File:** `apps/web/public/serve.json` (new) — Copied Vite into `dist/serve.json`, read by `serve` for Railway static web deployment.
- Same 6 security headers as Vercel.

### 6. Healthcheck Smoke Test Hardening
- **File:** `scripts/deployment/railway-web-healthcheck-smoke.mjs`
- Validates 6 security headers as part of Railway web healthcheck smoke test.
- Removed `shell: true` from `spawn` for cleaner process handling.

### 7. KETIK Custom Duration Input UX
- **File:** `apps/web/src/routes/ketik/components/settings/KetikSystemTab.tsx`
  - Auto-focus + select custom duration input when switching to custom mode (`useEffect` on `durationMode`).
- **File:** `apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts`
  - Extracted `DurationMode` type, `classifyDurationMode()`, `durationToInputValue()` helpers (replaced inline).
  - Proper `durationMode` state reset when modal reopens with fresh settings.
  - Fixed saved custom duration (>15 min) display when reopening system tab.
- **File:** `apps/web/src/__tests__/ketik-settings-modal.test.tsx`
  - 2 new tests: custom duration (20 min) save verification, saved custom duration display on tab reopen.

### 8. Dependency Updates
| Package | Old | New | Reason |
|---------|-----|-----|--------|
| `@google/genai` | `^2.4.0` | `^2.9.0` | Latest SDK |
| `hono` (api & web) | `^4.0.0` | `^4.12.27` | Latest, fixes edge case bugs |
| `ws` | `^8.18.0` | `^8.21.0` | Latest |
| `vite` | `^8.0.13` | `^8.1.0` | Latest |
| `@vitejs/plugin-react` | `^6.0.2` | `^6.0.3` | Compatibility |
| `xlsx` | `^0.18.5` | `https://cdn.sheetjs.com/xlsx-0.20.3.tgz` | Fixed version via SheetJS CDN |
| `@types/react` | bumped implicitly | — | — |
- **File:** `pnpm-workspace.yaml` — Added `overrides: { uuid: ^11.1.1 }` to fix pnpm 11 peer dep resolution.

## Files Modified / Created

| File | Status |
|------|--------|
| `apps/api/src/middleware/securityHeaders.ts` | **NEW** |
| `apps/api/src/app.ts` | Modified |
| `apps/api/src/middleware/auth.ts` | Modified |
| `apps/api/src/__tests__/app-onerror-cors.test.ts` | Modified |
| `apps/api/src/__tests__/auth-middleware.test.ts` | Modified |
| `apps/api/package.json` | Modified |
| `apps/web/package.json` | Modified |
| `apps/web/public/serve.json` | **NEW** |
| `apps/web/src/routes/ketik/components/settings/KetikSystemTab.tsx` | Modified |
| `apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts` | Modified |
| `apps/web/src/__tests__/ketik-settings-modal.test.tsx` | Modified |
| `apps/telefun/package.json` | Modified |
| `pnpm-workspace.yaml` | Modified |
| `pnpm-lock.yaml` | Modified |
| `vercel.json` | Modified |
| `scripts/deployment/railway-web-healthcheck-smoke.mjs` | Modified |
| `docs/deployment.md` | Modified |

## Test Coverage

- **app-onerror-cors.test.ts:** 4 tests — CORS matched origin, CORS unmatched (null headers), missing Origin (null headers), security headers on normal responses.
- **auth-middleware.test.ts:** RLS profile query test — verifies `createUserClient` is used (not `supabaseAdmin`).
- **ketik-settings-modal.test.tsx:** 2 new tests — custom duration save, saved custom display on tab reopen.

## Deployment Notes

- Railway Web still uses `serve` static server — `serve.json` is copied by Vite build into `dist/`.
- Vercel static deployments get security headers via `vercel.json`.
- API security headers are applied server-side by Hono middleware — no deployment config needed for API.
- CSP on API is restrictive (`default-src 'none'`) — API returns JSON only.
- CSP on Web must allow `script-src 'self'`, `style-src 'unsafe-inline'`, `connect-src https: wss:` for TanStack Router, Recharts, sonner toasts, etc.
- `Permissions-Policy` allows `microphone=(self)` only for Telefun WebSocket audio capture.
