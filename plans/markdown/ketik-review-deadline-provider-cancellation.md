# KETIK review worker: cancel provider work when the worker gives up a claim

Status: approved for execution by another agent. Lane D, because it changes how AI calls behave and are recorded (AI billing/usage) and it touches the shared provider clients used by PDKT, Telefun, SIDAK and KETIK. Load `trainers-superapp-tdd` before editing. Run `thermo-nuclear` after implementation.

## Requirement

When the review worker gives up a claim, it must also stop the provider work for that claim. The worker gives up a claim in two places: the review deadline, and shutdown fencing a claim while the provider is still running. Today it stops waiting but leaves the provider call running in the background.

1. **R3a — abort on deadline.** When the deadline in `runCycle` wins, the worker aborts the in-flight provider request for that claim before or while it releases the claim.
2. **R3b — abort on shutdown fence.** When shutdown releases a claim that is still in `processing`, the same abort fires.
3. **R3c — no follow-on calls.** Once the signal is aborted, these must not start:
   - the fallback model;
   - an OpenAI retry or backoff;
   - the Gemini "Developer instruction" retry.
4. **R3d — no settle after abort.** An aborted attempt must not call `settle_ketik_review`, with or without a result. The worker's release is the only settlement for that token. Today an abort-induced failure would go to `processClaimedKetikReview`'s catch and call `fail_attempt`, which counts against the job's attempts. That must not happen.
5. **R3e — no hidden work.** A cycle does not finish while its aborted processing promise is still running. If that promise does not settle within a bound, the worker logs it once and carries on (the DB fence still protects late writes).
6. **R3f — usage stays honest.**
   - An aborted OpenAI call is recorded through the existing `logTerminal` path as `status: "timeout"`, zero tokens, with an error text that tells it apart from a per-attempt timeout (for example `cancelled: review deadline`).
   - Do not add a new `ai_usage_logs.status` value. The CHECK in `supabase/migrations/012_ai_usage_status_error.sql` allows only `success | failed | timeout`, and adding one would need a migration.
   - Gemini does not log failed calls today (see "Pre-existing gaps"). Do not fix that here.
7. **Unchanged callers.** Every new parameter is optional. Callers that do not pass a signal must behave exactly as before. These callers must not change:
   - `services/pdkt/image-generation.ts`
   - `services/pdkt/shared-utils.ts`
   - `services/ketik/consumer-response.ts`
   - `services/sidak/dashboard-forecast.ts`
   - `lib/telefun-analysis.ts`
   - `routes/telefun/annotations.ts`
   - `lib/telefun-transcription.ts`

### What this buys, stated honestly

`@google/genai` 2.30.0 documents `abortSignal` as client-only: "Using it to cancel an operation will not cancel the request in the service. You will still be charged usage for any applicable operations." OpenAI is the same: an aborted HTTP request may still be billed.

So the benefit is **not** a refund for the call already in flight. The benefit is:

- stopping later paid calls: the fallback model, up to 4 OpenAI attempts, and the Developer-instruction retry;
- freeing the socket and memory;
- removing a background promise that can still run after the job is re-claimed by a new attempt.

**Realistic trigger:**

- The lease is `KETIK_REVIEW_LEASE_SECONDS = max(600, ceil((primary*2 + fallback)/1000) + 120)`.
- The deadline is `lease - 30 s`, about 570 s.
- A slow primary (2 × 180 s) followed by an OpenAI fallback (4 attempts × 120 s) can run past it.

Report this caveat in the final report. Do not claim cost savings for the aborted request itself.

## Verified facts (drift-check against HEAD before editing)

- **`apps/api/src/workers/ketik-review-worker-runtime.ts`**
  - `runCycle` races `processClaimedKetikReview(claim)` against `deadline = min(testDeadlineMs, (leaseSeconds - 30) * 1000)` (around lines 357–395).
  - On `"deadline"` with `activeClaim(host) === claim`, it calls `releaseWithin(claim, min(shutdownMs, 20_000))` and logs `deadline_released`, `lease_lost` or `deadline_release_timeout`.
  - The losing processing promise is never awaited or cancelled.
  - Host phases are `waiting | claiming | release_timed_out | processing{claim} | releasing{claim, promise}`. The transition table comment is around lines 133–160.
  - Shutdown fencing logs `shutdown_claim_fenced` or `shutdown_recovery_deferred` (around line 480).
- **`apps/api/src/services/ketik/review-lifecycle.ts:104`:** `processClaimedKetikReview(claim)` calls `processKetikReviewJob(sessionId, token, models)`. On any throw it calls `settle_ketik_review` with no result, which runs `fail_attempt`.
- **`apps/api/src/services/ketik/review-processor.ts`**
  - `generateKetikReviewAiResponse` calls the primary, then the fallback whenever the primary did not return text.
  - `processKetikReviewJob` parses, normalizes, then publishes with `settle_ketik_review(p_result)`. It returns `{status:"lease_lost"}` when the fence rejects.
- **`apps/api/src/lib/gemini.ts`**
  - `generateGeminiContent` races `ai.models.generateContent` against a timeout.
  - On a "Developer instruction is not enabled" error it retries with injected contents. The retry's `setTimeout` is never cleared.
  - Errors are returned as `{success:false}`, not thrown.
  - Usage is logged only on success.
- **`apps/api/src/lib/openai.ts:171`:** `generateOpenAIContent` loops up to 4 attempts.
  - Each attempt has its own `AbortController` with `timeoutMs ?? 120_000`.
  - It retries on 429/5xx with backoff `attempt * 500` ms.
  - `logTerminal` records `success | failed | timeout`, and `isAbortError` maps to `timeout`.
- **`settle_ketik_review`** (`supabase/migrations/20261116170000_ketik_review_job_transitions.sql:140`) returns false unless the job is `processing` with the same unexpired token. A late call is therefore fenced in the DB, but an early `fail_attempt` from the aborted attempt (R3d) would be accepted if it lands before the worker's release.
- **E2E harness**
  - `apps/web/e2e/helpers/ketikReviewWorkerApiHarness.ts`: a loopback provider stub with `suite.providerMode = hold|success|fail`, `suite.providerCalls`, `suite.boundaryRequests` and `releaseProvider()`. In `hold` mode the handler awaits a release promise and does not notice a client disconnect.
  - `apps/web/e2e/helpers/ketikWorkerTransport.mjs:13–20` rewrites provider URLs with `new Request(provider.origin + url.pathname, request)`. Copying from a `Request` should carry its `signal`, but nothing proves that yet. The RED test will show whether the abort reaches the wire.
- **Runtime:** Node v26 (`AbortSignal.any` and `AbortSignal.prototype.throwIfAborted` are available).

## Design

### Signal plumbing (optional everywhere)

- `processClaimedKetikReview(claim, options?: { signal?: AbortSignal })`
  - → `processKetikReviewJob(sessionId, token, models, { signal })`
  - → `generateKetikReviewAiResponse({ ..., signal })`
  - → `generateGeminiContent({ ..., abortSignal })` and `generateOpenAIContent({ ..., signal })`.
- **Gemini:** put `abortSignal` in `config` for both the first call and the Developer-instruction retry. Before the retry, return early if the signal is aborted. Also clear the retry timer (the same `finally` pattern as the first call). This is a tiny fix in a line R3 already touches.
- **OpenAI:**
  - Per attempt, use `signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal`.
  - Before each retry and during the backoff wait, stop if `options.signal?.aborted`. The backoff wait must be abortable.
  - When the caller's signal caused the abort, call `logTerminal` with status `timeout` and an error text such as `cancelled: <signal.reason>`.
- **`generateKetikReviewAiResponse`:** skip the fallback when `signal?.aborted` and return `{success:false, error:"cancelled"}`.
- **`processKetikReviewJob`:** call `signal?.throwIfAborted()` right after the AI response and again before the `settle_ketik_review` publish.
- **`processClaimedKetikReview`:** in the catch, if `options.signal?.aborted`, return `{ status: "cancelled" as const }` and **do not** call `settle_ketik_review`. Every other error keeps today's `fail_attempt` behavior.

Use one reason object (for example `new Error("KETIK review deadline")` and `"KETIK review shutdown"`), so logs say which path aborted.

### Worker ownership (no new implicit state)

- Move the `AbortController` into the host phase that owns the claim: `processing{claim, abort: AbortController}`.
  - It is a resource handle carried by the existing phase, not a new flag.
  - Shutdown can reach it through the same state that `activeClaim` reads, so R3b needs no side channel.
- Update the transition table comment: `claimed` now carries the controller. Add no new phase unless the implementation shows that "aborted but not yet settled" must be visible to other code. If it does, add `cancelling{claim, promise}` to the union and the table. Do not use a boolean.
- **Deadline path in `runCycle`:**
  1. Abort.
  2. Release with `releaseWithin` (unchanged).
  3. Await the processing promise with a bound (for example `min(config.shutdownMs, 20_000)`).
  4. If the bound wins, log `ketik_review_worker.cancel_join_timeout` once.
  5. Then the existing `cycle_finished`.

  Abort before release so the attempt cannot reach `settle_ketik_review` while release runs. R3d is the second guard.

- **Shutdown path:** where shutdown fences a `processing` claim, abort first, then release as today. The existing cycle cleanup already joins before `cycle_finished` / `loop_stopped`. Make sure it also joins the aborted processing promise with the same bound.
- `runCycle` handles the processing result `cancelled` silently. It must not log `lease_lost` for it.

### Usage logging

- Keep the existing union. An aborted OpenAI call → `timeout`, zero tokens, error `cancelled: KETIK review deadline` (or `shutdown`).
- Gemini: no change in logging. The aborted call has no usage metadata, and failure logging is a separate gap.

## Tests (E2E-first)

Use the existing worker API E2E (`apps/web/e2e/ketik-review-worker-api-deadline.spec.ts`) with the local disposable Supabase stack. Never point it at production.

### Harness change (part of the RED step)

- In the provider stub, record client disconnects. Increment `suite.providerAborts` on `res.on("close")` when `!res.writableEnded`.
- Resolve the held request on close, so `hold` stops leaking handlers.
- Reset `providerAborts` wherever `providerCalls` is reset (around line 373).

### Change to the check that judges this work (explicit, approved by this plan)

The existing test `a healthy deadline release invalidates its token and late provider output cannot publish` (around line 326) pins today's behavior:

- after `releaseProvider()`, the late provider output reaches `settle_ketik_review`;
- the worker logs `ketik_review_worker.lease_lost`.

After R3 that late output never arrives, because the request was aborted. Rewrite the test's tail. Keep these assertions:

- `deadline_released` is logged;
- no `deadline_release_timeout`;
- the old token's `settle_ketik_review(..., p_release: true)` returns `data: false`;
- the job is re-claimed and completes with `attempt_count` 2;
- health is 200.

Replace the `lease_lost` expectation with:

- `suite.providerAborts` reaches 1 (the abort reached the wire);
- the worker log never contains `"event":"ketik_review_worker.lease_lost"` for this run;
- `cancel_join_timeout` is not logged.

The second test `deadline release timeout degrades health and completes another job while PostgreSQL is still blocked` (line 141; its tail is around lines 214–236) pins the same late-output behavior. The executor found it at drift-check, and Fajar approved changing it on 2026-11-17. Keep everything up to and including the forced lease expiry and `unlock()`:

- `deadline_release_timeout`;
- `blockedSettlements() > 0`;
- the job still `processing` with `attempt_count` 1 and the old token, while it is locked;
- no review rows;
- health degraded, then 200.

Then change the tail:

- Replace the `lease_lost` poll with `suite.providerAborts` reaching 1.
  - The abort fires at the deadline, before the blocked release, so it can be asserted before `unlock()`. That is the stronger ordering if it holds.
- Add an explicit fence proof in place of the late-publish fence: after the job is re-claimed and `completed`, `settle_ketik_review(first, old.lease_token, p_release: true)` returns `data: false`.
- Keep `attempt_count` 2 and exactly one `ketik_session_reviews` row.
- Assert that the worker log never contains `"event":"ketik_review_worker.lease_lost"`.
- In the attached evidence, replace `lateProviderFenced: true` with `providerAborted` and `oldTokenFenced`.

Record both changes in the commit body and the final report. They change the check that judges the work, and the reason is that the behavior they pinned is the defect R3 removes. If drift-check finds a third test that waits for late provider output, stop and ask again.

**Third test: keep it unchanged** (Fajar approved, 2026-11-17). `a live worker that loses its lease cannot publish a late successful response` is in `apps/web/e2e/ketik-review-worker-api-host.spec.ts:256`.

- It expires the lease directly in the DB and re-claims with `test-successor`. No deadline and no shutdown fires, so R3 does not abort that request.
- Its `lease_lost` still proves the DB fence on the publish path. After R3, it is the only test that exercises `settle_ketik_review(p_result)` with a stale token, so it must keep passing unmodified.
- If it starts failing after R3, that is a regression, not a reason to edit it.

### New RED tests (write first, confirm each fails for the expected reason)

1. **Deadline aborts the provider request.**
   - Steps: hold mode with `KETIK_REVIEW_WORKER_DEADLINE_MS=1000`.
   - Expect `providerAborts` = 1 within the deadline plus the release bound.
   - Before R3 this fails: the stub never sees a close.
2. **No fallback after the deadline.**
   - Steps: hold mode, deadline 1000 ms. Do not enqueue a second session.
   - Expect: after `deadline_released`, and before the job is re-claimed, `providerCalls` stays 1.
   - Before R3: did the primary error spill into the fallback? The aborted primary returns `success:false`, so `generateKetikReviewAiResponse` calls the fallback, which hits the stub. RED shows `providerCalls` = 2.
   - If the re-claim races this window, read the request body to tell the attempts apart (`suite.boundaryRequests`), or make the stub fail-closed for the re-claim. Do not add sleeps.
3. **No `fail_attempt` from the aborted attempt.**
   - Expect: after the deadline, `ketik_review_jobs.attempt_count` for the first claim is never increased by the aborted attempt.
   - Assert that the re-claimed attempt is attempt 2, not 3, and that no `review_failed` / `fail_attempt` row or log appears for attempt 1.
   - Check what the job row exposes (`last_error`, `attempt_count`) before choosing the assertion.
4. **Shutdown aborts the provider request (R3b).**
   - Extend the existing SIGTERM-during-processing test that asserts `shutdown_claim_fenced`: also expect `providerAborts` = 1 before the process exits.
5. **Non-worker callers are unchanged.**
   - Run the existing KETIK consumer-response, PDKT and SIDAK forecast E2E specs that cover the shared clients. Find them with `rg -l "generateGeminiContent|generateOpenAIContent" apps/api/src` mapped to their E2E specs.
   - They must pass without modification.

OpenAI-specific retries (R3c for OpenAI) need an OpenAI primary.

- If the harness can select an OpenAI model through the existing model policy fixture, add: stub returns 503 on the first call, the deadline fires during the backoff, and no second attempt reaches the stub.
- If it cannot, do **not** add a unit test. Ask Fajar first, per `AGENTS.md`, and name the exact contract E2E cannot prove.

## Tasklist

1. Drift-check every "Verified facts" line against HEAD. Stop and report if any differs materially.
2. Run Graphify on `processClaimedKetikReview`, `generateGeminiContent` and `generateOpenAIContent` to confirm the caller list in Requirement 7. Use Context7 to confirm `@google/genai` `GenerateContentConfig.abortSignal` for the installed version.
3. Baseline: run the full deadline spec once on HEAD and record the counts:
   ```bash
   pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-api-deadline\.spec\.ts$' --reporter=line --workers=1
   ```
4. RED: change the harness, write tests 1–4, and rewrite the tail of the pinned test. Run them and confirm each fails for the stated reason. Keep the failing log under `artifacts/ketik-review-deadline-cancel/red.log`.
5. GREEN, in this order:
   1. Signal plumbing in the provider clients.
   2. `generateKetikReviewAiResponse` and `processKetikReviewJob` guards.
   3. `processClaimedKetikReview` cancelled branch.
   4. The worker deadline path.
   5. The worker shutdown path and join.
   6. The transition table comment.
6. Rerun the focused spec. Then run the regression set:
   - `ketik-review-worker-*.spec.ts`
   - the KETIK review E2E specs
   - the shared-client caller specs from step 2
7. Run gates: `pnpm --filter @trainers/api typecheck`, `pnpm lint`, `pnpm build` (root build, because the shared clients are cross-module).
8. Run `thermo-nuclear` on the diff, fix findings, and rerun the focused spec.
9. Update `docs/architecture.md`, in the KETIK review worker section: a deadline or shutdown aborts provider work, and the abort is client-only and still billable.
10. Commit with a `CHANGELOG.md` entry `- fix(ketik): abort provider work when the review worker gives up a claim` and a `Verified:` trailer in the last paragraph, next to `Co-Authored-By`. Push to `main`.
11. Run `graphify update .` once after the batch.

Use the three-round cap: if the same failure remains after three fix rounds, stop and report.

## Out of scope

- Gemini failed-call usage logging (pre-existing gap; see below).
- Any `ai_usage_logs` schema or status change.
- Cancelling provider work in non-worker request paths (KETIK consumer chat, PDKT, Telefun, SIDAK). They only gain an optional parameter.
- Changing lease or deadline lengths.
- Production deploy. Railway auto-deploys on push to `main`, so say in the report that pushing deploys the worker.

## Pre-existing gaps to report (do not fix here)

- `apps/api/src/lib/gemini.ts` calls `logAiUsage` only on success with usage metadata. Failed, timed-out and aborted Gemini calls leave no usage row, unlike OpenAI's `logTerminal`. Closing this gap is AI-usage work in Lane D and needs its own plan.
- `generateKetikReviewAiResponse` falls back on _any_ primary failure, including a primary timeout that may already have been billed. That is a product policy choice, not a defect R3 fixes.
