# KETIK explicit client lifecycles

## Requirement

Replace the implicit frontend chat, session-page, and review lifecycles identified in the read-only audit with explicit status unions and centralized reducer transitions. Lane C: frontend-only, existing API/authorization/billing contracts unchanged. Preserve concurrent durable agent appends while the consumer responds, pacing/reveal, expiry/goodbye, legacy resume, manual retry/idempotency, finish recovery, and old results after failed review reruns.

## Design

- Chat: one reducer owns independent append and response status regions (they intentionally run concurrently), displayed messages/queue count, and session phase. No separate busy/blocked/loading/typing flags. A synchronous reducer snapshot serves scheduler/reentrancy guards; React uses the same transition function. Refs remain for queue data, server snapshots, request IDs, timers, mount cleanup, and pacing only. Failed resumed responses stay blocked until explicit retry or new durable agent context. Recovery distinguishes polling from provider retry.
- Session page: discriminated union for home/subject selection/starting/resuming/resume failure/chat/finishing/telaah. Derive UI loading/errors from status, centralize state changes; URL remains navigation source of truth. Scope async completions to the owning operation/account; a failed finish keeps the same chat.
- Review: reducer centralizes named events for reset, queue/poll, result loading/success/failure and rerun limits. Discriminated phase union prevents ready without results and failed without failure kind. Preserve run fencing and polling truthfulness.
- No dependencies, migrations, backend changes, visual redesign, new provider calls, or remote operations.

## Tasklist

- [x] Inspect source, callers, shared types, relevant E2E, safe Playwright config; Graphify queries confirm hook callers.
- [x] Add focused browser E2E for failed response resume/manual retry and confirm RED.
- [x] Implement explicit chat reducer and lifecycle recovery.
- [x] Replace page and review lifecycle writes with reducer events.
- [x] Run focused and relevant hermetic KETIK E2E serially with trace artifacts.
- [x] Run web/root typecheck, lint, build serially; thermo-nuclear review; graphify update; diff check.
- [x] Update canonical docs/changelog; ready to commit/push owned files after passing gates.

## Verification

All browser specs use the canonical webServer env: Supabase/Telefun/API proxy on loopback discard port 9, no production service or provider. No inherited VITE/E2E/Playwright overrides were present at intake. Hermetic mocks intercept all business requests and reject egress.

Commands: `pnpm --dir apps/web exec playwright test ketik-server-chat-turns.spec.ts -g "failed response resumes" --reporter=line --workers=1 --trace on`; then relevant `ketik-server-chat-`, `ketik-flow-`, and `ketik-review-worker-browser.spec.ts` specs; `pnpm typecheck`; `pnpm lint`; `pnpm build`; `git diff --check`. Logs/artifacts under ignored `artifacts/` and `apps/web/test-results/`. No unit tests.

## Evidence and review

- RED chat: focused `failed response resumes` test exited 1: reopening a failed response unexpectedly called `/respond` before manual retry (`red.log`). GREEN exited 0 (`green-chat.log`).
- Additional browser recovery coverage: status/network failure retries GET without AI, concurrent append/response failures retain append retry and its UUID, resume/finish failure preserves the chat until explicit success (`recovery.log`: 3 passed).
- Full scoped regression: `pnpm --dir apps/web exec playwright test ketik-client-lifecycle.spec.ts ketik-server-chat-turns.spec.ts ketik-server-chat-pacing.spec.ts ketik-server-chat-start.spec.ts ketik-flow-landing.spec.ts ketik-flow-chat.spec.ts ketik-flow-telaah-rerun.spec.ts ketik-review-worker-browser.spec.ts --reporter=line --workers=1 --trace on --max-failures=1`: exit 0, 64 passed (`final-e2e.log`).
- Self-review found another lifecycle race: an enqueue failure arriving after polling confirmed a completed result still displayed a failure alert. Focused `late enqueue failure` E2E confirmed RED exit 1 (`red-review.log`); scoping enqueue callbacks to the still-pending request fixed it, GREEN exit 0 (`green-review.log`). Same guard also prevents stale queued acknowledgements from changing completed parent history state.
- After that final review fix, reran both owning review suites: `pnpm --dir apps/web exec playwright test ketik-review-worker-browser.spec.ts ketik-flow-telaah-rerun.spec.ts --reporter=line --workers=1 --trace on --max-failures=1`: exit 0, 16 passed (`final-review-e2e.log`). Total distinct scenarios verified: 65; not one combined 65-test run.
- Final `TURBO_CONCURRENCY=1 pnpm typecheck`, `TURBO_CONCURRENCY=1 pnpm lint`, and `TURBO_CONCURRENCY=1 pnpm build`: each exit 0 (`*-final.log`). Typecheck includes web E2E types. Other workspaces used Turbo cache; changed web workspace executed. Root web lint reports 74 existing warnings in untouched files, no errors. Scoped ESLint for all nine changed runtime/test files: exit 0, no warnings (`scoped-lint.log`).
- `GRAPHIFY_MAX_WORKERS=1 graphify update .`: exit 0, one AST worker, local ignored graph only (`graphify.log`). No Context7 needed: no external API or dependency changes.
- `git diff --check`: exit 0. All logs live in ignored `artifacts/ketik-lifecycle/`; latest traces/screenshots in ignored `apps/web/test-results/`. RED review trace retained at `artifacts/ketik-lifecycle/red-review-trace.zip`.
- Thermo-nuclear self-review: PASS after the enqueue race repair; no independent/delegated review claimed. Checked reducer transitions, concurrent status regions, retry identity, cleanup, account/operation fencing, parent review updates, error priority, URL transitions, complete owned diff, and scope. No product redesign, backend/RLS/schema/billing changes or real provider/production verification. Other KETIK settings/history/assignment lifecycles and backend transition consolidation are outside this three-lifecycle task.

Unrelated untracked plans at intake: cloudflare-security-audit-partial-2026-11-04.md, sidak-temuan-row-cache.md, supabase-egress-reduction.md. Preserve untouched.
