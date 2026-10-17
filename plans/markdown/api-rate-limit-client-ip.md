# API rate limit — trusted client IP

- **Status:** Implemented on `claude/project-thread-8hrwo8`, pending review.
- **Risk lane:** Lane D (security: request throttling at the public API boundary).
- **Requested by:** Fajar, 2026-10-17 (project thread "Pelajari isi aplikasi Trainers SuperApp", item 1).

## Requirement

The API's per-IP limiter (`rateLimitMiddleware`, 200 requests/minute on `/api/v1/*`) and the unauthenticated fallback of `aiRateLimitMiddleware` keyed the bucket on the **leftmost** `X-Forwarded-For` entry. That entry is whatever the caller sent. Railway's edge appends the real peer address on the right (Railway staff: "the right most value of the `X-Forwarded-For` header is trustworthy"), so a caller rotating a fake leftmost value got a fresh bucket on every request:

- the limit could be bypassed entirely;
- each fake value created a new map entry, so a flood could grow process memory until the 60-second sweep.

Acceptance:

1. Requests that share the same rightmost `X-Forwarded-For` hop share one bucket, whatever they prepend; request 201 inside the window returns `429 RATE_LIMITED`.
2. Different real clients (different rightmost hop) keep separate buckets.
3. A single-value header (local dev, existing API E2E helpers) behaves as before.

## Design

- One helper, `resolveClientIp(c)` in `apps/api/src/middleware/rateLimit.ts`, returns the rightmost non-empty `X-Forwarded-For` hop, capped at 64 characters, or `"local"` when absent. Both limiters use it.
- `X-Real-IP` is not consulted: the rightmost forwarded hop is the documented trustworthy value under both Railway behaviours (overwrite or append), so a second header adds trust surface without adding information.
- Out of scope (follow-up): the limiter is still in-memory per process. That is correct for the current single API replica; scaling the API horizontally needs a shared store (the Telefun DB-backed limiter is the existing pattern).

## Tasklist

- [x] RED: `apps/web/e2e/rate-limit-client-ip-api.spec.ts` against the real API app (env pinned to an unreachable loopback, fetch guard on).
- [x] GREEN: `resolveClientIp` in both limiters.
- [x] thermo-nuclear review, API typecheck/lint, root build.
