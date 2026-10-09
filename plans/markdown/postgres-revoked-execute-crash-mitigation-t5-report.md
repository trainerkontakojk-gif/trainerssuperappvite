# T5 report: review and docs (2026-10-10)

Lane D. Executed by Claude Code in a fresh session after T4 completed. No DB, Playwright, dev server, remote, commit, or push.

## Thermo-nuclear review

```text
Verdict: PASS (no P0/P1)
```

Scope read: `supabase/migrations/20261008150000_guard_exposed_service_role_functions.sql` (2093 lines; outline plus A1, A2, A32–A34, MV refresh, Q3 move, grants, self-check), `20261008150001_restore_anon_execute_client_rpcs.sql`, both rollback files (outline, A33/A34 headers, tail ordering), `apps/web/e2e/exposed-function-guard-api.spec.ts` (structure), `apps/web/playwright.api.config.ts` diff.

Checks:

- **No stale bodies after the main sync.** `git log --since=2026-10-08 -- supabase/migrations` shows only `20261008120000_tna_phase1.sql` on main; no migration redefines a guarded function after the T2 snapshot.
- **Guard first, grant after, one file.** All 34 Group A definitions have `PERFORM app_internal.assert_service_role();` directly after `BEGIN`; grants follow every definition; the `$check$` block re-verifies guard position, EXECUTE, owner, `app_internal` USAGE/EXECUTE denial and the Q3 move.
- **S5 (callers without service-role claims).** No SQL caller of any guarded function exists outside its own definition (no triggers, no cron). Runtime `.rpc()` callers use `supabaseAdmin`/`adminClient`/`admin` (API) or `createTelefunWebRtcDb()` defaulting to the service-role client (`apps/telefun/src/server.ts:74`). `consumeTelefunDistributedRateLimit` (`apps/api/src/middleware/rateLimit.ts:23`) takes an injected client but has no runtime caller.
- **Rollback.** Restores pre-T2 bodies (A33/A34 back to `LANGUAGE sql`, INVOKER by `CREATE OR REPLACE` default), pre-T2 ACLs, moves Q3 back before dropping the guard and schema, no CASCADE. Migration-2 rollback revokes only the 7 anon grants. Both carry the crash-exposure warning.

Findings (non-blocking, for T6 rollout):

- **P2 — production preflight.** Production migration history is out of sync with the repo (see TNA T1/T6). Migration 1 fails closed if any of the 34 signatures is missing or not owned by `postgres`; migration 2's global check fails closed if production has any other exposed function lacking anon/authenticated EXECUTE. Both abort atomically (safe), but a read-only catalog preflight on production, with Fajar's approval, should precede the rollout.
- **P3 — pg_graphql visibility** is documented, not hardened (T0 §6); optional `@graphql` omit directive left to Fajar.

## Docs

`docs/architecture.md` → Security Model item 6 plus section "Kontrak: fungsi di schema yang diekspos": never revoke EXECUTE from anon/authenticated; service-role guard pattern; anon rejection for user RPCs; `app_internal` rules; no direct-SQL/cron caller assumption; pg_graphql note; enforcement (migration-2 self-check + E2E); rollback warning.

## Commands

| Command                                                  | Exit                                                    |
| -------------------------------------------------------- | ------------------------------------------------------- |
| `graphify update .`                                      | 0 (15148 nodes, 27791 edges; HTML viz skipped for size) |
| `git diff --check`                                       | 0                                                       |
| `npx --no-install prettier --check docs/architecture.md` | 0                                                       |

No E2E, typecheck, or build rerun: T5 changed only docs and plan files.
