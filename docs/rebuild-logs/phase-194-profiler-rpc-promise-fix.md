# Phase 194: Profiler RPC Promise & CORS Fix

## Goal
Resolve the Profiler landing-page failure where data existed in the local database but the UI crashed before rendering it.

## Root Causes
1. **CORS whitelist mismatch**
   - Web dev server runs on `http://localhost:3005`
   - API initially only allowed `http://localhost:3000`
   - Browser requests from the web app were blocked before the API response could be consumed

2. **Hono RPC response wrapper bug**
   - `apps/web/src/lib/profilerService.ts` calls `unwrapResponse(profilerClient.*.$get())`
   - Hono RPC `$get()` returns a `Promise<ClientResponse>`
   - `unwrapResponse()` assumed it was already receiving a resolved response and accessed `res.headers` immediately
   - Result: `TypeError: can't access property "get", res.headers is undefined`

## Changes

### API
- Updated `apps/api/src/app.ts` to allow `http://localhost:3005` in the CORS origin list.
- Verified preflight and GET responses now include:
  - `access-control-allow-origin: http://localhost:3005`
  - `access-control-allow-credentials: true`

### Web
- Updated `apps/web/src/lib/api/unwrap-response.ts` to await Promise-like responses before reading headers.
- This keeps the Hono RPC client pattern working for all Profiler endpoints without changing each call site.

### Repository Hygiene
- Added the local mirror artifacts to `.gitignore`:
  - `.env.local.remote`
  - `remote_data_public.sql`
  - `supabase/seeds_backup/`
- These files are useful during local inspection, but should not be committed.

## Verification
- Profiler landing page now renders data correctly.
- API endpoint `/api/v1/profiler/years` responds with `401 Unauthorized` when no auth is present, but no longer fails CORS from the web origin.
- Local Supabase data includes years, folders, and peserta records needed by the Profiler UI.

## Notes
- The tracked `supabase/*` seed/migration diffs in the working tree are separate from this UI/API fix and should be reviewed independently before commit.
- This phase log documents only the user-facing Profiler recovery path and transport-layer fix.
