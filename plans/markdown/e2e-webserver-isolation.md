# E2E webServer isolation

- **Status:** Approved by Fajar 2026-10-10: full isolation, no server reuse. T1–T4 done 2026-10-10.
- **Lane:** C (test infrastructure across config and helpers; no product runtime change).

## Requirement

The default browser config `apps/web/playwright.config.ts` must never reach production.

Today it does:

1. `webServer.command` is the root `pnpm dev` (Turbo), which starts web, API and Telefun with the root `.env`/`.env.local`. Those point at the production Supabase project `ruosnjmtywcrghjgqugz` with the service-role key.
2. Booting the API starts `startPdktMailboxSubjectIntentCleanup()` (`apps/api/src/api-runtime.ts:73`), which calls the `cleanup_pdkt_mailbox_subject_intents` RPC. Under the production env, every E2E run that boots the stack deletes production rows. If `TELEFUN_SCORING_WORKER_ENABLED=true`, the scoring worker claims production jobs too.
3. The browser bundle is built with the production `VITE_SUPABASE_URL` and `VITE_TELEFUN_WS_URL`. Specs mock the auth paths they know, but any request that is not mocked reaches production.
4. `reuseExistingServer: !process.env.CI` silently reuses whatever listens on `:3005`, including a developer's `pnpm dev` running with production env.

No browser spec needs the real API or Telefun process: every spec either mocks `/api` (hermetic harnesses) or forwards `/api` to the in-process Hono app with `page.route` (`sidakRealBackend`). Only the Vite dev server is needed.

**Acceptance:**

- The default config and `playwright.access-web.config.ts` start only the web Vite dev server, with E2E env that points Supabase and Telefun at a dead loopback port.
- They never reuse an existing server; an occupied `:3005` fails the run.
- A focused E2E proves the served bundle env is the E2E env and that loading the app sends no request to a non-loopback Supabase or Telefun host.
- The full browser suite passes under the new config, compared with the baseline on `main`.

## Design

- **One source of truth:** `apps/web/e2e/helpers/e2eTargets.ts` exports `E2E_SUPABASE_URL = "http://127.0.0.1:9"` (TCP discard port: nothing listens, so a leaked request fails fast), the derived `E2E_SUPABASE_STORAGE_KEY` (`sb-127-auth-token`, the supabase-js `sb-<first host label>-auth-token` rule), `E2E_TELEFUN_WS_URL = "ws://127.0.0.1:9"`, and `E2E_WEB_SERVER_ENV` (all five `VITE_*` keys: Supabase URL, anon key placeholder, Telefun WS URL, `VITE_APP_URL = http://localhost:3005`, `VITE_API_URL = ""` so the app uses the `/api/v1` proxy).
- Vite gives existing `process.env` values priority over `.env` files, so `webServer.env` overrides the root `.env`/`.env.local` without touching them.
- **Configs:** `webServer.command = "pnpm --filter @trainers/web dev --host 127.0.0.1 --strictPort"` (already proven in `playwright.access-web.config.ts`), `env: E2E_WEB_SERVER_ENV`, `reuseExistingServer: false`.
- **Helpers/specs:** the 11 hardcoded production origins and storage key in `mockAuth.ts`, `hermeticShell.ts`, six SIDAK harnesses/fixtures, `sidak-heatmap.spec.ts` and `sidak-reports-data.spec.ts` import the constants instead.
- API-only configs (`playwright.api.config.ts`, `playwright.access-api.config.ts`) have no webServer and are unchanged.

## Tasklist

- [x] **T1 RED:** Done 2026-10-10: both tests failed against a manually started web-only Vite with the root env (served `VITE_SUPABASE_URL` = production; boot refresh went to `<ref>.supabase.co/auth/v1/token`, aborted by the spec). Original task: `apps/web/e2e/e2e-target-isolation.spec.ts`. Run it against a manually started web-only Vite (current env) with the current config; never let the current config start root `pnpm dev`. Expect failure: production Supabase URL in the served env.
- [x] **T2 GREEN:** Done: focused spec 2 passed; no listener left on :3001/:3002/:3005 after the run; an occupied :3005 fails the run (`http://localhost:3005 is already used`); `tsc -p tsconfig.e2e.json` exit 0. Original task: `e2eTargets.ts`, both configs, the 11 constants. Focused spec passes.
- [x] **T3 Regression:** Done: 601 passed, 3 skipped, 2 failed (19.1 min). Both failures are unrelated to this change: `accessibility.spec.ts` (landing-page color contrast, product CSS) and `access-scope-api.spec.ts:118` (401; passes 10/10 alone, fails only after `access-matrix-api.spec.ts` stubs the API Supabase env in the same worker — the reason `playwright.api.config.ts` splits projects). A `main` baseline was not run: the old config would start root `pnpm dev` against production. Original task: full browser suite (`playwright.config.ts`) once, one run at a time; compare failures with the `main` baseline.
- [x] **T4:** Done: self-review (Lane C test infra, no runtime change), docs updated (`docs/e2e-testing.md`, `docs/README.md`, `docs/AGENT_WORKFLOW.md`), `git diff --check` exit 0, Prettier clean on new files. Original task: thermo-nuclear review; update `docs/e2e-testing.md`; `git diff --check`.

## Follow-ups (out of scope)

- [x] Done 2026-10-10: the browser config sets `testIgnore: "**/*-api.spec.ts"` (607 → 439 listed tests). `sidak-temuan-dates-api.spec.ts` ran only under the browser config, so it moved to its own project in `playwright.api.config.ts`. Original note: the default config also matches `*-api.spec.ts`, so API specs share one worker and `access-matrix-api` env stubs leak into `access-scope-api`. They already run in `playwright.api.config.ts` / `playwright.access-api.config.ts`; consider `testIgnore: "*-api.spec.ts"` in the browser config.
- [x] Done 2026-10-10: `accessibility.spec.ts` passes. In `apps/web/src/routes/landing.css`, `--fg3` is `#6b6b6b` (light, ≥4.89:1 on `--bg`/`--surface`) and `#8a8a8a` (dark, ≥5.19:1). The blinking "Panggilan Masuk..." status uses `#065F46` (dark mode `#34D399`) and never drops below 0.8 opacity (≥4.62:1). RED had 17 nodes. Original note: `accessibility.spec.ts` fails on landing-page color contrast (`#a3a3a3` on `#fafafa`, 2.41:1).
- [x] Done 2026-10-10: `sidak-temuan-dates-api.spec.ts` had 13 failures (persistence and heatmap: 400/500 or missing rows), and `sidak-heatmap-integration.spec.ts` had 2. Cause: a static `import { getSidakHeatmap } from "../../api/src/services/sidak/heatmap-service"` was hoisted above the env pin. `apps/api/src/lib/env.ts` then parsed the root `.env.local`, which points at the production project, so `supabaseAdmin` and user clients were bound to production for the whole worker. The spec fetch guard blocked every non-loopback request in-process (supabase-js resolves global `fetch` at call time), so nothing left the machine; the routes failed instead. Fix: both specs load every `apps/api` module through one pinned `loadApiModules()`, which asserts `lib/env` is loopback before any query. RED: the assertion failed with the production host. GREEN: 45/45, 3/3, and the full `playwright.api.config.ts` passed 102/102.

---

# Re-audit 2026-10-17: residual gaps

- **Status:** Approved by Fajar 2026-10-17 (keep `auth-magic-link` guarded-only, include G4). U1–U6 done 2026-10-17.
- **Lane:** C (test infrastructure plus one dev-only Vite config default; no product runtime or schema change). This re-audit itself is Lane A (plan doc only).
- **Trigger:** a report that browser E2E still starts root `pnpm dev`. On `main` it does not: T1–T4 above (`1ccc40a7`, `33dff102`) changed that on 2026-10-10. The re-audit checked the current tree for paths that still reach a production-backed process.

## Findings (read-only, 2026-10-17)

**Root `pnpm dev` (Turbo `dev`, not used by any Playwright config):**

| Process                                           | Env source                                                                              | Supabase host                               | Background DB writes                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@trainers/web` (Vite :3005)                      | `envDir` = repo root: `.env`, `.env.local`                                              | `ruosnjmtywcrghjgqugz.supabase.co` (bundle) | none server-side; `/api` proxy → `http://localhost:3001`                                                                                                                                                                                                                      |
| `@trainers/api` (`tsx watch src/index.ts`, :3001) | `lib/env.ts`: `process.loadEnvFile(<root>/.env.local)` (does not override existing env) | `ruosnjmtywcrghjgqugz.supabase.co`          | `startPdktMailboxSubjectIntentCleanup()` at boot and every 15 min: service-role RPC `cleanup_pdkt_mailbox_subject_intents` → `DELETE FROM pdkt_mailbox_subject_intents`. Telefun scoring worker only if `TELEFUN_SCORING_WORKER_ENABLED=true` (unset in both root env files). |
| `@trainers/telefun` (`tsx watch src/server.ts`)   | `env.ts`: `loadEnvFile("../../.env.local")`                                             | `ruosnjmtywcrghjgqugz.supabase.co`          | `orphanCleanupWorker.start()`: service-role RPC `claim_telefun_realtime_orphans` (`UPDATE telefun_realtime_attempts`) every 30 s (default).                                                                                                                                   |

`.env.local` also holds a second hosted project for WFM (`dgcsjgskxrjvomruodyb.supabase.co`), read at request time only. `apps/api/.env.integration` points at `127.0.0.1` (API and DB).

**Playwright configs on `main`:**

- `playwright.config.ts`, `playwright.access-web.config.ts`: `pnpm --filter @trainers/web dev --host 127.0.0.1 --strictPort`, `reuseExistingServer: false`, `E2E_WEB_SERVER_ENV` (Supabase/Telefun → `127.0.0.1:9`). No API or Telefun process starts.
- `playwright.api.config.ts`, `playwright.access-api.config.ts`: no `webServer`. Specs run Hono in-process.
- So `tna-flow.spec.ts` (browser config) and `access-scope-api.spec.ts` (access-api config) start no API process on `main`. A run from an older checkout or a worktree branched before `1ccc40a7` would still start root `pnpm dev`.

**Spec classification (95 specs):**

- **Hermetic, Vite only (57):** every browser spec except the five below. Each uses a fail-closed harness (`hermeticShell`, a feature `*Harness`/`*Fixture`, `tnaHarness`, or a spec-local allowlist) that aborts unmocked `/api`.
- **Real backend in-process, loopback (38):**
  - 3 browser specs (`ketik-session-browser`, `sidak-heatmap-integration`, `sidak-heatmap-browser-integration`) forward `/api` to in-process Hono with `page.route`.
  - All 33 `*-api.spec.ts`. Every one that touches a DB reads `apps/api/.env.integration` through `sidakRealBackend.readLoopbackEnv()` (fail-closed `assertLoopback` plus a `fetch` egress guard). `sidak-jadwal-shifting-api` and `access-matrix-api` use local HTTP stubs instead.
- **Need the full stack (real API or Telefun process): none.**
- **Browser specs without a fail-closed `/api` guard (5):** `accessibility`, `edukatif-visual`, `auth-magic-link`, `e2e-target-isolation`, and `sidak-heatmap` (spec-local allowlist; it is fail-closed, so it is safe). The first four send any `/api` request they do not route through the Vite proxy.

**Residual gaps:**

1. **G1: the `/api` proxy target is not part of the E2E env.** `vite.config.ts` hard-codes `http://localhost:3001`. If anything listens there, for example `pnpm --filter @trainers/api dev` (prod `.env.local`) or a leftover `tsx watch`, unguarded specs reach it. `assertLocalDevOnlyTarget()` only proves the target is loopback, not that the process behind it is safe. Mock tokens are rejected (`401 INVALID_TOKEN`), but unauthenticated routes and the boot-time cleanup of that process still run against production.
2. **G2: `auth-magic-link.spec.ts` has no target guard.** It POSTs `/auth/v1/admin/generate_link` with the service-role key to whatever `SUPABASE_URL ?? VITE_SUPABASE_URL` the runner inherits. It is skipped unless `E2E_TEST_EMAIL` is set (absent from both root env files). With that variable set and root env exported, it writes a production auth token. Under the isolated bundle (Supabase → `127.0.0.1:9`) it also cannot pass, so it is dead coverage in its current form.
3. **G3: the isolation spec checks three named keys.** `e2e-target-isolation.spec.ts` asserts `VITE_SUPABASE_URL`, `VITE_TELEFUN_WS_URL`, `VITE_API_URL`. A future `VITE_*` URL key added to root `.env` would be inherited from production without failing it.
4. **G4 (minor): fragile static import.** `sidak-jadwal-shifting-api.spec.ts` statically imports `apps/api/src/routes/sidak/jadwal-shifting`. Today its import chain never reaches `lib/env`/`lib/supabase` (verified), so it is safe, but a future import there would bind the worker to production (the trap in `docs/e2e-testing.md`).

## Requirement

- No Playwright run on this machine can send a request to a process or host using production credentials, whatever else is listening on loopback or exported in the shell.
- Every browser-config spec is either fail-closed hermetic or explicitly real-backend loopback.
- Developer `pnpm dev` behavior is unchanged by default.

**Acceptance:**

- With a sentinel HTTP listener on `127.0.0.1:3001`, a browser-config request to `/api/...` that no spec mocks never reaches the sentinel.
- Every URL-shaped value in the served `import.meta.env` is loopback.
- `auth-magic-link.spec.ts` refuses (throws, not skips) a non-loopback Supabase URL before any request.
- Full browser suite and both API configs pass, one run at a time, compared with the 2026-10-10 baseline (439 browser tests, 102 API).

## Design

- **G1:** `vite.config.ts` proxy uses `target: process.env.API_PROXY_TARGET ?? "http://localhost:3001"`. The name has no `VITE_` prefix, so it never enters the bundle, and the default keeps `pnpm dev` unchanged. `E2E_WEB_SERVER_ENV` sets `API_PROXY_TARGET: "http://127.0.0.1:9"`. Update the regex in `assertLocalDevOnlyTargetAt()` to accept the env-driven form, and make it also assert `process.env.API_PROXY_TARGET` is loopback when set. One primary path, no fallback.
- **G2:** `auth-magic-link.spec.ts` runs `assertLoopback` on the resolved Supabase URL before `generate_link`; a non-loopback URL throws. **Decision for Fajar:** keep it guarded-only (still skipped by default), or retire it. Retiring it would mean confirming that `landing-auth` / `authenticated-shell` cover the UI side, since real magic-link login needs a bundle pointing at local Supabase, which the browser config deliberately does not have.
- **G3:** `e2e-target-isolation.spec.ts` iterates over every served `import.meta.env` entry whose value parses as an `http(s)`/`ws(s)` URL and asserts loopback (empty `VITE_API_URL` stays allowed).
- **G4:** this spec has no Supabase env pin (it needs no DB). The router now loads in `test.beforeAll` with a dynamic `import()` while `VITE_SUPABASE_URL`/`SUPABASE_URL` are pinned to `E2E_SUPABASE_URL` and restored afterwards. A future import reaching `lib/env` would then bind to the dead port, not production.
- **No full-stack config.** No spec needs a running API or Telefun process. A `playwright.fullstack.config.ts` would add a path that boots background jobs for no current coverage. If a future spec needs one, it gets its own config whose `webServer` env comes from `.env.integration`, plus a preflight that refuses to start unless every Supabase URL is loopback.
- **Out of scope, flagged (resolved 2026-10-19 by `plans/markdown/dev-production-database-guard.md`):** root `pnpm dev` itself runs both maintenance jobs (subject-intent DELETE, orphan-claim UPDATE) against production whenever a developer uses it. That is a dev-workflow decision, not E2E. Options: gate the jobs behind `NODE_ENV=production` or an explicit flag, or point local dev at local Supabase.

## Tasklist

- [x] **U1 RED:** Done: under `playwright.config.ts`, `e2e-target-isolation.spec.ts` → 1 failed (`the /api proxy never reaches a process listening on :3001`: body was `sentinel`), 2 passed. The all-URL env check passed on `main`, which has no extra URL key; it is a forward guard. Original task: in `e2e-target-isolation.spec.ts`, add (a) the sentinel test: start a `127.0.0.1:3001` HTTP listener that records hits, then `fetch(baseURL + "/api/v1/__e2e_proxy_probe")` from the test process and expect zero sentinel hits; (b) the all-URL-keys env check.
- [x] **U2 GREEN:** Done: 3/3 passed; the Vite log shows `http proxy error … ECONNREFUSED 127.0.0.1:9`; no listener left on :3001/:3005. `sidak-jadwal-shifting.spec.ts` passed 50/50 with `[preflight] OK`. The full run then found two verbatim copies of the preflight with the old regex (`helpers/sidakAgentReportFixture.ts`, `sidak-reports-data.spec.ts`); both now delegate to `assertLocalDevOnlyTargetAt(APP_ORIGIN)`, so the regex lives in one place (the shared helper also requires a loopback origin). The six affected files plus the isolation spec: 70 passed. The tautological `E2E_API_PROXY_TARGET` check proposed for the preflight was dropped in review; the sentinel test is the runtime proof.
- [x] **U3:** Done (kept, guarded-only): with `E2E_TEST_EMAIL=x@example.invalid SUPABASE_URL=https://example.invalid SUPABASE_SERVICE_ROLE_KEY=dummy` the test fails with `[e2e guard] auth-magic-link refuses non-loopback SUPABASE_URL host: example.invalid`; the guard runs before `request.post`. Without `E2E_TEST_EMAIL`: 1 skipped.
- [x] **U4:** Done: `playwright.access-api.config.ts --project access-schedule` 56 passed.
- [x] **U5 Regression:** Done. `tsc -p tsconfig.e2e.json`, `tsc --noEmit` (web), `tsc -p tsconfig.node.json`: exit 0. Full `playwright.config.ts`: 617 passed, 7 failed, 4 skipped, 61 did not run (40.3 min). Six failures plus the 61 not-run tests were the duplicate-preflight regression fixed in U2 (rerun: 70 passed). The seventh, `usage.spec.ts:83` (unmocked `GET /api/v1/ketik/history/summary`), fails identically on `HEAD`. `playwright.api.config.ts`: 231 passed, 9 failed (`ketik-review-worker-api` ×6, `exposed-function-guard-api` ×3); the same 9 fail on `HEAD` (stash), from local DB state. `playwright.access-api.config.ts`: 90 passed. No listener left on :3001/:3002/:3005.
- [x] **U6:** Done: thermo-nuclear self-review (findings fixed: dropped tautological preflight check, typed sentinel handler, removed duplicate preflights); `docs/e2e-testing.md` updated; `git diff --check` clean; CHANGELOG entry in the same commit.

**Evidence artifact:** the `e2e-target-isolation.spec.ts` list-reporter output for RED (U1) and GREEN (U2), plus the U5 run summaries, recorded in this tasklist.
