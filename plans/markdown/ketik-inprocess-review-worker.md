# KETIK in-process review worker

- **Status:** approved by Fajar 2026-10-17 ("jalankan dalam API seperti Telefun"; no standalone Railway service, to save a service).
- **Lane:** C (backend runtime behavior, cross-file; no schema, RLS or API-contract change).
- **Precedent:** `docs/rebuild-logs/phase-215-telefun-inprocess-scoring-worker.md` (Telefun scoring worker moved into `api-runtime.ts`).

## Requirement

The KETIK review worker (`createKetikReviewWorker`) only ran as a standalone process
(`start:ketik-review-worker`). Prod has no such service, so manual review requests queue
forever. Run the same worker inside the API process instead.

- `KETIK_REVIEW_WORKER_ENABLED=true` starts exactly one embedded worker after HTTP listen.
- Unset/other value: the API runs normally, logs `ketik_review_worker.disabled`, claims nothing.
- Enabled with invalid interval/shutdown/health-port config: the API refuses to start (exit 1) before accepting traffic, like Telefun.
- SIGTERM/SIGINT: stop admission, wait for/fence the active claim (existing worker shutdown), then close HTTP. A deferred-recovery shutdown sets exit code 1.
- No health server in embedded mode: the loopback health port is unreachable on Railway and must not be public. Lifecycle is visible through the existing JSON log events.
- The standalone entrypoint stays as a fallback. Both may run at once safely: claims are `SKIP LOCKED` and lease-token fenced.

## Design

- `ketik-review-worker-runtime.ts`: add `startEmbeddedKetikReviewWorker({ env, log })` mirroring `startEmbeddedTelefunScoringWorker`, reusing `parseKetikWorkerConfig` and `createKetikReviewWorker`. Config is parsed before listen.
- `api-runtime.ts`: parse KETIK config before listen, start after listen, shut both workers down in parallel before HTTP close.

## Verification (E2E)

`ketik-review-worker-api.spec.ts` runs a second Playwright project,
`ketik-review-worker-embedded-real-backend`, that spawns the real API entrypoint
(`apps/api/src/index.ts`, `PORT=0`) instead of the standalone worker, with the same
loopback DB and provider transport. All lifecycle tests (claim once, SIGKILL reclaim,
SIGTERM fencing, lease loss, rerun rollback) run in both modes. The standalone-only
config/health tests have embedded equivalents: disabled flag keeps jobs queued with zero
provider calls; invalid config exits 1 before the API listens. The loopback health test
runs in standalone mode only.

## Rollout (needs Fajar)

1. Merge; the API deploys with the worker disabled (flag unset), no behavior change.
2. Set `KETIK_REVIEW_WORKER_ENABLED=true` on the Railway API service; redeploy.
3. Log shows `ketik_review_worker.started` (embedded); one authorized test review completes.
4. Rollback: unset the flag and redeploy.

## Tasklist

- [x] RED: embedded project failed 8/14 (API never started the worker; SIGTERM never exited).
- [x] Implement embedded start/shutdown; fix two leaked ref timers (rate-limit sweep interval, Gemini timeout) and exit the API entrypoint after graceful shutdown.
- [x] GREEN: embedded 13 passed + 1 skipped (standalone-only health), standalone 14, guard 4, usage 2; api/web tsc and api build exit 0.
- [x] Docs: deployment.md, architecture.md, e2e-testing.md.
