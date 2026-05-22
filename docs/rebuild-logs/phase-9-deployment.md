# Phase 9 — Deployment (P0 Critical)

## What was implemented

### 1. API: Server Startup (`apps/api/src/`)

- Refactored: `src/app.ts` exports Hono app + `AppType`, `src/index.ts` starts server via `serve()`
- Added `@hono/node-server` dependency
- `start` script uses `tsx src/index.ts` (handles ESM module resolution)
- Server starts on configurable `PORT` (default 3001)

### 2. DB: Profiles Table Migration (`supabase/migrations/000_profiles_core.sql`)

- Creates `public.profiles` table (referenced by auth middleware)
- Auto-create profile on user signup trigger
- RLS policies (select own, update own)
- Updated-at trigger

### 3. Deployment Documentation (`docs/deployment.md`)

- Architecture diagram (web → api → supabase + telefun)
- Service overview with ports and deploy targets
- Complete environment variables per service
- Supabase migration order
- Build & run commands
- Deployment checklist

### Build: ✅ all 4 packages pass
