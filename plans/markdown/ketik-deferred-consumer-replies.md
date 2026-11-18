# KETIK deferred consumer replies

## Requirement

Publish generated consumer bubbles only at their reveal time. Persist agent sends immediately, restart the quiet window on a send, and regenerate at most once using the latest durable context. Preserve reload, expiry, finalization, lease fencing, and AI usage accounting. Realistic and training-fast quiet windows are 8 and 3 seconds respectively (floors 6 and 3 seconds), independent of consumer speed. A non-empty draft expires after 12 seconds without edits.

## Design

Hold the entire response batch on the server. Expose response status and typing metadata to its owner. Persist all bubbles together when the browser asks to reveal after pacing. Reload resumes pacing from the durable hold; ending the session copies only the published transcript. The first context mismatch consumes the one regeneration allowance. After that, publication is fenced against the latest version the browser paced for, while the original generation context version remains recorded. At expiry, retire a normal held response and request one goodbye. Lease fencing applies only during provider work.

Response payload storage and transition RPCs remain service-role only. Authenticated owners may read response metadata via existing RLS. Anonymous access is unchanged. Rollback discards unpublished replies. Published messages and existing history remain durable.

Use disposable Supabase project `ketik-held-reply-test-20261118` at loopback API/DB ports 55331/55332 with current canonical migrations and seeding disabled. Resolve local keys using `E2E_SUPABASE_WORKDIR`; stub provider responses in process. Run Playwright serially with retries zero.

## Tasklist

- [x] Re-check current ownership, transcript, expiry, and response-transition contracts with Graphify and live source.
- [x] Record focused browser and real-backend RED evidence.
- [x] Add the guarded reveal transition, paired rollback, shared contracts, typed endpoint and reducer-driven pacing.
- [x] Complete clean local replay, rollback round-trip, and final GREEN E2E.
- [x] Complete the Lane D checks and prepare the changelog and verification trailer for integration to main.

## Review

Graphify queries for `settle_ketik_session_response useServerKetikChat` and
`requestServerKetikResponse` confirmed the client/API dependency path. Live
source and migrations supplied the effective SQL definitions. The implementation
worker left the Graphify cache update to the integration owner.

Thermo-nuclear review removed the client-side hidden transcript and the separate
pause timer. The server keeps one pending response per session and one transition
function for status changes, including rollback. Reveal compares the agent
version and the regeneration count so replay of a first-attempt reveal cannot
publish the regenerated batch. The web hook is smaller than its baseline.
The migration and rollback preserve the existing RPC signatures and owner lock
order.

## Verification

The focused RED commands used one Playwright worker and the existing zero-retry
configs. Evidence is under the ignored local directory
`artifacts/ketik-held-reply/`.

- Browser RED: `pnpm --dir apps/web exec playwright test ketik-server-chat-pacing.spec.ts -g 'still typing a follow-up|a hurried consumer' --reporter=line --workers=1 --trace on --output="$PWD/artifacts/ketik-held-reply/browser-red"` exited 1. An 8-second draft pause triggered generation and the hurried consumer requested a response in 4,445 ms.
- API RED: `E2E_SUPABASE_WORKDIR="$PWD/scratch/ketik-held-reply-20261118" pnpm --dir apps/web exec playwright test ketik-session-api-turns.spec.ts --config=playwright.api.config.ts --project=ketik-session-real-backend -g 'held responses stay outside' --reporter=line --workers=1 --trace on --output="$PWD/artifacts/ketik-held-reply/api-red"` exited 1. The real transcript already contained two consumer bubbles after `respond`.

The following commands exited 0. The API run passed all 32 selected KETIK tests,
including clean-data ownership, reveal fencing, usage accounting, lease expiry,
closing, history, and rollback/reapply. The historical-attachment test needs
the Storage runtime, which this disposable stack excludes.

```bash
export E2E_SUPABASE_WORKDIR="$PWD/scratch/ketik-held-reply-20261118"
export E2E_KETIK_LIVE=1
supabase db reset --local --workdir "$E2E_SUPABASE_WORKDIR"
pnpm --dir apps/web exec playwright test '(^|/)(ketik-session-api-(turns|transitions|lifecycle|integrity)|ketik-consumer-close-api)\.spec\.ts$' --config=playwright.api.config.ts --project=ketik-session-real-backend --project=ketik-consumer-close-real-backend --grep-invert 'historical attachments use' --reporter=line --workers=1 --max-failures=1 --trace on --output="$PWD/artifacts/ketik-held-reply/api-ketik"
```

The optional global catalog run added `--project=db-guard-real-backend` and the
`exposed-function-guard-api` filter. It exited 1 after the 32 KETIK tests passed
because the existing global allowlist excludes `ai_model_policy_set` and
`ai_model_policy_reset`, both service-role-only since baseline migration
`20261114121440`. The new reveal RPC was already recognized by the guard, and
local catalog readback reported EXECUTE as false for anon and authenticated and
true for service role.

The browser command below exited 0 with **24 passed**, including the
real-JWT reload of a held closing reply, the restarted realistic quiet windows,
and regression coverage for chat start, expiry, and legacy recovery.

```bash
E2E_KETIK_LIVE=1 E2E_SUPABASE_WORKDIR="$PWD/scratch/ketik-held-reply-20261118" pnpm --dir apps/web exec playwright test '(^|/)ketik-(server-chat-(pacing|start|turns)|closing-resume-browser)\.spec\.ts$' --reporter=line --workers=1 --max-failures=1 --trace on --output="$PWD/artifacts/ketik-held-reply/browser-final"
```

`supabase stop --workdir "$E2E_SUPABASE_WORKDIR"` stopped the disposable stack
with exit 0. Root `pnpm typecheck`, `pnpm lint`, `pnpm build`, and
`git diff --check` ran sequentially and each exited 0. Root lint reported
baseline warnings and zero errors. The production migration was applied on 2026-11-18 at 05:16 UTC (see docs/deployment.md).
