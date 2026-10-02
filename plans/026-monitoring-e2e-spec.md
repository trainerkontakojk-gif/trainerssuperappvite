# Plan 026: Monitoring E2E spec (first browser coverage for the module)

## Requirement

Monitoring is the last user-facing module with **zero** Playwright coverage while carrying 60 unit tests across five files (`monitoring-redesign` 23, `monitoring-unauthorized` 22, `monitoring-assessment-completeness` 10, `monitoring-pricing-row` 4, `monitoring-telefun-recording-url` 1). Give it browser-level evidence.

**Finish line**: `pnpm --filter @trainers/web test:e2e -- monitoring.spec.ts` is green, and the spec passes `expectHermetic` (no unmocked `/api`, no unmocked auth path, no external egress).

In scope: `apps/web/e2e/monitoring.spec.ts`, plus `apps/web/e2e/helpers/monitoringMocks.ts` only if a second spec ends up needing the same fixtures.

Out of scope: retiring or editing the `monitoring-*` unit files (that is a separate, evidence-backed change once equivalence is verified), production code, and any non-E2E test.

## Design

- Use the existing hermetic harness: `helpers/hermeticShell.ts` (`openHermeticShell`, `expectHermetic`, `waitForMockedApi`) with `assertLocalDevOnlyTarget()` in `beforeAll`. Pattern reference: [`docs/e2e-testing.md`](../docs/e2e-testing.md).
- Route: `/monitoring` (route guard allows trainer, leader, admin).
- **Discover the `/api` surface with the guard, do not guess it**: run the spec with an empty `apiMocks`, read `blockedApi`, then add the minimum mocks.
- Mock the **API row shape** the endpoint actually returns, not the client type. The Telefun snake_case trap in `docs/e2e-testing.md` is the cautionary tale: a wrong-shaped fixture renders empty rows with no error.
- Cover the behaviour the unit files assert, not their appearance: module shell renders; a role without access is kept out; assessment completeness surface; pricing row; Telefun recording URL surfaced.
- Do **not** reproduce appearance-only assertions (`min-h-[44px]`, grid class names). Those stay in unit because E2E cannot prove them honestly.

## Tasklist

- [x] Drift check; confirm the dev server on `:3005` is this repo's Vite dev server and the `/api` proxy is loopback (`assertLocalDevOnlyTarget`).
- [x] Scaffold `monitoring.spec.ts` with an empty `apiMocks`, run it, and record the `blockedApi` surface.
- [x] Add the minimum mocks so the module shell renders hermetically (RED → GREEN).
- [x] Add the behaviour cases: unauthorized role kept out, assessment completeness, pricing row, Telefun recording URL.
- [x] Run the spec twice (cold and warm), then typecheck, eslint on the changed file, prettier, and `git diff --check`.
- [x] Record which `monitoring-*` unit contracts are now E2E-proven. Do **not** delete them in this plan.

## Verification

```bash
pnpm --filter @trainers/web test:e2e -- monitoring.spec.ts
pnpm --filter @trainers/web typecheck
pnpm --filter @trainers/web exec eslint apps/web/e2e/monitoring.spec.ts
git diff --check
```

## STOP conditions

- `/monitoring` cannot be driven hermetically without a mutation or a real backend → stop and report; never point Playwright at production.
- A case needs a production credential or a live AI provider → stop.
- The spec would only pass by asserting CSS classes → stop; that contract belongs in unit.

## Scope guard

Test-only. No production code, no new dependencies, no unit-test edits, and no commit or push without explicit approval.

## Outcome

**Finish line met** (2026-10-02): `pnpm --filter @trainers/web test:e2e -- monitoring.spec.ts` → **5 passed** on two consecutive runs, and the spec passes `expectHermetic` (no unmocked `/api`, no unmocked auth path, no external egress). Monitoring now has browser-level coverage; the web E2E spec count went 28 → 29.

Covered behaviour:

- hero (heading and description), tab strip, `Riwayat Simulasi` active by default, and the zero-data KPI state;
- `Harga & Kurs` visible for trainer and absent for leader — the role gate is real, not cosmetic;
- `Penggunaan Token` switches and fetches the aggregation;
- `Harga & Kurs` fetches pricing + billing and renders the price table, with the loaded rate proven through the input value;
- a 401 on `/api` returns the app to the public landing.

Unit contracts now E2E-proven in `monitoring-unauthorized` (about 12 of its 22 tests): the pricing-tab role gate (trainer yes, leader no), hero heading and description, tab strip, default tab, KPI cards, usage-tab fetch, pricing + billing fetch and billing sync, the history request, and "does not call raw unauthenticated fetch" (via the fail-closed guard).

Still unit-only, with reasons:

- the `qa` role pricing gate and the `Invalid token` / pass-through error mappings — same code path as the covered cases; cheap but not yet asserted;
- "renders history data in table rows" and the module/status filters — need a history fixture with a valid `MonitoringHistoryEntry` shape;
- appearance assertions (wide-table reachability) — Tier C;
- `monitoring-assessment-completeness` (10) and `monitoring-telefun-recording-url` (1) — inside the review detail modal, behind a heavy assessment payload; not attempted;
- `monitoring-pricing-row` (4) — one is a pure payload builder; the rest need edit/cancel interaction inside the price table.

Findings:

- **Mock override order.** `hermeticShell` resolves mocks with `.find()`, so the **first** match wins: an override list must be spread **before** the defaults. A 401 override appended last was silently ignored, and the failure looked like a product bug.
- **A 401 is not an inline error.** In the browser the global session handler reacts first and the app returns to the landing, so `mapError`'s friendly text is not reachable end-to-end. The spec asserts the stronger, user-visible outcome instead.
- **Locale-dependent formatting.** `toLocaleString()` follows the browser locale (`15,000` under en-US), so text-based number assertions are fragile; assert the input value instead.

Retiring the `monitoring-*` unit files was explicitly out of scope here; do it as a separate, evidence-backed change.
