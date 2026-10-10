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
- Open: `sidak-temuan-dates-api.spec.ts` has 13 failures against the local disposable DB (persistence and heatmap: 500 or missing seed rows). They reproduce on `main` with the old config, so they are unrelated to the exclusion.
