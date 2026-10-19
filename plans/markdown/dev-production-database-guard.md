# API and Telefun refuse the production database outside hosting

- **Status:** Done 2026-10-19. Fajar chose "Blokir, bisa dilewati" on the decision card (block by default, opt out with `ALLOW_PROD_DB_IN_DEV=1`).
- **Lane:** C (boot-time env check in two backend services; no schema, API contract or hosted-runtime change).

## Requirement

Supabase egress reached 91% of the Free quota. Most of it was database reads on 13–16 Oct from processes on developer machines and cloud dev environments that loaded the root `.env`/`.env.local` (production URL and service-role key). Railway did a fraction of that day's requests.

**Acceptance:**

- API and Telefun exit with code 1 and a clear Indonesian message, before any network request, when their Supabase URL is the production project and no Railway/Vercel hosting variable is set.
- With `ALLOW_PROD_DB_IN_DEV=1` they start and print a warning.
- On Railway (`RAILWAY_*`) or Vercel (`VERCEL`) they start with no message.
- Loopback/local Supabase is unaffected.

## Design

`checkDevDatabaseTarget(service, supabaseUrl, env)` in `packages/types/src/dev-database-guard.ts` returns ok / allowed / refused. `apps/api/src/lib/env.ts` and `apps/telefun/src/env.ts` call it right after env validation, so every entrypoint (dev, start, workers) is covered. Web (browser, RLS) is unchanged.

## Tasklist

- [x] RED: `dev-database-guard-api.spec.ts` (new `dev-database-guard` project in `playwright.api.config.ts`) spawns the real API and Telefun entrypoints with a non-loopback egress block; refuse and allow cases failed, Railway cases passed.
- [x] GREEN: 6/6 passed; refused runs log no denied egress.
- [x] `tsc --noEmit` for api, telefun, web and `tsconfig.e2e.json`: exit 0. Docs: `docs/deployment.md` local development.
