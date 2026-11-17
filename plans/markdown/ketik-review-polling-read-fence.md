# KETIK review polling: fence same-run status reads

Status: **F1/F2 implemented; RED/GREEN and local gates passed** (2026-11-17). Commit/push outcome is reported in the executor's final response.
Baseline: HEAD `ee8bb36a` on `main`.

## Requirement

Fix audit finding **F1**: an older status read that resolves after a newer one can replace a ready review. Fold in **F2** (failed-rerun provenance kept in a mutable ref), because the fix makes it a one-line change.

Observable acceptance:

1. Once a newer status read (manual refresh or scheduled poll) has been issued in the same run, a response from an older read never changes the UI, the session summary, or the polling-health flag. That covers success, `queued`/`processing`, `failed`, and network errors.
2. A completed result stays visible without depending on a later poll to restore it.
3. Behavior that must not change:
   - session/run fencing;
   - resume of a processing session;
   - explicit rerun from `ready`;
   - failed rerun that keeps the previous result ("previous-after-failure" banner);
   - the RERUN_LIMIT refusal;
   - the lost-enqueue recovery path;
   - poll back-off/interval (3 s);
   - a genuinely newer `queued` read from `ready` still entering `reviewing` (e.g. a rerun started in another tab).

Lane **C**: client lifecycle behavior in one hook plus its reducer, with E2E RED first. Load `trainers-superapp-tdd` before editing.

Out of scope: API, worker, DB, R3 provider cancellation, `KetikReviewWait.tsx` display clock, monitoring presentation components (`KetikSession.tsx` does not poll), and any visual change. Do not touch untracked plans you do not own.

## Verified facts (drift-check before editing)

Paths relative to `apps/web/src/routes/ketik/hooks/`:

- `useKetikReviewStatus.ts:93–130`: `checkStatus(run, initial)` fences only on `runRef`. Every branch (`poll-ok`, `loadResult`, `failed`, `queued` plus the session `update`, `idle`, and `poll-failed` in `catch`) runs for any read in the current run, whatever order the reads resolve in.
- `useKetikReviewStatus.ts:224–226`: `refreshStatus` calls `checkStatus(runRef.current)`, so it shares the run with the scheduled poll (`:144–164`). Scheduled polls are serial among themselves; manual refresh is the overlap source.
- `reviewLifecycle.ts:104–111`: `queued` unconditionally sets `phase: "reviewing"` and clears `review`, including from `ready`. This is correct for a _newer_ read and must stay. The bug is accepting an _older_ read, so the fix belongs at the read-ordering layer, not in a reducer rule like "ignore queued when ready".
- `useKetikReviewStatus.ts:46,102,135,175` (F2): `rerunFailedRun` is set to `run` immediately before `loadResult(run, data.detail)` and read once inside `loadResult` (`:85`). Every other `loadResult` caller (`retryResult` with `++run`, RERUN_LIMIT, the `completed` branch, the initial-check `catch`) gets `false` today, so an explicit `previousKept` argument is behavior-identical.
- Existing E2E `apps/web/e2e/ketik-review-worker-browser.spec.ts:329–395`, "late polling cannot replace completed results after an explicit status refresh", already constructs the interleaving. It passes only because `toHaveText("80")` retries until the next automatic poll restores the UI (3424 ms vs 91 ms). The trace in `artifacts/ketik-shutdown-poll-audit/` shows the transient "Menunggu giliran telaah" DOM.
- `docs/architecture.md` ("KETIK client lifecycle" bullet) describes reducer phases and old session/run fencing. It does not claim same-run read ordering.

## Design

### Read fence (F1)

- Add a per-hook monotonic read sequence beside the existing `runRef` generation fence, e.g. `latestReadRef`. `checkStatus` takes `const read = ++latestReadRef.current` _before_ the GET.
- After the await (in both the success path and `catch`), proceed only if `run === runRef.current && read === latestReadRef.current`. Otherwise return without any dispatch, `update`, `fail`, or `loadResult`.
- "Latest issued wins" is the rule because a later-issued read reflects equal or newer server state. Document it in one comment, and say explicitly that this is a fence like `runRef`, not a lifecycle state. Lifecycle phases stay in `reviewReducer`.
- A result load started by an accepted read (`loadResult(run, data.detail, …)`) passes the `detail` it already has, so there is no extra await. When `loadResult` fetches detail itself (no `known`), also discard it if a newer status read has since been accepted and changed the phase. The simplest correct form is to pass `read` into `loadResult` and re-check it after the detail await. Callers that are not status reads (`retryResult`, RERUN_LIMIT, the submit `completed` path) use a fresh `++latestReadRef.current` so an older in-flight poll is invalidated too.
- `submit` should also bump the read sequence when it starts a new run. This is belt-and-braces: `runRef` already fences across runs.
- Do not change `reviewReducer` semantics for `queued`/`poll-failed`. Do not add timeouts, sleeps, or debounce.

### Provenance as data (F2)

- Replace `rerunFailedRun` with an explicit `previousKept: boolean` parameter on `loadResult`, passed `true` only from the `failed && previousKept && resultReady` branch. Delete the ref and its resets (`:46,102,135,175`). The reducer `result` event already carries `previousKept`.

### Docs

- `docs/architecture.md` "KETIK client lifecycle" bullet: add one clause saying status reads within a run are fenced latest-issued-wins, so a late older read cannot downgrade a published result.
- In `plans/markdown/ketik-integrity-resilience.md:502,509`, do **not** rewrite historical evidence. The audit report already qualifies it.

## Tests (E2E only; no unit tests)

Browser config: `apps/web/playwright.config.ts`. It is hermetic: task-owned Vite on loopback `:3005`, `reuseExistingServer: false`, `retries: 0`, fetch guard. No Supabase stack is needed for this spec. One Playwright run at a time.

1. **Strengthen the existing test** at `ketik-review-worker-browser.spec.ts:329–395` so it cannot pass via automatic recovery. This edits the check deliberately; say so in the commit (`~/.claude/CLAUDE.md` verification rule: changing the check is the task here because the audit proved the check was too weak):
   - Before releasing the held stale `queued` response, make every **subsequent** status request hang (route held, never fulfilled until test end). Recovery polls then cannot repair the UI.
   - Before releasing, install a `MutationObserver` via `page.evaluate` that records whether "Menunggu giliran telaah" (or the progress region) is ever rendered after the score is shown.
   - Release the stale response and wait for it to be consumed deterministically: wait for the route's `fulfill` promise, then two `requestAnimationFrame` ticks inside `page.evaluate`. No `waitForTimeout`.
   - Assert that the observer flag is `false`, the score is still "80", and no progress UI is shown.
   - **Expected RED on current code:** the observer flag is `true` and the progress UI persists because recovery is blocked. Save the log and trace.
2. **New test, same file:** a stale **network failure** from an older read after a newer completed read must not show the polling-failure warning. Hold read A, issue read B via manual refresh → completed, then fail read A with HTTP 500. Assert no poll-failure banner, using the same observer technique. Write it RED first if current code shows the banner. If current code does not show it, keep it as a characterization test and say so honestly.
3. **Guard test (same file), if not already covered:** from `ready`, a manual refresh whose _newer_ response is `processing` (simulating a rerun started elsewhere) still enters the waiting UI. This prevents the "just ignore queued when ready" non-fix. It should be GREEN before and after.
4. Regression: the whole `ketik-review-worker-browser.spec.ts` (6 existing tests, including the failed-rerun previous-result test at `:276` that guards F2), plus any other KETIK browser spec that renders `KetikReviewStage` (find them with a grep for `ketik-review` / `telaah` in `apps/web/e2e`; ignore API-only specs).

Commands (serial; `--workers=1 --trace on --reporter=line --max-failures=1`; save logs under ignored `artifacts/ketik-review-read-fence/`):

```bash
pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-browser\.spec\.ts$' -g 'late polling cannot replace' --workers=1 --trace on --reporter=line --max-failures=1
pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-browser\.spec\.ts$' --workers=1 --trace on --reporter=line
```

If the same failure remains after three fix rounds, stop and report (`AGENTS.md` honest-verification rule).

## Tasklist

- [x] Intake: read `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, this plan, and `plans/markdown/ketik-review-polling-audit.md`; load `trainers-superapp-tdd`; drift-check every line reference; `graphify query useKetikReviewStatus` for other consumers of the hook's return shape (keep it unchanged).
- [x] Strengthen test 1 and capture RED on current code (log and trace).
- [x] Add test 2 (RED or characterization; label it truthfully) and test 3 (GREEN guard).
- [x] Implement the read fence and the F2 parameter; run the focused tests to GREEN.
- [x] Full `ketik-review-worker-browser.spec.ts` plus the other `KetikReviewStage` browser specs: all GREEN.
- [x] Grep acceptance: `rerunFailedRun` is gone; every post-await branch in `checkStatus`/`loadResult` checks both `runRef` and the read sequence; `reviewLifecycle.ts` `queued` semantics are unchanged.
- [x] `thermo-nuclear` review; `TURBO_CONCURRENCY=1 pnpm typecheck && pnpm lint && pnpm build` (web has 74 legacy warnings; zero new); scoped web ESLint on touched files; Prettier; `git diff --check`; `GRAPHIFY_MAX_WORKERS=1 graphify update .`.
- [x] Update the `docs/architecture.md` clause and changelog entry; prepare the commit evidence. Release step: commit `fix(ketik): fence same-run review status reads so late polls cannot replace results` and push to `main` after all gates. Record RED in the commit body and passing checks in `Verified:` per the repo trailer rule; actual SHA/push result belongs in the final response.
- [x] Record the evidence (commands, exit codes, log paths, RED/GREEN) in this plan.

## Risks

- Over-fencing: if `loadResult` from `retryResult`/RERUN_LIMIT does not take a fresh read id, an older poll could still win, or a legitimate retry could be discarded. Test 4's regression (failed-rerun, lost-enqueue, late-enqueue tests) is the guard.
- Discarding a newer `queued` would break cross-tab reruns. Test 3 guards this.
- The hook's return shape is consumed by `KetikReviewStage.tsx`. Keep it identical; `rerunFailed` stays derived from `resultSource`.

## Report back

Files changed; RED evidence (which assertion failed, trace path); whether test 2 was RED or characterization; GREEN commands with exit codes; grep acceptance; commit SHA; doc/code inconsistencies found.

## Execution evidence — 2026-11-17

### Scope and implementation

- Direct execution, Lane C, baseline `ee8bb36a`, using this approved persisted plan and `trainers-superapp-tdd` / evidence-first debugging. No delegation. Owned paths: this plan, `apps/web/src/routes/ketik/hooks/useKetikReviewStatus.ts`, `apps/web/e2e/ketik-review-worker-browser.spec.ts`, `docs/architecture.md`, `CHANGELOG.md`. The three unrelated untracked plans remain untouched.
- Every line reference and caller was drift-checked. `graphify query useKetikReviewStatus` → **0**, identified `KetikReviewStage` and unchanged return-shape consumers; direct imports confirmed it. The graph also contained stale historical local symbol names, so live source stayed authoritative. No external library/dependency/API change; Context7 was not needed.
- `latestReadRef` increments before each status GET, never resets, and is checked with `runRef` before any response/error side effects. Result loads carry that read identity and check both fences before dispatch and after their detail GET, including `catch`. Non-status result loads (submit-completed, RERUN_LIMIT, retryResult) take fresh read IDs; run reset/unmount and submit also invalidate reads. No lifecycle flag, timeout, sleep, debounce or new phase was introduced; the 3000 ms poll scheduler is unchanged.
- `rerunFailedRun` and all its resets were deleted. `previousKept` is a loadResult argument, true only for the accepted failed-rerun/previous-result branch. The reducer, its queued semantics, hook return shape, API, worker and database are unchanged.
- The old late-poll test was **deliberately strengthened as requested**, not edited to make the implementation pass. Both stale queued and stale HTTP-error variants block all recovery status requests after the newer read, arm a MutationObserver after the score is ready, wait for route fulfillment/response completion plus two animation frames, then assert that neither queued UI nor a false warning ever appeared. Observer/held-route cleanup is explicit. No new sleep, retry, timeout increase, skip or weakened assertion was added. The unrelated pre-existing late-enqueue test's sleep is not part of the fix and was left unchanged.

### Target safety and RED

All logs/traces below are under ignored `artifacts/ketik-review-read-fence/`. Traces can contain test auth storage and are not committed. Canonical browser config starts only a task-owned Vite on loopback `:3005`, with `reuseExistingServer: false`, `retries: 0`, one worker and the existing hermetic fetch guard. Supabase/Telefun/API-proxy targets are loopback discard port 9; no inherited `E2E_`, `PLAYWRIGHT_`, `VITE_`, or `API_PROXY_` overrides were present. No Supabase stack, production credentials, paid provider call or remote mutation was needed.

Each command below used the same prefix:

```bash
pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-browser\.spec\.ts$'
```

and flags `--workers=1 --trace on --reporter=line --max-failures=1`, with the indicated `-g` and `--output="$PWD/artifacts/ketik-review-read-fence/<output>"`. Runs were serial.

| Run / log            | `-g`                                                                                | Output                   | Exit  | Evidence                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `red-queued.log`     | `late polling cannot replace`                                                       | `red-queued-results`     | **1** | Before hook edits: observer `seen.queued` was **true**, expected false; message “An obsolete status read must never render queue progress” |
| `red-network.log`    | `stale polling network error`                                                       | `red-network-results`    | **1** | Before hook edits: observer `seen.warning` was **true**, expected false; message “An obsolete failure must never render a polling warning” |
| `guard-baseline.log` | `a newer processing read`                                                           | `guard-baseline-results` | **0** | **1 passed** on old code: ready → newer processing still enters waiting without POST review                                                |
| `green-focused.log`  | `late polling cannot replace\|stale polling network error\|a newer processing read` | `green-focused-results`  | **0** | **3 passed** after one implementation round                                                                                                |
| `owning-suite.log`   | none                                                                                | `owning-suite-results`   | **0** | **8 passed**, all six original cases plus two added cases; includes failed-rerun provenance and lost/late enqueue behavior                 |

**Test 2 was RED, not a characterization-only test.** The processing guard was GREEN before and after. Neither RED was an infrastructure failure; both reached their intended non-retrying observer assertion. The three-round escalation threshold was not approached.

Retained RED traces:

- `red-queued-results/ketik-review-worker-browse-26d29--an-explicit-status-refresh-chromium/trace.zip`.
- `red-network-results/ketik-review-worker-browse-297d5-fter-a-newer-completed-read-chromium/trace.zip`.

### Regression and quality gates

Selection was checked first with the following file filter and `--list --reporter=line` → **0**, `regression-list.log`, exactly **77 tests in 9 files**. Then executed:

```bash
pnpm --dir apps/web exec playwright test '(^|/)(ketik-client-lifecycle|ketik-flow-chat|ketik-flow-landing|ketik-flow-telaah-rerun|ketik-flow-telaah|ketik-history-browser|ketik-review-pdf|ketik-review-worker-browser|ketik-usage-lifecycle)\.spec\.ts$' --workers=1 --trace on --reporter=line --max-failures=1 --output="$PWD/artifacts/ketik-review-read-fence/regression-results"
```

→ **0**, **77 passed, zero skips**, `regression.log`. This includes stage rendering/navigation, processing resume, fresh rerun, failed rerun's previous-result banner, RERUN_LIMIT, PDF eligibility/failures, usage/history and lost-enqueue recovery. Monitoring/PDKT/Telefun presentation specs do not use the hook and were excluded. The opt-in `ketik-session-browser.spec.ts` needs a disposable real DB; it was not run or misrepresented as hermetic. No new API/worker behavior exists to verify there in this scope.

- `TURBO_CONCURRENCY=1 pnpm typecheck` → **0**, `typecheck.log`; includes web E2E TypeScript.
- `TURBO_CONCURRENCY=1 pnpm lint` → **0**, `lint.log`; 74 existing web warnings **plus 8 existing API warnings** in untouched files, zero errors. The plan had only named the web warning count; the API warnings were recorded, not repaired or hidden.
- `TURBO_CONCURRENCY=1 pnpm build` → **0**, `build.log`; existing Vite native-config warning, no build error.
- `pnpm --dir apps/web exec eslint src/routes/ketik/hooks/useKetikReviewStatus.ts e2e/ketik-review-worker-browser.spec.ts` → **0**, `scoped-eslint.log`, no warnings.
- `GRAPHIFY_MAX_WORKERS=1 graphify update .` → **0**, `graphify-update.log`; ignored local cache not staged.
- Scoped Prettier and `git diff --check` → **0**, `format-check.log` / `acceptance.log`. Grep shows no `rerunFailedRun`; all four post-await status/detail success/error guards check run plus read identity. `git diff -- apps/web/src/routes/ketik/hooks/reviewLifecycle.ts` is empty. Only the failed-rerun branch passes `true` as provenance.

### Thermo-nuclear self-review and boundaries

Verdict: **PASS** for the owned fix; no independent reviewer or manual visual review is claimed. Checked latest-issued rather than latest-resolved semantics, stale status/detail success/error fencing, run/session/unmount invalidation, explicit retry/RERUN_LIMIT result reads, unchanged reducer behavior for genuinely newer queued/processing work, parent/session updates, polling-health precedence, F2 provenance, no new dependencies, and blocked recovery in the strengthened regression. Newer work remains admissible; this is not a blanket terminal-phase lock.

The one architecture clause now states the new same-run read-ordering guarantee. Historical audit/implementation evidence remains unchanged as requested; the formerly overstrong late-poll claim is now covered by a real RED/GREEN rather than silently rewriting history. No new product-doc/code mismatch was found. The commit body records that editing the previously weak judge was explicitly part of this task; the `Verified:` trailer lists passing checks only, as required by the canonical repo rule.

Task-owned Vite/Playwright processes exited; final process and port inspection found no remaining task listener on `:3005`. Unrelated processes and dirty plans were not touched. R3 remains deferred. Push to `main` can trigger Railway auto-deploy; no deployment status, production smoke test or remote DB action is claimed. Commit SHA/push outcome is in the final response.
