---
name: supabase-migration
description: Author a Supabase schema/RLS/grant migration for Trainers SuperApp — paired rollback, clean local replay, and a real-backend E2E guard. Use together with trainers-superapp-tdd for any change under supabase/migrations.
---

# Supabase migration (Claude Code adapter)

Schema, RLS, grant, and RPC changes are Lane D. Load `trainers-superapp-tdd` first and follow `docs/AGENT_WORKFLOW.md`; this skill only adds the migration-specific steps.

## Steps

1. **Plan.** Persist `plans/markdown/<feature>.md` (Requirement / Design / Tasklist). Note data-loss risk and which client roles (`anon`, `authenticated`, `service_role`) the change touches.
2. **RED E2E first.** Add or extend a real-backend Playwright API spec in `apps/web/e2e/*-api.spec.ts` (pattern: `exposed-function-guard-api.spec.ts`, helpers in `e2e/helpers/sidakRealBackend.ts`) and register it as a project in `apps/web/playwright.api.config.ts`. Run it against the **local** stack and confirm it fails for the expected reason.
3. **Forward migration.** Create `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_name>.sql`, timestamped after the newest existing file. Make it idempotent where practical (`if exists` / `create or replace`), and give every new function an explicit `revoke ... from public, anon` plus the minimal `grant`.
4. **Rollback.** Create `supabase/rollbacks/rollback_<same filename>` in the same change, and add a row to `supabase/rollbacks/README.md` with its dependency or data-loss note. The PostToolUse hook warns and CI (`scripts/check-migration-rollbacks.mjs`) fails without it.
5. **Replay locally.** Only local, one stack at a time:
   ```bash
   bash scripts/integration/supabase-bootstrap.sh
   ```
   This runs `supabase db reset --local`, which replays every migration on a clean database. Then run the focused spec GREEN:
   ```bash
   pnpm --filter @trainers/web exec playwright test -c playwright.api.config.ts --project <project>
   ```
6. **Rollback round-trip** (when the rollback is non-trivial): apply the rollback SQL to the local DB, confirm the spec goes back to its RED state, then re-run the bootstrap.
7. **Types.** If the change alters tables or RPC signatures used by code, update the shared types in `packages/types` and run `pnpm typecheck`.

## Never

- Apply to a remote project (`supabase db push`, MCP `apply_migration`/`execute_sql`) without Fajar's explicit OK. The guard hook asks for confirmation and blocks the production ref `ruosnjmtywcrghjgqugz` outright.
- Treat Supabase MCP output as production facts; the MCP points at a different project.
- Edit an already-applied migration; add a new one instead. The one approved exception (Fajar, 2026-10-10) is the empty-database guard in `20260716163000`, needed because a clean replay stopped there before any later migration could run; see `plans/markdown/migration-replay-empty-db.md`.
