# E2E testing — `apps/web`

Policy (target safety, lanes, gates, when a non-E2E test needs approval) lives in
[`AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) §7. This document is only the practical map of the
harnesses in `apps/web/e2e/` and the traps already paid for.

## Two sanctioned patterns

| Pattern                                        | Helper                                                                                                                               | Requires                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **Hermetic** — mock every `/api` the page uses | `helpers/hermeticShell.ts`, or a feature harness such as `helpers/sidakTemuanDatesHarness.ts` / `helpers/sidakAgentReportFixture.ts` | nothing                                    |
| **Real backend** — real JWT, real Hono routers | `helpers/sidakRealBackend.ts`                                                                                                        | `apps/api/.env.integration`, loopback only |

## Dev server and service targets

`playwright.config.ts` and `playwright.access-web.config.ts` start **only** the web Vite dev
server (`pnpm --filter @trainers/web dev`), never the root `pnpm dev`: that one also boots the API
and Telefun with the root `.env`, which points at production, and the API's startup schedulers then
write to production. No browser spec needs those processes. Hermetic specs mock `/api`, and
real-backend specs forward `/api` to the in-process Hono app.

- The server gets `E2E_WEB_SERVER_ENV` from `helpers/e2eTargets.ts`. It points Supabase and Telefun
  at `127.0.0.1:9`, where nothing listens, so a request a spec forgot to mock fails on this machine.
  Mock Supabase paths against `E2E_SUPABASE_URL` / `E2E_SUPABASE_STORAGE_KEY`, never a project URL.
- `reuseExistingServer` is `false`. If `:3005` is busy (for example your own `pnpm dev`), the run
  fails instead of testing against a server whose env cannot be verified. Stop that server first.
- `e2e-target-isolation.spec.ts` guards both properties.
- The browser configs ignore `*-api.spec.ts`. API specs run under `playwright.api.config.ts` or
  `playwright.access-api.config.ts`, one project per env, because a shared worker leaks one spec's
  API env stubs into the next. A new API spec needs a project in one of those configs, or it never runs.

## `mockSupabaseAuth` is UI-only

`helpers/mockAuth.ts` makes the app _believe_ it is logged in; its `access_token` is not a
JWT, and `apps/api` rejects it with `401 INVALID_TOKEN` (proven with a direct probe). A spec
that mocks auth and then calls the real `/api` can never pass. Use the hermetic pattern, or
`sidakRealBackend` for real data. Full rationale: [`plans/markdown/e2e-mocked-auth-contract.md`](../plans/markdown/e2e-mocked-auth-contract.md).

## Hermetic harness rules

- One fail-closed route handler owns every request: the local dev origin, the mocked Supabase
  auth paths, and the `/api` paths on the caller’s allowlist. Anything else is aborted.
- `expectHermetic(audit)` asserts no unmocked `/api`, no unmocked auth path, and no external egress.
- Call `waitForMockedApi(audit, [...])` **before** `expectHermetic`. Without it the check can pass
  vacuously: the initial fetches are still in flight, so `blockedApi` is empty because nothing has
  been requested yet.
- `expectedThirdPartyHosts` declares known decorative assets (for example the OJK logo on the KETIK
  and PDKT landings). They are still aborted — no egress — but not counted as unexpected traffic.
- **Mock resolution is first-match-wins.** The harness resolves `/api` mocks with `.find()`, so an
  override list must be spread **before** the defaults. An override appended last is silently
  ignored, and the resulting failure looks like a product bug rather than a fixture mistake.
- Run `assertLocalDevOnlyTarget()` in `beforeAll`; it proves the target is this repo’s Vite dev
  server and that the `/api` proxy points at loopback.

## Fixture shapes

- **API rows are not client types.** `/api/v1/telefun/sessions` returns DB rows (`scenario_title`,
  `scoring_status`, …) which `mapTelefunSessionRow` maps to `CallRecord`. A camelCase fixture
  renders **empty rows with no error**, and the network guard stays silent because nothing leaked.
  Assert mapped fields explicitly so this fails loudly.
- Prefer shared constants and builders over hand-written copies: `DEFAULT_KETIK_SETTINGS` and
  `TEXT_SIMULATION_MODELS` from `@trainers/types`, `emptyUsageBreakdown()` from `src/lib/usage-snapshot.ts`.
  Then the spec fails when the UI drifts from the shared contract instead of going stale.

## Measurement and timing traps

- **Touch-target size:** measure `offsetHeight`, not `getBoundingClientRect()`. A dialog enter
  animation scales the box (44px renders as 41.8px = 44 × 0.95) and the rect-based assertion fails
  falsely.
- **Cold Vite module graph:** the first assertion of a heavy page can exceed the 5s `expect` budget
  right after a file change. `openAgentDetail()` therefore sets an explicit 20s budget. Note that
  `test.slow()` protects the test timeout, not `expect.timeout`.
- **Text matching is substring-based:** `getByText(string)` and `getByRole(name)` both match
  substrings, so `"Gemini 3.5 Flash"` also matches `"Gemini 3.5 Flash Lite"` and `"Lainnya"` also
  matches `"+ Tambah Kategori Lainnya"`. Scope the locator to a dialog and use `exact: true`.
- **Number formatting follows the browser locale.** `toLocaleString()` renders `15000` as `15,000`
  under en-US, so a text assertion such as `/15\.000/` fails for a reason unrelated to the app.
  Assert the input value or another locale-independent property instead.
- **A 401 is usually not an inline error.** A global session handler can react before the
  component’s own error path, so the user-visible outcome is a return to the landing page rather
  than the friendly text a `mapError` helper would produce. Assert the outcome the user actually
  gets — it is the stronger contract anyway.

## Repository hygiene

`apps/web/test-results/` is run output: it is gitignored and no longer tracked, because every
Playwright run deletes its contents and used to dirty the tree on every invocation.

## Layout

One spec per module flow under `apps/web/e2e/`. Shared fixtures and harnesses live in
`apps/web/e2e/helpers/`; keep a harness free of feature-specific state when more than one spec uses it.
