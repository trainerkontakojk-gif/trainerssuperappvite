# KETIK: remove the last implicit state machines (scenario editor, `consumer_closed`)

Status: **planned, not started** (2026-11-17). Executor: Codex worker (gpt-6.1-terra, xhigh). Baseline: HEAD `127b92cb` on `main`.
Source: read-only audit of 2026-11-17. Fajar reopened two residuals that `ketik-client-residual-lifecycle-state.md` ("Out of scope") had left as legacy.

## Requirement

Two places in KETIK still hold a lifecycle in loose pieces instead of one explicit status with transitions in one place (AGENTS.md, "No new implicit state machines"). Fix each one **without changing observable behavior, HTTP contracts, RPC signatures or RPC JSON**.

| ID  | Where                                                                               | Residual                                                                                                                                                                                                                                                                          | Lane |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| W1  | `apps/web/src/routes/ketik/components/settings/KetikScenariosTab.tsx`               | The scenario editor's image-read lifecycle (editor generation, pending reads, "may save") is spread over `editorGenerationRef`, `pendingImageReadsRef`, the `pendingImageReads` state mirror of that ref, and hand-written `beginEditor`/`closeEditor` resets                     | C    |
| W2  | `supabase/migrations/20261116160000_ketik_session_status_transitions.sql` (current) | `ketik_sessions.consumer_closed` is a lifecycle flag (`active` → consumer said goodbye) written outside `transition_ketik_session_status`: `publish_ketik_session_turn` (`:285`) and `settle_ketik_session_response` (`:488`), with no expected-state guard on that UPDATE itself | D    |

Load `trainers-superapp-tdd` before editing anything. For W2 also load `supabase-migration`. Run `thermo-nuclear` on each diff before final verification. One commit per workstream (W1, then W2). Do not touch the three untracked plans you do not own (`cloudflare-security-audit-partial-2026-11-04.md`, `sidak-temuan-row-cache.md`, `supabase-egress-reduction.md`).

Both are behavior-preserving refactors, so there is no product defect to turn RED. Each new E2E is a **characterization test**: it must pass on the baseline before you change product code, and still pass afterwards. Record both runs. Do not claim a RED you did not observe. If a characterization test fails on the baseline, you found a real defect: stop, keep the log and trace, and report before changing product code.

### Explicitly not in scope

- Refs in `useServerKetikChat.ts` (`responseTimer`, `pause`, `agentDraft`, `closingAttempts`, `responseRequestId`, `queued`, `read`, `hidden`, `slow`, `mounted`). On review these are timer handles, pacing data, idempotency keys and a retry counter. The response lifecycle itself is already the `chatLifecycle.ts` union. Do not change them.
- `apps/web/src/hooks/useCrudForm.ts` and `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx`. PDKT has the same pattern, but it is another module; note it in the report only.
- Renaming or retyping `consumer_closed` / `consumerClosed` (`packages/types`, `server-sessions.ts:51,143,155`). That would be an API contract change. W2 keeps the column and the JSON as they are.
- Any remote Supabase action. The W2 migration is local only. Applying it to production needs Fajar's explicit authorization afterwards.

## Verified facts (drift-check against HEAD before editing)

### W1: scenario editor image reads

- `KetikScenariosTab.tsx:46–56`: `isNewCategoryInput`, `newScenarioCategory`, `isScenarioScriptEnabled` (form fields, out of scope), `pendingImageReads` state, `pendingConfirm`, `query`, `categoryFilter`, `editorGenerationRef`, `pendingImageReadsRef`.
- `:58–69`: `beginEditor()` bumps the generation and zeroes pending reads; `closeEditor()` does the same and then calls `scenarioForm.close()`. The unmount effect (`:71–75`) bumps the generation.
- `:150–164`: `handleAddClick` / `handleEditClick` call `beginEditor()` then `scenarioForm.openAdd()` / `openEdit()`.
- `:166–194`: `handleSaveScenario` returns early while `pendingImageReads > 0`, otherwise saves and calls `closeEditor()`. Discard and delete confirmations also end in `closeEditor()` (`:108`, `:114`).
- `:196–247`: `handleImageUpload` captures `readGeneration` and `scenarioForm.getDraftGeneration()`. Files over 500 KB are refused with a toast and never count as pending. Each accepted file increments the ref and the mirror. A per-reader `settled` flag makes `finishRead` run once. `finishRead` decrements only when the editor generation still matches. `isCurrentEditor()` also requires the same draft generation and `scenarioForm.isOpen`. A stale read is dropped silently. A read error on the current editor shows "Gagal membaca file …".
- `:437` shows a pending indicator while `pendingImageReads > 0`. `:501` disables the save button while `pendingImageReads > 0`.
- No existing E2E covers the KETIK scenario image upload. `apps/web/e2e/lifecycle-ui-recovery.spec.ts:153` uses `setInputFiles` in a settings dialog and can serve as a harness reference.

### W2: `consumer_closed`

- `transition_ketik_session_status` (`20261116160000…sql:8`) already refuses `turn_reclaim` (`:65`), `response_claim` (`:98`) and `response_retry` (`:111`) unless `s.state = 'active' AND NOT s.consumer_closed`. `claim_ketik_session_turn` (`:210`) and `claim_ketik_session_response` (`:359`) refuse the same way. So the flag only ever moves `false → true` today. That invariant is implicit.
- `publish_ketik_session_turn` (`:274–287`): after `transition(…,'turn_publish',…)`, `UPDATE … SET messages=…, version=version+1, consumer_closed=p_closed`.
- `settle_ketik_session_response` (`:429–493`): after `transition(…,'response_publish',…)`, `UPDATE … SET messages=…, version=version+1, consumer_closed = p_closed OR expires_at <= clock_timestamp()`.
- No migration after `20261116170000_ketik_review_job_transitions.sql` touches KETIK. Rollback convention: `supabase/rollbacks/rollback_<migration name>.sql`. See `rollback_20261116160000_ketik_session_status_transitions.sql` for the style.
- E2E that exercise closing: `ketik-session-api-transitions.spec.ts`, `ketik-session-api-lifecycle.spec.ts`, `ketik-closing-resume-browser.spec.ts`, `ketik-remaining-lifecycle.spec.ts` (check which need `E2E_KETIK_LIVE=1` and a local Supabase stack).

## Design

### W1

Make one reducer own the editor's image-read lifecycle.

- Add a small pure reducer in a new file next to the tab (for example `components/settings/scenarioEditorLifecycle.ts`). State: `{ status: "closed"; generation: number } | { status: "open"; generation: number; pendingReads: number }`. Events: `open`, `read-start` (carries `generation`), `read-finish` (carries `generation`), `close`, `dispose`. `read-start`/`read-finish` with a stale generation, or while closed, return the state unchanged. `pendingReads` never goes below 0. `open` and `close` bump the generation.
- Use the synchronous-snapshot pattern already in `useServerKetikChat.ts:171–177`: a `lifecycle` ref updated by a `transition` helper that runs the same pure reducer before `dispatch`. FileReader callbacks read the snapshot, not React state. That ref is the only allowed copy. Delete `editorGenerationRef`, `pendingImageReadsRef` and the `pendingImageReads` `useState`.
- `beginEditor`/`closeEditor` become `transition({type:"open"})` / `transition({type:"close"})` followed by the existing `scenarioForm` calls. The unmount effect dispatches `dispose`.
- The save guard, the pending indicator (`:437`) and the disabled save button (`:501`) derive from the reducer state (`status === "open" && pendingReads > 0`).
- Keep the per-reader `settled` flag (it makes one FileReader settle once, which is idempotency, not a phase), the 500 KB refusal, the `scenarioForm.getDraftGeneration()` / `scenarioForm.isOpen` checks, and every toast string.

Must not change: refused oversized files never lock save; a read that finishes after the editor closed or reopened neither adds its image nor changes the new editor's pending count; a read error on the current editor shows the toast and unlocks save; all labels and copy.

### W2

Move the `consumer_closed` write into the transition function as a named, guarded event. Keep every RPC signature and the JSON they return.

- New migration `supabase/migrations/<timestamp after 20261116170000>_ketik_consumer_close_transition.sql`, `BEGIN; … COMMIT;`, `CREATE OR REPLACE` only.
- `transition_ketik_session_status`: add event `consumer_close` that runs `UPDATE public.ketik_sessions SET consumer_closed = true WHERE id = s.id AND state = 'active' AND NOT consumer_closed` and returns whether a row changed. Keep the closed-event `CASE` and error codes as they are. Copy the current function body exactly and add only this branch.
- `publish_ketik_session_turn` and `settle_ketik_session_response`: their `UPDATE` stops writing `consumer_closed`. Right after it, when the old expression was true (`p_closed` for the turn; `p_closed OR s.expires_at <= clock_timestamp()` for the response), `PERFORM transition(…,'consumer_close')` and re-read `s` so the returned JSON is unchanged. Everything stays in the same transaction under the same session row lock.
- Paired rollback `supabase/rollbacks/rollback_<new migration name>.sql` restores the three function bodies from `20261116160000`.
- Update the "KETIK backend chat lifecycle" bullet in `docs/architecture.md` (around `:246`): `consumer_closed` changes only through `transition_ketik_session_status` event `consumer_close`, which moves it `false → true` once.

Must not change: what the consumer's last word is after expiry; claim/reclaim/retry refusals after close; `consumerClosed` in the API response; RPC grants (service-role only, SECURITY INVOKER, `search_path`). Check that grants/`REVOKE` lines survive `CREATE OR REPLACE`, the way the `20261116160000` migration handles them.

## Tasks

### W1 (commit 1)

- [ ] Drift-check the W1 facts. If the code differs materially, stop and report.
- [ ] Add a hermetic browser E2E (new `apps/web/e2e/ketik-scenario-editor-lifecycle.spec.ts`, mocked API, same hermetic helpers as the existing KETIK settings specs). Minimum scenarios:
  1. Add a scenario, upload one small image: the preview appears, save is enabled, and the settings `PUT` body carries the image data URL.
  2. Upload a file over 500 KB: the toast appears and save stays enabled. No image is added.
  3. Hold a read deterministically (for example an `addInitScript` FileReader wrapper whose `onloadend` waits for a window-controlled gate; no sleeps): while it is held, the pending indicator shows and save is disabled. Cancel the editor, open a new one, then release the gate: the new editor shows no image and save is enabled.
- [ ] Run it on the **unchanged** tab. Expected: pass. Then implement the W1 design and rerun it, then run the regression set.
- [ ] `thermo-nuclear` review; fix material findings.

### W2 (commit 2)

- [ ] Drift-check the W2 facts.
- [ ] Add or extend a real-backend E2E against the task-owned **local** Supabase stack (`E2E_KETIK_LIVE=1`), for example in `ketik-session-api-transitions.spec.ts`. It must prove: (a) a consumer reply marked closed sets `consumerClosed: true` and later turn/response claims are refused; (b) a reply published after expiry sets `consumerClosed: true`; (c) one transition call with `consumer_close` on an already closed session changes nothing and returns false. (c) is a direct RPC call through the existing service-role harness; if the harness cannot call RPCs, say so and propose the smallest alternative before writing a non-E2E test (AGENTS.md).
- [ ] Run (a)/(b) on the baseline schema. Expected: pass. (c) needs the new event, so it is the only RED you may report: run it before the migration and record the failure.
- [ ] Write the migration and rollback. Reset the local DB (`supabase db reset` against the local stack only) for a clean replay. Rerun the W2 E2E, then apply the rollback locally and confirm it applies cleanly, then re-apply the migration.
- [ ] Update `docs/architecture.md`.
- [ ] `thermo-nuclear` review; fix material findings.

## Verification

Run commands serially, one Playwright run at a time (`.claude/hooks/one-test-run.sh`). `retries: 0`; never rerun to get green. The same failure after three fix rounds → stop and report (`docs/AGENT_WORKFLOW.md` §7).

- Focused W1: `pnpm --dir apps/web exec playwright test '(^|/)ketik-scenario-editor-lifecycle\.spec\.ts$' --reporter=line --workers=1 --trace on --max-failures=1`
- Regression W1: add `ketik-settings-save-lifecycle` and `lifecycle-ui-recovery` to the focused selection. Check the selection with `--list` first.
- Focused W2: the spec you extended, with `E2E_KETIK_LIVE=1` against the local stack.
- Regression W2: `ketik-session-api-lifecycle`, `ketik-session-api-transitions`, `ketik-session-api-turns`, `ketik-session-api-integrity`, `ketik-closing-resume-browser`, `ketik-remaining-lifecycle`, `ketik-server-chat-turns`, all with the local stack. If you do not start one, report those specs as skipped; do not claim them.
- Gates: `TURBO_CONCURRENCY=1 pnpm typecheck`, `TURBO_CONCURRENCY=1 pnpm lint` (add no warnings), `TURBO_CONCURRENCY=1 pnpm build`, scoped `eslint` and `prettier --check` on touched files, `git diff --check`, then `GRAPHIFY_MAX_WORKERS=1 graphify update .` once after the last batch.
- Logs under ignored `artifacts/ketik-remaining-implicit-state/`.
- Each commit: a `CHANGELOG.md` entry under its date and a `Verified:` trailer listing what ran (`verify` / `push-ready` skills). Push to `main` is pre-authorized. A push can trigger the Railway auto-deploy. W2's API code does not change, so deploy order is safe. Do not claim deploy or production status. Do not apply the migration to any remote project.

Acceptance: `rg -n "editorGenerationRef|pendingImageReadsRef" apps/web/src/routes/ketik` returns nothing. In the newest migration, `consumer_closed` is written only inside `transition_ketik_session_status`. Every characterization E2E passed on the baseline and after the change. The regression set and gates are green, with exact commands and counts in the report.

## Execution log

- (executor appends here)
