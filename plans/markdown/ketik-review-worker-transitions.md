# KETIK review worker: explicit transitions and bounded deadline release

Status: **WS1 implemented, pushed (`cc8baf9c`), and applied to the authorized target on 2026-11-17. WS2 implemented and locally verified; push held for separate deployment approval. WS3 deployment-debug edits not started; its code comment was fixed with WS2.** Original plan written from a read-only audit.
Baseline: HEAD `3b511754` on `main`.

## Requirement

A read-only audit of the durable KETIK review worker found three gaps against `AGENTS.md` ("No new implicit state machines") and one documentation drift. This plan fixes them in three independent workstreams. **Each workstream is its own commit** (with its own `CHANGELOG.md` entry) and can ship on its own.

| WS  | Finding                                                                                    | Lane | Ship order |
| --- | ------------------------------------------------------------------------------------------ | ---- | ---------- |
| WS1 | Review-job status writes scattered across three RPCs; `claim` has no expected-status guard | D    | 1st        |
| WS2 | Worker host lifecycle is a set of flags, and the deadline-path release has no time bound   | C    | 2nd        |
| WS3 | `docs/deployment.md` and one code comment describe removed behavior                        | A    | any        |

Out of scope: provider/model selection, quota/usage accounting, the session chat lifecycle (already centralized in `20261116160000_ketik_session_status_transitions.sql`), frontend, and new job statuses. Do not touch the three pre-existing untracked plans in `plans/markdown/`.

## Verified findings (evidence for the executor)

Re-verify each against live code before editing (`docs/AGENT_WORKFLOW.md` drift check).

### F1: review-job transitions are not centralized (WS1)

Effective definitions. No later migration redefines these:

- `claim_ketik_review(text,integer,uuid)`: `supabase/migrations/20261016000935_ketik_durable_review_worker.sql` (claim body around lines 55–75).
- `settle_ketik_review(uuid,uuid,jsonb,boolean)`: `supabase/migrations/20261017150000_ketik_settle_review_drop_legacy_results.sql:13–50`.
- `enqueue_ketik_review(uuid,uuid,uuid,boolean)`: `supabase/migrations/20261018200000_user_controls.sql:24–54`.

Precise state of each:

- **`settle`** is already _effectively_ guarded. It locks `ketik_history` and then the job `FOR UPDATE`, and returns `false` unless `status='processing'`, the token matches, and the lease is live. The UPDATEs themselves use only `WHERE id=j.id`. This is a policy gap, not a race.
- **`enqueue`** is effectively guarded too. Under `FOR UPDATE` it returns early when the job is `queued`/`processing`. The `ON CONFLICT DO UPDATE` has no status predicate. Policy gap.
- **`claim` is the real weak point.** It picks the candidate with the statement snapshot but locks only `ketik_history` (`FOR UPDATE OF h SKIP LOCKED`). Then it runs `SELECT … FROM ketik_review_jobs … FOR UPDATE` and **does not re-check `j.status` / lease** before `UPDATE … SET status='processing' … WHERE id=j.id`. Other RPCs lock `h` without updating it, so Postgres does no EvalPlanQual re-check. If a second worker's claim (or a settle) commits between this statement's snapshot and its lock, the claim proceeds on stale job state. It can then steal a live lease, wasting an AI call and adding an extra `attempt_count`, so the job can reach `failed` early. In theory it can also re-open a `completed` job. This needs at least 2 concurrent workers and a very narrow window. **Plausible, not reproduced.** Do not claim it was reproduced unless a test actually shows it.

### F2: worker host lifecycle is implicit (WS2)

`apps/api/src/workers/ketik-review-worker-runtime.ts:74–88`: `started`, `stopping`, `loopAlive`, `active`, and `cycle` together encode the phase. `start()`, `shutdown()`, `runCycle()`, `loop()`, and `health()` each read and write them. The **poll schedule is already explicit** (`PollState`/`PollEvent`/`transitionPoll`, lines 52–85). Keep it and extend that pattern; do not replace it.

### F3: deadline-path release is unbounded (WS2)

`ketik-review-worker-runtime.ts:119–121`: `await releaseKetikReview(claim)` has no application timeout. `createAdminClient()` (`apps/api/src/lib/supabase.ts`) sets no fetch timeout either. `loop()` awaits the whole cycle, so a hung `settle_ketik_review` RPC blocks every later claim on this worker. The shutdown path already bounds its release (`:187–203`, `RELEASE_TIMEOUT`), so the two paths are inconsistent. The embedded worker has no health server, so nothing restarts it. With a single worker, nothing else reclaims the job after its lease expires. No existing E2E covers the deadline path.

### F4: documentation drift (WS3)

- `docs/deployment.md:491–498` (KETIK debug checklist, steps 5–6):
  - Step 6 says "Polling akan auto-mark failed". In fact `read_ketik_review` is `LANGUAGE sql STABLE` with no writes, and the E2E `ketik-review-worker-api-host.spec.ts` "polling is read-only…" asserts this.
  - Step 5 tells the reader to check `OPENAI_API_KEY`, which implies an OpenAI fallback. The default KETIK review models are both Gemini: `packages/types/src/ai-model-policy.ts` → `ketik_review` `gemini-3.8-flash`, `ketik_review_fallback` `gemini-3.5-flash-lite`. Admin policy can override this.
- `apps/api/src/services/ketik/review-lifecycle.ts:19` comment "Gemini can retry … once, then OpenAI": same drift.
- Report only, do not fix: the duplicate "Test Commands (KETIK Specific)" section at `docs/deployment.md:501–508` lists legacy unit commands, and its step 4 points to `ketik-service.ts`. Both were already reported by `ketik-backend-status-transitions.md`.

## Design

### WS1: `transition_ketik_review_job` (Lane D)

Follow the shape of `transition_ketik_session_status` in `20261116160000_ketik_session_status_transitions.sql`. That migration and its plan (`plans/markdown/ketik-backend-status-transitions.md`) are the house pattern; read both first.

- New migration `supabase/migrations/<ts>_ketik_review_job_transitions.sql` plus paired `supabase/rollbacks/rollback_<ts>_ketik_review_job_transitions.sql` (load the `supabase-migration` skill).
- One `SECURITY INVOKER`, `search_path=''`, **service_role-only** function `public.transition_ketik_review_job(...)` with a closed event set. Derive the status union from the live `ketik_review_jobs.status` CHECK constraint (expected `queued|processing|completed|failed`). Proposed events, to be confirmed against current RPC semantics:

| Event          | From (expected predicate)                                                                        | To                                           | Fence                     |
| -------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------- |
| `enqueue`      | no row / `completed` / `failed`                                                                  | `queued`                                     | caller holds history lock |
| `claim`        | `queued` and `available_at<=now`, or `processing` with null/expired lease, and `attempt_count<3` | `processing` (new token, `attempt_count+1`)  | n/a                       |
| `exhaust`      | same as `claim` but `attempt_count>=3`                                                           | `failed`                                     | n/a                       |
| `release`      | `processing`, token match, live lease                                                            | `queued`                                     | token + expiry            |
| `fail_attempt` | `processing`, token match, live lease                                                            | `queued` if `attempt_count<3`, else `failed` | token + expiry            |
| `complete`     | `processing`, token match, live lease                                                            | `completed`                                  | token + expiry            |

- Every UPDATE carries `AND status = <expected>` (plus the lease/token predicate where listed) and checks `ROW_COUNT`.
- The mirrored `ketik_history.review_status` writes (`processing` / `failed` / `completed`) move into the same function, keeping their existing "never downgrade `completed`" predicates.
- Locking order is unchanged: `ketik_history` first, then the job row.
- Rewrite `claim_ketik_review`, `settle_ketik_review`, and `enqueue_ketik_review` to delegate their status writes to the helper. **Keep signatures, return JSON shapes, error codes, ACLs, and validation unchanged**, so no API change and no deploy-ordering dependency. Business writes (review rows, typo rows, scores) stay in `settle`, in the same transaction.
- **Claim fix:** after `SELECT … FOR UPDATE` on the job, re-check the claim predicate on the locked row. If it no longer holds, return `NULL` (the same as "no work") instead of raising. The next poll finds other work. `settle` keeps returning `false` on a fence miss. A required single-row transition that misses inside `enqueue` raises `PT409` (consistent with the session helper).
- Inventory updates the existing harness depends on:
  - Add the new signature to the allowlist in `apps/web/e2e/exposed-function-guard-api.spec.ts`. Do **not** add the unrelated `ai_model_policy_*` drift reported in the previous plan.
  - Append the new migration to the reapply list in `apps/web/e2e/ketik-review-worker-api-host.spec.ts` (rollback test, about line 553). Otherwise that test reapplies the old RPC bodies and leaves the helper unused.
  - Add a row to the rollback README catalog.
- The rollback restores the exact prior bodies of the three RPCs and drops the helper. DDL only, no data deletion.

### WS2: explicit host lifecycle and bounded deadline release (Lane C)

F3 adds a new lifecycle outcome ("release timed out"). Under `AGENTS.md`, changing lifecycle state requires an explicit union, so F2 and F3 are done together.

- Replace the five flags with one host state union and a single pure `transitionHost(state, event)` beside `transitionPoll`. Suggested shape (adjust to what the code needs):
  - `idle → running(waiting) ⇄ running(claiming) → running(processing, claim) → running(releasing, claim) → running(waiting)`
  - Any running phase `→ stopping(…) → stopped`.
  - `start()` on non-idle throws `WORKER_ALREADY_STARTED`, as today.
- Timer handles, `loopPromise`, `wake`, and `unsubscribe` stay as resource handles, not state. `health()` derives from the state plus `lastPollAt`/`errorClass`, keeping the same JSON fields.
- **Bounded deadline release.** Extract one helper, `releaseWithin(claim, ms)`, used by both the deadline path and the shutdown path. On the deadline path:
  - Bound: `min(config.shutdownMs, 20_000)`. It must finish inside the 30 s grace left before lease expiry (`claim.leaseSeconds - 30`).
  - On timeout: log `ketik_review_worker.deadline_release_timeout`, set `errorClass = "ReleaseTimeout"` (health degrades until the next successful poll resets it), leave the claim to lease expiry, and continue the loop.
  - A late `settle` is harmless because it is token-fenced. Do not add a second fallback.
- Keep the poll back-off, the wake semantics, and the shutdown contract (`shutdown_claim_fenced` / `shutdown_recovery_deferred` logs) unchanged.
- Also fix the stale comment at `review-lifecycle.ts:19` in this commit if WS3 has not landed.

**Decision gate (stop and ask Fajar before coding the test):** the deadline fires at `leaseSeconds - 30` s, and lease is at least 600 s (`claim_ketik_review` rejects `<600`; `calculateKetikReviewLeaseSeconds` floors at 600). There is no E2E seam that reaches the deadline path in reasonable time. Present these options:

1. **(Recommended)** Add a test-only override such as `KETIK_REVIEW_WORKER_DEADLINE_MS`, parsed in `parseKetikWorkerConfig`, **rejected when `NODE_ENV=production`**, and documented as test-only. The E2E then:
   - runs the real worker against the disposable stack with a short deadline and a stubbed slow provider;
   - holds a `FOR UPDATE` lock on that `ketik_history` row from a separate `psql` session, so `settle_ketik_review` truly blocks;
   - asserts that the worker logs the timeout, reports degraded health, and claims a _second_ queued job while the first is still blocked;
   - releases the lock and asserts the late settle is fenced after lease expiry or reclaim.
2. Accept code-only verification of F3 plus the existing E2E regression. This is weaker; say so explicitly in the report.

Do not add unit tests (`AGENTS.md`: ask first, explain what E2E cannot prove).

### WS3: docs (Lane A)

- `docs/deployment.md` step 5: the provider keys to check follow the active KETIK model policy (defaults are both Gemini → `GEMINI_API_KEY`; `OPENAI_API_KEY` only if an admin assigned an OpenAI model).
- `docs/deployment.md` step 6: polling is read-only. A stuck `processing` job is reclaimed by a worker after lease expiry, up to 3 attempts, then `failed`. Mention "Jalankan Ulang Analisis" only if it still exists in the UI (verify with a grep).
- `review-lifecycle.ts:19`: rewrite the comment to match `review-processor.ts` (primary, then configured fallback).
- Gates: Prettier on touched `.md`, `git diff --check`. No product tests.

## Tasklist

### WS0: intake (all workstreams)

- [x] Read `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, this plan, and `plans/markdown/ketik-backend-status-transitions.md`. Load `trainers-superapp-tdd` before any WS1/WS2 edit; load `supabase-migration` for WS1.
- [ ] Drift-check every file:line above against HEAD. Grep for **all** writers of `ketik_review_jobs.status` and `ketik_history.review_status` (`supabase/migrations/`, latest definitions only; `apps/api/src`). Add any missed writer to WS1 scope or report it.
- [x] `graphify query` for `releaseKetikReview` / `claimKetikReview` callers (Lane C/D rule).

### WS3: docs (can go first; smallest)

- [ ] Edit the docs and the comment as designed → Prettier on touched files → `git diff --check` → commit `docs(ketik): …` with a changelog entry → push.

### WS1: DB transitions (Lane D)

- [x] Create a fresh, task-owned disposable Supabase stack. Copy the procedure and pitfalls from the previous plan: `--workdir` under ignored `scratch/`, exclude `mailpit` not `inbucket`, unused loopback ports, no `.env*` edits, never point at prod `ruosnjmtywcrghjgqugz`. One Playwright run at a time.
- [x] RED: add a fixture-only DB trigger, as in the previous plan's `PG_CONTEXT` call-stack fixture and never shipped, that rejects any `ketik_review_jobs.status` / `ketik_history.review_status` change not made by `transition_ketik_review_job`. Run the existing worker publication/host flows under it; expect failure on the current RPCs. Save the log and trace.
- [x] RED (claim guard): a real-DB test that calls `claim_ketik_review` for a specific session whose job is `processing` with a live lease, or `completed`, after making the candidate SELECT see stale state if that is feasible. If the stale window cannot be forced deterministically, assert only the helper's CAS behavior and **say so**. Do not fake the race.
- [x] Implement the migration, rollback, allowlist, reapply-list, and catalog changes; apply locally with `psql -v ON_ERROR_STOP=1 -f …`.
- [x] GREEN: the focused tests, then the full worker suite, serially, with `--workers=1 --trace on`:
  - `pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-api-(host|publication)\.spec\.ts$' --config=playwright.api.config.ts --project=ketik-review-worker-real-backend`
  - the same with `--project=ketik-review-worker-embedded-real-backend`
  - plus `user-controls-api.spec.ts` (re-score / enqueue) and `ketik-errors-api.spec.ts`.
- [x] Rollback → reapply → re-run the focused tests. Verify that the rollback restores the prior three bodies byte-for-byte (md5 of `pg_get_functiondef`) and leaves data unchanged.
- [x] Structural check on the local catalog: every status UPDATE on the two tables lives in the helper and has an expected-status predicate.
- [x] `thermo-nuclear` self-review; serial root typecheck/lint/build with `TURBO_CONCURRENCY=1` on each command; `GRAPHIFY_MAX_WORKERS=1 graphify update .`; changelog and diff review. See executed evidence and the explicitly open pre-existing global RPC gate below.
- [x] Commit `refactor(ketik): centralize review job status transitions with guarded SQL updates`, then push: `cc8baf9c` on `main`.
- [x] Stop for explicit authorization, then apply only this migration with preflight, ledger repair and catalog readback. Fajar authorized the WS1 target apply on 2026-11-17; completed serially as recorded below.

### WS2: worker host (Lane C)

- [x] Ask Fajar the deadline-test decision gate question (above). Fajar approved option 1 on 2026-11-17: test-only deadline override rejected in production, real PostgreSQL history-row lock for blocked release. WS2 push is held pending separate approval because it triggers Railway auto-deploy.
- [x] RED, option 1: blocked-release E2E reached the real PostgreSQL lock wait with only the approved seam enabled, then failed because the second job remained queued. Preserved trace/log below.
- [x] Implement the host union, `transitionHost`, `releaseWithin`, and the deadline-path bound, plus the approved test-only override.
- [x] GREEN: five new E2E scenarios and both worker projects in full, including the existing SIGTERM/SIGKILL/health/wake/backoff/publication scenarios.
- [x] `thermo-nuclear` self-review, serial root gates, graphify update, scoped lint/format checks, changelog and task-owned cleanup; evidence below.
- [ ] Commit `fix(ketik): bound deadline review release and make worker host lifecycle explicit` locally (outcome in final report).
- [ ] **HOLD PUSH:** obtain separate approval before pushing WS2 to `main`, because it triggers Railway auto-deploy. No Railway mutation/deploy or remote DB action is authorized by this workstream.

## Risks and boundaries

- WS1 touches result publication (`settle`). Any change to its fence or publish order can lose or duplicate scores. Keep business writes byte-identical apart from moving the status writes out.
- The claim predicate re-check must not turn "no work" into an error. Workers treat `NULL` as idle, and errors as `cycle_failed` plus back-off.
- Do not weaken the global `exposed-function-guard` precondition. Its pre-existing `ai_model_policy_*` drift stays reported, not fixed.
- No remote DB commands outside the explicitly authorized WS1 target apply recorded below. No production API deploy or E2E against production.

## WS1 execution evidence — 2026-11-16

### Scope and review

- Direct implementation, Lane D; no delegation or independent review claimed. Only WS1 is authorized in this run. WS2 deadline-test decision remains unasked/unselected; WS3 remains unchanged.
- Verified effective writers in all canonical migrations and `apps/api/src`: only the three RPCs listed in F1 mutate existing job/history review statuses. Inserts still initialize rows. WS0's broad WS2/WS3 drift-check checkbox remains open because those workstreams were not started.
- New migration/rollback: `20261116170000_ketik_review_job_transitions.sql`. Current API signatures, defaults, JSON responses, access validation and service-role-only ACLs are retained. No TypeScript runtime or provider/model/quota changes.
- Helper events are closed; all six live status UPDATE statements are in the helper (three job UPDATEs and three mirrored history UPDATEs). Job predicates compare expected status; nullable history status uses `IS NOT DISTINCT FROM` as the null-safe CAS. Every status write checks ROW_COUNT. The helper and all three delegates are SECURITY INVOKER with empty search_path, anon/authenticated denied, service_role allowed (`catalog-review.log`).
- Settle completes the fenced transition before its unchanged business writes, in the same transaction: a fence miss returns false without publication; later review/typo/score failures roll back both transition and results. Existing real-worker failure-injection E2E passed under the fixture-only call-stack guard.
- **Claim race not reproduced.** Tests prove live/completed/future-queue rejection, helper CAS, null/expired lease reclaim, attempt exhaustion, stale-token denial and unchanged data on misses. They do not force the narrow candidate-snapshot window; the locked-row recheck was reviewed structurally. The original RED proves centralized mutation, not that concurrency race.
- Thermo-nuclear/lifecycle/SQL-security self-review: **owned implementation PASS**; at local completion, remote application was blocked pending authorization (subsequently granted; see target apply below). The known unrelated global RPC-inventory gate remains red and is not represented as successful.
- Graphify `graphify query 'claimKetikReview'` exited 0 and identified both claim/release callers and the two worker hosts; live code/migrations remained authoritative. Context7 was not repeated: this internal refactor reuses the existing PostgreSQL call-stack/CAS fixture and changes no external API usage or dependencies.

### Disposable target and commands

All logs below are under ignored `artifacts/ketik-review-transitions/`; traces may contain local test JWTs and must not be committed. Workdir is ignored `scratch/ketik-review-transitions-20261116`, project `ketik-review-transitions-test-20261116`, API/DB loopback ports **55421/55422**. Canonical migrations are symlinked, seeds disabled, Storage schema retained but runtime excluded. No `.env*`, developer stack or remote project touched.

- `supabase start --workdir "$PWD/scratch/ketik-review-transitions-20261116" --exclude studio,mailpit,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta` → **0** (`stack-start.log`). Fresh baseline replay, no existing user data. Only task-owned DB/Auth/PostgREST/Kong containers.
- Local SQL apply: `psql postgresql://postgres:postgres@127.0.0.1:55422/postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261116170000_ketik_review_job_transitions.sql` → **0** (`apply.log`). This URL uses the disposable local database's standard development credentials, never a remote credential.
- Initial RED command: `E2E_SUPABASE_WORKDIR="$PWD/scratch/ketik-review-transitions-20261116" pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-api-host\.spec\.ts$' --config=playwright.api.config.ts --project=ketik-review-worker-real-backend -g 'review job status transitions' --reporter=line --workers=1 --trace on` → **1**, expected enqueue HTTP 202, received 500 because the old history writer bypassed the fixture guard (`red.log`, preserved `red-trace.zip`). Identical command after apply → **0**, 1 passed (`green.log`).
- Expanded focus adds `-g 'review job status transitions|review transition CAS|review transition rollback|review authorization' --max-failures=1` in place of that single-test grep → **0**, 4 passed (`focused-expanded.log`). Denial checks cover anon and every fixture JWT role with exact SQLSTATE 42501, including the new helper; service-role controls exercise actual transitions.
- Standalone regression: `E2E_SUPABASE_WORKDIR="$PWD/scratch/ketik-review-transitions-20261116" pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-api-(host|publication)\.spec\.ts$' --config=playwright.api.config.ts --project=ketik-review-worker-real-backend --reporter=line --workers=1 --trace on --max-failures=1` → **0**, **28 passed, 1 skipped** (`worker-standalone.log`; skip is embedded-only wake).
- Same regression command with `--project=ketik-review-worker-embedded-real-backend` → **0**, **28 passed, 1 skipped** (`worker-embedded.log`; skip is standalone-only health). Every publication-suite status write runs under the call-stack fixture guard, including rollback-on-publication-failure, SIGTERM, SIGKILL and restart.
- `E2E_SUPABASE_WORKDIR="$PWD/scratch/ketik-review-transitions-20261116" pnpm --dir apps/web exec playwright test '(^|/)user-controls-api\.spec\.ts$' --config=playwright.api.config.ts --project=user-controls-real-backend --reporter=line --workers=1 --trace on --max-failures=1` → **0**, **3 passed** (`user-controls.log`).
- Same command with file `ketik-errors-api\.spec\.ts$` and project `ketik-errors-real-backend` → **0**, **5 passed** (`errors.log`). Provider calls are stubbed only at the HTTP boundary; no external requests/cost.
- Global guard: `E2E_SUPABASE_WORKDIR="$PWD/scratch/ketik-review-transitions-20261116" pnpm --dir apps/web exec playwright test '(^|/)exposed-function-guard-api\.spec\.ts$' --config=playwright.api.config.ts --project=db-guard-real-backend -g 'D5.9' --reporter=line --workers=1 --trace on --max-failures=1` → **1**, before RPC calls: baseline `ai_model_policy_reset(text,text,uuid)` and `ai_model_policy_set(text,text,uuid)` remain outside the allowlist (`global-rpc-guard.log`). No crash or new KETIK inventory mismatch. This is the pre-existing drift explicitly excluded by the plan, not repaired or hidden.
- `supabase db reset --local --workdir "$PWD/scratch/ketik-review-transitions-20261116"` → **0**, complete canonical replay including the new migration (`clean-replay.log`). Expanded focus then → **0**, 4 passed, with `--output="$PWD/artifacts/ketik-review-transitions/final-results"` (`focused-clean-replay.log`).
- Local rollback via `psql` with the paired rollback file → **0** (`rollback.log`); the initial guarded test then → **1**, same expected 202/500 RED (`rollback-red.log`, `rollback-red-results/`). Reapply via the same local SQL command → **0** (`reapply.log`); expanded focus again → **0**, 4 passed (`focused-reapply.log`, `reapply-results/`). The round-trip E2E derives baseline MD5s from the exact historical sources in rolled-back DDL, verifies all three `pg_get_functiondef` hashes, helper removal, and byte-identical JSON for history/job/reviews/typos, then verifies forward hashes and unchanged data after reapply. No HTTP writes while rolled back.
- `psql postgresql://postgres:postgres@127.0.0.1:55422/postgres -v ON_ERROR_STOP=1 -f artifacts/ketik-review-transitions/catalog-review.sql` → **0**, six guarded writes in one live writer, correct ACL/search_path, zero remaining fixture triggers/profiles/history/jobs/usage logs (`catalog-review.log`).
- Serial root gates: `TURBO_CONCURRENCY=1 pnpm typecheck`, `TURBO_CONCURRENCY=1 pnpm lint`, `TURBO_CONCURRENCY=1 pnpm build` → **0** each (`typecheck.log`, `lint.log`, `build.log`). Respectively 4/4/3 successful tasks, 3/3/2 cached; web typecheck includes E2E. Root lint retains **74 existing warnings, zero errors**, all in untouched web code.
- Scoped `pnpm --dir apps/web exec eslint e2e/ketik-review-worker-api-host.spec.ts e2e/ketik-review-worker-api-publication.spec.ts e2e/helpers/ketikReviewWorkerApiHarness.ts e2e/exposed-function-guard-api.spec.ts` → **0**, no warnings (`scoped-lint.log`). No unit/legacy suite ran.
- `GRAPHIFY_MAX_WORKERS=1 graphify update .` → **0** (`graphify.log`); ignored cache only, one AST worker. No second update or delegated worker.
- `supabase stop --workdir "$PWD/scratch/ketik-review-transitions-20261116" --no-backup` → **0** (`stack-stop.log`). Task-owned containers/volumes are gone; no task worker remains. The three unrelated untracked plans are preserved.

### Remaining boundaries and drift

- At local completion, remote apply was not authorized or run. Implementation was subsequently committed/pushed as `cc8baf9c`; the later authorized target apply is recorded below. WS2/WS3 remain separate changes/commits.
- `docs/deployment.md` steps 5–6 and the `review-lifecycle.ts` fallback comment remain the planned WS3 drift. Existing legacy unit-command instructions and the old `ketik-service.ts` debug pointer remain report-only, as required.
- Canonical `docs/database.md` now describes this migration and compatible rollback. The rollback index adds only the owned catalog row; its existing reverse-order usage example/blanket verification-query prose are not repaired by WS1.
- A tooling-only invocation `node scripts/check-migration-rollbacks.mjs --help` exited 1 because that script accepts a base ref, not a help flag. The actual committed-migration check is run with the baseline ref after commit; no product or test gate was weakened.

## WS1 target apply — 2026-11-17 (authorized)

Fajar explicitly authorized applying WS1 after the implementation report. The linked project was verified as `ruosnjmtywcrghjgqugz`; no project relinking, API deployment, remote E2E or remote business-RPC invocation was performed. All remote CLI commands ran strictly serially, avoiding the temporary-login-role collision documented in the preceding session-transition plan.

Logs are under ignored `artifacts/ketik-review-transitions/`:

1. `supabase migration list --linked` → **0** (`remote-migration-preflight-20261117.log`). Of 127 local rows, only `20261116170000` was unapplied remotely; all 126 earlier rows matched. No `db push`.
2. `supabase db query --linked -f artifacts/ketik-review-transitions/remote-catalog-20261117.sql` → **0** (`remote-catalog-before-20261117.log`). Read-only catalog/count preflight confirmed the helper was absent and all three prior `pg_get_functiondef` MD5s matched the disposable baseline: claim `d144627c6c7360ebba2f3b79997e1bfe`, enqueue `231cdee2b926b584676bbf172b3799a4`, settle `d6f62f94777f628c0ec2dfb5b3803956`. No queued/processing job was present.
3. `supabase db query --linked -f supabase/migrations/20261116170000_ketik_review_job_transitions.sql` → **0** (`remote-apply-20261117.log`), applied exactly once; only this transactional DDL file.
4. `supabase migration repair --linked --status applied 20261116170000` → **0** (`remote-repair-20261117.log`), recording only this version in the migration ledger.
5. The same read-only catalog command → **0** (`remote-catalog-after-20261117.log`). All four functions are SECURITY INVOKER with empty search_path; ACL is postgres (owner) plus service_role only, no PUBLIC/anon/authenticated EXECUTE. All three existing RPCs delegate to the helper. The helper is the only live status writer on the two tables: **six status UPDATEs, all with expected-status predicates**. Definition MD5s: claim `ee79a48775753bb9e92f4d2497b85769`, enqueue `098127a61e60ff2bc38afb30f1510246`, settle `8eec24d68953ac215fb324f5bf75a9ea`, helper `f736331b1a86480cb15ff75e26002182`.
6. `supabase migration list --linked` → **0** (`remote-migration-after-20261117.log`): all **127** local/remote versions match, including `20261116170000`.

Business-data row counts were unchanged before/after: history **74**, jobs **38**, reviews **38**, typos **44**, queued/processing jobs **0**. The migration contains no business-data DML; only the explicit migration-ledger repair changes a ledger row. No production behavioral acceptance or race reproduction is claimed. The existing global `ai_model_policy_*` allowlist drift remains open.

This apply follow-up changed only this execution record and `CHANGELOG.md`: scoped Prettier and diff checks applied, not a rerun of local product tests/typecheck/lint/build. The recorded local WS1 gates cover that unchanged implementation. No new documentation/code inconsistency was found during readback. At that point WS2 had not started; its later execution is recorded below.

## WS2 execution evidence — 2026-11-17

### Approved scope and implementation

- Lane C, direct implementation; Fajar approved the test-only override before test coding. Baseline `78e4506b`; three unrelated untracked plans preserved. No delegation, independent reviewer, new dependency, schema/SQL migration, remote mutation or deployment.
- Replaced runtime `started/stopping/loopAlive/active/cycle` with one host state union and pure `transitionHost`. Host status: idle/running/stopping/stopped; work phase: waiting/claiming/processing/releasing/release_timed_out. `transitionPoll` is unchanged. Promises, timers, wake/subscription callbacks remain resource handles; health fields and poll/backoff/wake semantics are preserved.
- One `releaseWithin(claim, ms)` handles late admission during shutdown, deadline and shutdown release. All callers cap it at `min(shutdownMs, 20000)` ms; simultaneous shutdown/deadline share the bounded in-flight attempt. Timeout returns control without cancelling the underlying RPC/provider; late publication/release still relies on the existing SQL token/expiry fence. No second fallback.
- Deadline timeout is an explicit phase/event, logs `ketik_review_worker.deadline_release_timeout`, and sets `errorClass=ReleaseTimeout`; the next successful admission poll clears it. Only standalone exposes worker health; embedded health was not invented for this test. Deadline/shutdown overlap preserves exit 1 and `shutdown_recovery_deferred` if the active claim cannot be fenced, rather than treating a completed-but-timed-out loop as successful shutdown.
- `KETIK_REVIEW_WORKER_DEADLINE_MS` is accepted **only in NODE_ENV=test**, integer 250–3600000, and clamped to the normal lease-minus-30s deadline. It never changes the DB lease and is rejected in production/development. Config E2E sets the child to production only after installing the test transport's loopback egress guard, then exercises the actual host/parser before startup; it does not contact production.
- New `ketik-review-worker-api-deadline.spec.ts` is automatically selected by both existing worker project globs, keeping the 902-line host spec below the size gate. Its task-owned psql sessions hold a real history row lock and cleanly rollback/exit. `pg_stat_activity` confirms settlement is truly waiting on that lock; no release RPC/fetch/service mock. Provider HTTP alone is stubbed.
- Corrected the stale fallback comment in `review-lifecycle.ts` as planned, without changing its lease/model behavior. Canonical architecture and worker deployment/config documentation now describe the host graph, bound, test seam, health degradation and late-call fencing. WS3 debug steps 5–6 remain separate.

### Executed verification

All logs/traces below are ignored under `artifacts/ketik-review-host/`. Traces contain disposable-local auth data and must not be committed.

- OrbStack was initially stopped; `open -a OrbStack` started the existing local Docker runtime. No concurrency/resource configuration was increased. `graphify query 'releaseKetikReview'` → **0** (`graph-query.log`), identified the runtime, claim/release callers and API host. Existing internal patterns sufficed; no external API/dependency adoption required Context7.
- Fresh target: `scratch/ketik-review-host-20261117`, project `ketik-review-host-test-20261117`, API/DB **55521/55522**, canonical migration symlink, no seeds, no `.env*` edit. `supabase start --workdir "$PWD/scratch/ketik-review-host-20261117" --exclude studio,mailpit,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta` → **0** (`stack-start.log`). Only the task-owned minimum DB/Auth/PostgREST/Kong stack.
- Initial missing-seam RED: `E2E_SUPABASE_WORKDIR="$PWD/scratch/ketik-review-host-20261117" pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-api-deadline\.spec\.ts$' --config=playwright.api.config.ts --project=ketik-review-worker-real-backend -g 'deadline release timeout' --reporter=line --workers=1 --trace on --output="$PWD/artifacts/ketik-review-host/red-without-seam-results"` → **1** (`red-without-seam.log`): deadline not reached; this alone is **not** proof of the release bug.
- Config RED before seam implementation: same focused file/project with `-g 'test-only deadline config' --output="$PWD/artifacts/ketik-review-host/config-red-results"` → **1** (`config-red.log`); parser ignored the proposed override. After implementing only the approved seam/config rejection, same test with `config-green-results` → **0** (`config-green.log`).
- **Decisive bug RED:** the deadline test command above, with only the seam implemented and `--output="$PWD/artifacts/ketik-review-host/red-blocked-results"` → **1** (`red-blocked.log`): actual PostgreSQL settlement lock wait confirmed, second job expected completed but remained queued for the entire 7s assertion budget. After host/bound implementation, identical scenario with `green-blocked-results` → **0** (`green-blocked.log`). This reproduces the hung-release bug, **not** the WS1 candidate-snapshot claim race.
- Shutdown-overlap regression RED: same file/project with `-g 'shutdown bounds blocked release during deadline release' --output="$PWD/artifacts/ketik-review-host/shutdown-overlap-red-results"` → **1** (`shutdown-overlap-red.log`), expected exit 1 but got 0. Fixed the grace-period timeout outcome; subsequent focused and full suites passed. The test also proves only one settlement RPC waits on the lock while shutdown and deadline overlap.
- Focused suite: same deadline spec/project without grep, adding `--max-failures=1 --output="$PWD/artifacts/ketik-review-host/focused-standalone-results"` → **0**, **5 passed** (`focused-standalone.log`); embedded project with `focused-embedded-results` → **0**, **5 passed** (`focused-embedded.log`). Distinct scenarios: production/invalid config rejection; blocked deadline release + health + second-job progress + late fencing; healthy deadline release; blocked shutdown during processing; blocked shutdown during deadline release. Both timeout cases recover through expired-lease reclaim after restart.
- Full standalone regression: `E2E_SUPABASE_WORKDIR="$PWD/scratch/ketik-review-host-20261117" pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-api-.*\.spec\.ts$' --config=playwright.api.config.ts --project=ketik-review-worker-real-backend --reporter=line --workers=1 --trace on --max-failures=1 --output="$PWD/artifacts/ketik-review-host/standalone-results"` → **0**, **33 passed, 1 skipped** (`standalone.log`; embedded-only wake skipped).
- Identical full regression with `--project=ketik-review-worker-embedded-real-backend --output="$PWD/artifacts/ketik-review-host/embedded-results"` → **0**, **33 passed, 1 skipped** (`embedded.log`; standalone-only health skipped). Includes WS1 guarded publication/rollback/authorization and all existing SIGTERM/SIGKILL/recovery/wake/backoff checks. No browser visual verification or production acceptance is claimed.
- First `TURBO_CONCURRENCY=1 pnpm typecheck` → **1** (`typecheck.log`): only the new config-case array inferred an optional undefined field incompatible with the fixture's `Record<string,string>`. Added the same explicit case-array type used by the existing host spec; no runtime change. Re-ran the affected config E2E in both projects, serially: deadline spec with both `--project` arguments, `-g 'test-only deadline config' --workers=1 --trace on --max-failures=1 --output="$PWD/artifacts/ketik-review-host/final-config-results"` → **0**, **2 passed** (`final-config.log`). Full-suite runtime results above remain applicable; the subsequent change was that fixture-only type annotation and comment placement.
- Final root checks, serial: `TURBO_CONCURRENCY=1 pnpm typecheck` → **0** (`typecheck-final.log`, 4 tasks/3 cached); `TURBO_CONCURRENCY=1 pnpm lint` → **0** (`lint.log`, 4 tasks/2 cached, **74 existing warnings**, zero errors); `TURBO_CONCURRENCY=1 pnpm build` → **0** (`build.log`, 3 tasks/1 cached). No non-E2E/unit suite ran.
- Scoped `pnpm --dir apps/web exec eslint e2e/ketik-review-worker-api-deadline.spec.ts e2e/helpers/ketikWorkerTransport.mjs` and `pnpm --dir apps/api exec eslint src/workers/ketik-review-worker-runtime.ts src/services/ketik/review-lifecycle.ts` → **0** each, no warnings (`scoped-web-lint.log`, `scoped-api-lint.log`).
- `GRAPHIFY_MAX_WORKERS=1 graphify update .` → **0** (`graphify.log`), once after the final AST change, ignored cache only. Only the edited worker-config table needed Prettier alignment; final owned-file format/diff checks are scoped.
- Local read-only cleanup counts → **0** (`cleanup-counts.log`): zero profiles/history/jobs/usage logs/fixture triggers/blocked settlements. `supabase stop --workdir "$PWD/scratch/ketik-review-host-20261117" --no-backup` → **0** (`stack-stop.log`); task-owned containers/volumes and worker/psql processes are gone. No unrelated stack/process was stopped.

### Review and release boundary

- Thermo-nuclear/lifecycle self-review: **implementation PASS; deployment HELD**. Single transition owner, explicit timeout outcome, late-claim shutdown bound, shared release resource, timer cleanup, stale-token publication, unchanged health JSON, and no success masking on shutdown/deadline overlap reviewed with the real-backend evidence above. No owned-code material finding remains; no independent review is claimed.
- Existing wrapper-level flags in `ketik-review-worker-entrypoint.ts` (`stopping`) and `api-runtime.ts` (`shutdownStarted`) remain legacy and untouched; this workstream replaces only the runtime's five scoped flags/handles. No claim that all process hosts or Telefun lifecycles have been remodeled.
- Remaining doc/code drift: WS3 deployment-debug steps still mention an OpenAI key/auto-failure polling; the worker lease-budget paragraph in the same deployment doc also still says OpenAI fallback although model policy is configurable and both defaults are Gemini. This additional stale sentence is reported, not silently folded into WS2's provider scope. Legacy unit-command/debug-pointer prose remains open. The code comment itself is now corrected.
- WS1's pre-existing global `ai_model_policy_*` allowlist drift is unchanged; no global guard success is claimed and that unrelated gate was not rerun for WS2 (no SQL/signature change).
- Commit is local-only; **do not push or deploy WS2 without separate Fajar approval**. No Railway CLI/MCP operation, Supabase remote command, production test or production variable change ran during WS2. WS3 remains a separate docs commit.

## Report back (required format)

For each workstream: files changed, exact commands with exit codes and log paths, what is claimed vs not claimed (especially: was the claim race reproduced, and which option was chosen for the deadline test), commit SHA, and any newly found doc/code inconsistencies.
