# E2E mocked-auth contract: retire the unrunnable `e2e-p0-p1` spec

## Requirement

Stop the web E2E suite from shipping a spec that can never pass, and make the
mocked-auth helper state its real contract so the same trap is not recreated.

`apps/web/e2e/e2e-p0-p1.spec.ts` combined `mockSupabaseAuth()` — which only makes
the app _believe_ it is logged in — with calls to the real `/api` backend, which
authenticates every request. Those two cannot both hold.

Required outcome:

- the structurally impossible spec is gone, not left failing and not marked
  `skip` to hide it;
- `mockSupabaseAuth` documents that it is UI-only and that a real `/api` token
  comes from the loopback backend helper;
- the gap left behind is recorded with a concrete recipe so Wave 1 can close it.

Out of scope:

- production code, especially `apps/api` auth. Adding a dev/test auth bypass was
  considered and **rejected** (see Design);
- re-authoring the deleted spec's full Profiler flow — that belongs to
  `plans/025-...` spec #5 (`apps/web/e2e/profiler.spec.ts`).

## Evidence

Root cause, proven with commands (not inferred from reading code):

```
curl -sS -o /tmp/p.txt -w "%{http_code}" -H "Authorization: Bearer live-test-token" \
  http://localhost:3001/api/v1/profiler/years      # → 401
cat /tmp/p.txt
# {"success":false,"error":{"code":"INVALID_TOKEN","message":"Invalid token"}}
```

`"live-test-token"` is exactly the `access_token` that
`apps/web/e2e/helpers/mockAuth.ts` injects, and
`apps/api/src/middleware/auth.ts:41` validates every bearer token with
`supabaseAdmin.auth.getUser(token)` with no bypass.

The regression was introduced by `a8d1f31` (2026-08-23, "fix deleted email, add
mockAuth helper and magic link flow"), which swapped the spec's real login for the
mock:

```
- await page.fill('input[name="email"]', "rina.wijaya@bankmuamalat.co.id");
- await page.fill('input[name="password"]', "password123");
+ await mockSupabaseAuth(page, { email: "trainer.visual@trainers.local", ... });
```

So the spec has produced zero real coverage since that commit; it cost runtime and
reported a failure nobody acted on.

An attempted hermetic replacement was written and **failed twice** (direct
`/dashboard` and the original `landing → dashboard` order): the app ends up on the
public landing page. The guard at `apps/web/src/router.tsx:569` reads
`supabase.auth.getSession()`, so the mocked session does pass the first check, but
the app then signs out — supabase-js attempts a token refresh against the
**unmocked** `POST /auth/v1/token` on the remote project. Reproducing it requires
mocking the auth bootstrap _and_ installing a fail-closed network guard; that is a
separate, properly-scoped piece of work, so the half-verified replacement was
deleted rather than shipped.

## Design

Decisions:

- **Rejected — API dev/test auth bypass.** Accepting a fixed test token when not
  in production would put an authentication bypass in production code to make a
  test convenient. It contradicts the repository rule against trading
  security/auth evidence for a shorter loop, and one mis-set environment variable
  becomes an auth hole.
- **Chosen — retire the spec and state the contract.** The spec's coverage is
  already zero, and the two legitimate patterns already exist in the repository.
- **Keep the contract in the helper, next to the code that people reach for.**
  `mockSupabaseAuth` now documents: UI-only token, the two mocked endpoints, the
  proven `401 INVALID_TOKEN`, and the two sanctioned alternatives.

Sanctioned patterns, for reference:

| Pattern                                   | Helper                                                                     | Requires                                   |
| ----------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| Hermetic: mock every `/api` the page uses | `helpers/sidakTemuanDatesHarness.ts`, `helpers/sidakAgentReportFixture.ts` | nothing                                    |
| Real backend: real JWT, real routers      | `helpers/sidakRealBackend.ts` (`readLoopbackEnv` → `createUserWithJwt`)    | `apps/api/.env.integration`, loopback only |

Deferred work: **done.** `apps/web/e2e/helpers/hermeticShell.ts` implements the three points below, and `apps/web/e2e/authenticated-shell.spec.ts` uses it (1 passed). `mockSupabaseAuth` also mocks `POST /auth/v1/token` now, so a mocked session no longer signs itself out mid-bootstrap.

## Tasklist

- [x] Prove the root cause with a live probe against `apps/api` (401 `INVALID_TOKEN`).
- [x] Identify when it broke (`a8d1f31` swapped real login for the mock).
- [x] Document the `mockSupabaseAuth` contract in `apps/web/e2e/helpers/mockAuth.ts`.
- [x] Add the `POST /auth/v1/token` mock so a mocked session no longer signs itself out during bootstrap.
- [x] Build the hermetic authenticated-shell spec on a fail-closed harness (`helpers/hermeticShell.ts` + `e2e/authenticated-shell.spec.ts`).
- [x] Delete `apps/web/e2e/e2e-p0-p1.spec.ts` and confirm no dangling references.
- [x] Delete the unverified hermetic replacement instead of shipping it.
- [x] Restore browser-level Profiler coverage in `apps/web/e2e/profiler.spec.ts` (workspace render + team → batch), hermetic.

## Verification

```bash
git grep -n "e2e-p0-p1" -- . ':!plans' ':!docs/rebuild-logs'   # no live references
pnpm --filter @trainers/web typecheck
pnpm --filter @trainers/web exec eslint apps/web/e2e/helpers/mockAuth.ts
git diff --check
```

## Scope guard

Do not add an auth bypass to `apps/api`. Do not point any E2E at the remote
Supabase project. Do not re-add a spec that calls `/api` while using
`mockSupabaseAuth`. Do not commit or push.
