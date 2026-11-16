# Remaining KETIK client lifecycles

## Requirement

Follow-up to `ketik-explicit-client-lifecycle.md` at baseline `6fe67128`: remove the remaining implicit **multi-state frontend lifecycles** in assignment and history, including their CSV and replay playback flows. Lane C, existing frontend-local patterns and no API/schema/RLS/provider/billing contract change. Preserve dirty/untracked plans not owned by this task.

## Design

- Assignment: discriminated status union and one reducer for source load, recipient lookup, ready, saving, failure/conflict, explicit reload, and success. Keep source/recipient version snapshots tied to the selected recipient and load generation. Ignore cancelled/late responses; no silent overwrite retry.
- History action reducer: independent replay lookup (idle/loading/ready/failed) and delete (idle/confirming/deleting/failed/closed-with-target-for-exit-animation) regions. No replay/pending/error or target/open/busy flag combinations. Account changes and unmount invalidate outstanding operations, preserving backend authorization unchanged.
- CSV export: idle/exporting/failed union with progress and generation-tagged events. Preserve full sequential paging, bounded limits, no partial download, cancellation on filter/account change and manual retry.
- Replay playback: explicit closed/paused/playing/ended states with cursor transitions in a reducer. Empty replay displays 0/0 with controls disabled, last message cannot leave a Play state that immediately cancels itself; timers stop on close.
- Inventory distinction: ordinary form data/search/filter values, dialog visibility, DOM refs, image fallback flags, clocks and a single operation's busy indicator are not themselves hidden multi-state machines. Existing settings save already has an explicit reducer; page/list/detail/assignment-self loads already use explicit loading/ready/error unions. Do not rewrite these unrelated working paths just to remove every `useState`.
- Keep changes invisible except correcting invalid/recoverability states. No UI redesign or new dependencies; reuse existing E2E fixtures. No backend state-write consolidation in this task.

## Tasklist

- [x] Read affected runtime files, existing E2E and safe Playwright config; inspect all KETIK state usages and narrow Graphify callers.
- [x] Write/run focused failing browser cases before product edits.
- [x] Implement named reducer transitions for assignment, history actions/export and playback.
- [x] Run focused GREEN and existing assignment/history/replay/settings regressions serially, with trace artifacts.
- [x] Thermo-nuclear self-review, serial root typecheck/lint/build, Graphify update, diff check.
- [x] Record inventory/evidence, update canonical architecture and changelog; ready to commit/push owned files after passing gates.

## Verification

Canonical `apps/web/playwright.config.ts` starts only local Vite and sets Supabase/API/Telefun to loopback discard port 9. No inherited VITE/E2E/Playwright overrides found. Hermetic fixtures block unexpected network egress. No unit tests or production services.

Focused command: `pnpm --dir apps/web exec playwright test ketik-remaining-lifecycle.spec.ts --reporter=line --workers=1 --trace on --max-failures=1`. Relevant existing specs: `ketik-server-chat-start.spec.ts`, `ketik-history-browser.spec.ts`, `ketik-flow-landing.spec.ts`, `ketik-settings-save-lifecycle.spec.ts`. Compile gates: `TURBO_CONCURRENCY=1 pnpm typecheck`, `TURBO_CONCURRENCY=1 pnpm lint`, `TURBO_CONCURRENCY=1 pnpm build`; scoped formatting; `git diff --check`.

Logs/artifacts: ignored `artifacts/ketik-remaining-lifecycle/` and `apps/web/test-results/`. No delegated agents or parallel heavy commands.

## Inventory and evidence

| Surface                                        | Finding/result                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Assignment dialog                              | Removed source/snapshot/loading/saving/error/success flag combinations; reducer enforces lookup/save state and recipient ownership of the version snapshot, preserves explicit conflict reload.                                                                                                                                |
| History replay lookup                          | Removed replay/detail-pending/error combinations; reducer events identify the current request; existing late-selection/account-reset guards retained.                                                                                                                                                                          |
| History deletion                               | Removed target/open/deleting flag combinations; explicit confirming/deleting/failed/closed-with-target state preserves retry and exit copy. Request generation invalidates callbacks after account changes/unmount.                                                                                                            |
| History CSV                                    | Removed progress-null/error combinations; explicit idle/exporting/failed reducer preserves sequential paging, limits, retry and no partial downloads.                                                                                                                                                                          |
| Replay player                                  | Removed isPlaying/index inferred lifecycle; explicit closed/paused/playing/ended reducer clamps navigation, stops timers on close and handles empty/end boundaries.                                                                                                                                                            |
| Chat/session/review                            | Already explicit reducers from previous commit, untouched.                                                                                                                                                                                                                                                                     |
| Settings save                                  | Already explicit phase reducer (`ready/saving-global/saving-personal/resetting/failed`); untouched. Existing in-flight ref is a synchronous reentrancy guard, not a second multi-phase workflow.                                                                                                                               |
| Page/assignment-self/list/detail/summary loads | Already name loading/ready/error in a status union. Unchanged; not hidden flag-combination lifecycles.                                                                                                                                                                                                                         |
| Other state usages                             | Form drafts, duration validation, filters, search, selections, ordinary visibility toggles, clock values, counters, one image fallback/retry and single-operation PDF/usage busy indicators. Not a hidden multi-state workflow merely because they use useState. No shared CRUD hooks or backend lifecycle policies rewritten. |

- RED: `pnpm --dir apps/web exec playwright test ketik-remaining-lifecycle.spec.ts -g 'empty replay' --reporter=line --workers=1 --trace on --max-failures=1` exited 1 because the empty replay showed 1/0 instead of 0/0 (`red.log`).
- Focused playback GREEN exited 0: empty replay and end/reset/close behavior, 2 passed (`green-playback.log`). Full new spec GREEN exited 0, 5 passed (`green.log`), including deletion failure/manual retry for one/all and late recipient snapshot fencing.
- Regression: `pnpm --dir apps/web exec playwright test ketik-remaining-lifecycle.spec.ts ketik-history-browser.spec.ts ketik-server-chat-start.spec.ts ketik-flow-landing.spec.ts ketik-settings-save-lifecycle.spec.ts --reporter=line --workers=1 --trace on --max-failures=1`: exit 0, 41 passed (`regression.log`). Existing E2E covers replay focus/Escape, CSV failure/retry/full paging/filtering, search races, account-change replay cleanup, assignment conflict/reload/success at 390/1280px and settings partial-save phases.
- `pnpm --filter @trainers/web typecheck`: exit 0 (`web-typecheck.log`). Final serial root `TURBO_CONCURRENCY=1 pnpm typecheck`, `TURBO_CONCURRENCY=1 pnpm lint`, `TURBO_CONCURRENCY=1 pnpm build`: all exit 0 (`typecheck.log`, `lint.log`, `build.log`). Other workspaces reused Turbo cache; changed web tasks executed. Root lint has the same 74 warnings in untouched files, zero errors. Scoped ESLint for the 8 owned runtime/test files: exit 0, no warnings (`scoped-lint.log`).
- `GRAPHIFY_MAX_WORKERS=1 graphify update .`: exit 0; local ignored graph only, one AST worker (`graphify.log`). No external library/API semantics changed, so no Context7 lookup needed.
- Thermo-nuclear self-review: PASS; reviewed complete owned diff/new reducer files, all callers, cancellation/retry/version ownership, reducer reentrancy guards, timer cleanup, bounded playback and preservation of UI/API contracts. No independent/delegated review claimed. `git diff --check` passed. No production/backend/provider/RLS verification claimed.
- Unrelated untracked plans preserved: cloudflare-security-audit-partial-2026-11-04.md, sidak-temuan-row-cache.md, supabase-egress-reduction.md.
