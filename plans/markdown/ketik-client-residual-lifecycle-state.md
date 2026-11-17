# KETIK client: move the last lifecycle decisions out of refs

Status: **planned, not started** (2026-11-17). Executor: another agent. Baseline: HEAD `9d17d223` on `main`.
Source: read-only audit of 2026-11-17 (residuals #1 and #2). Residual #3 (`consumer_closed`) and #4 (R3 provider cancellation) are out of scope; see the last section.

## Requirement

Two client hooks still make lifecycle decisions from a mutable ref that runs alongside their reducer. Make each reducer the only source of truth for those decisions, **without changing observable behavior**.

| ID  | File                                                                         | Residual                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | `apps/web/src/routes/ketik/hooks/useServerKetikChat.ts` + `chatLifecycle.ts` | `legacyPending` ref decides "appends are held" and "retry resends the legacy turn"; the reducer cannot tell a legacy-failed `blocked` from a modern-failed `blocked` |
| W2  | `apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts`     | `saveInFlightRef` boolean duplicates the reducer's `saving-*`/`resetting` phases as the reentrancy guard; local `savingPersonal` mirrors phase `saving-personal`     |

Lane **C**: client lifecycle behavior in two hooks. No API, type contract, schema, provider or visual change. Load `trainers-superapp-tdd` before editing. One commit per workstream (W1, then W2). Do not touch the three untracked plans you do not own (`cloudflare-security-audit-partial-2026-11-04.md`, `sidak-temuan-row-cache.md`, `supabase-egress-reduction.md`).

This is a behavior-preserving refactor, so there is no product defect to turn RED. The E2E for each workstream is a **characterization test**: it must pass on the baseline before you edit the hook, and still pass afterwards. Record both runs. Do not claim a RED you did not observe.

## Verified facts (drift-check against HEAD before editing)

### W1: legacy pending turn

A "legacy turn" is a `ketik_session_turns` row from the old single-call endpoint (`POST /api/v1/ketik/sessions/:id/turns`). The current client never starts one. It only recovers or retries one that the server returns as `session.pendingTurn` (`packages/types/src/ketik-session.ts:60–65`: `KetikSessionTurnRequest & { status: "processing" | "failed"; leaseExpiresAt }`). `ketikApi.sendTurn` is called only from `retry()` (`useServerKetikChat.ts:623`).

- `:178`: `const legacyPending = useRef(initial.pendingTurn)`.
- Reducer init (`:139–145`): `pending = session.pendingResponse ?? session.pendingTurn`; `processing` → `response: "recovering"`, `failed` → `response: "blocked"` plus a `response` error. The reducer does not record _which_ kind is pending.
- `:319–324`: `processAppends` returns early (no `append-start`) while `legacyPending.current` is non-null. Queued agent messages therefore stay queued while a legacy turn is processing or failed. With a modern `pendingResponse`, appends are allowed (orthogonal regions; see the comment at the top of `chatLifecycle.ts`).
- `:549–566` (recovery poll): when the server stops reporting processing, `legacyPending.current = loaded.pendingTurn` (it is now `null` or a failed turn), then `response-finish`, then `response-failed` if either pending is failed, else flush queued appends, else schedule a response.
- `:614–640` (`retry`): the order is append-blocked → no-op while busy → `recovery-failed` → **`legacyPending.current?.status === "failed"`** → append error → modern response retry. The legacy branch dispatches `legacy-retry`, calls `sendTurn` with the stored `requestId`, `text` and `expectedVersion`. On success it sets `legacyPending.current = null`, applies the session, dispatches `session` and `response-finish`, then flushes queued appends or schedules a response. On failure it dispatches `response-failed`.
- `chatLifecycle.ts`: `append-saved` turns `blocked` into `idle`. Today that cannot happen for a legacy-blocked chat, because appends are held. A reducer-only design must keep that invariant.
- `isLoading` / `isConsumerTyping` / `retryLabel` (`:648–671`) derive from reducer state only. The legacy case shows `isLoading` during `legacy-retrying` and the label "Coba minta balasan lagi".
- **No existing browser E2E sets `pendingTurn`** (only `pendingResponse`; `rg pendingTurn apps/web/e2e` is empty). Existing chat lifecycle E2E: `apps/web/e2e/ketik-client-lifecycle.spec.ts`, which uses `openHermeticShell` + `ketikServerChatHarness` (`base`, `id`, `session(...)`).

### W2: settings save reentrancy

- `useKetikSettingsDraft.ts:145–186`: `settingsSaveReducer` with phases `ready | saving-global | saving-personal | resetting | failed` and `acknowledgedGlobal`. `isSaving` is derived from phase (`:205–208`).
- `:218`: `saveInFlightRef = useRef(false)`, checked at `:382` (`handleSave`) and `:526` (`handleResetDefaults`), set before the first dispatch and cleared in `finally` (`:520`, `:556`). The reducer state cannot serve as the guard as-is, because a second click in the same tick sees the pre-render state. That is the only legitimate reason for a synchronous copy.
- `:480–515`: local `savingPersonal` and `sharedAcknowledged` choose the partial-save error message ("Template standar sudah tersimpan, tetapi pengaturan pribadi belum tersimpan."). `savingPersonal === true` exactly when the reducer has reached `saving-personal`.
- Existing E2E `apps/web/e2e/ketik-settings-save-lifecycle.spec.ts` covers partial result, retry, reopen and next revision for the global→personal save. It does not cover double-submit or reset-during-save.

## Design

### W1

Give the reducer ownership of the legacy turn.

- Add to `ChatState` the data the legacy branch needs, for example `legacy: { status: "none" } | { status: "processing" | "failed"; turn: { requestId; text; expectedVersion } }`. Initialize it from `initial.pendingTurn` in the reducer initializer.
- Feed the recovery result through an event that carries `loaded.pendingTurn` (extend `session`/`response-finish` or add a named event; keep events named and the transition in `chatReducer`).
- `legacy-retry` is legal only from `legacy.status === "failed"`. Its success clears `legacy` to `none` in the same event that finishes the response. Its failure keeps the failed turn so the next retry resends the same `requestId`/`expectedVersion`.
- `processAppends` reads `lifecycle.current.legacy.status !== "none"` instead of the ref. `retry()` reads the turn from `lifecycle.current.legacy`. Delete the `legacyPending` ref.
- Keep `responseRequestId`, timers, `pause`, `agentDraft`, `queued`, `read`, `hidden`, `slow`, `closingAttempts` and `mounted` as they are. They are idempotency keys, resource handles or pacing data, not lifecycle phases. Do not widen the scope to them.

Must not change: append/response orthogonality for modern responses; appends held during a legacy turn; same request ID/expected version on legacy retry; no automatic AI request on resume of a failed response; recovery-poll network failure → `recovery-failed` → manual status retry; post-expiry goodbye (`owesClosing`); every user-visible string and label.

### W2

- Replace the boolean with the synchronous reducer snapshot pattern already used by `useServerKetikChat.ts:173–177` (`lifecycle` ref updated by a `transition` helper that runs the same pure reducer). The guard becomes "phase is a saving phase" read from that snapshot.
- Derive the partial-save message from the snapshot (`phase === "saving-personal"` and `acknowledgedGlobal`) instead of the local `savingPersonal`/`sharedAcknowledged`, if that keeps the code simpler. If it does not, leave those two locals and say why in the report.
- Optionally make `start` legal only from `ready`/`failed` (return the state unchanged otherwise). That is the guard; do not throw in a UI reducer.

Must not change: the four contracts in `ketik-settings-save-lifecycle.spec.ts`; reset-defaults behavior; modal close on success; error toasts and copy.

## Tasks

### W1 (commit 1)

- [ ] Drift-check the facts above. If `legacyPending` is gone or the retry order differs, stop and report.
- [ ] Add hermetic browser E2E to `apps/web/e2e/ketik-client-lifecycle.spec.ts` (same harness as its first test). Minimum scenarios:
  1. Session loads with `pendingTurn.status = "failed"`: the response error alert is shown; the agent sends a message → **no** `POST .../messages` is made while the legacy turn is failed; the retry button sends exactly one `POST .../turns` whose body carries the stored `requestId`, `text` and `expectedVersion`; after it succeeds the queued message is appended (one `POST .../messages`) and the alert is gone.
  2. Legacy retry fails once, then succeeds: the second `POST .../turns` reuses the same `requestId`; no `POST .../respond` is made at any point.
  3. Session loads with `pendingTurn.status = "processing"`: the typing indicator shows; appends are held; the recovery poll (`GET /sessions/:id`) then returns `pendingTurn = null` with the consumer reply → reply visible, queued message appended, no `/turns` or `/respond` request.
     Use request counters and route handlers like the existing tests. Do not use sleeps; hold/release routes or wait on observable UI.
- [ ] Run them on the **unchanged** hook. Expected: pass (characterization). If one fails, you found a real defect: stop, keep the log and trace, and report before changing anything.
- [ ] Implement the W1 design. Rerun the focused tests (expected pass), then the regression set below.
- [ ] Update the "KETIK client lifecycle" bullet in `docs/architecture.md:246`: the chat reducer also owns the pending legacy turn, and appends are held only while that turn is unresolved.
- [ ] `thermo-nuclear` review of the diff; fix material findings.

### W2 (commit 2)

- [ ] Drift-check. Add hermetic E2E to `ketik-settings-save-lifecycle.spec.ts`: a double click on save while the first save is held sends exactly one `PUT /api/v1/ketik/settings` (and at most one `PUT /api/v1/ketik/templates`); reset-defaults clicked while that save is held sends no additional `PUT /api/v1/ketik/settings`. Run on the unchanged hook (expected pass).
- [ ] Implement the W2 design. Rerun focused, then regression.
- [ ] `thermo-nuclear` review.

## Verification

Run commands serially, one Playwright run at a time (`.claude/hooks/one-test-run.sh`). `retries: 0`; never rerun to get green. Same failure after three fix rounds → stop and report (`docs/AGENT_WORKFLOW.md` §7).

- Focused W1: `pnpm --dir apps/web exec playwright test '(^|/)ketik-client-lifecycle\.spec\.ts$' --reporter=line --workers=1 --trace on --max-failures=1`
- Focused W2: `pnpm --dir apps/web exec playwright test '(^|/)ketik-settings-save-lifecycle\.spec\.ts$' --reporter=line --workers=1 --trace on --max-failures=1`
- Regression (after each workstream): `pnpm --dir apps/web exec playwright test '(^|/)(ketik-client-lifecycle|ketik-server-chat-start|ketik-server-chat-turns|ketik-server-chat-pacing|ketik-closing-resume-browser|ketik-flow-chat|ketik-session-browser|ketik-settings-save-lifecycle)\.spec\.ts$' --reporter=line --workers=1 --trace on --max-failures=1`. Check the selection with `--list` first. `ketik-closing-resume-browser.spec.ts` and `ketik-session-browser.spec.ts` need `E2E_KETIK_LIVE=1` and a task-owned local Supabase stack. If you do not start one, report it as skipped; do not claim it.
- Gates: `TURBO_CONCURRENCY=1 pnpm typecheck`, `TURBO_CONCURRENCY=1 pnpm lint` (web has 74 legacy warnings; add none), `TURBO_CONCURRENCY=1 pnpm build`, scoped `eslint` and `prettier --check` on touched files, `git diff --check`, then `GRAPHIFY_MAX_WORKERS=1 graphify update .` once after the last batch.
- Logs under ignored `artifacts/ketik-client-residual-lifecycle/`.
- Each commit: a `CHANGELOG.md` entry under its date and a `Verified:` trailer listing what ran (use the `verify` / `push-ready` skills). Push to `main` is pre-authorized. A push can trigger the Railway auto-deploy; do not claim deploy or production status.

Acceptance: `rg -n "legacyPending|saveInFlightRef" apps/web/src/routes/ketik` returns nothing. Every new E2E passed on the baseline and after the change. Regression and gates are green, with exact commands and counts in the report.

## Out of scope (do not implement)

- **#3 `ketik_sessions.consumer_closed`:** the boolean next to `state` forms an implicit "closing" sub-state. Writes happen under the session row lock after an `active AND NOT consumer_closed` check, so there is no known race. Changing it is a Lane D migration and API contract change (`consumerClosed` in `KetikServerSession`). Leave it as legacy unless Fajar opens that task.
- **#4 R3 provider cancellation at the review deadline** (`apps/api/src/workers/ketik-review-worker-runtime.ts:360`): it needs `AbortSignal` plumbing through `review-processor.ts` and the provider clients, and it is Fajar's decision. It gets its own plan.
- Other refs in `useServerKetikChat.ts` (timers, pacing, idempotency key, mounted guard), `KetikScenariosTab.tsx` `pendingImageReads`, `ketik-review-worker-entrypoint.ts` `stopping`, and simple dialog/form toggles. These are resource handles, counters or UI state, not lifecycle phases.
