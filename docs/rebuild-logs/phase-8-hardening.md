# Phase 8 — Hardening

## P0 Critical

### 1. API: Global Error Handler (`apps/api/src/index.ts`)

- `app.onError()` — catches unhandled errors, returns consistent `ApiResponse<never>` with `{ code, message }`
- `app.notFound()` — returns 404 with `ApiResponse` format
- Auth middleware error format fixed: all errors now use `{ code, message }` objects instead of plain strings

### 2. API: Rate Limiting (`apps/api/src/middleware/rateLimit.ts`)

- In-memory sliding window rate limiter (100 req/min per IP)
- Applies to all `/v1/*` routes via `rateLimitMiddleware`
- Returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers
- Returns 429 `{ code: 'RATE_LIMITED', message: '...' }` on exceed
- Periodic cleanup every 60s

### 3. Web: React Error Boundary (`apps/web/src/components/ErrorBoundary.tsx`)

- Class component that catches render errors
- Shows friendly fallback UI with "Try again" button
- Logs errors to console
- Wraps `RouterProvider` in `main.tsx`

### 4. Web: Auth Store Initialization (`apps/web/src/store/authInit.ts`)

- `initAuth()` called at app bootstrap
- Reads stored token from `localStorage`, validates with Supabase
- Restores session and profile in Zustand store
- Layout header now displays actual user name from store

## P1 High

### 5. API: Env Validation (`apps/api/src/lib/env.ts`)

- Zod-based env validation at startup (pattern from telefun)
- Validates: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`
- Clear error messages + `process.exit(1)` on failure

### 6. API: Request Logger (`apps/api/src/middleware/requestLogger.ts`)

- Logs `[METHOD] [PATH] [STATUS] [DURATION] [USER_ID]` for every request
- Applied globally via `app.use(requestLogger)`

### 7. API: Consistent Error Response Format

- `sidak.ts` — temuan endpoint: `total` moved inside `data` (was at top level)
- `ai.ts` — upsert/billing responses: added `data: null` for consistency

### 8. Telefun: Graceful Shutdown (`apps/telefun/src/server.ts`)

- `SIGTERM`/`SIGINT` handlers: stop accepting new WS, close all connections, flush usage, close HTTP server
- 10s timeout force-exit fallback

### 9. Web: Error Handling & API URLs

- `vite.config.ts`: proxy `/api` → `http://localhost:3001`
- `useApi.ts`: base URL from `VITE_API_URL` env var, fallback to `/api/v1`
- `ketik/simulation.tsx`: error state shown when AI call fails (red banner)
- `pdkt/simulation.tsx`: error state shown on start/evaluate failures
- `monitoring.tsx`: added catch blocks, error banner display

### Build: ✅ all 4 packages pass

## P2 Medium

### 10. API: Reusable Role Middleware (`apps/api/src/middleware/role.ts`)

- `requireRole(...roles)` middleware factory
- Replaces inline role checks in `ai.ts` (pricing upsert, billing update)
- Returns consistent 403 `{ code: 'FORBIDDEN', message }` response

### 11. API: CORS Hardening (`apps/api/src/index.ts`)

- Explicit allowed origins based on `NODE_ENV`
- Dev: `http://localhost:3000` | Prod: custom domains
- `credentials: true` for cookie/session support

### 12. Types: Shared Zod Validation Schemas (`packages/types/src/index.ts`)

- Moved `generateMessageSchema` from `ketik.ts` → shared types
- Moved `generateEmailSchema` / `evaluateSchema` from `pdkt.ts` → shared types
- Added Zod schemas: `chatMessageSchema`, `ketikIdentitySchema`, `pdktIdentitySchema`, `emailMessageSchema`
- Route files now import schemas from `@trainers/types` (no inline `z.object` definitions)

## Next

- Phase 9: Deployment preparation
