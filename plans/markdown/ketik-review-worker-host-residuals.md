# KETIK review worker host: remove residual implicit lifecycle state

Status: **R1/R2/R4 implemented; local gates passed; task-owned stack cleaned up** (2026-11-17). Commit/push outcome is reported in the executor's final response. R3 remains out of scope.
Baseline: HEAD `5b17b751` on `main`. Follows `plans/markdown/ketik-review-worker-transitions.md` (WS1–WS3 done).

## Requirement

The previous plan replaced the five host flags with `HostState`/`transitionHost`. A follow-up review found that some lifecycle decisions still bypass that state. Close these gaps in `apps/api/src/workers/ketik-review-worker-runtime.ts` **without changing observable worker behavior** except where R4 explicitly says so.

| ID  | Residual                                                                                                   | In scope            |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------- |
| R1  | Release-timeout outcome lives in two places; `shutdown()` decides via the health field `errorClass`        | Yes                 |
| R2  | `releasePromise` (a resource handle) gates "is a release in flight?", duplicating phase `releasing`        | Yes                 |
| R4  | `transitionHost` silently returns `state` for every unexpected event, so illegal transitions are invisible | Yes (decided)       |
| R3  | Provider work abandoned at the deadline keeps running untracked                                            | **No**: report only |

Lane C: one file, but it changes the worker lifecycle, its health semantics, and the embedded API process. Load `trainers-superapp-tdd` before editing. Out of scope: SQL/migrations (DB side is already centralized in `20261116170000_ketik_review_job_transitions.sql`), provider code, the frontend, the poll schedule (`transitionPoll`), and the standalone entrypoint's `stopping` idempotency guard. Do not touch untracked plans you do not own.

## Verified findings (re-verify against HEAD before editing)

All line numbers refer to `apps/api/src/workers/ketik-review-worker-runtime.ts` at `5b17b751`.

### R1: timeout outcome duplicated; lifecycle reads a health field

- The host already has phase `release_timed_out` (`:87–89`, set at `:204–205`, preserved by `cycle_finished` at `:142–146`).
- `loop_stopped` (`:113`) collapses any state to `{ status: "stopped" }`, so that outcome is lost when the loop exits.
- `shutdown()` therefore decides with `if (claimAtShutdown && errorClass === "ReleaseTimeout") throw new ReleaseTimeout()` (`:325–326`). `errorClass` is the health/diagnostic field (`health()` at `:338–360`), and it is reset by any successful claim (`:219`).
- Semantics that must be preserved exactly: throw only when **the claim that was active when shutdown began** hit a release timeout. That includes a deadline release that times out during the shutdown grace. A timeout from an _earlier_ claim (host already in `release_timed_out` with no claim when shutdown starts) must **not** make shutdown throw.

### R2: in-flight gate on a handle

`releaseWithin()` starts with `if (releasePromise) return releasePromise;` (`:190`). The state already records `work.phase === "releasing"` with the claim. The handle is still needed in order to _join_ the in-flight attempt, but the _decision_ should come from state.

### R4: illegal events are silent no-ops

Every `return state` fallthrough in `transitionHost` (`:109–146`) hides both legitimate idempotent cases and real bugs. Compare the SQL helpers, which raise `PT409` on an unexpected transition. Some no-ops **are** legitimate today. Classify them before changing anything. Known candidates, to be verified by reading every call site:

- `stop` while already `stopping`/`stopped`: idempotent shutdown.
- `claimed` arriving while `stopping` (stop raced the claim RPC): legal, and must go to `processing` so that `runCycle` releases it (`:222–226`).
- `cycle_finished` from `waiting` or `release_timed_out`.
- `loop_stopped` from any state.
- `release_finished`/`release_timed_out` for a claim that is no longer `work.claim`: is this reachable now that releases are joined? Decide and document.

### R3: abandoned provider work (report only)

At the deadline, `Promise.race` (`:230–245`) stops waiting for `processClaimedKetikReview(claim)` but does not cancel it. The host returns to `waiting` while the provider call is still running. The same worker can re-claim the re-queued job and make a second, concurrent AI call for the same session. Late results are token-fenced in the DB, so this costs AI money but cannot corrupt data. The fix needs `AbortSignal` plumbing through `review-processor.ts` and the provider clients, which is a separate decision for Fajar. **Do not implement it here.** Record it in the report and in `docs/` only if a matching "known limitations" section already exists.

## Design

### R1 + R2: make the state carry what shutdown and release need

- Extend `stopping` and `stopped` so that the shutdown outcome is derived from state, not from `errorClass`. Suggested shape, adjust as needed:
  - `stop` records the claim active at that moment: `{ status: "stopping"; work; claimAtStop: KetikReviewClaim | null }`.
  - `release_timed_out` for `event.claim === claimAtStop` marks the stop as deferred.
  - `loop_stopped` produces `{ status: "stopped"; outcome: "clean" | "recovery_deferred" }` from that.
- `shutdown()` throws `ReleaseTimeout` iff `host.outcome === "recovery_deferred"` after the loop settles. Keep the existing bounded shutdown-release path (`:327–335`) and its logs (`shutdown_claim_fenced`, `shutdown_recovery_deferred`) unchanged.
- `releaseWithin()` decides from state: if `work.phase === "releasing"` and `work.claim === claim`, join the stored handle. If a different claim is releasing, that is an illegal transition (see R4). The handle stays purely for awaiting.
- **Acceptance:** no lifecycle branch reads `errorClass`, `lastPollAt`, or `releasePromise` for a decision (grep them). `errorClass` stays a health/diagnostic output only, still set to `"ReleaseTimeout"` on a deadline-release timeout and still cleared by the next successful poll, so the `health()` JSON is unchanged.

### R4: illegal transitions fail loudly (decided by Fajar 2026-11-17)

- Write a transition table (state × event → next state | `noop` | `illegal`) in the code comment above `transitionHost`. Legitimate idempotent cases stay explicit no-ops; everything else is `illegal`.
- **Decision (Fajar, 2026-11-17): implement the `faulted` option below.** Do not ask again; the "keep running" alternative was rejected.
  - `transitionHost` throws `HostTransitionError`.
  - The host enters a terminal `{ status: "faulted" }`: admission stops, `health().healthy === false`, and the log is `ketik_review_worker.host_faulted` with only the event type and state status, no claim IDs or tokens.
  - `loopPromise` must never become an **unhandled rejection**. In embedded mode that would crash the whole API process (`apps/api/src/api-runtime.ts:87–106`). Attach the handler in `start()`.
  - `shutdown()` from `faulted` resolves via the deferred-recovery path (throws `ReleaseTimeout`-equivalent so both hosts log `shutdown_recovery_deferred`; lease expiry is the backstop).
  - Rejected alternative: log and degrade health but keep running (keeps admitting work after a proven bug).
- Never convert an illegal transition into a silent success (`AGENTS.md`).

## Tests

Existing real-backend E2E already pins the behavior R1/R2 must preserve. Run them under **both** Playwright projects. The deadline spec matches `ketik-review-worker-api-*.spec.ts`, so both projects include it.

- `apps/web/e2e/ketik-review-worker-api-deadline.spec.ts`:
  - "deadline release timeout degrades health and completes another job while PostgreSQL is still blocked" (`errorClass` still `ReleaseTimeout`, then cleared);
  - "a healthy deadline release invalidates its token…";
  - both `shutdown bounds blocked release during {deadline release | provider processing}` cases (exit code and `shutdown_recovery_deferred` vs `shutdown_claim_fenced`). This is the R1 regression guard.
- `ketik-review-worker-api-host.spec.ts` (health, wake, competing claims, invalid activation) and `ketik-review-worker-api-publication.spec.ts` (SIGTERM/SIGKILL).

**Missing coverage to add (characterization, before refactoring):** a shutdown that begins while the host is already in `release_timed_out` from an _earlier_ claim, with no active claim, must exit **0** and log neither `shutdown_claim_fenced` nor `shutdown_recovery_deferred`. Today's behavior relies on `claimAtShutdown` being null; pin it before refactoring. Extend `ketik-review-worker-api-deadline.spec.ts`, reusing its PostgreSQL row-lock and `KETIK_REVIEW_WORKER_DEADLINE_MS` harness. It should be GREEN on current code (a characterization test). Say so honestly; it is not a RED for a bug.

**R4 cannot be reached by E2E** without injecting a bug, because illegal transitions are unreachable by construction. **Decision (Fajar, 2026-11-17): no new test for R4.** Verify it with the transition table, the `thermo-nuclear` review, and the full E2E regression on both projects. Do **not** add a unit or isolated test. State in the report that R4's fault path is verified by review only, not by an executed test.

## Tasklist

- [x] Intake: read `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, this plan and the previous one; load `trainers-superapp-tdd`; drift-check every line reference above; `graphify query` for `createKetikReviewWorker` / `transitionHost` callers.
- [x] R4 decisions recorded (Fajar, 2026-11-17): `faulted` terminal status; no new test, verification by review and E2E regression.
- [x] Set up a fresh, task-owned disposable Supabase stack, as in the previous plans: ignored `scratch/` workdir, exclude `mailpit`, loopback ports, no `.env*` edits, never prod `ruosnjmtywcrghjgqugz`. One Playwright run at a time, `--workers=1 --trace on`.
- [x] Add the characterization E2E (shutdown after an earlier claim's timeout). Run it on current code: expect GREEN and save the log.
- [x] Implement R1 + R2 and run the focused deadline spec, then the full worker suite on both projects:
  - `pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-api-(deadline|host|publication)\.spec\.ts$' --config=playwright.api.config.ts --project=ketik-review-worker-real-backend`
  - the same with `--project=ketik-review-worker-embedded-real-backend`
- [x] Implement R4 (`faulted`, handled `loopPromise` rejection, bounded shutdown from `faulted`); re-run the same suite on both projects.
- [x] Grep acceptance: no lifecycle decision reads `errorClass`, `lastPollAt`, or `releasePromise`, and every `transitionHost` fallthrough is either a table-listed no-op or `illegal`.
- [x] `thermo-nuclear` review; `TURBO_CONCURRENCY=1 pnpm typecheck && pnpm lint && pnpm build`; scoped API ESLint; `GRAPHIFY_MAX_WORKERS=1 graphify update .`; changelog entry.
- Release step after the local gates: commit `refactor(ketik): derive review worker shutdown outcome from host state and reject illegal transitions` and push to `main`; actual SHA/push result belongs in the final response. Railway auto-deploys on push; no manual deployment or deployment-success claim.
- [x] Clean up only task-owned stacks, processes, and fixtures.

## Risks

- R1 shifts which code path decides the shutdown exit code. A mistake changes the API exit code or `shutdown_recovery_deferred` logging in production. The deadline spec's shutdown cases are the guard; do not weaken their assertions.
- R4 with "faulted" stops the embedded worker inside a running API process; the API keeps serving HTTP. Confirm in `api-runtime.ts` that a faulted worker does not block API shutdown, and that `shutdown()` stays bounded by `shutdownMs`.
- Keep `health()` JSON fields identical, so the standalone `/health` contract is unchanged.

## Report back

Files changed; the final R4 transition table; exact commands with exit codes and log paths; whether the characterization test was GREEN before the refactor; grep evidence for the acceptance check; commit SHA; R3 restated as an open follow-up; any doc/code inconsistencies found.

## Execution evidence — 2026-11-17

### Scope and implementation

- Direct implementation, Lane C, using this approved persisted plan and `trainers-superapp-tdd`; no delegation or independent review claimed. Initial HEAD and all findings matched `5b17b751`. Another session committed the unrelated harness change `5dc2c5f3` during execution; it is preserved. Its new verification-trailer rule was read and applied before this task's commit. No API config, fixture harness, hook, migration, provider client, or poll schedule was changed.
- Owned files: `apps/api/src/workers/ketik-review-worker-runtime.ts`, `apps/web/e2e/ketik-review-worker-api-deadline.spec.ts`, this plan, `docs/architecture.md`, `docs/deployment.md`, `CHANGELOG.md`. The three unrelated untracked plans remain untouched.
- R1: `stopping` snapshots `claimAtStop` and carries `outcome`; only that claim's release timeout changes it to `recovery_deferred`. `loop_stopped` preserves the outcome. A timeout before stop, with no active claim, starts a clean shutdown. Neither path reads a health diagnostic to decide the result.
- R2: `releaseWithin` joins only when state says the same claim is `releasing`; `releasePromise` is just the awaitable handle. A different claim goes through the transition validator and faults. `release_failed` explicitly leaves `releasing` before the handle is cleared, so even RPC rejection cannot leave state falsely advertising an in-flight handle.
- R4: illegal transitions throw `HostTransitionError`; the wrapper dispatches `fault` through the same transition function, unsubscribes wake signals, and logs only `event`, `eventType`, `stateStatus`. Fault is terminal; health is false, admission stops, and shutdown rejects with `ReleaseTimeout` immediately (or after the existing grace if fault occurred during that wait). Both existing process hosts already catch that rejection and log deferred recovery; embedded HTTP remains independent. `start()` attaches a rejection handler immediately to the loop, so no unhandled loop rejection escapes into the API.
- Review found two legitimate shutdown overlaps that silent no-ops had concealed: provider completion/error while shutdown release is pending, and the provider deadline after shutdown has already fenced the claim. Cycle cleanup now joins the existing bounded release before finishing; deadline release runs only while this claim remains active. No second RPC or new lifecycle flag is introduced. These overlap branches were reviewed, not separately fault-injected.

### Final transition table

R = `running`, S = `stopping`; all release/completion events require the identical claim object. The complete table is also directly above `transitionHost` in code.

| From                                    | Event                                | Result                                                                   |
| --------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `idle`                                  | `start`                              | R/`waiting`                                                              |
| `idle`                                  | `stop`                               | `stopped`, clean                                                         |
| R/any phase                             | `stop`                               | S/same work, snapshot active claim, clean                                |
| S/any phase, `stopped`, `faulted`       | `stop`                               | explicit noop                                                            |
| R/`waiting` or `release_timed_out`      | `claim`                              | R/`claiming`                                                             |
| R or S/`claiming`                       | `claimed`                            | same status/`processing` (includes stop racing claim RPC)                |
| R or S/`processing`                     | `release`                            | same status/`releasing`                                                  |
| R or S/`releasing`                      | `release_finished`, `release_failed` | same status/`waiting`                                                    |
| R or S/`releasing`                      | `release_timed_out`                  | same status/`release_timed_out`; S defers iff claim equals `claimAtStop` |
| R or S/`claiming` or `processing`       | `cycle_finished`                     | same status/`waiting`                                                    |
| R or S/`waiting` or `release_timed_out` | `cycle_finished`                     | explicit noop, preserves timeout phase                                   |
| any except `faulted`                    | `loop_stopped`                       | `stopped`, preserves stop outcome where present                          |
| `faulted`                               | `loop_stopped`                       | explicit noop                                                            |
| any except `faulted`                    | `fault`                              | terminal `faulted`                                                       |
| `faulted`                               | `fault`                              | explicit noop                                                            |
| any other pair or mismatched claim      | any                                  | illegal: throw `HostTransitionError`                                     |

A duplicate release is joined before dispatch, not silently ignored by the reducer. A late RPC cannot dispatch a second completion after its `Promise.race` has settled. Cleanup skips `cycle_finished` after a fault and `loop_stopped` preserves `faulted`; no cleanup converts a proven bug back into a healthy state.

### Safe target and E2E commands

All evidence is under ignored `artifacts/ketik-review-residuals/`. Traces can include local JWTs and are not committed. The fresh target was `scratch/ketik-review-residuals-20261117`, project `ketik-review-residuals-test-20261117`, API/DB loopback targets **55621/55622**. Canonical migrations were symlinked, seed disabled, and Storage schema retained with its runtime excluded. Provider SDK calls were routed to the existing loopback HTTP fixture; non-loopback fetches were denied. No `.env*`, production endpoint, remote DB, or paid provider was used.

- `graphify query createKetikReviewWorker` and `graphify query transitionHost` → **0**; both identified the runtime and its standalone/embedded callers. Live imports confirmed those edges. The preliminary `graphify query --help` was interpreted as a graph query, not CLI help, so its unrelated result was not used. Context7 was unnecessary: no external API/dependency change.
- `supabase start --workdir "$PWD/scratch/ketik-review-residuals-20261117" --exclude studio,mailpit,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta` → **0**, `stack-start.log` (fresh canonical replay).
- Characterization **before product edits**: `E2E_SUPABASE_WORKDIR="$PWD/scratch/ketik-review-residuals-20261117" pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-api-deadline\.spec\.ts$' --config=playwright.api.config.ts --project=ketik-review-worker-real-backend -g 'shutdown after an earlier' --reporter=line --workers=1 --trace on --output="$PWD/artifacts/ketik-review-residuals/characterization-results"` → **0**, **1 passed**, `characterization.log`; trace in `characterization-results/`. This was GREEN on old code, not a bug RED.
- R1/R2 focus: the same deadline-spec command without `-g`, with `--max-failures=1 --output="$PWD/artifacts/ketik-review-residuals/r12-deadline-results"` → **0**, **6 passed**, `r12-deadline.log`.

The exact full-suite command used for each row below was:

```bash
E2E_SUPABASE_WORKDIR="$PWD/scratch/ketik-review-residuals-20261117" pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-api-(deadline|host|publication)\.spec\.ts$' --config=playwright.api.config.ts --project=<project> --reporter=line --workers=1 --trace on --max-failures=1 --output="$PWD/artifacts/ketik-review-residuals/<run>-results"
```

| Run / log stem     | Project                                     | Exit | Result                                   |
| ------------------ | ------------------------------------------- | ---- | ---------------------------------------- |
| `r12-standalone`   | `ketik-review-worker-real-backend`          | 0    | 34 passed, 1 embedded-only wake skip     |
| `r12-embedded`     | `ketik-review-worker-embedded-real-backend` | 0    | 34 passed, 1 standalone-only health skip |
| `r4-standalone`    | `ketik-review-worker-real-backend`          | 0    | 34 passed, 1 embedded-only wake skip     |
| `r4-embedded`      | `ketik-review-worker-embedded-real-backend` | 0    | 34 passed, 1 standalone-only health skip |
| `final-standalone` | `ketik-review-worker-real-backend`          | 0    | 34 passed, 1 embedded-only wake skip     |
| `final-embedded`   | `ketik-review-worker-embedded-real-backend` | 0    | 34 passed, 1 standalone-only health skip |

Final runs include the post-review shutdown/deadline guard and TypeScript narrowing correction. Each has its own log and trace output directory. All runs were serial, with one Playwright worker and no retries. Existing assertions were not weakened. The only test edit is the characterization expressly requested by this plan.

**R4's `faulted` path was verified by transition-table / thermo-nuclear self-review only, not by an executed test.** No isolated/unit test or illegal-event injection was added or run. Passing E2E proves the reachable worker regressions, not fault injection.

### Thermo-nuclear and quality gates

Verdict: **PASS for owned implementation**, with the explicit R4 test exception and R3 follow-up. No independent reviewer is claimed. Reviewed state/event coverage, matching-claim fences, stop/claim race, timeout before/during stop, deadline/shutdown joins, RPC rejection cleanup, late provider completion, handled loop rejection, terminal fault preservation, unchanged health fields, sanitized fault logs, and both hosts' shutdown catch boundaries.

- Initial `pnpm --filter @trainers/api typecheck` → **1**, `api-typecheck.log`: TypeScript held pre-await `running` / non-faulted narrowing across closure mutations (`TS2339`, `TS2367`). Added a typed current-state read at the two async control boundaries, without a cast or weakened compiler setting. Same command → **0**, `api-typecheck-green.log`. No unexplained failure or test flake remains.
- `TURBO_CONCURRENCY=1 pnpm typecheck` → **0**, `typecheck.log` (includes web E2E TypeScript).
- `TURBO_CONCURRENCY=1 pnpm lint` → **0**, `lint.log`; 74 existing web warnings in untouched files, zero errors.
- `TURBO_CONCURRENCY=1 pnpm build` → **0**, `build.log`; existing Vite native-config warning, no build error.
- `pnpm --dir apps/api exec eslint src/workers/ketik-review-worker-runtime.ts` → **0**, `api-eslint.log`.
- `GRAPHIFY_MAX_WORKERS=1 graphify update .` → **0**, `graphify-update.log`; generated cache not staged.
- `rg -n 'errorClass|lastPollAt|releasePromise' apps/api/src/workers/ketik-review-worker-runtime.ts`: reads of health diagnostics are only in `health()`; lifecycle code merely assigns them. `releasePromise` is assigned, cleared, or returned for awaiting, never an admission/in-flight predicate. `shutdownPromise` remains the allowed idempotency resource.
- Final scoped Prettier and diff acceptance evidence is in `format-check.log` and `acceptance.log`; changelog entry matches the intended commit. The new `Verified:` commit trailer lists only executed passing checks.

### Cleanup and remaining limitations

- Read-only local cleanup query → **0**, `cleanup-counts.log`: zero profiles/history/jobs/usage rows, fixture transition functions, and blocked settlements. `supabase stop --workdir "$PWD/scratch/ketik-review-residuals-20261117" --no-backup` → **0**, `stack-stop.log`. No task worker, Playwright, psql lock session, or task-owned container remained. No unrelated process/stack was stopped.
- **R3 remains open:** `Promise.race` abandons but does not cancel provider work; a re-claim can incur concurrent AI calls for the same session. DB token/expiry fencing protects publication, not AI cost. Separate AbortSignal plumbing through processor/provider clients is still needed and was not implemented. No matching known-limitations section exists in the scoped canonical docs, so no new R3 section was invented.
- Canonical architecture/deployment text now includes `faulted` and state-derived shutdown outcomes. Existing report-only drift remains: deployment debug step 4 points at removed `ketik-service.ts`, and the legacy unit-command subsection remains. Entrypoint `stopping` and API `shutdownStarted` flags are existing wrapper lifecycles deliberately outside this runtime task. The local Wiki copies contain no worker-host lifecycle mirror to synchronize; their canonical-doc links remain valid.
- Pushing this task to `main` triggers Railway auto-deploy as noted in the approved plan. A successful push is not evidence of a successful deployment. No Railway deploy command, production smoke test, or remote Supabase mutation was performed.
