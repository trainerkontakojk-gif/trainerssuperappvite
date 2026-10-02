# E2E testing — `apps/web`

Policy (target safety, lanes, gates, when a non-E2E test needs approval) lives in
[`AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) §7. This document is only the practical map of the
harnesses in `apps/web/e2e/` and the traps already paid for.

## Two sanctioned patterns

| Pattern                                        | Helper                                                                                                                               | Requires                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **Hermetic** — mock every `/api` the page uses | `helpers/hermeticShell.ts`, or a feature harness such as `helpers/sidakTemuanDatesHarness.ts` / `helpers/sidakAgentReportFixture.ts` | nothing                                    |
| **Real backend** — real JWT, real Hono routers | `helpers/sidakRealBackend.ts`                                                                                                        | `apps/api/.env.integration`, loopback only |

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

## Repository hygiene

`apps/web/test-results/` is run output: it is gitignored and no longer tracked, because every
Playwright run deletes its contents and used to dirty the tree on every invocation.

## Layout

One spec per module flow under `apps/web/e2e/`. Shared fixtures and harnesses live in
`apps/web/e2e/helpers/`; keep a harness free of feature-specific state when more than one spec uses it.
