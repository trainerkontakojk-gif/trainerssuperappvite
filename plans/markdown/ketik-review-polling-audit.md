# KETIK review polling lifecycle — read-only audit

Date: 2026-11-17. Frontend baseline: `7aeb7d78` (unchanged by the subsequent, separately authorized API shutdown refactor `f243a44d`). Scope: manual review, queued/processing polling, status refresh, result loading, failed rerun provenance, and stale-response fencing. Direct read-only audit; no delegation, no frontend hook/reducer/component/browser-spec edits, no production access.

## Summary

The main review phase is already explicit (`idle`, `reviewing`, `loading-result`, `ready`, `failed`) in `reviewLifecycle.ts`. It is not the old collection of loading/busy flags. However, **same-run status requests are not fenced against each other**, and a delayed queued response can regress a completed result. The existing browser test passes because its retrying assertion waits for a later poll to repair that regression, not because the regression is absent.

The handoff's `apps/web/src/routes/monitoring/components/session/KetikSession.tsx` is a presentation component, not the polling owner. Polling lives in `apps/web/src/routes/ketik/hooks/useKetikReviewStatus.ts`, called by `components/KetikReviewStage.tsx:66`. Monitoring's `KetikTranscript` / `KetikAssessment` only render supplied data (`KetikSession.tsx:42,87`); no polling effect/timer was found there.

## Vetted findings

| ID  | Priority     | Finding                                                                                 | Impact                                                                                                                                                                 | Effort                       | Fix risk                                                           | Confidence                                  |
| --- | ------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| F1  | P2           | Same-run late status response can downgrade a ready review; existing E2E masks recovery | Completed score/result temporarily disappears, UI re-enters queued/loading and issues another poll; a later read failure could leave the UI in that stale state longer | M, including regression test | Medium: must retain resume, manual refresh and real rerun behavior | High: source plus executed trace            |
| F2  | P3, optional | Failed-rerun outcome is also carried in a mutable ref outside the reducer               | Small lifecycle source-of-truth debt; no separate user-visible defect established                                                                                      | S, after F1                  | Low/medium: preserve previous-result banner and reset semantics    | High for structure; no functional bug claim |

### F1 — fence concurrent status reads within one review run

Evidence:

- `useKetikReviewStatus.ts:93–115`: `checkStatus` captures only `runRef`, awaits GET, then dispatches `poll-ok` and `queued`. It does not carry a request sequence or expected review phase.
- `useKetikReviewStatus.ts:224–225`: manual `refreshStatus` calls `checkStatus(runRef.current)` without creating a newer read identity. A timer request and manual refresh therefore share the same run.
- `useKetikReviewStatus.ts:72–88`: publishing a result clears the enqueue request handle but does not invalidate other status reads in that same run.
- `useKetikReviewStatus.ts:144–164`: effect cleanup stops rescheduling through `cancelled`; it does not invalidate a `checkStatus` already awaiting its response. This cleanup boolean is a resource guard, but it does not solve response ordering.
- `reviewLifecycle.ts:104–112`: `queued` unconditionally enters `phase: "reviewing"`, even from `ready`. `KetikReviewStage.tsx:390–409` then replaces the result with progress.
- `ketik/index.tsx:605–607` keys the stage by session ID, so same-session completion does not create a fresh hook/run by remounting it.

Executed evidence (not just a hypothetical interleaving):

1. Existing test `apps/web/e2e/ketik-review-worker-browser.spec.ts:329–395` starts from processing, makes the first poll fail, holds the second poll's queued response, and uses manual refresh to receive a completed result.
2. The held queued response is then delivered after the completed result/detail. The trace contains a DOM snapshot with **“Menunggu giliran telaah”** even though the score had already been displayed.
3. A new status poll and detail read occur roughly three seconds later. The final score assertion takes **3424.0 ms**, versus **91.3 ms** for the first completed-score assertion.
4. The test exits **0**, because `toHaveText("80")` at line 390 retries for up to 5000 ms. It proves eventual recovery, not “never replace completed results.” This is not a failed test, a flaky rerun, or a RED claimed after the fact.

Sanitized extracted network ordering:

| Request   | Start UTC    | Duration ms | Meaning                                         |
| --------- | ------------ | ----------- | ----------------------------------------------- |
| status #1 | 00:43:51.108 | 8.606       | HTTP 500                                        |
| status #2 | 00:43:54.120 | 478.661     | held response, eventually queued                |
| status #3 | 00:43:54.304 | 17.056      | manual refresh, completed                       |
| detail #1 | 00:43:54.409 | 15.028      | completed result first displayed                |
| status #4 | 00:43:57.620 | 11.243      | polling resumed after the stale queued response |
| detail #2 | 00:43:57.634 | 23.022      | completed result restored                       |

Impact is presentation/extra reads, not a backend job transition or another AI enqueue. No data corruption or extra AI call was demonstrated. A later recovery GET failing/hanging is an extrapolation, not an executed scenario.

Fix sketch (not implementation authorization): give status-read attempts an explicit identity/expected-state guard in the existing reducer-owned lifecycle, including result-load work started by that read. Ignore obsolete completions/failures after a newer accepted read/terminal result; preserve session/run fencing and intentional fresh reruns. First strengthen the existing hermetic scenario so it deterministically observes the stale completion and cannot pass by waiting for the next automatic recovery. Capture RED on current code, then make the smallest fix. Do not merely increase timeouts, add a sleep, suppress all queued events, or add unit tests. Treat that follow-up as Lane C with a persisted plan and the repository TDD gates.

### F2 — consolidate failed-rerun provenance when touching this lifecycle

- `useKetikReviewStatus.ts:46,102,135,175`: `rerunFailedRun` is set when a failed rerun preserves its previous result, then reset on session/run changes.
- `useKetikReviewStatus.ts:85`: result publication decides `previousKept` from that ref, rather than from reducer state or explicit current load context.
- `reviewLifecycle.ts:18,43,88`: the same outcome is finally represented as `resultSource: "previous-after-failure"` in the reducer.

This ref contains outcome metadata, not a timer/abort handle or pure generation counter. The main phase still lives in the reducer, so this is **not evidence that the whole review lifecycle is implicit**. No independent failure from this split was reproduced. If F1 is fixed, consider carrying the provenance in the result-loading state/event and removing the extra mutable outcome flag; do not do a separate broad refactor just to remove every ref.

## Considered and rejected as findings

- `runRef` is legitimate generation fencing across session changes/new attempts/unmount. Its presence alone is not an implicit state machine. The gap is ordering of reads _within_ that generation.
- `requestRef` preserves the UUID/rerun intent and prevents a delayed enqueue callback after terminal publication from changing the result. It is not automatically a defect just because it is a ref.
- `polling: "ok" | "failed"` is an explicit, orthogonal read-health region: a network failure need not make the backend job failed. A ready result plus a polling warning can be legitimate during fallback status recovery.
- Effect-local `cancelled` and timer handles control teardown; do not remodel them as product phases solely to eliminate booleans.
- `KetikReviewWait.tsx`'s interval is a display clock. It changes waiting copy at three minutes and does not declare the job failed.
- The same-session `queued` event cannot simply be disallowed forever from ready: explicit reruns/refresh of genuinely newer backend work must continue to work.
- No new provider cancellation, worker, DB, auth/RLS, or lifecycle repair was performed as part of this audit.

## Verification and documentation drift

Command executed once, with no retry:

```bash
pnpm --dir apps/web exec playwright test '(^|/)ketik-review-worker-browser\.spec\.ts$' -g 'late polling cannot replace' --reporter=line --workers=1 --trace on --max-failures=1 --output="$PWD/artifacts/ketik-shutdown-poll-audit/poll-race-results"
```

Exit **0**, **1 passed**. Log: `artifacts/ketik-shutdown-poll-audit/poll-race.log`. Full trace: `poll-race-results/ketik-review-worker-browse-26d29--an-explicit-status-refresh-chromium/trace.zip` under that directory. Sanitized read-only extraction: `poll-race-evidence.json` (request timing, assertion durations, queued-UI snapshot timestamp; no JWT/header/provider payload).

Target safety: canonical Playwright browser config starts only task-owned Vite on loopback `:3005`, never root `pnpm dev`; `reuseExistingServer: false`, `retries: 0`. `e2eTargets.ts` points Supabase, Telefun and API proxy at loopback discard port 9. The existing hermetic fetch guard intercepts business requests and rejects non-allowlisted egress. No inherited `E2E_`, `PLAYWRIGHT_`, `VITE_` or `API_PROXY_` overrides were present. The browser test's server exited; no unrelated server was stopped.

- `docs/architecture.md:246` correctly describes reducer phases and fencing of responses from an older session/run. It should **not** be interpreted as guaranteeing same-run read ordering.
- The historical `plans/markdown/ketik-integrity-resilience.md:502,509` claims protection from late polling and “no polling overlap automatically.” Automatic scheduled polls are serial, but manual refresh can overlap; the executed test does not establish the stronger no-downgrade claim. Historical evidence is left intact and qualified here rather than silently rewritten.
- The handoff's suggested monitoring source path is inaccurate for the polling owner, as noted above. The monitoring presentation file was inspected and left unchanged.
- Existing deployment debug pointer/unit-command drift is unrelated and remains untouched.

This was a focused lifecycle/correctness/coverage audit, not a whole-frontend security, accessibility, visual, dependency or performance audit. No new browser spec, UI screenshot review, full frontend suite, production test or Railway inspection is claimed. Runtime checks executed for the separate API refactor are documented in `ketik-review-worker-host-residuals.md`; they are not evidence that frontend F1 is fixed.

**Recommendation:** address F1 first, with a RED that cannot hide behind automatic recovery. F2 can be folded into that approved lifecycle change only if it keeps the fix simpler. No full implementation plan or frontend repair is started until Fajar selects it.
