# PDKT reply attribution (Lane D)

## Requirement

Fajar's 2026-10-22 decision: a new reply belongs to the participant selected at reply time, not the immutable creator subject. Riwayat, Monitoring and SIDAK consume the history subject. Keep mailbox creator metadata and all existing history unchanged. No remote mutations, commits, unit tests or full suites.

## Design

- Browser sends `simulationSubject` through the existing typed Hono reply request.
- Reply route uses the same JWT/RLS subject resolver as session create, before quota/mutations; only admin/trainer can select an existing Profiler participant. Omission means verified self, never mailbox inheritance.
- A new explicit-selection reply RPC validates the current actor and participant in the database, preserves row-lock/idempotency and evaluation ownership, and inserts the replier subject. Existing three-argument RPCs default to self through the new implementation. No mailbox subject updates or historical backfill.
- Header copy calls the mailbox subject `Email dibuat untuk` and the creator `Pembuat email` to avoid misrepresenting creator metadata as reply attribution.
- Roles: anon/public cannot execute the new RPC; authenticated can with active-profile and admin/trainer participant checks; service-role is not used by the runtime reply call. No data-loss migration; paired rollback restores the old functions and drops the new RPC without rewriting history.
- Owned scope: shared PDKT reply schema; PDKT web submission/header; API reply route/service; focused apps/web browser/API E2E; new migration/rollback and rollback index; canonical attribution docs and changelog.

## Tasklist

- [x] Read workflow/TDD/migration skills, source, tests and local-target safety docs.
- [x] Inspect graph for `submitMailboxReplyWithOutcome` (exact query useful; initial `--help` query irrelevant).
- [x] Create focused browser regression: create self email, switch picker to participant, reply, inspect Riwayat/Monitoring and persisted immutable creator. Run RED against local stack.
- [x] Implement minimal typed request, shared backend resolution, DB RPC and rollback.
- [x] Replay migrations locally and run focused GREEN. Exercise authorization, missing participant, self and idempotent retry via E2E. Rollback restored creator-derived RED; clean full replay restored GREEN.
- [x] After API retry E2E passed, remove only the superseded mock-only retry test in `pdkt-mailbox-service.test.ts` (the rest of that file and its suite-list entries remain). No unit tests added or run.
- [x] Review with thermo-nuclear; run workspace lint/typecheck and diff check serially.
- [x] Record exact evidence and remaining uncertainty; leave all changes uncommitted.

## Safety and evidence

Initial working tree clean. Docker was stopped; started the installed OrbStack runtime for disposable local Supabase. Browser uses the guarded Vite E2E environment, real JWT bridged to local Hono, dynamic API import after loopback env pin, and fail-closed provider/browser guards. No root dev process, remote database, production credentials or provider calls.

### Verification commands and outcomes

All commands serial. Playwright commands below ran from `apps/web` directly (not the package script argument-forwarding form).

```sh
pnpm exec playwright test pdkt-replier-attribution.spec.ts -g "PDKT reply attributes Riwayat and Monitoring" --workers=1 --trace on
```

- RED exit 1: reply HTTP 200, Riwayat subject was `self / Pembuat email` instead of picker participant; Monitoring also retained actor attribution. `/tmp/pdkt-replier-red.log`; original trace/screenshot/JSON archived under `/tmp/pdkt-replier-red-artifacts/`.
- Intermediate post-replay exit 1: local auth gateway HTTP 502 (fixed by restarting task-owned Kong after DB reset).
- Intermediate exit 1: attribution assertions already passed; Riwayat locator selected the hidden mobile copy. Scoped to the visible table cell, without changing the product expectation.
- GREEN exit 0, 1 passed; `/tmp/pdkt-replier-green-3.log`.

```sh
pnpm exec playwright test pdkt-replier-attribution.spec.ts pdkt-flow.spec.ts -g "PDKT reply attributes Riwayat and Monitoring|tahap Pahami: kotak masuk, navigasi tahap, dan panel baca" --workers=1 --trace on
pnpm exec playwright test pdkt-replier-attribution-api.spec.ts --config playwright.api.config.ts --project pdkt-replier-attribution-real-backend --workers=1
```

- Final browser exit 0: 2 passed (real-JWT attribution + existing header-copy regression), `/tmp/pdkt-replier-browser-final.log`. Trace and attribution JSON remain under `apps/web/test-results/pdkt-replier-attribution-*/` (ignored, local auth artifacts must not be committed).
- Initial API exit 0: 3 passed; split legacy RPC coverage into its own test for the rollback round-trip. Final API exit 0: 4 passed, `/tmp/pdkt-replier-api-final-2.log`. Covers admin/trainer, forbidden agent/leader, absent/malformed participant, invalid JWT, inactive direct caller, anon EXECUTE denial, forged metadata ignored, creator A → replier B, omitted → verified self, canonical retry ID/actor/subject/body/time/evaluation timestamp, both legacy signatures.

Local migration/rollback commands (repo root):

```sh
bash scripts/integration/supabase-bootstrap.sh
supabase db reset --local
pnpm exec tsx -e 'import { readFileSync } from "node:fs"; import { readLoopbackEnv, runSql } from "./apps/web/e2e/helpers/sidakRealBackend.ts"; runSql(readLoopbackEnv(), readFileSync("supabase/rollbacks/rollback_20261023090000_pdkt_reply_replier_attribution.sql", "utf8")); console.log("Local rollback applied");'
```

- Initial bootstrap exit 0. First GREEN bootstrap exit 1 during schema initialization; retry `supabase db reset --local` exited 0 and replayed the new migration. A later round-trip bootstrap timed out during container restart; its direct reset retry exited 1 because an old storage container was unhealthy, not because SQL failed. Recovered via `supabase stop` then `supabase start -x storage-api,imgproxy` (both exit 0); final `supabase db reset --local` exit 0 after full migrations/seeds. `/tmp/pdkt-replier-roundtrip-reset-final.log`.
- Rollback application exit 0. Then, from `apps/web`:

```sh
pnpm exec playwright test pdkt-replier-attribution-api.spec.ts --config playwright.api.config.ts --project pdkt-replier-attribution-real-backend -g "legacy reply RPCs default" --workers=1
```

- Expected RED exit 1: restored RPC inherited `Creator` participant instead of verified replier self. `/tmp/pdkt-replier-rollback-red.log`. Full local replay restored the 4 API passes above.

Catalog control (from `apps/web`):

```sh
pnpm exec playwright test exposed-function-guard-api.spec.ts --config playwright.api.config.ts --project db-guard-real-backend -g "D5.1 catalog invariant" --workers=1
```

- Exit 1 with migration AND on rollback baseline: identical 12 unrelated pre-existing revoked RPCs absent from its legacy service-only allowlist. Only catalog addition is the new PDKT RPC (`anon=false`, `authenticated=true`), deliberately handled with an exact authenticated-only exception; no unrelated grants or allowlist entries changed. `/tmp/pdkt-replier-catalog.log`, `/tmp/pdkt-replier-catalog-baseline.log`.
- To run baseline, applied the rollback with the same `tsx` command above (console label `Local baseline restored`), reran the catalog test, then reapplied the forward SQL locally:

```sh
pnpm exec tsx -e 'import { readFileSync } from "node:fs"; import { readLoopbackEnv, runSql } from "./apps/web/e2e/helpers/sidakRealBackend.ts"; runSql(readLoopbackEnv(), readFileSync("supabase/migrations/20261023090000_pdkt_reply_replier_attribution.sql", "utf8")); console.log("Local forward migration reapplied");'
```

- Forward reapplication exit 0. All final E2Es ran after it.

Compile/quality checks (repo root):

```sh
pnpm --dir packages/types typecheck && pnpm --dir apps/api typecheck && pnpm --dir apps/web typecheck
pnpm --dir packages/types lint && pnpm --dir apps/api lint && pnpm --dir apps/web lint
pnpm --dir apps/api build && pnpm --dir apps/web build
pnpm exec prettier --check apps/web/e2e/pdkt-replier-attribution.spec.ts apps/web/e2e/pdkt-replier-attribution-api.spec.ts
git diff --check
```

All exit 0. API lint: 8 existing warnings; web lint: 66 existing warnings, zero errors. Web typecheck includes E2E TypeScript. Builds were workspace-scoped; no root release/merge gate or legacy unit suite ran.

### Review and limitations

Thermo-nuclear scoped self-review: PASS; traced selection → shared strict schema → existing JWT/RLS resolver → explicit type/ID RPC → immutable history subject → Riwayat/Monitoring/SIDAK. Row lock, created flag, original actor/evaluation ownership and creator metadata are preserved. Header change is copy-only (`Email dibuat untuk`, `Pembuat email`), not a redesign. No unrelated legacy test removal; only the now-equivalently-covered mock retry test was removed, so its file/suite entries remain.

Context7 consulted `/supabase/supabase`: SECURITY DEFINER requires caller validation and explicit EXECUTE revocation; pinned empty search path is not authorization. Exact-signature Graphify query found the service/callers. `graphify update .` was attempted once but timed out after 180s after AST extraction; the ignored graph cache update remains incomplete (no running task-owned extractor remained). This is not product verification.

Known unfinished: global D5.1 baseline remains red for its 12 unrelated functions; parent integration owner should review this separately. No remote mutation, deploy, backfill, commit, push or unit-test execution occurred. Final `supabase stop` exited 0 and stopped this task's local stack; Playwright's Vite servers had already exited. Final Prettier check and `git diff --check` exited 0.
